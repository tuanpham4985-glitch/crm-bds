import assert from 'node:assert/strict';
import test from 'node:test';
import type { StackingListRow } from '../../src/lib/types';
import {
  filterStackingListRows,
  totalStackingListPages,
  clampStackingListPage,
  paginateStackingListRows,
  STACKING_LIST_PAGE_SIZE,
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
