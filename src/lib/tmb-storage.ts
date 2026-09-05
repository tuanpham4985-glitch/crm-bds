/** TMB Manager — storage abstraction cho asset (PDF/ảnh) của map profile.
 *
 * KHÔNG có object storage nào (S3/Vercel Blob/GCS) được cấu hình trong dự án
 * này hiện tại (đã audit package.json + toàn bộ src, xem báo cáo audit) — vì
 * vậy KHÔNG được invent credentials hay giả định 1 provider cụ thể. Interface
 * dưới đây tách rời "nơi lưu asset" khỏi phần còn lại của TMB Manager (Prisma
 * chỉ lưu `ref` — 1 string key, KHÔNG lưu path/provider cụ thể), để khi có
 * provider thật (khuyến nghị Vercel Blob vì app đã deploy trên Vercel), chỉ
 * cần viết 1 adapter mới implement TmbAssetStorage, KHÔNG đổi schema/service
 * nào khác.
 *
 * `LocalDevAssetStorage` CHỈ dùng được khi chạy `next dev`/script trên máy có
 * filesystem bền (KHÔNG hoạt động đúng trên Vercel serverless — filesystem ở
 * đó ephemeral theo từng invocation, ghi xong có thể biến mất trước khi đọc
 * lại) — dùng để phát triển/test local, KHÔNG dùng cho production tới khi có
 * provider thật. `assertProductionUploadAllowed()` chặn rõ ràng thay vì âm
 * thầm ghi file rồi mất dữ liệu.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

export interface TmbAssetStorage {
  /** Ghi asset, trả về `ref` (key ổn định) để lưu vào Prisma — KHÔNG phải path thật, không lộ chi tiết provider. */
  put(ref: string, data: Buffer): Promise<void>;
  /** Đọc lại nguyên vẹn asset đã `put` theo `ref`. */
  get(ref: string): Promise<Buffer>;
  /** URL Sale/Admin dùng để fetch asset từ browser (TmbMap.tsx fetch(profile.pdfUrl, ...)). */
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
  async put(ref: string, data: Buffer): Promise<void> {
    const filePath = this.resolvePath(ref);
    await fsp.mkdir(path.dirname(filePath), { recursive: true });
    await fsp.writeFile(filePath, data);
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

let _storage: TmbAssetStorage | null = null;

/** Factory duy nhất — mọi service khác gọi qua đây, KHÔNG new trực tiếp
 * adapter, để đổi provider sau này không phải sửa nhiều nơi. */
export function getTmbAssetStorage(): TmbAssetStorage {
  if (_storage) return _storage;
  assertProductionUploadAllowed();
  _storage = new LocalDevAssetStorage();
  return _storage;
}
