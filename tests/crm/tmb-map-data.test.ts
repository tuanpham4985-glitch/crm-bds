import assert from 'node:assert/strict';
import test from 'node:test';
import { isTmbAvailableForConfig, TMB_MAP_CONFIG_ID } from '../../src/app/stacking/tmb-map-data';

// ─── isTmbAvailableForConfig: identity ổn định (config.id), KHÔNG phụ thuộc
// sheet_id (mutable từ khi cho phép Admin đổi Google Sheet backing 1 nguồn
// đã đăng ký) — đây CHÍNH LÀ bug đã audit + fix ("Tổng mặt bằng" biến mất
// sai nếu Sheet ID đổi dù vẫn cùng 1 nguồn/dự án) ───────────────────────────

test('isTmbAvailableForConfig: đúng config.id -> true, bất kể sheet_id là gì', () => {
  assert.equal(isTmbAvailableForConfig({ id: TMB_MAP_CONFIG_ID }), true);
});

test('isTmbAvailableForConfig: SAU KHI đổi Sheet (sheet_id khác, id KHÔNG đổi) -> vẫn true — đây là mục tiêu chính của fix, TMB phải sống sót qua đổi Sheet', () => {
  // updateStackingConfig KHÔNG BAO GIỜ đổi id (chỉ addStackingConfig sinh 1
  // lần lúc tạo nguồn) — mô phỏng đúng config sau khi PATCH sheet_id thành công.
  const configAfterSheetChange = { id: TMB_MAP_CONFIG_ID, sheet_id: 'MOT_SHEET_ID_HOAN_TOAN_KHAC' };
  assert.equal(isTmbAvailableForConfig(configAfterSheetChange), true);
});

test('isTmbAvailableForConfig: config.id khác (nguồn khác, kể cả nếu tình cờ trùng sheet_id cũ) -> false', () => {
  assert.equal(isTmbAvailableForConfig({ id: 'SC_khac' }), false);
});

test('isTmbAvailableForConfig: null/undefined (chưa chọn nguồn nào) -> false, không throw', () => {
  assert.equal(isTmbAvailableForConfig(null), false);
  assert.equal(isTmbAvailableForConfig(undefined), false);
});
