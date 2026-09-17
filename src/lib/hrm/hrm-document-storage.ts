/** HRM document storage — file thật cho QĐ bổ nhiệm / QĐ miễn nhiệm.
 *
 * Reuse Ý TƯỞNG/shape đã proven ở TMB Manager (src/lib/tmb-storage.ts: cùng
 * interface put/get/publicUrl/delete/exists, cùng lựa chọn Vercel Blob cho
 * production vì app đã deploy Vercel, cùng nguyên tắc "publicUrl() luôn là
 * route proxy có auth server-side, KHÔNG BAO GIỜ trả thẳng URL provider") —
 * nhưng đây là 1 module HOÀN TOÀN ĐỘC LẬP, KHÔNG import/generalize
 * tmb-storage.ts (approved architecture §7 "KHÔNG refactor/generalize
 * tmb-storage.ts, KHÔNG sửa TMB đang chạy ổn"): state riêng (_storage
 * singleton riêng), factory riêng, env flag riêng (HRM_DOCUMENT_STORAGE_PROVIDER,
 * KHÔNG dùng chung TMB_ASSET_STORAGE_PROVIDER dù cùng giá trị "vercel-blob"),
 * thư mục dev riêng (.hrm-dev-storage/), key namespace riêng (prefix
 * "hrm/bo-nhiem/...", không đụng namespace "SC_.../..." của TMB).
 *
 * File HR nhạy cảm hơn PDF mặt bằng — cỡ nhỏ (scan 1 quyết định, không phải
 * PDF mặt bằng 100-300MB) nên KHÔNG cần luồng client-direct-upload 2 bước như
 * TMB (`@vercel/blob/client` + route cấp token riêng) — upload thẳng qua 1
 * route server-side multipart là đủ, miễn giữ dưới giới hạn body ~4.5MB của
 * Vercel serverless (xem MAX_HRM_DOCUMENT_SIZE_BYTES).
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

export interface HrmDocumentStorage {
  /** Ghi file. Trả về `ref` THẬT SỰ cần lưu vào DB — CÓ THỂ khác `key` truyền
   * vào (Vercel Blob tự sinh URL cuối, addRandomSuffix) — caller LUÔN dùng
   * giá trị trả về. */
  put(key: string, data: Buffer, opts: { contentType: string }): Promise<string>;
  get(ref: string): Promise<Buffer>;
  /** LUÔN là route proxy nội bộ có auth server-side — KHÔNG BAO GIỜ trả thẳng
   * URL provider (Section an toàn dữ liệu nhân sự). */
  publicUrl(ref: string): string;
  delete(ref: string): Promise<void>;
  exists(ref: string): Promise<boolean>;
}

// ---- Validation (pure — test được không cần storage thật) ----

export const ALLOWED_HRM_DOCUMENT_MIME_TYPES: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

/** An toàn dưới giới hạn body ~4.5MB của Vercel serverless functions (route
 * nhận multipart trực tiếp, không qua client-direct-upload token) — quyết
 * định scan thường vài trăm KB tới vài MB, 4MB là dư cho V1. */
export const MAX_HRM_DOCUMENT_SIZE_BYTES = 4 * 1024 * 1024;

export function validateHrmDocumentFile(file: { type: string; size: number }): string | null {
  if (!ALLOWED_HRM_DOCUMENT_MIME_TYPES[file.type]) {
    return 'Chỉ chấp nhận file PDF, JPG hoặc PNG';
  }
  if (file.size <= 0) return 'File rỗng';
  if (file.size > MAX_HRM_DOCUMENT_SIZE_BYTES) {
    return `File vượt quá giới hạn ${MAX_HRM_DOCUMENT_SIZE_BYTES / (1024 * 1024)}MB`;
  }
  return null;
}

/** Sinh storage key AN TOÀN — KHÔNG bao giờ dùng filename/path client gửi lên
 * (chỉ dùng mimeType đã validate để suy ra phần mở rộng), tránh path
 * traversal/ký tự lạ từ tên file người dùng đặt. `kind` phân biệt hồ sơ bổ
 * nhiệm vs miễn nhiệm của cùng 1 tenure. */
export function generateHrmDocumentKey(tenureId: string, kind: 'bo-nhiem' | 'mien-nhiem', mimeType: string): string {
  const ext = ALLOWED_HRM_DOCUMENT_MIME_TYPES[mimeType] || 'bin';
  const safeTenureId = tenureId.replace(/[^a-zA-Z0-9_-]/g, '');
  return `hrm/bo-nhiem/${safeTenureId}/${kind}-${crypto.randomUUID()}.${ext}`;
}

// ---- Local dev adapter ----

const LOCAL_ROOT = path.join(process.cwd(), '.hrm-dev-storage');

/** CHỈ dùng local dev/test — filesystem serverless Vercel là ephemeral, ghi
 * xong có thể mất trước khi đọc lại (cùng caveat với LocalDevAssetStorage của
 * TMB). */
export class LocalDevHrmDocumentStorage implements HrmDocumentStorage {
  async put(key: string, data: Buffer, _opts?: { contentType: string }): Promise<string> {
    const filePath = this.resolvePath(key);
    await fsp.mkdir(path.dirname(filePath), { recursive: true });
    await fsp.writeFile(filePath, data);
    return key;
  }

  async get(ref: string): Promise<Buffer> {
    return fsp.readFile(this.resolvePath(ref));
  }

  publicUrl(ref: string): string {
    return `/api/bo-nhiem-chuc-vu/documents/${encodeURIComponent(ref)}`;
  }

  async delete(ref: string): Promise<void> {
    await fsp.rm(this.resolvePath(ref), { force: true });
  }

  async exists(ref: string): Promise<boolean> {
    try {
      await fsp.access(this.resolvePath(ref), fs.constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  /** Chặn path traversal — `key` luôn do generateHrmDocumentKey() sinh ra nên
   * không nên chứa "..", nhưng vẫn kiểm tra tường minh (defense in depth,
   * cùng nguyên tắc LocalDevAssetStorage của TMB). */
  private resolvePath(key: string): string {
    const resolved = path.resolve(LOCAL_ROOT, key);
    if (!resolved.startsWith(LOCAL_ROOT + path.sep) && resolved !== LOCAL_ROOT) {
      throw new Error(`Invalid document key (path traversal blocked): ${key}`);
    }
    return resolved;
  }
}

// ---- Vercel Blob adapter (production) ----

/** Store Private (giống TMB) — mọi op put/get PHẢI khai báo access:'private'
 * khớp cấu hình store thật, tránh đúng bug "unknown_error → auto-retry toàn
 * bộ request" đã audit ở TMB (xem tmb-storage.ts comment chi tiết) nếu access
 * mode gửi lên không khớp store. */
export class VercelBlobHrmDocumentStorage implements HrmDocumentStorage {
  async put(key: string, data: Buffer, opts: { contentType: string }): Promise<string> {
    const { put } = await import('@vercel/blob');
    const blob = await put(key, data, {
      access: 'private',
      addRandomSuffix: true,
      contentType: opts.contentType,
    });
    return blob.url;
  }

  async get(ref: string): Promise<Buffer> {
    const { get } = await import('@vercel/blob');
    const result = await get(ref, { access: 'private' });
    if (!result || result.statusCode !== 200 || !result.stream) {
      throw new Error(`Không tải được hồ sơ nhân sự từ Vercel Blob (statusCode=${result?.statusCode ?? 'null'}): ${ref}`);
    }
    return Buffer.from(await new Response(result.stream).arrayBuffer());
  }

  publicUrl(ref: string): string {
    return `/api/bo-nhiem-chuc-vu/documents/${encodeURIComponent(ref)}`;
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

export const HRM_VERCEL_BLOB_PROVIDER = 'vercel-blob';

/** Đã cấu hình đủ để dùng provider production thật chưa — dùng để route/UI
 * báo lỗi rõ ràng thay vì để upload thất bại giữa chừng khó hiểu. Tên biến
 * BLOB_READ_WRITE_TOKEN dùng chung với TMB vì đây là biến Vercel tự cấp theo
 * PROJECT (1 Blob store connect vào project), không phải theo feature — 2
 * feature dùng chung 1 store nhưng namespace key hoàn toàn tách biệt (xem
 * generateHrmDocumentKey prefix "hrm/bo-nhiem/" vs namespace "SC_.../..." của
 * TMB) nên không đụng nhau. */
export function isHrmDocumentStorageConfigured(): boolean {
  return process.env.HRM_DOCUMENT_STORAGE_PROVIDER === HRM_VERCEL_BLOB_PROVIDER && !!process.env.BLOB_READ_WRITE_TOKEN;
}

/** THẤY RÕ khi gọi nhầm production mà chưa cấu hình — throw ngay, KHÔNG
 * fallback âm thầm về local storage (mất file ở serverless). */
export function assertHrmProductionUploadAllowed(): void {
  if (process.env.VERCEL === '1' && !process.env.HRM_DOCUMENT_STORAGE_PROVIDER) {
    throw new Error(
      'HRM document storage chưa cấu hình cho production (VERCEL=1, không có HRM_DOCUMENT_STORAGE_PROVIDER). ' +
      'Cần cấu hình HRM_DOCUMENT_STORAGE_PROVIDER=vercel-blob (+ BLOB_READ_WRITE_TOKEN) trước khi upload hồ sơ QĐ trên production.'
    );
  }
}

let _storage: HrmDocumentStorage | null = null;

/** Factory duy nhất — service khác gọi qua đây, KHÔNG new trực tiếp adapter. */
export function getHrmDocumentStorage(): HrmDocumentStorage {
  if (_storage) return _storage;
  if (process.env.HRM_DOCUMENT_STORAGE_PROVIDER === HRM_VERCEL_BLOB_PROVIDER) {
    _storage = new VercelBlobHrmDocumentStorage();
    return _storage;
  }
  assertHrmProductionUploadAllowed();
  _storage = new LocalDevHrmDocumentStorage();
  return _storage;
}
