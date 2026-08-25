// Import Excel cho Khách hàng CHỈ lấy đúng 3 trường: Tên KH, SĐT, Email.
// Cột được xác định qua HEADER (không theo vị trí cố định) — file nguồn của người
// dùng có thể có bất kỳ layout nào (VD báo cáo căn hộ có cột Căn/Tầng/Sảnh/Số CMND...),
// nên không được giả định thứ tự cột cố định như export của phễu lead nội bộ.

const NAME_HEADER_ALIASES = new Set(['ten kh', 'ten khach hang', 'ho ten', 'ten nk']);
const PHONE_HEADER_ALIASES = new Set(['sdt', 'so dien thoai', 'dien thoai', 'phone']);
const EMAIL_HEADER_ALIASES = new Set(['email', 'e mail']);

export function normalizeHeader(raw: unknown): string {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[-_.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface ExcelColumnMap {
  name: number;
  phone: number;
  /** -1 nếu file không có cột Email */
  email: number;
}

/**
 * Chỉ nhận header khớp CHÍNH XÁC (sau normalize) với alias đã biết — không
 * fuzzy/substring-match, để không nhận nhầm ví dụ "Số CMND" thành SĐT.
 * Trả về null nếu thiếu cột Tên KH hoặc SĐT bắt buộc.
 */
export function resolveColumns(headerRow: readonly unknown[]): ExcelColumnMap | null {
  let name = -1, phone = -1, email = -1;
  headerRow.forEach((cell, index) => {
    const normalized = normalizeHeader(cell);
    if (name === -1 && NAME_HEADER_ALIASES.has(normalized)) name = index;
    else if (phone === -1 && PHONE_HEADER_ALIASES.has(normalized)) phone = index;
    else if (email === -1 && EMAIL_HEADER_ALIASES.has(normalized)) email = index;
  });
  if (name === -1 || phone === -1) return null;
  return { name, phone, email };
}

export function cellToText(value: unknown): string {
  if (value === null || value === undefined) return '';
  // Cell numeric (SĐT bị Excel lưu dạng number) — String() với số nguyên ở độ dài
  // số điện thoại (chỉ chuyển sang ký hiệu khoa học khi |number| >= 1e21) an toàn,
  // không mất độ chính xác hay sinh "e+" sai lệch.
  const text = String(value).trim();
  return text === '—' || text === '-' || text.toLowerCase() === 'nan' ? '' : text;
}

/**
 * Excel lưu SĐT dạng number sẽ tự làm mất số 0 đầu (VD 0901234567 → 901234567).
 * Khôi phục số 0 đầu nếu thiếu; giữ nguyên nếu đã đúng định dạng.
 */
export function normalizePhone(raw: string): string {
  const compact = raw.replace(/\s+/g, '');
  return compact.startsWith('0') ? compact : '0' + compact;
}

/**
 * So khớp trùng theo 9 chữ số cuối — đồng nhất với dedupe hiện có của
 * /api/khach-hang (manual create/update), tránh bug import trùng do khác
 * định dạng (đầu số quốc gia, khoảng trắng, số 0 đầu...).
 */
export function phoneKey(value: string): string {
  return value.replace(/\D/g, '').slice(-9);
}

export type RowClassification =
  | { status: 'blank' }
  | { status: 'invalid'; reason: string }
  | { status: 'duplicate'; ten_KH: string; so_dien_thoai: string }
  | { status: 'ready'; ten_KH: string; so_dien_thoai: string; email: string };

/**
 * Trích xuất và phân loại một dòng dữ liệu. Kết quả 'ready' CHỈ chứa đúng 3
 * trường ten_KH / so_dien_thoai / email — không có field nào khác được đọc
 * từ Excel, kể cả khi file có thêm cột Dự án/Nguồn/Sale/Nhu cầu...
 */
export function classifyRow(
  row: readonly unknown[],
  columns: ExcelColumnMap,
  existingPhoneKeys: ReadonlySet<string>,
): RowClassification {
  const tenKH = cellToText(row[columns.name]);
  const rawSdt = cellToText(row[columns.phone]);
  const email = columns.email >= 0 ? cellToText(row[columns.email]) : '';

  if (!tenKH && !rawSdt && !email) return { status: 'blank' };
  if (!tenKH || !rawSdt) {
    return { status: 'invalid', reason: !tenKH && !rawSdt ? 'Thiếu Tên KH và SĐT' : !tenKH ? 'Thiếu Tên KH' : 'Thiếu SĐT' };
  }

  const so_dien_thoai = normalizePhone(rawSdt);
  if (existingPhoneKeys.has(phoneKey(so_dien_thoai))) {
    return { status: 'duplicate', ten_KH: tenKH, so_dien_thoai };
  }

  return { status: 'ready', ten_KH: tenKH, so_dien_thoai, email };
}
