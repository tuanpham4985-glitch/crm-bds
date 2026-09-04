import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isTmbAvailableForConfig, TMB_MAP_CONFIG_ID, TMB_MAP_UNITS, TMB_PDF_URL, TMB_PDF_PAGE_NUMBER,
  resolveTmbMapProfile, TMB_HLX_VBM_CONFIG_ID, TMB_HLX_VBM_UNITS, TMB_HLX_VBM_PDF_URL,
} from '../../src/app/stacking/tmb-map-data';

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

// ─── resolveTmbMapProfile — multi-project registry (task hiện tại: thêm HLX
// VBM1 cạnh Saigon Park, dùng CHUNG 1 renderer qua profile) — test bắt buộc
// #1/#2/#5 (project resolution + Saigon Park không regression + coordinate
// bounds) ───────────────────────────────────────────────────────────────────

test('resolveTmbMapProfile: Saigon Park (TMB_MAP_CONFIG_ID) -> đúng profile, KHÔNG regression so với hằng số cũ (TMB_PDF_URL/TMB_MAP_UNITS)', () => {
  const profile = resolveTmbMapProfile({ id: TMB_MAP_CONFIG_ID });
  assert.ok(profile);
  assert.equal(profile.configId, TMB_MAP_CONFIG_ID);
  assert.equal(profile.pdfUrl, TMB_PDF_URL);
  assert.equal(profile.pdfPageNumber, TMB_PDF_PAGE_NUMBER);
  assert.equal(profile.units, TMB_MAP_UNITS); // CÙNG reference — không copy/duplicate dữ liệu
  assert.equal(profile.label, 'Vinhomes Sài Gòn Park');
});

test('resolveTmbMapProfile: HLX VBM1 (TMB_HLX_VBM_CONFIG_ID) -> đúng profile mới thêm', () => {
  const profile = resolveTmbMapProfile({ id: TMB_HLX_VBM_CONFIG_ID });
  assert.ok(profile);
  assert.equal(profile.configId, TMB_HLX_VBM_CONFIG_ID);
  assert.equal(profile.pdfUrl, TMB_HLX_VBM_PDF_URL);
  assert.equal(profile.pdfPageNumber, 1);
  assert.equal(profile.units, TMB_HLX_VBM_UNITS);
  assert.match(profile.label, /HLX/);
});

test('resolveTmbMapProfile: config.id lạ/không thuộc profile nào -> null (test bắt buộc #1, project resolution KHÔNG suy đoán/fallback)', () => {
  assert.equal(resolveTmbMapProfile({ id: 'SC_khac_hoan_toan' }), null);
});

test('resolveTmbMapProfile: null/undefined -> null, không throw', () => {
  assert.equal(resolveTmbMapProfile(null), null);
  assert.equal(resolveTmbMapProfile(undefined), null);
});

test('isTmbAvailableForConfig: TMB_HLX_VBM_CONFIG_ID -> true (nguồn HLX giờ đã có TMB profile)', () => {
  assert.equal(isTmbAvailableForConfig({ id: TMB_HLX_VBM_CONFIG_ID }), true);
});

// ─── HLX VBM1 unit mapping — test bắt buộc #3/#4/#5/#6/#7 ───────────────────

test('TMB_HLX_VBM_UNITS: ĐÚNG 5 mã, khớp 1:1 với source Bảng hàng sheet DQ (VBM1) — không invent mapping cho unit không tìm thấy', () => {
  const codes = TMB_HLX_VBM_UNITS.map(u => u.unitCode).sort();
  assert.deepEqual(codes, ['BM17-12', 'BM34-25', 'BM54-03', 'BM57-28', 'BM6-13']);
});

test('TMB_HLX_VBM_UNITS: mọi mã UNIQUE — không unit nào trùng lặp (exact-match authority, xem tmb-map-matching.ts)', () => {
  const codes = TMB_HLX_VBM_UNITS.map(u => u.unitCode.trim().toUpperCase());
  assert.equal(new Set(codes).size, codes.length);
});

test('TMB_HLX_VBM_UNITS: mọi toạ độ là số hữu hạn (không NaN/rỗng, không invent 0,0) và nằm trong biên trang PDF (1600 x 1200, unrotated scale=1, đã audit trực tiếp qua pdf.js)', () => {
  const PAGE_WIDTH = 1600, PAGE_HEIGHT = 1200;
  for (const u of TMB_HLX_VBM_UNITS) {
    assert.ok(Number.isFinite(u.pdfX), `${u.unitCode}: pdfX phải là số hữu hạn`);
    assert.ok(Number.isFinite(u.pdfY), `${u.unitCode}: pdfY phải là số hữu hạn`);
    assert.ok(u.pdfX >= 0 && u.pdfX <= PAGE_WIDTH, `${u.unitCode}: pdfX phải nằm trong biên trang [0, ${PAGE_WIDTH}]`);
    assert.ok(u.pdfY >= 0 && u.pdfY <= PAGE_HEIGHT, `${u.unitCode}: pdfY phải nằm trong biên trang [0, ${PAGE_HEIGHT}]`);
  }
});

test('TMB_HLX_VBM_UNITS: đúng 5 mã unit universe HLX v1 — KHÔNG mở rộng thêm phân khu khác (BM88/BM87/... tìm thấy trong PDF nhưng KHÔNG thuộc VBM1/Bảng hàng hiện có -> KHÔNG được map)', () => {
  assert.equal(TMB_HLX_VBM_UNITS.length, 5);
  const codes = new Set(TMB_HLX_VBM_UNITS.map(u => u.unitCode));
  assert.equal(codes.has('BM88-17'), false); // xuất hiện trong PDF (audit thấy) nhưng KHÔNG thuộc VBM1 Bảng hàng -> đúng phải bị loại
  assert.equal(codes.has('BM87-18'), false);
});
