/** TMB Manager — storage abstraction cho asset (PDF/ảnh) của map profile.
 *
 * Provider thật đã audit (TMB Self-Service Ingestion v1, xem Final Report):
 * `VercelBlobAssetStorage` (bên dưới), dùng khi env `TMB_ASSET_STORAGE_PROVIDER
 * = "vercel-blob"` — chọn Vercel Blob vì app đã deploy trên Vercel, có
 * client-side direct upload SDK (`@vercel/blob/client`, dùng ở route
 * tmb-profiles/upload-url) tránh đẩy file 100-300MB qua body Next.js API
 * (giới hạn cứng ~4.5MB của Vercel serverless functions). Prisma vẫn CHỈ lưu
 * `ref` — 1 string key/URL, KHÔNG lưu chi tiết provider nào khác — đổi
 * provider trong tương lai chỉ cần thêm 1 adapter mới implement
 * TmbAssetStorage, KHÔNG đổi schema/service nào khác.
 *
 * `LocalDevAssetStorage` CHỈ dùng được khi chạy `next dev`/script trên máy có
 * filesystem bền (KHÔNG hoạt động đúng trên Vercel serverless — filesystem ở
 * đó ephemeral theo từng invocation, ghi xong có thể biến mất trước khi đọc
 * lại) — dùng để phát triển/test local, KHÔNG dùng cho production tới khi có
 * provider thật. `assertProductionUploadAllowed()` chặn rõ ràng thay vì âm
 * thầm ghi file rồi mất dữ liệu, khi CHƯA cấu hình `TMB_ASSET_STORAGE_PROVIDER`.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

export interface TmbAssetStorage {
  /** Ghi asset. Trả về `ref` THẬT SỰ cần lưu vào Prisma — CÓ THỂ khác `ref`
   * truyền vào (VD Vercel Blob tự sinh URL cuối cùng, addRandomSuffix), nên
   * caller LUÔN phải dùng giá trị trả về, KHÔNG dùng lại `ref` đã truyền. */
  put(ref: string, data: Buffer, opts?: { contentType?: string }): Promise<string>;
  /** Đọc lại nguyên vẹn asset đã `put` theo `ref` (giá trị ĐÃ trả về từ put()). */
  get(ref: string): Promise<Buffer>;
  /** URL Sale/Admin dùng để fetch asset từ browser (TmbMap.tsx fetch(profile.pdfUrl, ...))
   * — LUÔN là route proxy có auth server-side (Section 14), KHÔNG BAO GIỜ trả
   * thẳng URL provider (dù provider đó là public blob) để giữ nguyên gate
   * "non-admin chỉ xem asset của profile ACTIVE" hiện có. */
  publicUrl(ref: string): string;
  delete(ref: string): Promise<void>;
  exists(ref: string): Promise<boolean>;
}

/** THẤY RÕ khi code gọi nhầm production mà chưa có provider — throw ngay,
 * KHÔNG fallback âm thầm về local storage (sẽ mất asset ở serverless). */
export function assertProductionUploadAllowed(): void {
  if (process.env.VERCEL === '1' && !process.env.TMB_ASSET_STORAGE_PROVIDER) {
    throw new Error(
      'TMB asset storage chưa cấu hình cho production (VERCEL=1, không có TMB_ASSET_STORAGE_PROVIDER). ' +
      'Cần cấu hình object storage thật (khuyến nghị Vercel Blob) trước khi Admin upload TMB mới trên production. ' +
      'Xem TMB Manager audit report, mục "External storage/config needed".'
    );
  }
}

const LOCAL_ROOT = path.join(process.cwd(), '.tmb-dev-storage');

/** Adapter dev/local — ghi xuống `.tmb-dev-storage/` ở project root (đã
 * .gitignore, KHÔNG commit). Chỉ dùng khi chạy local hoặc script server-side,
 * KHÔNG dùng trên Vercel (xem assertProductionUploadAllowed). */
export class LocalDevAssetStorage implements TmbAssetStorage {
  async put(ref: string, data: Buffer): Promise<string> {
    const filePath = this.resolvePath(ref);
    await fsp.mkdir(path.dirname(filePath), { recursive: true });
    await fsp.writeFile(filePath, data);
    return ref; // local dev tự chọn + kiểm soát key 1:1, ref trả về = ref truyền vào
  }

  async get(ref: string): Promise<Buffer> {
    return fsp.readFile(this.resolvePath(ref));
  }

  publicUrl(ref: string): string {
    return `/api/stacking/tmb-assets/${encodeURIComponent(ref)}`;
  }

  async delete(ref: string): Promise<void> {
    const filePath = this.resolvePath(ref);
    await fsp.rm(filePath, { force: true });
  }

  async exists(ref: string): Promise<boolean> {
    try {
      await fsp.access(this.resolvePath(ref), fs.constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  /** `ref` là key logic (VD "hlx-tdnd1/master.pdf") — chặn path traversal
   * (Section 14: "No path traversal") bằng cách resolve rồi kiểm tra vẫn nằm
   * trong LOCAL_ROOT, KHÔNG tin key có thể chứa "..". */
  private resolvePath(ref: string): string {
    const resolved = path.resolve(LOCAL_ROOT, ref);
    if (!resolved.startsWith(LOCAL_ROOT + path.sep) && resolved !== LOCAL_ROOT) {
      throw new Error(`Invalid asset ref (path traversal blocked): ${ref}`);
    }
    return resolved;
  }
}

/** Adapter production — Vercel Blob (`@vercel/blob`). Chỉ dùng khi Admin/DevOps
 * đã cấu hình `TMB_ASSET_STORAGE_PROVIDER=vercel-blob` + env `BLOB_READ_WRITE_TOKEN`
 * (Vercel tự cấp khi Connect 1 Blob store vào project trên dashboard — KHÔNG
 * tự set giá trị thật ở đây, xem Final Report "Required env/config").
 *
 * `ref` lưu trong Prisma = URL công khai đầy đủ Vercel Blob trả về (bắt buộc
 * dùng URL, không phải bare pathname — SDK `head()`/`del()` cần URL đầy đủ để
 * xác định đúng blob). `publicUrl()` vẫn LUÔN trả về route proxy nội bộ
 * (`/api/stacking/tmb-assets/{ref}`), KHÔNG trả thẳng URL Blob — browser
 * KHÔNG BAO GIỜ fetch trực tiếp Blob khi ĐỌC (chỉ khi UPLOAD, qua
 * `@vercel/blob/client` + route `tmb-profiles/upload-url` cấp token riêng),
 * giữ nguyên gate "non-admin chỉ xem asset của profile ACTIVE" ở tmb-assets/[ref]/route.ts
 * (Section 14) — proxy đọc lại bytes qua `get()` bên dưới rồi mới trả cho client. */
export class VercelBlobAssetStorage implements TmbAssetStorage {
  async put(ref: string, data: Buffer, opts?: { contentType?: string }): Promise<string> {
    const { put } = await import('@vercel/blob');
    const blob = await put(ref, data, {
      access: 'public',
      addRandomSuffix: true,
      contentType: opts?.contentType ?? 'application/pdf',
    });
    return blob.url;
  }

  async get(ref: string): Promise<Buffer> {
    const res = await fetch(ref);
    if (!res.ok) throw new Error(`Không tải được asset từ Vercel Blob (HTTP ${res.status}): ${ref}`);
    return Buffer.from(await res.arrayBuffer());
  }

  publicUrl(ref: string): string {
    return `/api/stacking/tmb-assets/${encodeURIComponent(ref)}`;
  }

  async delete(ref: string): Promise<void> {
    const { del } = await import('@vercel/blob');
    await del(ref);
  }

  async exists(ref: string): Promise<boolean> {
    try {
      const { head } = await import('@vercel/blob');
      await head(ref);
      return true;
    } catch {
      return false;
    }
  }
}

/** Tên provider hợp lệ cho env `TMB_ASSET_STORAGE_PROVIDER` — tách hằng số để
 * factory + status-check (route /api/stacking/info) dùng CHUNG, không lệch nhau. */
export const VERCEL_BLOB_PROVIDER = 'vercel-blob';

/** Đã cấu hình đủ để dùng provider thật chưa — dùng cho UI Simple Mode báo rõ
 * "Chưa cấu hình Object Storage" thay vì để Admin bấm rồi nhận lỗi khó hiểu
 * giữa chừng pipeline (Section "Upload architecture" — no fake production success). */
export function isTmbUploadStorageConfigured(): boolean {
  return process.env.TMB_ASSET_STORAGE_PROVIDER === VERCEL_BLOB_PROVIDER && !!process.env.BLOB_READ_WRITE_TOKEN;
}

let _storage: TmbAssetStorage | null = null;

/** Factory duy nhất — mọi service khác gọi qua đây, KHÔNG new trực tiếp
 * adapter, để đổi provider sau này không phải sửa nhiều nơi. */
export function getTmbAssetStorage(): TmbAssetStorage {
  if (_storage) return _storage;
  if (process.env.TMB_ASSET_STORAGE_PROVIDER === VERCEL_BLOB_PROVIDER) {
    _storage = new VercelBlobAssetStorage();
    return _storage;
  }
  assertProductionUploadAllowed();
  _storage = new LocalDevAssetStorage();
  return _storage;
}
