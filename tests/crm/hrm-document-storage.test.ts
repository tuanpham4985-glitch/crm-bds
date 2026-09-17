import assert from 'node:assert/strict';
import test from 'node:test';
import fsp from 'node:fs/promises';
import path from 'node:path';
import {
  LocalDevHrmDocumentStorage, validateHrmDocumentFile, generateHrmDocumentKey,
  MAX_HRM_DOCUMENT_SIZE_BYTES, ALLOWED_HRM_DOCUMENT_MIME_TYPES,
} from '../../src/lib/hrm/hrm-document-storage';

// Module ĐỘC LẬP với TMB (approved architecture §7 "KHÔNG refactor/generalize
// tmb-storage.ts") — test riêng, không import gì từ tmb-storage.ts.

const TEST_ROOT = path.join(process.cwd(), '.hrm-dev-storage');

test('validateHrmDocumentFile: chỉ chấp nhận PDF/JPG/PNG', () => {
  assert.equal(validateHrmDocumentFile({ type: 'application/pdf', size: 1000 }), null);
  assert.equal(validateHrmDocumentFile({ type: 'image/jpeg', size: 1000 }), null);
  assert.equal(validateHrmDocumentFile({ type: 'image/png', size: 1000 }), null);
  assert.match(validateHrmDocumentFile({ type: 'application/zip', size: 1000 }) || '', /PDF, JPG hoặc PNG/);
});

test('validateHrmDocumentFile: chặn file rỗng và file vượt giới hạn kích thước', () => {
  assert.match(validateHrmDocumentFile({ type: 'application/pdf', size: 0 }) || '', /rỗng/);
  assert.match(validateHrmDocumentFile({ type: 'application/pdf', size: MAX_HRM_DOCUMENT_SIZE_BYTES + 1 }) || '', /vượt quá giới hạn/);
  assert.equal(validateHrmDocumentFile({ type: 'application/pdf', size: MAX_HRM_DOCUMENT_SIZE_BYTES }), null);
});

test('generateHrmDocumentKey: sinh key an toàn từ mimeType đã validate, KHÔNG dùng filename client', () => {
  const key = generateHrmDocumentKey('tenure-123', 'bo-nhiem', 'application/pdf');
  assert.match(key, /^hrm\/bo-nhiem\/tenure-123\/bo-nhiem-[0-9a-f-]+\.pdf$/);
});

test('generateHrmDocumentKey: loại bỏ ký tự lạ khỏi tenureId (chặn path traversal qua tenureId)', () => {
  const key = generateHrmDocumentKey('../../etc/passwd', 'mien-nhiem', 'image/png');
  assert.doesNotMatch(key, /\.\./);
  assert.match(key, /^hrm\/bo-nhiem\/etcpasswd\/mien-nhiem-[0-9a-f-]+\.png$/);
});

test('ALLOWED_HRM_DOCUMENT_MIME_TYPES: đúng 3 loại được duyệt', () => {
  assert.deepEqual(Object.keys(ALLOWED_HRM_DOCUMENT_MIME_TYPES).sort(), ['application/pdf', 'image/jpeg', 'image/png']);
});

test('LocalDevHrmDocumentStorage.put(): trả về đúng key, ghi/đọc round-trip nguyên vẹn', async () => {
  const storage = new LocalDevHrmDocumentStorage();
  const key = `__test__/${Date.now()}-doc.pdf`;
  const data = Buffer.from('%PDF-1.4 fake content');
  try {
    const returnedRef = await storage.put(key, data, { contentType: 'application/pdf' });
    assert.equal(returnedRef, key);
    assert.equal(await storage.exists(key), true);
    const readBack = await storage.get(key);
    assert.ok(readBack.equals(data));
  } finally {
    await storage.delete(key);
    assert.equal(await storage.exists(key), false);
  }
});

test('LocalDevHrmDocumentStorage.publicUrl(): luôn là route proxy nội bộ /api/bo-nhiem-chuc-vu/documents/...', () => {
  const storage = new LocalDevHrmDocumentStorage();
  const key = 'hrm/bo-nhiem/t1/bo-nhiem-abc.pdf';
  assert.equal(storage.publicUrl(key), `/api/bo-nhiem-chuc-vu/documents/${encodeURIComponent(key)}`);
});

test('LocalDevHrmDocumentStorage: chặn path traversal trong key', async () => {
  const storage = new LocalDevHrmDocumentStorage();
  await assert.rejects(() => storage.put('../../../etc/passwd', Buffer.from('x'), { contentType: 'application/pdf' }));
  await assert.rejects(() => storage.get('../../../etc/passwd'));
});

test.after(async () => {
  await fsp.rm(path.join(TEST_ROOT, '__test__'), { recursive: true, force: true }).catch(() => {});
});
