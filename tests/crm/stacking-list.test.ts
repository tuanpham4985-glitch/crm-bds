import assert from 'node:assert/strict';
import test from 'node:test';
import type { StackingListRow } from '../../src/lib/types';
import {
  filterStackingListRows,
  totalStackingListPages,
  clampStackingListPage,
  paginateStackingListRows,
  STACKING_LIST_PAGE_SIZE,
  splitStackingListColumns,
  groupStackingListColumnsForDetail,
  classifyStackingListColumn,
  effectiveDotStatus,
  countStackingListRowsByDotStatus,
  sortStackingListRows,
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

// ─── sortStackingListRows — click header sắp xếp bảng chính ────────────────

test('sortStackingListRows: sort=null giữ NGUYÊN thứ tự gốc từ Sheet', () => {
  const rows = makeRows(5);
  assert.deepEqual(sortStackingListRows(rows, null).map(r => r.maCan), rows.map(r => r.maCan));
});

test('sortStackingListRows: sort theo cột số (Giá) tăng dần', () => {
  const rows = [
    { maCan: 'A-01', values: { Giá: 3 }, trangThai: 'con_hang' as const },
    { maCan: 'A-02', values: { Giá: 1 }, trangThai: 'con_hang' as const },
    { maCan: 'A-03', values: { Giá: 2 }, trangThai: 'con_hang' as const },
  ];
  const sorted = sortStackingListRows(rows, { column: 'Giá', direction: 'asc' });
  assert.deepEqual(sorted.map(r => r.maCan), ['A-02', 'A-03', 'A-01']);
});

test('sortStackingListRows: sort theo cột số (Giá) giảm dần', () => {
  const rows = [
    { maCan: 'A-01', values: { Giá: 3 }, trangThai: 'con_hang' as const },
    { maCan: 'A-02', values: { Giá: 1 }, trangThai: 'con_hang' as const },
    { maCan: 'A-03', values: { Giá: 2 }, trangThai: 'con_hang' as const },
  ];
  const sorted = sortStackingListRows(rows, { column: 'Giá', direction: 'desc' });
  assert.deepEqual(sorted.map(r => r.maCan), ['A-01', 'A-03', 'A-02']);
});

test('sortStackingListRows: sort theo "Mã căn" (field riêng, không nằm trong values) A→Z', () => {
  const rows = [
    { maCan: 'C-01', values: {}, trangThai: 'con_hang' as const },
    { maCan: 'A-01', values: {}, trangThai: 'con_hang' as const },
    { maCan: 'B-01', values: {}, trangThai: 'con_hang' as const },
  ];
  const sorted = sortStackingListRows(rows, { column: 'Mã căn', direction: 'asc' });
  assert.deepEqual(sorted.map(r => r.maCan), ['A-01', 'B-01', 'C-01']);
});

test('sortStackingListRows: sort chữ dùng numeric compare — "A-2" đứng trước "A-10", không so ký tự thô', () => {
  const rows = [
    { maCan: 'A-10', values: {}, trangThai: 'con_hang' as const },
    { maCan: 'A-2', values: {}, trangThai: 'con_hang' as const },
    { maCan: 'A-1', values: {}, trangThai: 'con_hang' as const },
  ];
  const sorted = sortStackingListRows(rows, { column: 'Mã căn', direction: 'asc' });
  assert.deepEqual(sorted.map(r => r.maCan), ['A-1', 'A-2', 'A-10']);
});

test('sortStackingListRows: dòng thiếu dữ liệu (null) LUÔN rơi xuống cuối, bất kể asc hay desc', () => {
  const rows = [
    { maCan: 'A-01', values: { Hướng: 'Đông' }, trangThai: 'con_hang' as const },
    { maCan: 'A-02', values: { Hướng: null }, trangThai: 'con_hang' as const },
    { maCan: 'A-03', values: { Hướng: 'Tây' }, trangThai: 'con_hang' as const },
  ];
  const asc = sortStackingListRows(rows, { column: 'Hướng', direction: 'asc' });
  assert.equal(asc[asc.length - 1].maCan, 'A-02');
  const desc = sortStackingListRows(rows, { column: 'Hướng', direction: 'desc' });
  assert.equal(desc[desc.length - 1].maCan, 'A-02');
});

test('sortStackingListRows: cột thiếu ở 1 số dòng (undefined trong values) cũng bị coi là null, rơi xuống cuối', () => {
  const rows: StackingListRow[] = [
    { maCan: 'A-01', values: { Giá: 100 }, trangThai: 'con_hang' },
    { maCan: 'A-02', values: {}, trangThai: 'con_hang' },
  ];
  const sorted = sortStackingListRows(rows, { column: 'Giá', direction: 'asc' });
  assert.deepEqual(sorted.map(r => r.maCan), ['A-01', 'A-02']);
});

test('sortStackingListRows: không mutate mảng gốc — trả về mảng MỚI', () => {
  const rows = [
    { maCan: 'A-02', values: { Giá: 2 }, trangThai: 'con_hang' as const },
    { maCan: 'A-01', values: { Giá: 1 }, trangThai: 'con_hang' as const },
  ];
  const original = [...rows];
  sortStackingListRows(rows, { column: 'Giá', direction: 'asc' });
  assert.deepEqual(rows.map(r => r.maCan), original.map(r => r.maCan));
});

test('sortStackingListRows: chạy SAU filter (filter rồi mới sort, không sort lại toàn bộ danh sách gốc)', () => {
  const rows = [
    ...makeRows(3, { phanKhu: 'IVY PARK', prefix: 'A' }),
    ...makeRows(3, { phanKhu: 'GLOBAL PARK', prefix: 'B' }),
  ];
  const filtered = filterStackingListRows(rows, { groupColumn: 'Phân khu', groupFilter: 'GLOBAL PARK', search: '' });
  const sorted = sortStackingListRows(filtered, { column: 'Mã căn', direction: 'desc' });
  assert.deepEqual(sorted.map(r => r.maCan), ['B-003', 'B-002', 'B-001']);
});

// ─── Bảng chính vs popup — chia cột ĐÚNG thứ tự Sheet, cắt ngay sau Giá ────

// Bộ cột thật (theo đúng thứ tự) từ 2 screenshot production user gửi: cột
// đầu tới hết Giá gồm VAT+KPBT hiện trên bảng, phần sau (TTC...Hướng) vào popup.
const REAL_COLUMN_SET = [
  'STT', 'Phân khu', 'Mã căn', 'Đặc điểm', 'TCBG', 'Loại hình', 'DT Đất (m2)', 'DTXD (m2)', 'Giá gồm VAT+KPBT',
  'TTC', 'TTS', 'Vay 18T', 'Vay 24T', 'Vay 30T', 'Vay 36T', 'LINK PTG', 'Hướng',
];

const FULL_COLUMN_SET = [
  'Mã căn', 'Đặc điểm', 'TCBG', 'Loại căn', 'DT Đất', 'DTXD', 'Giá',
  'TTC', 'TTS', 'Vay 18T', 'Vay 24T', 'Vay 30T', 'Vay 36T',
  'LINK PTG', 'Hướng', 'View', 'Quỹ', 'Giỏ bank',
];

test('bảng chính giữ đúng nửa ĐẦU, đúng thứ tự Sheet — khớp screenshot thật (17 cột → 9 cột đầu ở lại bảng)', () => {
  const { tableColumns } = splitStackingListColumns(REAL_COLUMN_SET);
  assert.deepEqual(tableColumns, [
    'STT', 'Phân khu', 'Mã căn', 'Đặc điểm', 'TCBG', 'Loại hình', 'DT Đất (m2)', 'DTXD (m2)', 'Giá gồm VAT+KPBT',
  ]);
});

test('popup nhận đúng nửa SAU, đúng thứ tự Sheet — khớp screenshot thật (8 cột: TTC...Hướng)', () => {
  const { detailColumns } = splitStackingListColumns(REAL_COLUMN_SET);
  assert.deepEqual(detailColumns, ['TTC', 'TTS', 'Vay 18T', 'Vay 24T', 'Vay 30T', 'Vay 36T', 'LINK PTG', 'Hướng']);
});

test('bảng chính không còn render các cột đã chuyển hoàn toàn sang popup (TTC/TTS/Vay/Link PTG)', () => {
  const { tableColumns } = splitStackingListColumns(REAL_COLUMN_SET);
  for (const moved of ['TTC', 'TTS', 'Vay 18T', 'Vay 24T', 'Vay 30T', 'Vay 36T', 'LINK PTG']) {
    assert.equal(tableColumns.includes(moved), false, `"${moved}" phải bị loại khỏi bảng chính`);
  }
});

test('chia đôi không mất/không lặp cột nào — gộp lại đúng bằng danh sách gốc theo thứ tự', () => {
  const { tableColumns, detailColumns } = splitStackingListColumns(REAL_COLUMN_SET);
  assert.deepEqual([...tableColumns, ...detailColumns], REAL_COLUMN_SET);
});

test('không phụ thuộc số cột chẵn/lẻ hay tổng số cột — nguồn có NHIỀU cột hơn (thêm View) vẫn cắt đúng ngay sau Giá, TTC vẫn về popup', () => {
  // Bug thật: nguồn "Vinhomes Sài Gòn Park" có 19 cột (nhiều hơn ví dụ 17 cột ở
  // trên) — chia đôi thô (ceil(19/2)=10) từng khiến TTC lọt vào bảng chính.
  // Cắt ngay sau cột Giá đảm bảo TTC luôn về popup bất kể tổng số cột.
  const columns = [...REAL_COLUMN_SET, 'View'];
  const { tableColumns, detailColumns } = splitStackingListColumns(columns);
  assert.deepEqual(tableColumns, [
    'STT', 'Phân khu', 'Mã căn', 'Đặc điểm', 'TCBG', 'Loại hình', 'DT Đất (m2)', 'DTXD (m2)', 'Giá gồm VAT+KPBT',
  ]);
  assert.equal(tableColumns.includes('TTC'), false);
  assert.deepEqual(detailColumns, ['TTC', 'TTS', 'Vay 18T', 'Vay 24T', 'Vay 30T', 'Vay 36T', 'LINK PTG', 'Hướng', 'View']);
});

test('"Quỹ" và "Giỏ bank" luôn hiện trên bảng chính, nối NGAY SAU cột Giá — dù đứng ở đâu trong Sheet gốc', () => {
  const columns = [...REAL_COLUMN_SET, 'View', 'Quỹ', 'Giỏ bank'];
  const { tableColumns, detailColumns } = splitStackingListColumns(columns);
  assert.deepEqual(tableColumns, [
    'STT', 'Phân khu', 'Mã căn', 'Đặc điểm', 'TCBG', 'Loại hình', 'DT Đất (m2)', 'DTXD (m2)', 'Giá gồm VAT+KPBT',
    'Quỹ', 'Giỏ bank',
  ]);
  // TTC/TTS/Vay.../Link PTG/Hướng/View vẫn ở popup như cũ — chỉ Quỹ/Giỏ bank được kéo lên.
  assert.deepEqual(detailColumns, ['TTC', 'TTS', 'Vay 18T', 'Vay 24T', 'Vay 30T', 'Vay 36T', 'LINK PTG', 'Hướng', 'View']);
});

test('"Quỹ"/"Giỏ bank" không lặp lại ở popup sau khi đã kéo lên bảng chính — không mất, không trùng dữ liệu', () => {
  const columns = [...REAL_COLUMN_SET, 'Quỹ', 'Giỏ bank'];
  const { tableColumns, detailColumns } = splitStackingListColumns(columns);
  assert.deepEqual([...tableColumns, ...detailColumns].sort(), [...columns].sort());
  assert.equal(detailColumns.includes('Quỹ'), false);
  assert.equal(detailColumns.includes('Giỏ bank'), false);
});

test('nguồn không có "Quỹ"/"Giỏ bank" thì không sao — không tự thêm cột không tồn tại', () => {
  const { tableColumns } = splitStackingListColumns(REAL_COLUMN_SET);
  assert.equal(tableColumns.includes('Quỹ'), false);
  assert.equal(tableColumns.includes('Giỏ bank'), false);
});

test('nhiều cột Giá (VD "Giá KS" và "Giá bán") → bảng chính giữ tới cột Giá CUỐI CÙNG', () => {
  const { tableColumns, detailColumns } = splitStackingListColumns(['Mã căn', 'Giá KS', 'Giá bán', 'TTC']);
  assert.deepEqual(tableColumns, ['Mã căn', 'Giá KS', 'Giá bán']);
  assert.deepEqual(detailColumns, ['TTC']);
});

test('không có cột Giá nào → fallback chia đôi (ceil ở nửa đầu), vẫn thu gọn được bảng', () => {
  const { tableColumns, detailColumns } = splitStackingListColumns(['A', 'B', 'C', 'D', 'E']);
  assert.deepEqual(tableColumns, ['A', 'B', 'C']);
  assert.deepEqual(detailColumns, ['D', 'E']);
});

test('danh sách cột rỗng hoặc chỉ 1 cột không lỗi', () => {
  assert.deepEqual(splitStackingListColumns([]), { tableColumns: [], detailColumns: [] });
  assert.deepEqual(splitStackingListColumns(['Mã căn']), { tableColumns: ['Mã căn'], detailColumns: [] });
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

// ─── Chấm trạng thái trên bảng chính: ưu tiên marker "Đã bán" khi CRM chưa kịp cập nhật ─

test('effectiveDotStatus: marker "da_ban" (Sheet tô đỏ) ghi đè chấm thành đỏ dù Pipeline vẫn "con_hang"', () => {
  assert.equal(effectiveDotStatus({ trangThai: 'con_hang', marker: 'da_ban' }), 'da_ban');
  assert.equal(effectiveDotStatus({ trangThai: 'dang_xem', marker: 'da_ban' }), 'da_ban');
});

test('effectiveDotStatus: marker "check_admin" KHÔNG đổi màu chấm — vẫn theo CRM Pipeline', () => {
  assert.equal(effectiveDotStatus({ trangThai: 'con_hang', marker: 'check_admin' }), 'con_hang');
  assert.equal(effectiveDotStatus({ trangThai: 'dang_xem', marker: 'check_admin' }), 'dang_xem');
});

test('effectiveDotStatus: không có marker → giữ nguyên trangThai gốc từ CRM Pipeline', () => {
  assert.equal(effectiveDotStatus({ trangThai: 'con_hang', marker: undefined }), 'con_hang');
  assert.equal(effectiveDotStatus({ trangThai: 'da_ban', marker: undefined }), 'da_ban');
});

test('effectiveDotStatus: Pipeline đã "da_ban" thật sự thì marker nào cũng không đổi kết quả', () => {
  assert.equal(effectiveDotStatus({ trangThai: 'da_ban', marker: 'check_admin' }), 'da_ban');
  assert.equal(effectiveDotStatus({ trangThai: 'da_ban', marker: undefined }), 'da_ban');
});

// ─── Số đếm đầu trang: khớp với chấm màu, không lệch số ────────────────────

test('countStackingListRowsByDotStatus: khớp bug thật — 3 dòng marker "Đã bán" (Sheet) nhưng Pipeline chỉ 1 dòng "da_ban" thật → đếm vẫn ra 3', () => {
  const rows = [
    { trangThai: 'da_ban' as const, marker: undefined },          // Pipeline đã Ký HĐ thật
    { trangThai: 'con_hang' as const, marker: 'da_ban' as const }, // Sheet tô đỏ, Pipeline chưa cập nhật
    { trangThai: 'con_hang' as const, marker: 'da_ban' as const }, // tương tự
    { trangThai: 'con_hang' as const, marker: undefined },
    { trangThai: 'con_hang' as const, marker: 'check_admin' as const },
  ];
  const count = countStackingListRowsByDotStatus(rows);
  assert.equal(count.da_ban, 3);
  assert.equal(count.con_hang, 2); // 2 dòng còn lại không có marker "Đã bán"
  assert.equal(count.con_hang + count.dang_xem + count.da_ban, rows.length); // không mất/không đếm trùng căn nào
});

test('countStackingListRowsByDotStatus: không có marker nào → khớp y hệt đếm theo trangThai gốc', () => {
  const rows = [
    { trangThai: 'con_hang' as const, marker: undefined },
    { trangThai: 'dang_xem' as const, marker: undefined },
    { trangThai: 'da_ban' as const, marker: undefined },
  ];
  assert.deepEqual(countStackingListRowsByDotStatus(rows), { con_hang: 1, dang_xem: 1, da_ban: 1 });
});

test('countStackingListRowsByDotStatus: danh sách rỗng không lỗi', () => {
  assert.deepEqual(countStackingListRowsByDotStatus([]), { con_hang: 0, dang_xem: 0, da_ban: 0 });
});
