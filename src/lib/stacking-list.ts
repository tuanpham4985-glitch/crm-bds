import type { StackingListRow } from '@/lib/types';

/** Chế độ Danh sách (biệt thự/liền kề) của Bảng hàng — filter + pagination
 * thuần, tách khỏi component để test được độc lập với React. */

export const STACKING_LIST_PAGE_SIZE = 20;

/** Trạng thái hiển thị dùng chung cho bảng, số đếm, TMB và popup — ưu tiên
 * marker "Đã bán" trong Sheet nếu CRM Pipeline chưa cập nhật "Ký HĐ".
 * Chỉ ảnh hưởng hiển thị, không thay đổi `row.trangThai` hay dữ liệu CRM. */
export function effectiveDotStatus(row: Pick<StackingListRow, 'trangThai' | 'marker'>): StackingListRow['trangThai'] {
  return row.marker === 'da_ban' ? 'da_ban' : row.trangThai;
}

/** Đếm số căn theo từng trạng thái cho ô tổng quan đầu trang — dùng
 * effectiveDotStatus để khớp với màu chấm trên bảng (marker "Đã bán" từ
 * Sheet cũng được tính vào, không lệch số với những gì User nhìn thấy). */
export function countStackingListRowsByDotStatus(
  rows: readonly Pick<StackingListRow, 'trangThai' | 'marker'>[]
): { con_hang: number; dang_xem: number; da_ban: number } {
  const c = { con_hang: 0, dang_xem: 0, da_ban: 0 };
  for (const r of rows) c[effectiveDotStatus(r)]++;
  return c;
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

/** Đối chiếu cột đang chọn (visible_columns cũ) với header THẬT của Sheet mới
 * khi Admin đổi Google Sheet backing 1 nguồn (Sửa nguồn → đổi Link/Sheet ID)
 * — Sheet mới có thể có bộ header khác hẳn Sheet cũ. `kept` giữ ĐÚNG thứ tự
 * Sheet MỚI (không phải thứ tự lựa chọn cũ); `removed` = cột cũ không còn,
 * để UI báo rõ cho Admin thay vì âm thầm mất dữ liệu hiển thị. */
export function reconcileVisibleColumns(
  oldColumns: readonly string[], newHeaders: readonly string[]
): { kept: string[]; removed: string[] } {
  const newSet = new Set(newHeaders);
  return {
    kept: newHeaders.filter(h => oldColumns.includes(h)),
    removed: oldColumns.filter(c => !newSet.has(c)),
  };
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

// "Quỹ" và "Giỏ bank" luôn hiện trên bảng chính (yêu cầu riêng), NGAY SAU cột
// Giá — dù đứng ở đâu trong Sheet gốc, vẫn kéo lên bảng thay vì để trong popup.
const FORCE_TABLE_COLUMNS = ['quỹ', 'giỏ bank'];

/** Chia `columns` (đúng thứ tự Sheet): bảng chính giữ mọi cột từ đầu tới hết
 * cột Giá cuối cùng tìm thấy (không xáo trộn thứ tự), CỘNG THÊM "Quỹ"/"Giỏ
 * bank" (nếu có) nối ngay sau đó theo đúng thứ tự chúng xuất hiện trong
 * Sheet; mọi cột còn lại — VD TTC/TTS/Vay 18-36T/Link PTG/Hướng... — chuyển
 * vào popup, bất kể tổng số cột của nguồn (mỗi Sheet nguồn có thể khác nhau).
 * Không tìm thấy cột Giá nào (hiếm) → fallback chia đôi (ceil ở nửa đầu) để
 * vẫn thu gọn được bảng thay vì hiện hết. */
export function splitStackingListColumns(columns: string[]): { tableColumns: string[]; detailColumns: string[] } {
  let lastPriceIdx = -1;
  for (let i = 0; i < columns.length; i++) {
    if (isPriceColumn(columns[i])) lastPriceIdx = i;
  }
  const boundary = lastPriceIdx >= 0 ? lastPriceIdx + 1 : Math.ceil(columns.length / 2);
  const head = columns.slice(0, boundary);
  const tail = columns.slice(boundary);

  const forced: string[] = [];
  const detailColumns: string[] = [];
  for (const col of tail) {
    if (FORCE_TABLE_COLUMNS.includes(normHeader(col))) forced.push(col);
    else detailColumns.push(col);
  }

  return { tableColumns: [...head, ...forced], detailColumns };
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
