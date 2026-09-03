import type { StackingListRow } from '@/lib/types';

/** Chế độ Danh sách (biệt thự/liền kề) của Bảng hàng — filter + pagination
 * thuần, tách khỏi component để test được độc lập với React. */

export const STACKING_LIST_PAGE_SIZE = 20;

/** Màu chấm tròn hiển thị trên bảng chính (không có label đi kèm, nên màu
 * sai lệch với nền/badge của dòng gây hiểu nhầm) — ưu tiên marker "Đã bán"
 * do Sale tự tô trong Sheet nếu CRM Pipeline (authority) CHƯA kịp cập nhật
 * "Ký HĐ" cho căn đó. CHỈ ảnh hưởng màu hiển thị của chấm; KHÔNG đổi
 * `trangThai` gốc — filter/search/đếm số lượng/badge có label (popup) vẫn
 * dùng đúng `row.trangThai` từ CRM Pipeline như cũ. */
export function effectiveDotStatus(row: Pick<StackingListRow, 'trangThai' | 'marker'>): StackingListRow['trangThai'] {
  return row.marker === 'da_ban' ? 'da_ban' : row.trangThai;
}

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

// ─── Popup chi tiết căn: chia cột động (Sheet header) ──────────────────────
// Chế độ Danh sách KHÔNG có schema cứng — mọi cột đến từ header thật trong
// Sheet, ĐÚNG thứ tự Sheet (xem getStackingListRows ở google-sheets.ts,
// values keyed by chính text header đó). Bảng chính giữ các cột thông tin cơ
// bản + Giá (đúng thứ tự, không xáo trộn); mọi cột SAU cột Giá (TTC/TTS/
// Vay.../Link PTG/Hướng...) chuyển hẳn vào popup — không phụ thuộc số cột
// chẵn/lẻ hay tổng số cột của từng nguồn (mỗi nguồn Sheet có thể khác nhau).

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

/** Chia `columns` (đúng thứ tự Sheet): bảng chính giữ mọi cột từ đầu tới hết
 * cột Giá cuối cùng tìm thấy (không xáo trộn thứ tự); mọi cột sau đó — VD
 * TTC/TTS/Vay 18-36T/Link PTG/Hướng... — chuyển vào popup, bất kể tổng số
 * cột của nguồn (mỗi Sheet nguồn khác nhau có thể có nhiều/ít cột hơn).
 * Không tìm thấy cột Giá nào (hiếm) → fallback chia đôi (ceil ở nửa đầu) để
 * vẫn thu gọn được bảng thay vì hiện hết. */
export function splitStackingListColumns(columns: string[]): { tableColumns: string[]; detailColumns: string[] } {
  let lastPriceIdx = -1;
  for (let i = 0; i < columns.length; i++) {
    if (isPriceColumn(columns[i])) lastPriceIdx = i;
  }
  const boundary = lastPriceIdx >= 0 ? lastPriceIdx + 1 : Math.ceil(columns.length / 2);
  return { tableColumns: columns.slice(0, boundary), detailColumns: columns.slice(boundary) };
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
