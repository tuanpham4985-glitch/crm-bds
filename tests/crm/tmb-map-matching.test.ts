import assert from 'node:assert/strict';
import test from 'node:test';
import type { StackingListRow } from '../../src/lib/types';
import {
  normalizeUnitCode,
  buildMaCanIndex,
  matchTmbUnitCode,
  resolveTmbUnitState,
  summarizeTmbInventory,
} from '../../src/app/stacking/tmb-map-matching';
import { TMB_MAP_UNITS } from '../../src/app/stacking/tmb-map-data';

function row(maCan: string, opts: Partial<{ trangThai: StackingListRow['trangThai']; marker: 'check_admin' | 'da_ban' }> = {}): StackingListRow {
  return { maCan, values: {}, trangThai: opts.trangThai ?? 'con_hang', marker: opts.marker };
}

// ─── normalizeUnitCode — trim/case/whitespace only, no fuzzy ──────────────

test('normalizeUnitCode: trim + uppercase + gộp khoảng trắng, không đổi ký tự khác', () => {
  assert.equal(normalizeUnitCode('  tl28-04  '), 'TL28-04');
  assert.equal(normalizeUnitCode('TL28 - 04'), 'TL28-04');
  assert.equal(normalizeUnitCode('TL28-04'), 'TL28-04');
});

// ─── matching: matched / unmatched / ambiguous ────────────────────────────

test('matchTmbUnitCode: khớp đúng 1 dòng -> matched', () => {
  const idx = buildMaCanIndex([row('TL28-04')]);
  const res = matchTmbUnitCode('TL28-04', idx);
  assert.equal(res.kind, 'matched');
});

test('matchTmbUnitCode: không có dòng nào -> unmatched, KHÔNG suy đoán/fuzzy', () => {
  const idx = buildMaCanIndex([row('TL28-04')]);
  const res = matchTmbUnitCode('TL28-40', idx); // gần giống nhưng khác hẳn
  assert.equal(res.kind, 'unmatched');
});

test('matchTmbUnitCode: 2 dòng cùng maCan (data lỗi ở Sheet) -> ambiguous, không tự chọn đại 1 dòng', () => {
  const idx = buildMaCanIndex([row('TL28-04'), row('TL28-04')]);
  const res = matchTmbUnitCode('TL28-04', idx);
  assert.equal(res.kind, 'ambiguous');
  assert.equal(res.kind === 'ambiguous' && res.count, 2);
});

test('matchTmbUnitCode: normalize an toàn áp dụng cả 2 phía (PDF lẫn Sheet)', () => {
  const idx = buildMaCanIndex([row(' tl28-04 ')]);
  const res = matchTmbUnitCode('TL28-04', idx);
  assert.equal(res.kind, 'matched');
});

// ─── resolveTmbUnitState: available chỉ khi matched + effectiveDotStatus === con_hang ─

test('Còn hàng (trangThai con_hang, không marker) -> available = true, marker active', () => {
  const idx = buildMaCanIndex([row('TL28-01', { trangThai: 'con_hang' })]);
  const state = resolveTmbUnitState('TL28-01', idx);
  assert.equal(state.available, true);
});

test('Đã bán (trangThai da_ban) -> available = false, KHÔNG active', () => {
  const idx = buildMaCanIndex([row('TL28-01', { trangThai: 'da_ban' })]);
  const state = resolveTmbUnitState('TL28-01', idx);
  assert.equal(state.available, false);
});

test('Đang xem (trangThai dang_xem) -> available = false, KHÔNG active', () => {
  const idx = buildMaCanIndex([row('TL28-01', { trangThai: 'dang_xem' })]);
  const state = resolveTmbUnitState('TL28-01', idx);
  assert.equal(state.available, false);
});

test('marker "Đã bán" từ Sheet override effectiveDotStatus dù Pipeline vẫn con_hang -> available = false (reuse đúng authority, không tạo công thức riêng)', () => {
  const idx = buildMaCanIndex([row('TL28-01', { trangThai: 'con_hang', marker: 'da_ban' })]);
  const state = resolveTmbUnitState('TL28-01', idx);
  assert.equal(state.available, false);
});

test('marker "check_admin" KHÔNG ảnh hưởng — vẫn Còn hàng nếu Pipeline là con_hang', () => {
  const idx = buildMaCanIndex([row('TL28-01', { trangThai: 'con_hang', marker: 'check_admin' })]);
  const state = resolveTmbUnitState('TL28-01', idx);
  assert.equal(state.available, true);
});

test('unmatched -> available = false, không active', () => {
  const idx = buildMaCanIndex([]);
  const state = resolveTmbUnitState('TL28-99', idx);
  assert.equal(state.match.kind, 'unmatched');
  assert.equal(state.available, false);
});

test('ambiguous -> available = false, không chọn bừa 1 trong 2 dòng', () => {
  const idx = buildMaCanIndex([row('TL28-01', { trangThai: 'con_hang' }), row('TL28-01', { trangThai: 'da_ban' })]);
  const state = resolveTmbUnitState('TL28-01', idx);
  assert.equal(state.match.kind, 'ambiguous');
  assert.equal(state.available, false);
});

// ─── động theo dữ liệu mới — đổi trạng thái ở Bảng hàng thì TMB tự đổi theo ─

test('đổi trangThai Còn hàng -> Đã bán (dữ liệu Bảng hàng thay đổi) -> marker tự chuyển non-active, không cần sửa spatial map', () => {
  const rowsBefore = [row('TL28-01', { trangThai: 'con_hang' })];
  const stateBefore = resolveTmbUnitState('TL28-01', buildMaCanIndex(rowsBefore));
  assert.equal(stateBefore.available, true);

  const rowsAfter = [row('TL28-01', { trangThai: 'da_ban' })]; // cùng unitCode, chỉ đổi trạng thái
  const stateAfter = resolveTmbUnitState('TL28-01', buildMaCanIndex(rowsAfter));
  assert.equal(stateAfter.available, false);
});

// ─── summarizeTmbInventory — derive từ runtime data, không hard-code ──────

test('summarizeTmbInventory: tổng hợp đúng theo từng nhóm, tổng khớp số đầu vào', () => {
  const idx = buildMaCanIndex([
    row('TL28-01', { trangThai: 'con_hang' }),  // available
    row('TL28-02', { trangThai: 'da_ban' }),    // matched, other status
    row('TL28-03', { trangThai: 'dang_xem' }),  // matched, other status
    row('TL28-04', { trangThai: 'con_hang' }),  // available
    row('TL28-06', { trangThai: 'con_hang' }),  // available, dùng cho ambiguous bên dưới
    row('TL28-06', { trangThai: 'da_ban' }),    // trùng mã -> TL28-06 thành ambiguous
    // TL28-05 không có trong Sheet -> unmatched
  ]);
  const codes = ['TL28-01', 'TL28-02', 'TL28-03', 'TL28-04', 'TL28-05', 'TL28-06'];
  const states = codes.map(c => resolveTmbUnitState(c, idx));
  const summary = summarizeTmbInventory(states);

  assert.equal(summary.total, 6);
  assert.equal(summary.matched, 4); // 01, 02, 03, 04 matched (05 unmatched, 06 ambiguous)
  assert.equal(summary.available, 2); // 01, 04
  assert.equal(summary.otherStatus, 2); // 02 (da_ban), 03 (dang_xem)
  assert.equal(summary.unmatched, 1); // 05
  assert.equal(summary.ambiguous, 1); // 06
  assert.equal(summary.matched + summary.unmatched + summary.ambiguous, summary.total);
  assert.equal(summary.available + summary.otherStatus, summary.matched);
});

test('summarizeTmbInventory: danh sách rỗng không lỗi', () => {
  const summary = summarizeTmbInventory([]);
  assert.deepEqual(summary, { total: 0, matched: 0, available: 0, otherStatus: 0, unmatched: 0, ambiguous: 0 });
});

// ─── Spatial map thật (22 mã, audit trực tiếp getStackingListRows, giao 100% với PDF) ─
// Không test lại giao thật với Bảng hàng SỐNG ở đây (phụ thuộc Google Sheets
// API, không deterministic offline) — chỉ đảm bảo cấu trúc dữ liệu không bị
// hỏng do sửa sau này (không trùng mã, không toạ độ rỗng/NaN).

test('TMB_MAP_UNITS: 22 mã, không trùng lặp', () => {
  assert.equal(TMB_MAP_UNITS.length, 22);
  const uniqueCodes = new Set(TMB_MAP_UNITS.map(h => normalizeUnitCode(h.unitCode)));
  assert.equal(uniqueCodes.size, TMB_MAP_UNITS.length);
});

test('TMB_MAP_UNITS: mọi toạ độ là số hữu hạn (không NaN/rỗng, không invent 0,0)', () => {
  for (const h of TMB_MAP_UNITS) {
    assert.ok(Number.isFinite(h.pdfX), `${h.unitCode}: pdfX phải là số hữu hạn`);
    assert.ok(Number.isFinite(h.pdfY), `${h.unitCode}: pdfY phải là số hữu hạn`);
    assert.notEqual(h.pdfX, 0);
    assert.notEqual(h.pdfY, 0);
  }
});

test('TMB_MAP_UNITS: resolveTmbUnitState với đúng maCan thật (AS72-04, TL12-67, TL12-31 = Đã bán theo screenshot production) không throw và match được', () => {
  const rows: StackingListRow[] = [
    row('AS72-04', { trangThai: 'da_ban' }),
    row('TL12-67', { trangThai: 'da_ban' }),
    row('TL12-31', { trangThai: 'da_ban' }),
    row('AS80-08', { trangThai: 'con_hang' }),
  ];
  const idx = buildMaCanIndex(rows);
  const states = TMB_MAP_UNITS.map(h => resolveTmbUnitState(h.unitCode, idx));
  const byCode = new Map(states.map(s => [s.unitCode, s]));
  assert.equal(byCode.get('AS72-04')?.available, false);
  assert.equal(byCode.get('TL12-67')?.available, false);
  assert.equal(byCode.get('TL12-31')?.available, false);
  assert.equal(byCode.get('AS80-08')?.available, true);
  // 18 mã còn lại không có trong `rows` giả lập -> unmatched, không throw
  const summary = summarizeTmbInventory(states);
  assert.equal(summary.total, 22);
  assert.equal(summary.available, 1);
  assert.equal(summary.otherStatus, 3);
  assert.equal(summary.unmatched, 18);
});
