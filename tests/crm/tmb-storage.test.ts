import assert from 'node:assert/strict';
import test from 'node:test';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { LocalDevAssetStorage } from '../../src/lib/tmb-storage';

// TMB Self-Service Ingestion v1 — put() đổi contract từ Promise<void> sang
// Promise<string> (trả về ref THẬT SỰ cần lưu, khác requested ref với provider
// tự sinh URL như Vercel Blob — xem tmb-storage.ts comment). LocalDevAssetStorage
// vẫn tự kiểm soát key 1:1 nên ref trả về PHẢI đúng bằng ref truyền vào —
// regression cho 2 call site đang dùng giá trị trả về (tmb-profiles/route.ts
// multipart branch, optimize/route.ts).

const TEST_ROOT = path.join(process.cwd(), '.tmb-dev-storage');

test('LocalDevAssetStorage.put(): trả về ĐÚNG ref đã truyền vào (contract mới), ghi/đọc round-trip nguyên vẹn', async () => {
  const storage = new LocalDevAssetStorage();
  const ref = `__test__/${Date.now()}-storage-contract.pdf`;
  const data = Buffer.from('%PDF-1.4 fake content for test');
  try {
    const returnedRef = await storage.put(ref, data);
    assert.equal(returnedRef, ref);
    assert.equal(await storage.exists(ref), true);
    const readBack = await storage.get(ref);
    assert.ok(readBack.equals(data));
  } finally {
    await storage.delete(ref);
    assert.equal(await storage.exists(ref), false);
  }
});

test('LocalDevAssetStorage.publicUrl(): luôn trả về route proxy nội bộ, KHÔNG lộ chi tiết filesystem path', () => {
  const storage = new LocalDevAssetStorage();
  const ref = 'SC_123/456-master.pdf';
  assert.equal(storage.publicUrl(ref), `/api/stacking/tmb-assets/${encodeURIComponent(ref)}`);
});

test('LocalDevAssetStorage: chặn path traversal trong ref (Section 14 "No path traversal")', async () => {
  const storage = new LocalDevAssetStorage();
  await assert.rejects(() => storage.put('../../../etc/passwd', Buffer.from('x')));
  await assert.rejects(() => storage.get('../../../etc/passwd'));
});

test.after(async () => {
  // Dọn thư mục test tạo ra (không đụng asset dev thật khác nếu có) — best-effort.
  await fsp.rm(path.join(TEST_ROOT, '__test__'), { recursive: true, force: true }).catch(() => {});
});
