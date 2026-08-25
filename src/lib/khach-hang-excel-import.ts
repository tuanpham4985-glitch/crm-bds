// Import Excel cho Khách hàng CHỈ lấy đúng 3 trường: Tên KH, SĐT, Email.
// Cột được xác định qua HEADER (không theo vị trí cố định) — file nguồn của người
// dùng có thể có bất kỳ layout nào (VD báo cáo căn hộ có cột Căn/Tầng/Sảnh/Số CMND...,
// hoặc file bán hàng có nhiều cột "Số điện thoại 1/2"), nên không được giả định thứ
// tự cột cố định như export của phễu lead nội bộ.

const NAME_HEADER_ALIASES = new Set(['ten kh', 'ten khach hang', 'ho ten', 'ten nk', 'ten']);
const EMAIL_HEADER_ALIASES = new Set(['email', 'e mail']);
// Anchored toàn bộ header, không substring/fuzzy: chỉ khớp đúng 1 trong 4 từ gốc,
// có thể theo sau bởi số thứ tự (VD "Số điện thoại 1", "Phone 2"). Không khớp
// "Số CMND", "Mã căn", "STT"... vì các header đó không bắt đầu bằng 1 trong 4 từ gốc.
const PHONE_HEADER_PATTERN = /^(so dien thoai|sdt|dien thoai|phone)( \d+)?$/;

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
  /** 1+ cột phone theo thứ tự xuất hiện trong header (VD "Số điện thoại 1" trước "Số điện thoại 2"). */
  phone: number[];
  /** -1 nếu file không có cột Email */
  email: number;
}

/**
 * Chỉ nhận header khớp CHÍNH XÁC (sau normalize) với alias/pattern đã biết — không
 * fuzzy/substring-match, để không nhận nhầm ví dụ "Số CMND" thành SĐT hay "Tên dự án"
 * thành Tên KH. Trả về null nếu thiếu cột Tên KH hoặc SĐT bắt buộc.
 */
export function resolveColumns(headerRow: readonly unknown[]): ExcelColumnMap | null {
  let name = -1, email = -1;
  const phone: number[] = [];
  headerRow.forEach((cell, index) => {
    const normalized = normalizeHeader(cell);
    if (name === -1 && NAME_HEADER_ALIASES.has(normalized)) name = index;
    else if (PHONE_HEADER_PATTERN.test(normalized)) phone.push(index);
    else if (email === -1 && EMAIL_HEADER_ALIASES.has(normalized)) email = index;
  });
  if (name === -1 || phone.length === 0) return null;
  return { name, phone, email };
}

/** Số dòng đầu quét trong mỗi sheet để tìm header — cho phép dòng trống/tiêu đề nằm trước header thật. */
export const MAX_HEADER_SCAN_ROWS = 30;

export interface SheetRows {
  sheetName: string;
  rows: readonly unknown[][];
}

export interface ResolvedImportSheet {
  sheetName: string;
  /** Index (0-based) của dòng header trong rows của chính sheet đó. */
  headerRowIndex: number;
  columns: ExcelColumnMap;
  rows: readonly unknown[][];
}

/**
 * Tìm sheet + dòng header phù hợp để import — KHÔNG giả định sheet đầu tiên
 * trong workbook luôn chứa dữ liệu (VD file có sheet rỗng đứng trước sheet
 * dữ liệu thật). Quét từng sheet theo đúng thứ tự trong workbook; trong mỗi
 * sheet quét tối đa MAX_HEADER_SCAN_ROWS dòng đầu để tìm dòng có header hợp
 * lệ (resolveColumns trả về non-null) — cho phép dòng trống/tiêu đề nằm
 * trước header thật. Trả về sheet+header đầu tiên khớp theo thứ tự; null
 * nếu không sheet nào có header hợp lệ trong phạm vi quét.
 */
export function findImportSheet(sheets: readonly SheetRows[]): ResolvedImportSheet | null {
  for (const { sheetName, rows } of sheets) {
    const scanLimit = Math.min(rows.length, MAX_HEADER_SCAN_ROWS);
    for (let i = 0; i < scanLimit; i++) {
      const columns = resolveColumns(rows[i]);
      if (columns) return { sheetName, headerRowIndex: i, columns, rows };
    }
  }
  return null;
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

/**
 * Gộp nhiều cột phone trên cùng 1 dòng (VD "Số điện thoại 1"/"2") thành đúng 1 SĐT:
 *  - bỏ qua candidate trống;
 *  - normalize từng candidate (khôi phục số 0 đầu) — 2 candidate chỉ khác nhau ở số 0
 *    đầu sẽ tự động normalize về cùng 1 chuỗi, không coi là khác nhau;
 *  - nếu sau normalize vẫn còn nhiều số THỰC SỰ khác nhau (khác canonical phoneKey),
 *    ưu tiên candidate ở cột đầu tiên theo thứ tự header — không ghép/concat các số lại;
 *  - không có candidate hợp lệ nào -> null (thiếu SĐT).
 */
export function resolveRowPhone(row: readonly unknown[], phoneColumns: readonly number[]): string | null {
  const candidates = phoneColumns
    .map(index => cellToText(row[index]))
    .filter(text => text.length > 0)
    .map(text => normalizePhone(text));
  return candidates.length > 0 ? candidates[0] : null;
}

export function normalizeName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').toLowerCase();
}

export type RowClassification =
  | { status: 'blank' }
  | { status: 'invalid'; reason: string }
  /** Trùng canonical phone với 1 dòng khác ĐÃ được xử lý trong cùng file này. */
  | { status: 'duplicate_in_file'; ten_KH: string; so_dien_thoai: string }
  /** Trùng canonical phone với customer ĐÃ có sẵn trong CRM trước khi import. */
  | { status: 'already_exists'; ten_KH: string; so_dien_thoai: string }
  | { status: 'ready'; ten_KH: string; so_dien_thoai: string; email: string };

/**
 * Trích xuất và phân loại một dòng dữ liệu. Kết quả 'ready' CHỈ chứa đúng 3
 * trường ten_KH / so_dien_thoai / email — không có field nào khác được đọc
 * từ Excel, kể cả khi file có thêm cột STT/Mã căn/Loại căn/Dự án/Sale...
 *
 * Canonical phone là identity/dedupe authority chính — tên chỉ dùng để cảnh báo
 * (xem detectDuplicateNameWarnings), không bao giờ dùng một mình làm identity key.
 */
export function classifyRow(
  row: readonly unknown[],
  columns: ExcelColumnMap,
  existingDbPhoneKeys: ReadonlySet<string>,
  seenInFilePhoneKeys: ReadonlySet<string>,
): RowClassification {
  const tenKH = cellToText(row[columns.name]);
  const resolvedPhone = resolveRowPhone(row, columns.phone);
  const email = columns.email >= 0 ? cellToText(row[columns.email]) : '';

  if (!tenKH && resolvedPhone === null && !email) return { status: 'blank' };
  if (!tenKH || resolvedPhone === null) {
    return { status: 'invalid', reason: !tenKH && resolvedPhone === null ? 'Thiếu Tên KH và SĐT' : !tenKH ? 'Thiếu Tên KH' : 'Thiếu SĐT' };
  }

  const so_dien_thoai = resolvedPhone;
  const key = phoneKey(so_dien_thoai);
  if (existingDbPhoneKeys.has(key)) return { status: 'already_exists', ten_KH: tenKH, so_dien_thoai };
  if (seenInFilePhoneKeys.has(key)) return { status: 'duplicate_in_file', ten_KH: tenKH, so_dien_thoai };

  return { status: 'ready', ten_KH: tenKH, so_dien_thoai, email };
}

/**
 * Phát hiện các tên (normalized) xuất hiện ở nhiều customer với canonical phone
 * KHÁC nhau trong cùng file — chỉ để cảnh báo, KHÔNG merge/xóa. Trùng tên nhưng
 * khác SĐT vẫn giữ là các customer riêng biệt.
 */
export function detectDuplicateNameWarnings(records: readonly { ten_KH: string; so_dien_thoai: string }[]): string[] {
  const phonesByName = new Map<string, Set<string>>();
  const displayName = new Map<string, string>();
  for (const record of records) {
    const norm = normalizeName(record.ten_KH);
    if (!phonesByName.has(norm)) {
      phonesByName.set(norm, new Set());
      displayName.set(norm, record.ten_KH);
    }
    phonesByName.get(norm)!.add(phoneKey(record.so_dien_thoai));
  }
  const warnings: string[] = [];
  for (const [norm, phones] of phonesByName) {
    if (phones.size > 1) warnings.push(displayName.get(norm)!);
  }
  return warnings;
}
