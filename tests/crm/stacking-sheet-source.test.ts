import assert from 'node:assert/strict';
import test from 'node:test';
import { extractSheetId } from '../../src/lib/google-sheets';
import { reconcileVisibleColumns } from '../../src/lib/stacking-list';

// ─── extractSheetId: parse an toàn Link đầy đủ hoặc Sheet ID thô — dùng cả
// lúc thêm nguồn (addStackingConfig) lẫn lúc đổi Sheet của nguồn đã có
// (PATCH /api/stacking/configs) — PHẢI parse ĐÚNG như nhau ở cả 2 flow ──────

test('extractSheetId: full Google Sheets URL (dạng /edit) -> đúng ID', () => {
  const url = 'https://docs.google.com/spreadsheets/d/1ZACRtVRTT0Bhz4HLbQtGXQv1LoZLWhbedHat2BZP5fg/edit#gid=0';
  assert.equal(extractSheetId(url), '1ZACRtVRTT0Bhz4HLbQtGXQv1LoZLWhbedHat2BZP5fg');
});

test('extractSheetId: full URL không có #gid hay query -> đúng ID', () => {
  const url = 'https://docs.google.com/spreadsheets/d/1ZACRtVRTT0Bhz4HLbQtGXQv1LoZLWhbedHat2BZP5fg';
  assert.equal(extractSheetId(url), '1ZACRtVRTT0Bhz4HLbQtGXQv1LoZLWhbedHat2BZP5fg');
});

test('extractSheetId: full URL kèm query "usp=sharing" -> đúng ID', () => {
  const url = 'https://docs.google.com/spreadsheets/d/1ZACRtVRTT0Bhz4HLbQtGXQv1LoZLWhbedHat2BZP5fg/edit?usp=sharing';
  assert.equal(extractSheetId(url), '1ZACRtVRTT0Bhz4HLbQtGXQv1LoZLWhbedHat2BZP5fg');
});

test('extractSheetId: raw Sheet ID (không phải URL) -> giữ nguyên, chỉ trim', () => {
  assert.equal(extractSheetId('1ZACRtVRTT0Bhz4HLbQtGXQv1LoZLWhbedHat2BZP5fg'), '1ZACRtVRTT0Bhz4HLbQtGXQv1LoZLWhbedHat2BZP5fg');
  assert.equal(extractSheetId('  1ZACRtVRTT0Bhz4HLbQtGXQv1LoZLWhbedHat2BZP5fg  '), '1ZACRtVRTT0Bhz4HLbQtGXQv1LoZLWhbedHat2BZP5fg');
});

test('extractSheetId: input rỗng/khoảng trắng -> chuỗi rỗng (KHÔNG throw) — endpoint validate riêng, hàm này chỉ parse', () => {
  assert.equal(extractSheetId(''), '');
  assert.equal(extractSheetId('   '), '');
});

test('extractSheetId: input không phải URL/ID hợp lệ (VD text bất kỳ) -> trả về nguyên input đã trim — validate access thật xảy ra ở probeStackingSheet (gọi Google API), không phải ở đây', () => {
  assert.equal(extractSheetId('không phải sheet id'), 'không phải sheet id');
});

// ─── reconcileVisibleColumns: đối chiếu cột đã chọn với header Sheet MỚI khi
// Admin đổi Google Sheet backing 1 nguồn — Sheet mới có thể có header khác
// hẳn, không được silently giữ cột đã mất hay crash ────────────────────────

test('reconcileVisibleColumns: mọi cột cũ vẫn còn trong Sheet mới -> kept đủ, removed rỗng', () => {
  const { kept, removed } = reconcileVisibleColumns(['Mã căn', 'Giá'], ['Mã căn', 'Giá', 'Diện tích']);
  assert.deepEqual(kept, ['Mã căn', 'Giá']);
  assert.deepEqual(removed, []);
});

test('reconcileVisibleColumns: 1 số cột cũ không còn trong Sheet mới -> kept chỉ giữ cột còn, removed liệt kê đúng cột mất', () => {
  const { kept, removed } = reconcileVisibleColumns(['Mã căn', 'Giá', 'Cột Đã Xoá'], ['Mã căn', 'Giá', 'Diện tích']);
  assert.deepEqual(kept, ['Mã căn', 'Giá']);
  assert.deepEqual(removed, ['Cột Đã Xoá']);
});

test('reconcileVisibleColumns: TOÀN BỘ cột cũ mất hết (Sheet mới hoàn toàn khác header) -> kept rỗng, removed = toàn bộ cột cũ, KHÔNG throw', () => {
  const { kept, removed } = reconcileVisibleColumns(['Cột A', 'Cột B'], ['Header Khác 1', 'Header Khác 2']);
  assert.deepEqual(kept, []);
  assert.deepEqual(removed, ['Cột A', 'Cột B']);
});

test('reconcileVisibleColumns: kept theo ĐÚNG thứ tự Sheet MỚI, không phải thứ tự lựa chọn cũ', () => {
  const { kept } = reconcileVisibleColumns(['Giá', 'Mã căn'], ['Mã căn', 'Diện tích', 'Giá']);
  assert.deepEqual(kept, ['Mã căn', 'Giá']);
});

test('reconcileVisibleColumns: oldColumns rỗng (nguồn cũ đang "hiện tất cả cột") -> kept/removed đều rỗng, không tự suy đoán', () => {
  const { kept, removed } = reconcileVisibleColumns([], ['Mã căn', 'Giá']);
  assert.deepEqual(kept, []);
  assert.deepEqual(removed, []);
});

test('reconcileVisibleColumns: newHeaders rỗng (Sheet mới không đọc được cột nào) -> kept rỗng, removed = toàn bộ cột cũ', () => {
  const { kept, removed } = reconcileVisibleColumns(['Mã căn', 'Giá'], []);
  assert.deepEqual(kept, []);
  assert.deepEqual(removed, ['Mã căn', 'Giá']);
});
