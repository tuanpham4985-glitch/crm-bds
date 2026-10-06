import { test } from 'node:test';
import assert from 'node:assert/strict';
import { photoRetentionCutoff } from '../../src/lib/attendance-photo-retention';

// Giờ VN = UTC+7
const vn = (iso: string) => new Date(`${iso}+07:00`);

test('ngày 1..15: vẫn giữ ảnh tháng trước', () => {
  assert.equal(photoRetentionCutoff(vn('2026-10-01T00:30:00')), '2026-09-01');
  assert.equal(photoRetentionCutoff(vn('2026-10-15T23:59:00')), '2026-09-01');
});

test('từ ngày 16: xóa ảnh tháng trước', () => {
  assert.equal(photoRetentionCutoff(vn('2026-10-16T00:00:00')), '2026-10-01');
  assert.equal(photoRetentionCutoff(vn('2026-10-31T12:00:00')), '2026-10-01');
});

test('tháng 1 lùi về tháng 12 năm trước', () => {
  assert.equal(photoRetentionCutoff(vn('2027-01-05T08:00:00')), '2026-12-01');
});

test('dùng giờ VN, không dùng giờ UTC', () => {
  // 15/10 18:00 UTC = 16/10 01:00 giờ VN → đã qua ngày 15
  assert.equal(photoRetentionCutoff(new Date('2026-10-15T18:00:00Z')), '2026-10-01');
});
