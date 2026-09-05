/** TMB Manager — đọc asset của 1 map profile theo `ref`, tự nhận diện 2 dạng:
 * - ref bắt đầu bằng "/" -> path tĩnh dưới public/ (đã commit git, dùng cho
 *   web asset production khi chưa có object storage thật — xem tmb-storage.ts
 *   comment đầu file).
 * - ref khác -> storage abstraction (LocalDevAssetStorage hiện tại).
 * Dùng CHUNG cho mọi route đọc master/web asset, tránh lặp lại logic + tránh
 * lệch cách chặn path traversal giữa các nơi gọi.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { getTmbAssetStorage } from '@/lib/tmb-storage';

export async function readTmbAsset(ref: string): Promise<Buffer> {
  if (ref.startsWith('/')) return readPublicAsset(ref);
  return getTmbAssetStorage().get(ref);
}

async function readPublicAsset(publicPath: string): Promise<Buffer> {
  const publicRoot = path.join(process.cwd(), 'public');
  const resolved = path.resolve(publicRoot, '.' + publicPath); // '.' + '/x/y' -> './x/y', luôn relative
  if (!resolved.startsWith(publicRoot + path.sep)) {
    throw new Error('Invalid asset path (path traversal blocked)');
  }
  return fs.readFile(resolved);
}
