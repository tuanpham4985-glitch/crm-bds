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

// ─── Popup chi tiết căn: chia đôi cột động (Sheet header) ──────────────────
// Chế độ Danh sách KHÔNG có schema cứng — mọi cột đến từ header thật trong
// Sheet, ĐÚNG thứ tự Sheet (xem getStackingListRows ở google-sheets.ts,
// values keyed by chính text header đó). Yêu cầu: nửa ĐẦU giữ nguyên thứ tự
// hiện tại trên bảng chính, nửa SAU (TTC/TTS/Vay.../Link PTG/Hướng...) chuyển
// vào popup — KHÔNG xáo trộn thứ tự, không tự chọn field theo tên.

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

/** Chia `columns` (đúng thứ tự Sheet) làm đôi: nửa đầu ở lại bảng chính
 * (giữ NGUYÊN thứ tự, không sắp lại), nửa sau chuyển vào popup chi tiết.
 * Số lẻ → nửa đầu nhận thêm 1 cột (ceil), khớp ví dụ thật: 17 cột → bảng
 * giữ 9 cột đầu (STT...Giá gồm VAT+KPBT), popup nhận 8 cột sau (TTC...Hướng). */
export function splitStackingListColumns(columns: string[]): { tableColumns: string[]; detailColumns: string[] } {
  const half = Math.ceil(columns.length / 2);
  return { tableColumns: columns.slice(0, half), detailColumns: columns.slice(half) };
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
