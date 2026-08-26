// Import Excel cho Khách hàng CHỈ lấy đúng 3 trường: Tên KH, SĐT, Email.
// Cột được xác định qua HEADER (không theo vị trí cố định) — file nguồn của người
// dùng có thể có bất kỳ layout nào (VD báo cáo căn hộ có cột Căn/Tầng/Sảnh/Số CMND...,
// hoặc file bán hàng có nhiều cột "Số điện thoại 1/2"), nên không được giả định thứ
// tự cột cố định như export của phễu lead nội bộ.

const NAME_HEADER_ALIASES = new Set(['ten kh', 'ten khach hang', 'ho ten', 'ten nk', 'ten']);
const EMAIL_HEADER_ALIASES = new Set(['email', 'e mail', 'email kh']);
// Anchored toàn bộ header, không substring/fuzzy: chỉ khớp đúng 1 trong 4 từ gốc,
// có thể theo sau bởi số thứ tự (VD "Số điện thoại 1", "Phone 2") hoặc " kh"
// (VD "SĐT KH" — mẫu file dự án BĐS nghỉ dưỡng thật). Không khớp "Số CMND",
// "Mã căn", "STT"... vì các header đó không bắt đầu bằng 1 trong 4 từ gốc.
const PHONE_HEADER_PATTERN = /^(so dien thoai|sdt|dien thoai|phone)( \d+| kh)?$/;

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
 * Tìm TẤT CẢ sheet + dòng header phù hợp để import — KHÔNG giả định chỉ 1
 * sheet (hoặc chỉ sheet đầu tiên) trong workbook chứa dữ liệu thật. File dự
 * án BĐS thật (VD "CONDOTEL VÀ BIỆT THỰ PHÚ QUỐC.xlsx") có thể có NHIỀU sheet
 * dữ liệu khách hàng thật (CONDOTEL, VILLAS) xen giữa sheet mẫu/form không
 * phải dataset (MẪU) và/hoặc sheet rỗng.
 *
 * Quét TỪNG sheet theo đúng thứ tự trong workbook; trong mỗi sheet quét tối
 * đa MAX_HEADER_SCAN_ROWS dòng đầu để tìm dòng có header hợp lệ (resolveColumns
 * trả về non-null, tức có CẢ cột Tên KH VÀ cột SĐT trong CÙNG 1 dòng) — cho
 * phép dòng trống/tiêu đề/nhóm-cột-gộp (merged title) nằm trước header thật.
 * Mỗi sheet lấy TỐI ĐA 1 header (dòng đầu tiên khớp trong phạm vi quét) rồi
 * chuyển sang sheet kế tiếp — không dừng lại ở sheet hợp lệ đầu tiên.
 *
 * Yêu cầu "cùng 1 dòng phải có cả Tên KH VÀ SĐT" (không phải chỉ cần xuất
 * hiện đâu đó trong sheet) là rào chắn chính để loại sheet mẫu/form: 1 sheet
 * form có thể có ô "Tên KH" (label 1 dòng) và ô "SĐT:" (label dòng khác) rời
 * rạc, không cùng hàng — sẽ KHÔNG qua được resolveColumns nên sheet đó không
 * được chọn, dù có chứa các từ khoá này ở đâu đó.
 */
export function findImportSheets(sheets: readonly SheetRows[]): ResolvedImportSheet[] {
  const resolved: ResolvedImportSheet[] = [];
  for (const { sheetName, rows } of sheets) {
    const scanLimit = Math.min(rows.length, MAX_HEADER_SCAN_ROWS);
    for (let i = 0; i < scanLimit; i++) {
      const columns = resolveColumns(rows[i]);
      if (columns) {
        resolved.push({ sheetName, headerRowIndex: i, columns, rows });
        break;
      }
    }
  }
  return resolved;
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

// Ký tự phân tách khi 1 cell chứa nhiều số ĐT thực sự khác nhau — cả 3 đều
// gặp thực tế trong cùng 1 cột "SĐT KH" của file dự án BĐS thật: "-" (VD
// "0908236202-0903834016"), "/" (VD "043 833 4170 / 0913 046 557"), ","
// (VD "0983112511 , 61497573478").
const MULTI_PHONE_SEPARATORS = /[-/,]/;

/**
 * 1 CELL đôi khi chứa nhiều số ĐT thực sự khác nhau (xem MULTI_PHONE_SEPARATORS).
 * Không được ghép/concat các số lại (sẽ ra chuỗi số vô nghĩa và dedupe key
 * sai), cũng không được tạo nhiều customer từ 1 dòng Excel — chỉ lấy số VN
 * hợp lệ (đúng 9 hoặc 10 chữ số) ĐẦU TIÊN theo thứ tự xuất hiện trong cell,
 * deterministic; các số không đúng độ dài VN (VD định dạng cũ 11 số, số quốc
 * tế) bị bỏ qua khi chọn.
 *
 * Chỉ can thiệp khi cell KHÔNG tự nó là 1 số hợp lệ (9-10 chữ số) — nếu dấu
 * phân tách chỉ là cách trình bày trong 1 số duy nhất, hoặc không có candidate
 * nào đúng độ dài VN, thì rơi thẳng vào normalizePhone như cũ (giữ nguyên cả
 * chuỗi, không đổi hành vi hiện có) — không âm thầm làm mất dữ liệu.
 */
export function resolveCellPhone(text: string): string {
  const compact = text.replace(/\s+/g, '');
  const digitsOnly = compact.replace(/\D/g, '');
  if ((digitsOnly.length !== 9 && digitsOnly.length !== 10) && MULTI_PHONE_SEPARATORS.test(compact)) {
    for (const segment of compact.split(MULTI_PHONE_SEPARATORS)) {
      const segDigits = segment.replace(/\D/g, '');
      if (segDigits.length === 9 || segDigits.length === 10) return normalizePhone(segment);
    }
  }
  return normalizePhone(compact);
}

/**
 * Gộp nhiều cột phone trên cùng 1 dòng (VD "Số điện thoại 1"/"2") thành đúng 1 SĐT:
 *  - bỏ qua candidate trống;
 *  - resolve từng candidate (khôi phục số 0 đầu, tách nếu 1 cell chứa nhiều số —
 *    xem resolveCellPhone) — 2 candidate chỉ khác nhau ở số 0 đầu sẽ tự động
 *    normalize về cùng 1 chuỗi, không coi là khác nhau;
 *  - nếu sau normalize vẫn còn nhiều số THỰC SỰ khác nhau (khác canonical phoneKey),
 *    ưu tiên candidate ở cột đầu tiên theo thứ tự header — không ghép/concat các số lại;
 *  - không có candidate hợp lệ nào -> null (thiếu SĐT).
 */
export function resolveRowPhone(row: readonly unknown[], phoneColumns: readonly number[]): string | null {
  const candidates = phoneColumns
    .map(index => cellToText(row[index]))
    .filter(text => text.length > 0)
    .map(text => resolveCellPhone(text));
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
