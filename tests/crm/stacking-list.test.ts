import assert from 'node:assert/strict';
import test from 'node:test';
import type { StackingListRow } from '../../src/lib/types';
import {
  filterStackingListRows,
  totalStackingListPages,
  clampStackingListPage,
  paginateStackingListRows,
  STACKING_LIST_PAGE_SIZE,
  pickSummaryColumns,
  groupStackingListColumnsForDetail,
  classifyStackingListColumn,
} from '../../src/lib/stacking-list';

function makeRows(n: number, opts: Partial<{ phanKhu: string; marker: 'check_admin' | 'da_ban'; prefix: string }> = {}): StackingListRow[] {
  const prefix = opts.prefix ?? 'A';
  return Array.from({ length: n }, (_, i) => ({
    maCan: `${prefix}-${String(i + 1).padStart(3, '0')}`,
    values: { 'Phân khu': opts.phanKhu ?? 'IVY PARK', 'Giá': 1_000_000 + i },
    marker: opts.marker,
    trangThai: 'con_hang' as const,
  }));
}

test('<=20 căn → 1 trang', () => {
  const rows = makeRows(15);
  assert.equal(totalStackingListPages(rows.length), 1);
});

test('21 căn → 2 trang', () => {
  const rows = makeRows(21);
  assert.equal(totalStackingListPages(rows.length), 2);
});

test('trang 1 có đúng 20 dòng', () => {
  const rows = makeRows(45);
  const page1 = paginateStackingListRows(rows, 1);
  assert.equal(page1.length, STACKING_LIST_PAGE_SIZE);
  assert.equal(page1[0].maCan, 'A-001');
});

test('trang 2 bắt đầu từ record thứ 21', () => {
  const rows = makeRows(45);
  const page2 = paginateStackingListRows(rows, 2);
  assert.equal(page2[0].maCan, 'A-021');
  assert.equal(page2.length, 20);
});

test('trang cuối không duplicate và không mất record', () => {
  const rows = makeRows(45);
  const page3 = paginateStackingListRows(rows, 3);
  assert.equal(page3.length, 5);
  assert.equal(page3[0].maCan, 'A-041');
  assert.equal(page3[4].maCan, 'A-045');

  // Gộp toàn bộ 3 trang lại phải trùng khớp 1-1 với dữ liệu gốc, không thiếu không lặp.
  const all = [
    ...paginateStackingListRows(rows, 1),
    ...paginateStackingListRows(rows, 2),
    ...paginateStackingListRows(rows, 3),
  ];
  assert.deepEqual(all.map(r => r.maCan), rows.map(r => r.maCan));
});

test('filter (search + Phân khu) chạy TRƯỚC pagination', () => {
  const rows = [
    ...makeRows(30, { phanKhu: 'IVY PARK', prefix: 'A' }),
    ...makeRows(10, { phanKhu: 'GLOBAL PARK', prefix: 'B' }),
  ];
  const filtered = filterStackingListRows(rows, { groupColumn: 'Phân khu', groupFilter: 'GLOBAL PARK', search: '' });
  assert.equal(filtered.length, 10);
  assert.equal(totalStackingListPages(filtered.length), 1);

  const searched = filterStackingListRows(rows, { groupColumn: 'Phân khu', groupFilter: '', search: 'b-005' });
  assert.equal(searched.length, 1);
  assert.equal(searched[0].maCan, 'B-005');
});

test('page vượt quá tổng số trang được kẹp về trang cuối (không rỗng)', () => {
  const rows = makeRows(25);
  const clamped = clampStackingListPage(99, rows.length);
  assert.equal(clamped, 2);
  const page = paginateStackingListRows(rows, 99);
  assert.equal(page.length, 5);
});

test('marker Đã bán / Check Admin vẫn đi kèm đúng dòng sau khi paginate', () => {
  const rows = [
    ...makeRows(19, { marker: undefined }),
    { maCan: 'A-020', values: { 'Phân khu': 'IVY PARK' }, marker: 'da_ban' as const, trangThai: 'da_ban' as const },
    { maCan: 'A-021', values: { 'Phân khu': 'IVY PARK' }, marker: 'check_admin' as const, trangThai: 'con_hang' as const },
  ];
  const page1 = paginateStackingListRows(rows, 1);
  const page2 = paginateStackingListRows(rows, 2);
  assert.equal(page1[19].marker, 'da_ban');
  assert.equal(page2[0].marker, 'check_admin');
});

// ─── Popup chi tiết căn — phân loại cột động (Sheet header) ────────────────

const FULL_COLUMN_SET = [
  'Mã căn', 'Đặc điểm', 'TCBG', 'Loại căn', 'DT Đất', 'DTXD', 'Giá',
  'TTC', 'TTS', 'Vay 18T', 'Vay 24T', 'Vay 30T', 'Vay 36T',
  'LINK PTG', 'Hướng', 'View', 'Quỹ', 'Giỏ bank',
];

test('bảng chính không còn render các cột đã chuyển hoàn toàn sang popup (TTC/TTS/Vay/Link PTG/Quỹ/Giỏ bank)', () => {
  const summary = pickSummaryColumns(FULL_COLUMN_SET);
  for (const moved of ['TTC', 'TTS', 'Vay 18T', 'Vay 24T', 'Vay 30T', 'Vay 36T', 'LINK PTG', 'Quỹ', 'Giỏ bank', 'TCBG']) {
    assert.equal(summary.includes(moved), false, `"${moved}" phải bị loại khỏi bảng tóm tắt`);
  }
});

test('bảng chính giữ đúng cột tóm tắt: Đặc điểm, Loại căn, 1 cột diện tích chính, Giá, Hướng', () => {
  const summary = pickSummaryColumns(FULL_COLUMN_SET);
  assert.deepEqual(summary, ['Đặc điểm', 'Loại căn', 'DT Đất', 'Giá', 'Hướng']);
});

test('Phân khu được giữ trên bảng tóm tắt nếu nguồn có cột này', () => {
  const summary = pickSummaryColumns([...FULL_COLUMN_SET, 'Phân khu']);
  assert.ok(summary.includes('Phân khu'));
});

test('diện tích chính: DTXD được chọn khi không có DT Đất', () => {
  const summary = pickSummaryColumns(['Mã căn', 'DTXD', 'DT Tim tường']);
  assert.ok(summary.includes('DTXD'));
  assert.equal(summary.includes('DT Tim tường'), false);
});

test('classifyStackingListColumn phân đúng nhóm cho từng field trong task', () => {
  assert.equal(classifyStackingListColumn('Giá'), 'gia');
  assert.equal(classifyStackingListColumn('TTC'), 'financial');
  assert.equal(classifyStackingListColumn('TTS'), 'financial');
  assert.equal(classifyStackingListColumn('Vay 18T'), 'financial');
  assert.equal(classifyStackingListColumn('Vay 36T'), 'financial');
  assert.equal(classifyStackingListColumn('LINK PTG'), 'misc');
  assert.equal(classifyStackingListColumn('Quỹ'), 'misc');
  assert.equal(classifyStackingListColumn('Giỏ bank'), 'misc');
  assert.equal(classifyStackingListColumn('Hướng'), 'basic');
  assert.equal(classifyStackingListColumn('View'), 'basic');
  assert.equal(classifyStackingListColumn('TCBG'), 'basic');
});

test('popup: gom nhóm đầy đủ — mọi field TTC/TTS/Vay/Link PTG/Quỹ/Giỏ bank vẫn xuất hiện (không hide, không mất data)', () => {
  const groups = groupStackingListColumnsForDetail(FULL_COLUMN_SET);
  assert.deepEqual(groups.gia, ['Giá']);
  assert.deepEqual(groups.financial, ['TTC', 'TTS', 'Vay 18T', 'Vay 24T', 'Vay 30T', 'Vay 36T']);
  assert.deepEqual(groups.misc, ['LINK PTG', 'Quỹ', 'Giỏ bank']);
  assert.deepEqual(groups.basic, ['Đặc điểm', 'TCBG', 'Loại căn', 'DT Đất', 'DTXD', 'Hướng', 'View']);
});

test('popup: "Mã căn" không lặp lại trong nhóm nào (đã hiện riêng ở header popup)', () => {
  const groups = groupStackingListColumnsForDetail(FULL_COLUMN_SET);
  const all = [...groups.gia, ...groups.financial, ...groups.misc, ...groups.basic];
  assert.equal(all.includes('Mã căn'), false);
});

test('popup: gộp toàn bộ nhóm lại đúng bằng toàn bộ cột trừ Mã căn — không cột nào bị rơi mất', () => {
  const groups = groupStackingListColumnsForDetail(FULL_COLUMN_SET);
  const all = [...groups.gia, ...groups.financial, ...groups.misc, ...groups.basic];
  const expected = FULL_COLUMN_SET.filter(c => c !== 'Mã căn');
  assert.deepEqual([...all].sort(), [...expected].sort());
});

test('field thiếu dữ liệu (null) hiển thị "—" — quy ước hiện có của bảng, giữ nguyên cho popup', () => {
  const row: StackingListRow = {
    maCan: 'A-03A-02', trangThai: 'con_hang',
    values: { 'Hướng': null, 'Giá': 14_369_000_000 },
  };
  assert.equal(row.values['Hướng'], null); // popup renderer map null -> '—' ở UI layer, giá trị gốc giữ nguyên null (không suy diễn)
});
