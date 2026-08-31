import type { StackingListRow } from '@/lib/types';

/** Chế độ Danh sách (biệt thự/liền kề) của Bảng hàng — filter + pagination
 * thuần, tách khỏi component để test được độc lập với React. */

export const STACKING_LIST_PAGE_SIZE = 20;

export function filterStackingListRows(
  rows: StackingListRow[],
  opts: { groupColumn: string; groupFilter: string; search: string }
): StackingListRow[] {
  let out = rows;
  if (opts.groupFilter) {
    out = out.filter(r => String(r.values[opts.groupColumn] ?? '') === opts.groupFilter);
  }
  const q = opts.search.trim().toLowerCase();
  if (q) {
    out = out.filter(r =>
      r.maCan.toLowerCase().includes(q) ||
      Object.values(r.values).some(v => v !== null && String(v).toLowerCase().includes(q))
    );
  }
  return out;
}

export function totalStackingListPages(rowCount: number, pageSize = STACKING_LIST_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(rowCount / pageSize));
}

/** Kẹp `page` về khoảng hợp lệ [1, tổng số trang] — tránh trang rỗng khi
 * filter làm giảm tổng số dòng trong lúc đang ở trang cuối. */
export function clampStackingListPage(page: number, rowCount: number, pageSize = STACKING_LIST_PAGE_SIZE): number {
  return Math.min(Math.max(1, page), totalStackingListPages(rowCount, pageSize));
}

export function paginateStackingListRows<T>(rows: T[], page: number, pageSize = STACKING_LIST_PAGE_SIZE): T[] {
  const safePage = clampStackingListPage(page, rows.length, pageSize);
  return rows.slice((safePage - 1) * pageSize, safePage * pageSize);
}

// ─── Popup chi tiết căn: gom cột động (Sheet header) theo nhóm hiển thị ────
// Chế độ Danh sách KHÔNG có schema cứng — mọi cột đến từ header thật trong
// Sheet (xem getStackingListRows ở google-sheets.ts, values keyed by chính
// text header đó). Phân loại dưới đây dựa THUẦN vào tên cột (không phân biệt
// hoa/thường, không đổi/không suy diễn dữ liệu) để: (1) bảng chính chỉ hiện
// cột tóm tắt, (2) popup hiện đầy đủ mọi cột theo đúng nhóm — không cột nào
// bị rơi mất khỏi cả 2 nơi.

export const MA_CAN_HEADER = 'Mã căn';

function normHeader(h: string): string {
  return h.trim().toLowerCase();
}

export function isPriceColumn(header: string): boolean {
  return normHeader(header).includes('giá');
}

export function isFinancialColumn(header: string): boolean {
  const n = normHeader(header);
  return n === 'ttc' || n === 'tts' || /^vay\b/.test(n);
}

export function isMiscColumn(header: string): boolean {
  const n = normHeader(header);
  return n.includes('link') || n.includes('ptg') || n === 'quỹ' || n === 'giỏ bank';
}

export function isAreaColumn(header: string): boolean {
  const n = normHeader(header);
  return n.startsWith('dt') || n.includes('diện tích');
}

// Ưu tiên diện tích "chính" hiển thị trên bảng tóm tắt — biệt thự/liền kề
// dùng DT Đất/DTXD, các nguồn kiểu căn hộ dùng DT Tim tường/DT Thông thủy.
const AREA_PRIORITY = ['dt đất', 'dtxd', 'dt tim tường', 'dt thông thủy'];

/** Cột tóm tắt cho bảng chính — subset của `columns`, giữ nguyên text gốc,
 * chỉ những cột THẬT SỰ tồn tại trong Sheet (không invent field mới). */
export function pickSummaryColumns(columns: string[]): string[] {
  const norm = columns.map(normHeader);
  const summary: string[] = [];

  const pickFirst = (matcher: (n: string) => boolean) => {
    const idx = norm.findIndex(matcher);
    if (idx >= 0 && !summary.includes(columns[idx])) summary.push(columns[idx]);
  };

  pickFirst(n => n === 'đặc điểm');
  pickFirst(n => n === 'loại hình' || n === 'loại căn');

  let areaHeader: string | undefined;
  for (const p of AREA_PRIORITY) {
    const idx = norm.indexOf(p);
    if (idx >= 0) { areaHeader = columns[idx]; break; }
  }
  if (!areaHeader) {
    const idx = columns.findIndex(c => isAreaColumn(c));
    if (idx >= 0) areaHeader = columns[idx];
  }
  if (areaHeader) summary.push(areaHeader);

  pickFirst(n => n.includes('giá'));
  pickFirst(n => n === 'hướng');
  pickFirst(n => n === 'phân khu');

  return summary;
}

export type StackingListDetailGroup = 'gia' | 'financial' | 'misc' | 'basic';

export function classifyStackingListColumn(header: string): StackingListDetailGroup {
  if (isPriceColumn(header)) return 'gia';
  if (isFinancialColumn(header)) return 'financial';
  if (isMiscColumn(header)) return 'misc';
  return 'basic';
}

/** Toàn bộ cột (trừ "Mã căn" — đã hiện riêng ở header popup) gom theo nhóm
 * Giá/Tài chính/Khác/Cơ bản, GIỮ NGUYÊN thứ tự xuất hiện trong Sheet của mỗi
 * nhóm — dùng cho popup chi tiết, đảm bảo không mất dữ liệu so với bảng cũ. */
export function groupStackingListColumnsForDetail(columns: string[]): Record<StackingListDetailGroup, string[]> {
  const groups: Record<StackingListDetailGroup, string[]> = { gia: [], financial: [], misc: [], basic: [] };
  for (const col of columns) {
    if (normHeader(col) === normHeader(MA_CAN_HEADER)) continue;
    groups[classifyStackingListColumn(col)].push(col);
  }
  return groups;
}
