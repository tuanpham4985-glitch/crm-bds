import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyRow, detectDuplicateNameWarnings, findImportSheets, MAX_HEADER_SCAN_ROWS,
  normalizeHeader, normalizeName, normalizePhone, phoneKey, resolveCellPhone, resolveColumns, resolveRowPhone,
} from '../../src/lib/khach-hang-excel-import';

const NO_DB_DUP = new Set<string>();
const NO_FILE_DUP = new Set<string>();

// Header layout giống ảnh thực tế: nhiều cột không liên quan (Căn, Tầng, Sảnh, Số CMND...)
// xen giữa 3 cột cần lấy, đặt cố ý KHÔNG theo thứ tự Tên/SĐT/Email cố định.
const REALISTIC_HEADER = [
  'STT', 'Căn', 'Tầng', 'Sảnh', 'Tên NK', 'Số CMND', 'Ngày sinh', 'Giới tính',
  'Địa chỉ', 'Quan hệ', 'SĐT', 'Từ ngày', 'Email',
];

// Đúng layout file thực tế gây bug được báo cáo: STT | Tên | Mã căn | Số điện thoại 1 | Số điện thoại 2 | Loại căn
const SALES_FILE_HEADER = ['STT', 'Tên', 'Mã căn', 'Số điện thoại 1', 'Số điện thoại 2', 'Loại căn'];

test('file có nhiều cột lạ: chỉ Tên KH/SĐT/Email được lấy, đúng theo header thực tế', () => {
  const columns = resolveColumns(REALISTIC_HEADER);
  assert.ok(columns);
  assert.equal(REALISTIC_HEADER[columns!.name], 'Tên NK');
  assert.deepEqual(columns!.phone.map(i => REALISTIC_HEADER[i]), ['SĐT']);
  assert.equal(REALISTIC_HEADER[columns!.email], 'Email');

  const row = ['1', 'A1203', '12', 'A', 'Nguyễn Văn A', '079123456789', '01/01/1990', 'Nam', 'Q1, TP.HCM', 'Vợ', '901234567', '01/01/2026', 'a@example.com'];
  const result = classifyRow(row, columns!, NO_DB_DUP, NO_FILE_DUP);
  assert.deepEqual(result, { status: 'ready', ten_KH: 'Nguyễn Văn A', so_dien_thoai: '0901234567', email: 'a@example.com' });
});

test('"Số CMND" không bao giờ được nhận diện là cột SĐT', () => {
  const headerWithCmndOnly = ['Tên KH', 'Số CMND'];
  const columns = resolveColumns(headerWithCmndOnly);
  // Thiếu cột SĐT thật sự -> phải từ chối, không được lấy đại cột CMND làm SĐT
  assert.equal(columns, null);

  assert.notEqual(normalizeHeader('Số CMND'), normalizeHeader('SĐT'));
  assert.notEqual(normalizeHeader('Số CMND'), normalizeHeader('Số điện thoại'));
});

test('thiếu Email vẫn import được, email lưu chuỗi rỗng', () => {
  const header = ['Tên KH', 'SĐT', 'Email'];
  const columns = resolveColumns(header)!;
  const result = classifyRow(['Trần Thị B', '0912345678', ''], columns, NO_DB_DUP, NO_FILE_DUP);
  assert.deepEqual(result, { status: 'ready', ten_KH: 'Trần Thị B', so_dien_thoai: '0912345678', email: '' });
});

test('file không có cột Email vẫn import được (email luôn rỗng)', () => {
  const header = ['Tên KH', 'SĐT'];
  const columns = resolveColumns(header);
  assert.ok(columns);
  assert.equal(columns!.email, -1);
  const result = classifyRow(['Lê Văn C', '0987654321'], columns!, NO_DB_DUP, NO_FILE_DUP);
  assert.deepEqual(result, { status: 'ready', ten_KH: 'Lê Văn C', so_dien_thoai: '0987654321', email: '' });
});

test('giữ số 0 đầu của SĐT kể cả khi Excel lưu dạng number (mất số 0)', () => {
  assert.equal(normalizePhone('901234567'), '0901234567'); // number cell -> mất số 0 đầu
  assert.equal(normalizePhone('0901234567'), '0901234567'); // đã đúng định dạng
  assert.equal(normalizePhone('090 123 4567'), '0901234567'); // có khoảng trắng
});

test('header variant: Tên khách hàng / Họ tên / Điện thoại / E-mail vẫn nhận đúng', () => {
  const header = ['Họ tên', 'Điện thoại', 'E-mail'];
  const columns = resolveColumns(header)!;
  assert.equal(columns.name, 0);
  assert.deepEqual(columns.phone, [1]);
  assert.equal(columns.email, 2);

  const header2 = ['Tên khách hàng', 'Số điện thoại'];
  const columns2 = resolveColumns(header2)!;
  assert.equal(columns2.name, 0);
  assert.deepEqual(columns2.phone, [1]);
  assert.equal(columns2.email, -1);
});

test('"Tên" (đơn lẻ) -> ten_KH, nhưng không nhận nhầm "Tên dự án"/"Tên Sale"/"Tên Telesale"/"Tên công ty"', () => {
  const columns = resolveColumns(['Tên', 'SĐT'])!;
  assert.equal(columns.name, 0);

  for (const decoy of ['Tên dự án', 'Tên Sale', 'Tên Telesale', 'Tên công ty']) {
    assert.notEqual(normalizeHeader(decoy), normalizeHeader('Tên'));
    const decoyColumns = resolveColumns([decoy, 'SĐT']);
    // Không có cột "Tên" thật -> thiếu cột bắt buộc -> null, KHÔNG được lấy đại "Tên dự án" làm tên KH
    assert.equal(decoyColumns, null);
  }
});

test('"Số điện thoại 1" (có suffix số) được nhận đúng làm cột phone', () => {
  const columns = resolveColumns(['Tên', 'Số điện thoại 1'])!;
  assert.deepEqual(columns.phone, [1]);
});

test('phone header pattern anchored toàn bộ — không nhận "Số CMND"/"Mã căn"/"STT"/"mã khách hàng" làm phone dù có số ở cuối', () => {
  const columns = resolveColumns(['Tên', 'Số điện thoại 1', 'Số CMND', 'Mã căn', 'STT', 'mã khách hàng 1']);
  assert.ok(columns);
  assert.deepEqual(columns!.phone, [1]); // chỉ đúng 1 cột phone thật, các cột còn lại bị loại
});

test('duplicate phone (theo 9 chữ số cuối) với DB bị đánh dấu already_exists, không import lại', () => {
  const header = ['Tên KH', 'SĐT'];
  const columns = resolveColumns(header)!;
  const existingDbPhoneKeys = new Set([phoneKey('0901234567')]);
  const result = classifyRow(['Người trùng SĐT', '901234567'], columns, existingDbPhoneKeys, NO_FILE_DUP);
  assert.deepEqual(result, { status: 'already_exists', ten_KH: 'Người trùng SĐT', so_dien_thoai: '0901234567' });
});

test('thiếu Tên KH hoặc SĐT bị đánh dấu invalid, không âm thầm biến mất', () => {
  const header = ['Tên KH', 'SĐT'];
  const columns = resolveColumns(header)!;
  assert.deepEqual(classifyRow(['', '0901234567'], columns, NO_DB_DUP, NO_FILE_DUP), { status: 'invalid', reason: 'Thiếu Tên KH' });
  assert.deepEqual(classifyRow(['Không có SĐT', ''], columns, NO_DB_DUP, NO_FILE_DUP), { status: 'invalid', reason: 'Thiếu SĐT' });
  assert.deepEqual(classifyRow(['', ''], columns, NO_DB_DUP, NO_FILE_DUP), { status: 'blank' }); // dòng trắng hoàn toàn, không tính invalid
});

test('field Dự án/Nguồn/Sale/Nhu cầu/Mã căn/Loại căn/STT không bao giờ bị populate từ Excel dù file có các cột này', () => {
  const header = ['Dự án', 'Sale', 'Tên KH', 'Nguồn', 'SĐT', 'Nhu cầu', 'Email', 'Mã căn', 'Loại căn', 'STT'];
  const columns = resolveColumns(header)!;
  const row = ['Vinhomes', 'Nguyễn Sale', 'Phạm Văn D', 'Facebook', '0933333333', 'Mua để ở gấp', 'd@example.com', 'A101', 'Căn hộ', '1'];
  const result = classifyRow(row, columns, NO_DB_DUP, NO_FILE_DUP);
  assert.equal(result.status, 'ready');
  // Kết quả classifyRow chỉ có đúng 4 khoá: status, ten_KH, so_dien_thoai, email —
  // không có cách nào rò rỉ Dự án/Sale/Nguồn/Nhu cầu/Mã căn/Loại căn/STT vào object trả về.
  assert.deepEqual(Object.keys(result).sort(), ['email', 'so_dien_thoai', 'status', 'ten_KH']);
  if (result.status === 'ready') {
    assert.equal(result.ten_KH, 'Phạm Văn D');
    assert.equal(result.so_dien_thoai, '0933333333');
    assert.equal(result.email, 'd@example.com');
  }
});

test('không tìm thấy cột Tên KH/SĐT bắt buộc -> resolveColumns trả về null', () => {
  assert.equal(resolveColumns(['Căn', 'Tầng', 'Sảnh']), null);
  assert.equal(resolveColumns(['Tên KH']), null); // có tên nhưng thiếu SĐT
  assert.equal(resolveColumns(['SĐT']), null); // có SĐT nhưng thiếu tên
});

// ─── Multiple phone columns (Số điện thoại 1/2) ─────────────────────────────

test('Phone 1 mất số 0 đầu + Phone 2 đầy đủ -> canonical phone có leading zero, không coi là 2 số khác nhau', () => {
  const columns = resolveColumns(SALES_FILE_HEADER)!;
  const row = ['1', 'Khách A', 'A101', '902918818', '0902918818', 'Căn hộ'];
  const phone = resolveRowPhone(row, columns.phone);
  assert.equal(phone, '0902918818');
});

test('Phone 1 trống -> dùng Phone 2', () => {
  const columns = resolveColumns(SALES_FILE_HEADER)!;
  const row = ['1', 'Khách B', 'A102', '', '0912345678', 'Căn hộ'];
  assert.equal(resolveRowPhone(row, columns.phone), '0912345678');
});

test('Phone 1 có giá trị, Phone 2 trống -> dùng Phone 1', () => {
  const columns = resolveColumns(SALES_FILE_HEADER)!;
  const row = ['1', 'Khách B2', 'A102', '0912345678', '', 'Căn hộ'];
  assert.equal(resolveRowPhone(row, columns.phone), '0912345678');
});

test('Phone 1/2 cùng một số (không phải chỉ lệch số 0) -> không concatenate, chỉ 1 SĐT', () => {
  const columns = resolveColumns(SALES_FILE_HEADER)!;
  const row = ['1', 'Khách C', 'A103', '0902918818', '0902918818', 'Căn hộ'];
  const phone = resolveRowPhone(row, columns.phone);
  assert.equal(phone, '0902918818');
  assert.doesNotMatch(phone!, /0902918818.+0902918818/); // chắc chắn không bị nối chuỗi
});

test('Phone 1 và Phone 2 là 2 số THỰC SỰ khác nhau -> chọn deterministic theo cột đầu tiên, không ghép', () => {
  const columns = resolveColumns(SALES_FILE_HEADER)!;
  const row = ['1', 'Khách D', 'A104', '0901111111', '0902222222', 'Căn hộ'];
  const phone = resolveRowPhone(row, columns.phone);
  assert.equal(phone, '0901111111'); // cột đầu tiên (Số điện thoại 1) thắng, không phải nối 2 số
});

test('cả 2 cột phone đều trống -> null (thiếu SĐT, invalid)', () => {
  const columns = resolveColumns(SALES_FILE_HEADER)!;
  const row = ['1', 'Khách E', 'A105', '', '', 'Căn hộ'];
  assert.equal(resolveRowPhone(row, columns.phone), null);
});

// ─── In-file dedupe: canonical phone là identity chính ──────────────────────

test('same canonical phone xuất hiện nhiều dòng trong file -> chỉ dòng đầu ready, các dòng sau duplicate_in_file', () => {
  const header = ['Tên KH', 'SĐT'];
  const columns = resolveColumns(header)!;
  const seenInFile = new Set<string>();

  const first = classifyRow(['Nguyễn A', '0901234567'], columns, NO_DB_DUP, seenInFile);
  assert.equal(first.status, 'ready');
  seenInFile.add(phoneKey('0901234567')); // route thêm vào sau khi tạo thành công

  const second = classifyRow(['Nguyễn A (bản ghi lặp)', '0901234567'], columns, NO_DB_DUP, seenInFile);
  assert.equal(second.status, 'duplicate_in_file');
});

test('kịch bản thực tế trong đề bài: HOANG TRUNG HIEU 3 dòng -> 2 customer riêng biệt + 1 duplicate_in_file + cảnh báo trùng tên', () => {
  const header = ['Tên', 'Số điện thoại 1', 'Số điện thoại 2'];
  const columns = resolveColumns(header)!;
  const rows = [
    ['HOANG TRUNG HIEU', '902918818', '0902918818'],
    ['HOANG TRUNG HIEU', '985106218', '0985106218'],
    ['HOANG TRUNG HIEU', '985106218', '0985106218'],
  ];

  const seenInFile = new Set<string>();
  const readyRecords: { ten_KH: string; so_dien_thoai: string }[] = [];
  const statuses: string[] = [];
  const phones: string[] = [];

  for (const row of rows) {
    const result = classifyRow(row, columns, NO_DB_DUP, seenInFile);
    statuses.push(result.status);
    if (result.status === 'ready') {
      phones.push(result.so_dien_thoai);
      readyRecords.push({ ten_KH: result.ten_KH, so_dien_thoai: result.so_dien_thoai });
      seenInFile.add(phoneKey(result.so_dien_thoai));
    }
  }

  assert.deepEqual(statuses, ['ready', 'ready', 'duplicate_in_file']);
  assert.deepEqual(phones, ['0902918818', '0985106218']);
  assert.equal(readyRecords.length, 2); // resulting unique customers = 2

  const warnings = detectDuplicateNameWarnings(readyRecords);
  assert.deepEqual(warnings, ['HOANG TRUNG HIEU']);
});

test('same tên + same canonical phone -> chắc chắn duplicate, chỉ giữ một (không có cảnh báo trùng tên vì cùng SĐT)', () => {
  const readyRecords = [{ ten_KH: 'Nguyễn Văn A', so_dien_thoai: '0901234567' }];
  assert.deepEqual(detectDuplicateNameWarnings(readyRecords), []);
});

test('same tên nhưng KHÁC canonical phone -> giữ cả hai customer riêng biệt, chỉ cảnh báo, không merge/xóa', () => {
  const readyRecords = [
    { ten_KH: 'Nguyễn Văn A', so_dien_thoai: '0901111111' },
    { ten_KH: 'Nguyễn Văn A', so_dien_thoai: '0902222222' },
  ];
  const warnings = detectDuplicateNameWarnings(readyRecords);
  assert.deepEqual(warnings, ['Nguyễn Văn A']);
  // Cả 2 record vẫn còn nguyên trong danh sách — không có logic nào xóa bớt.
  assert.equal(readyRecords.length, 2);
});

test('same canonical phone nhưng tên khác case/spelling -> vẫn dedupe theo phone (không liên quan đến tên)', () => {
  const header = ['Tên KH', 'SĐT'];
  const columns = resolveColumns(header)!;
  const seenInFile = new Set([phoneKey('0901234567')]);
  const result = classifyRow(['  nguyễn văn a  ', '0901234567'], columns, NO_DB_DUP, seenInFile);
  assert.equal(result.status, 'duplicate_in_file'); // trùng phone -> bỏ qua, bất kể tên viết khác thế nào
});

test('normalizeName: trim + collapse whitespace + case-insensitive, không fuzzy', () => {
  assert.equal(normalizeName('  Nguyễn   Văn A '), normalizeName('nguyễn văn a'));
  assert.notEqual(normalizeName('Nguyễn Văn A'), normalizeName('Nguyen Van A')); // không bỏ dấu — không fuzzy
});

test('canonical phone đã tồn tại trong DB -> already_exists, không tạo mới, không đụng customer cũ', () => {
  const header = ['Tên KH', 'SĐT'];
  const columns = resolveColumns(header)!;
  const existingDbPhoneKeys = new Set([phoneKey('0909999999')]);
  const result = classifyRow(['Khách đã có sẵn', '909999999'], columns, existingDbPhoneKeys, NO_FILE_DUP);
  assert.deepEqual(result, { status: 'already_exists', ten_KH: 'Khách đã có sẵn', so_dien_thoai: '0909999999' });
});

test('fixture đúng loại file gây bug: STT | Tên | Mã căn | Số điện thoại 1 | Số điện thoại 2 | Loại căn', () => {
  const columns = resolveColumns(SALES_FILE_HEADER);
  assert.ok(columns);
  assert.equal(SALES_FILE_HEADER[columns!.name], 'Tên');
  assert.deepEqual(columns!.phone.map(i => SALES_FILE_HEADER[i]), ['Số điện thoại 1', 'Số điện thoại 2']);
  assert.equal(columns!.email, -1);

  const row = ['3', 'Đặng Văn F', 'B205', '903123456', '0903123456', 'Shophouse'];
  const result = classifyRow(row, columns!, NO_DB_DUP, NO_FILE_DUP);
  assert.deepEqual(result, { status: 'ready', ten_KH: 'Đặng Văn F', so_dien_thoai: '0903123456', email: '' });
});

// --- findImportSheets: bug thực tế "Import Excel thất bại: File không có dữ liệu"
// trên file "446 Manhattan-VHGP.xlsx" — workbook có sheet đầu ("Sheet2") HOÀN
// TOÀN RỖNG, dữ liệu thật nằm ở sheet thứ 2 ("Sheet1"), header
// STT | MÃ CĂN | TÊN | SĐT. Code cũ luôn đọc wb.SheetNames[0] -> đọc nhầm sheet
// rỗng -> báo "File không có dữ liệu" dù file có 444 dòng dữ liệu thật.

// Đúng cấu trúc thực tế của "446 Manhattan-VHGP.xlsx": Sheet2 rỗng đứng trước
// Sheet1 chứa toàn bộ dữ liệu, header STT | MÃ CĂN | TÊN | SĐT.
const MANHATTAN_FIXTURE_SHEETS = [
  { sheetName: 'Sheet2', rows: [] as unknown[][] },
  {
    sheetName: 'Sheet1',
    rows: [
      ['STT', 'MÃ CĂN', 'TÊN', 'SĐT'],
      [1, 'Y3-91', 'BÙI THỊ VINH', '0913803906'],
      [2, 'V3-93', 'CT CP NĂNG LƯỢNG VĂN CẢNH', '0933666668'],
      [3, 'V3-89', 'ĐỖ VĂN THẢO', '0913803906'],
    ],
  },
];

test('findImportSheets: sheet đầu rỗng ("Sheet2") bị bỏ qua, chọn đúng sheet có dữ liệu thật ("Sheet1") — fixture 446 Manhattan-VHGP.xlsx', () => {
  const resolved = findImportSheets(MANHATTAN_FIXTURE_SHEETS);
  assert.equal(resolved.length, 1);
  const sheet = resolved[0];
  assert.equal(sheet.sheetName, 'Sheet1');
  assert.equal(sheet.headerRowIndex, 0);
  const header = sheet.rows[sheet.headerRowIndex];
  assert.equal(header[sheet.columns.name], 'TÊN');
  assert.deepEqual(sheet.columns.phone.map(i => header[i]), ['SĐT']);
  assert.equal(sheet.columns.email, -1); // file không có cột Email

  // MÃ CĂN (cột 1) tuyệt đối không được nhận nhầm làm bất kỳ field CRM nào.
  assert.notEqual(sheet.columns.name, 1);
  assert.ok(!sheet.columns.phone.includes(1));
  assert.notEqual(sheet.columns.email, 1);

  const dataRows = sheet.rows.slice(sheet.headerRowIndex + 1);
  const row0 = classifyRow(dataRows[0], sheet.columns, NO_DB_DUP, NO_FILE_DUP);
  assert.deepEqual(row0, { status: 'ready', ten_KH: 'BÙI THỊ VINH', so_dien_thoai: '0913803906', email: '' });
});

test('findImportSheets: cho phép dòng trống/tiêu đề nằm trước header thật trong cùng 1 sheet', () => {
  const sheets = [
    {
      sheetName: 'Báo cáo',
      rows: [
        ['BÁO CÁO BÁN HÀNG DỰ ÁN VINHOMES GRAND PARK', '', '', ''],
        ['', '', '', ''],
        ['Tên KH', 'SĐT', 'Email', ''],
        ['Khách A', '0901111111', 'a@x.com', ''],
      ],
    },
  ];
  const resolved = findImportSheets(sheets);
  assert.equal(resolved.length, 1);
  const sheet = resolved[0];
  assert.equal(sheet.headerRowIndex, 2);
  const dataRows = sheet.rows.slice(sheet.headerRowIndex + 1);
  assert.equal(dataRows.length, 1);
  assert.deepEqual(classifyRow(dataRows[0], sheet.columns, NO_DB_DUP, NO_FILE_DUP), { status: 'ready', ten_KH: 'Khách A', so_dien_thoai: '0901111111', email: 'a@x.com' });
});

test('findImportSheets: header nằm sau MAX_HEADER_SCAN_ROWS dòng trống -> không tìm thấy (tránh quét vô hạn sheet rác)', () => {
  const paddingRows: unknown[][] = Array.from({ length: MAX_HEADER_SCAN_ROWS + 1 }, () => ['', '', '']);
  const sheets = [{ sheetName: 'Rác', rows: [...paddingRows, ['Tên KH', 'SĐT']] }];
  assert.deepEqual(findImportSheets(sheets), []);
});

test('findImportSheets: nhiều sheet đều không có header Tên+SĐT hợp lệ -> [] (chỉ trường hợp này mới báo "không có dữ liệu phù hợp")', () => {
  const sheets = [
    { sheetName: 'Sheet1', rows: [] },
    { sheetName: 'Sheet2', rows: [['STT', 'MÃ CĂN', 'Số CMND']] }, // không có Tên/SĐT hợp lệ
  ];
  assert.deepEqual(findImportSheets(sheets), []);
});

test('findImportSheets: nhiều sheet đều có header hợp lệ -> TẤT CẢ đều được nhận, theo đúng thứ tự workbook, không dừng ở sheet đầu tiên', () => {
  const sheets = [
    { sheetName: 'Sheet1', rows: [['Tên KH', 'SĐT'], ['Khách 1', '0901111111']] },
    { sheetName: 'Sheet2', rows: [['Tên KH', 'SĐT'], ['Khách 2', '0902222222']] },
  ];
  const resolved = findImportSheets(sheets);
  assert.equal(resolved.length, 2);
  assert.equal(resolved[0].sheetName, 'Sheet1');
  assert.equal(resolved[1].sheetName, 'Sheet2');
});

// =====================================================================
// Multi-data-sheet workbook thực tế: "CONDOTEL VÀ BIỆT THỰ PHÚ QUỐC.xlsx"
// — 3 sheet: CONDOTEL (dataset thật), MẪU (form/template, KHÔNG phải
// dataset), VILLAS (dataset thật). Header không ở row 0 (CONDOTEL: row 4,
// dưới 1 dòng nhóm-cột-gộp "THÔNG TIN CĂN HỘ/LIÊN HỆ/..."; VILLAS: row 2).
// =====================================================================

// Đúng header thực tế của sheet CONDOTEL/VILLAS trong file — nhiều cột không
// liên quan (MÃ CĂN, NVBH, ĐỊA CHỈ, SỐ CMND, TÊN CHỦ TK...) xen giữa, và có
// cột "TÊN KH NHẬN CHUYỂN NHƯỢNG (NẾU CÓ)" đứng ngay sau "TÊN KH" — bẫy nhận
// nhầm kinh điển nếu match không anchored.
const CONDOTEL_STYLE_HEADER = [
  'STT', '*DỰ ÁN', '*MÃ CĂN', 'NVBH', 'TÊN KH', 'TÊN KH NHẬN CHUYỂN NHƯỢNG (NẾU CÓ)',
  'SĐT KH', 'EMAIL KH', 'ĐỊA CHỈ THƯỜNG TRÚ (TRÊN HỘ KHẨU)', 'SỐ CMND/\r\nPASSPORT', 'TÊN CHỦ TK',
];

test('CONDOTEL_STYLE_HEADER: TÊN KH/SĐT KH/EMAIL KH được nhận đúng, không nhận nhầm cột transfer-name hay các cột CRM khác', () => {
  const columns = resolveColumns(CONDOTEL_STYLE_HEADER);
  assert.ok(columns);
  assert.equal(CONDOTEL_STYLE_HEADER[columns!.name], 'TÊN KH');
  assert.deepEqual(columns!.phone.map(i => CONDOTEL_STYLE_HEADER[i]), ['SĐT KH']);
  assert.equal(CONDOTEL_STYLE_HEADER[columns!.email], 'EMAIL KH');
});

test('"TÊN KH NHẬN CHUYỂN NHƯỢNG (NẾU CÓ)" tuyệt đối không bị nhận nhầm thành cột Tên KH', () => {
  const columns = resolveColumns(CONDOTEL_STYLE_HEADER);
  assert.ok(columns);
  const transferNameIdx = CONDOTEL_STYLE_HEADER.indexOf('TÊN KH NHẬN CHUYỂN NHƯỢNG (NẾU CÓ)');
  assert.notEqual(columns!.name, transferNameIdx);
  // Header đứng 1 mình, không có "TÊN KH" thật đi kèm — dù vẫn có SĐT KH,
  // vẫn phải bị từ chối vì không match alias "ten kh" nào (không
  // substring/fuzzy) -> resolveColumns PHẢI trả về null (thiếu Tên KH hợp lệ).
  const soloColumns = resolveColumns(['TÊN KH NHẬN CHUYỂN NHƯỢNG (NẾU CÓ)', 'SĐT KH']);
  assert.equal(soloColumns, null);
});

test('CMND/CCCD, Mã căn, TÊN CHỦ TK không bao giờ bị nhận thành SĐT hay Tên KH dù đứng cạnh cột thật', () => {
  const columns = resolveColumns(CONDOTEL_STYLE_HEADER)!;
  const cmndIdx = CONDOTEL_STYLE_HEADER.indexOf('SỐ CMND/\r\nPASSPORT');
  const maCanIdx = CONDOTEL_STYLE_HEADER.indexOf('*MÃ CĂN');
  const tenChuTkIdx = CONDOTEL_STYLE_HEADER.indexOf('TÊN CHỦ TK');
  assert.ok(!columns.phone.includes(cmndIdx));
  assert.notEqual(columns.name, maCanIdx);
  assert.notEqual(columns.name, tenChuTkIdx);
});

test('sheet MẪU (form/template thật): "Tên KH" và "SĐT:" nằm ở 2 dòng RIÊNG BIỆT (không cùng 1 dòng) -> không sheet nào qua được resolveColumns, sheet bị loại đúng như thiết kế', () => {
  // Đúng cấu trúc thật của sheet MẪU: dòng 3 có "Tên KH" (label form, không có
  // SĐT cùng dòng); dòng 9 có "SĐT:" (label khác, không có Tên KH cùng dòng).
  const mauSheetRows = [
    ['Dear chị Vy!', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['Em gửi hồ sơ làm HĐVV căn VRC-17-12B', '', '', '', '', '', '', '', '', '', '', '', 'TTĐC'],
    ['Thanks chị!!!', '', '', '', '', '', '', '', '', '', '', '', 'HĐVV'],
    ['', 'STT', 'Mã căn', 'Tên KH', '', 'Loại Hồ sơ', 'Ngày chuyển TT', 'Ngày hẹn ký', 'Giờ hẹn ký', 'Địa điểm', '', '', 'HĐMB'],
    ['', 1, 'VBC-39-12A', '', '', 'HĐVV', '05/08/2016', '06/08/2016', '9h', 'HCM', '', '', 'PLTTS'],
    ['1. Thông tin khách hàng:', 'Khách cá nhân', '', '', '', '', '', '', '', '', '', '', '35% + VAT'],
    ['Họ và tên:', '', '', '', 'Ngày sinh:', '', 'SĐT:', '', '', '', '', '', 1],
    ['Số CMND:  ', '', '', '', 'Ngày cấp:', '', 'Nơi cấp:', '', '', '', '', '', ''],
    ['Email: ', '', '', '', '', '', '', '', '', '', '', '', 'Khách đồng sở hữu'],
  ];
  for (const row of mauSheetRows) assert.equal(resolveColumns(row), null);
  assert.deepEqual(findImportSheets([{ sheetName: 'MẪU', rows: mauSheetRows }]), []);
});

test('multi-data-sheet: CONDOTEL + MẪU + VILLAS -> chỉ CONDOTEL và VILLAS được chọn, MẪU bị loại, cả 2 dataset đều được xử lý (không dừng ở sheet đầu tiên)', () => {
  const sheets = [
    {
      sheetName: 'CONDOTEL',
      rows: [
        ['VinPearl Condotel', '', 1, 2],
        ['THÔNG TIN CĂN HỘ', '', 'THÔNG TIN LIÊN HỆ', ''],
        ['STT', 'TÊN KH', 'SĐT KH', 'EMAIL KH'],
        [1, 'Nguyễn Văn A', '0901111111', 'a@x.com'],
        [2, 'Trần Thị B', '0902222222', 'b@x.com'],
      ],
    },
    { sheetName: 'MẪU', rows: [['', 'Tên KH', ''], ['Họ và tên:', '', 'SĐT:']] },
    {
      sheetName: 'VILLAS ',
      rows: [
        ['STT', 'TÊN KH', 'SĐT KH', 'EMAIL KH'],
        [1, 'Lê Văn C', '0903333333', 'c@x.com'],
      ],
    },
  ];
  const resolved = findImportSheets(sheets);
  assert.deepEqual(resolved.map(s => s.sheetName), ['CONDOTEL', 'VILLAS ']);
});

test('resolveCellPhone: "0913 125 665" (spaced, thực tế trong file) -> "0913125665"', () => {
  assert.equal(resolveCellPhone('0913 125 665'), '0913125665');
});

test('resolveCellPhone: "0908236202-0903834016" (2 số thực sự khác nhau trong 1 cell, thực tế trong file) -> lấy số ĐẦU TIÊN, không ghép', () => {
  assert.equal(resolveCellPhone('0908236202-0903834016'), '0908236202');
});

test('resolveCellPhone: hỗ trợ cả dấu "/" và "," làm phân tách nhiều số trong 1 cell (thực tế trong file)', () => {
  assert.equal(resolveCellPhone('043 833 4170 / 0913 046 557'), '0438334170');
  assert.equal(resolveCellPhone('0983112511 , 61497573478'), '0983112511');
});

test('resolveCellPhone: không có candidate nào đúng độ dài VN (9-10 số) -> giữ nguyên cả chuỗi, không âm thầm làm mất dữ liệu', () => {
  assert.equal(resolveCellPhone('48666268268/01675197399/01629828368'), '048666268268/01675197399/01629828368');
});

test('resolveCellPhone: dấu "-" chỉ là cách trình bày trong 1 số duy nhất (VD định dạng cũ) -> không bị tách nhầm, hành vi giống normalizePhone hiện có (chỉ bỏ khoảng trắng, giữ nguyên dấu "-")', () => {
  // Toàn bộ digit của cell (bỏ dấu) chỉ có 10 số -> KHÔNG kích hoạt tách multi-phone,
  // rơi thẳng vào normalizePhone như cũ — không đổi hành vi hiện có.
  assert.equal(resolveCellPhone('090-123-4567'), '090-123-4567');
  assert.equal(resolveCellPhone('090-123-4567'), normalizePhone('090-123-4567'));
});

test('workbook-wide dedupe: cùng canonical phone xuất hiện ở CONDOTEL rồi lại ở VILLAS -> chỉ 1 customer được tạo (dedupe set KHÔNG reset khi chuyển sheet)', () => {
  const header = ['TÊN KH', 'SĐT KH', 'EMAIL KH'];
  const columns = resolveColumns(header)!;
  const condotelRows = [['Nguyễn Văn A', '0901234567', 'a@x.com']];
  const villasRows = [['Nguyễn Văn A (Villas)', '0901234567', 'a2@x.com']]; // cùng SĐT, xuất hiện lại ở sheet khác

  // Mô phỏng đúng route.ts: 1 Set dùng CHUNG cho toàn workbook, không tạo Set
  // mới khi chuyển sang xử lý sheet kế tiếp.
  const seenInFilePhoneKeys = new Set<string>();
  const r1 = classifyRow(condotelRows[0], columns, NO_DB_DUP, seenInFilePhoneKeys);
  assert.equal(r1.status, 'ready');
  if (r1.status === 'ready') seenInFilePhoneKeys.add(phoneKey(r1.so_dien_thoai));

  const r2 = classifyRow(villasRows[0], columns, NO_DB_DUP, seenInFilePhoneKeys);
  assert.equal(r2.status, 'duplicate_in_file');
});

test('only Tên/SĐT/Email populate trên đúng header CONDOTEL thật: STT/DỰ ÁN/MÃ CĂN/NVBH/transfer-name/ĐỊA CHỈ/CMND/TÊN CHỦ TK tuyệt đối không lọt vào kết quả', () => {
  const columns = resolveColumns(CONDOTEL_STYLE_HEADER)!;
  const row = [
    1, 'VEC', 'VEC-07-05', 'Nguyễn Kim Ngân', 'Tôn Nữ Kiều Thu', '',
    '0915508671', 'kieuthutonnu@yahoo.com.vn', '44 Đường Số 7', '021793327', 'Tôn Nữ Kiều Thu',
  ];
  const result = classifyRow(row, columns, NO_DB_DUP, NO_FILE_DUP);
  assert.deepEqual(result, {
    status: 'ready', ten_KH: 'Tôn Nữ Kiều Thu', so_dien_thoai: '0915508671', email: 'kieuthutonnu@yahoo.com.vn',
  });
  assert.equal(Object.keys(result).length, 4); // status + đúng 3 field, không field nào khác
});

// =====================================================================
// File thực tế "Data - Solari-VHGP.xlsx" — header: Building | Tên căn |
// Tên KH | Di động | House Style | Ghi Chú. "Di động" trước đây KHÔNG được
// nhận là cột phone (từ gốc riêng, không phải biến thể của "điện thoại") ->
// resolveColumns trả về null cho MỌI dòng -> cả workbook bị reject dù có
// 5532 dòng dữ liệu thật. Phone cell cũng có dạng nhiều số nối bởi ";"
// (VD "0918676628;0918686628") mà parser cũ chưa hỗ trợ tách.
// =====================================================================

const SOLARI_HEADER = ['Building', 'Tên căn', 'Tên KH', 'Di động', 'House Style', 'Ghi Chú'];

test('SOLARI_HEADER: "Tên KH" + "Di động" đủ điều kiện làm header hợp lệ (Di động -> cột phone)', () => {
  const columns = resolveColumns(SOLARI_HEADER);
  assert.ok(columns);
  assert.equal(SOLARI_HEADER[columns!.name], 'Tên KH');
  assert.deepEqual(columns!.phone.map(i => SOLARI_HEADER[i]), ['Di động']);
  assert.equal(columns!.email, -1); // file không có cột Email
});

test('"Di động" map đúng vào cột phone qua PHONE_HEADER_PATTERN, không fuzzy/substring', () => {
  const columns = resolveColumns(['Tên KH', 'Di động'])!;
  assert.deepEqual(columns.phone, [1]);
});

test('Building/Tên căn/House Style/Ghi Chú tuyệt đối không bị nhận thành Tên KH hay SĐT dù đứng cạnh cột thật', () => {
  const columns = resolveColumns(SOLARI_HEADER)!;
  assert.notEqual(columns.name, SOLARI_HEADER.indexOf('Tên căn'));
  assert.notEqual(columns.name, SOLARI_HEADER.indexOf('Building'));
  assert.notEqual(columns.name, SOLARI_HEADER.indexOf('House Style'));
  assert.notEqual(columns.name, SOLARI_HEADER.indexOf('Ghi Chú'));
  assert.ok(!columns.phone.includes(SOLARI_HEADER.indexOf('Building')));
  assert.ok(!columns.phone.includes(SOLARI_HEADER.indexOf('House Style')));
});

test('resolveCellPhone: "0908323855;0946154545" (2 số nối bởi ";", đúng ví dụ báo cáo lỗi) -> lấy số ĐẦU TIÊN, không ghép', () => {
  assert.equal(resolveCellPhone('0908323855;0946154545'), '0908323855');
});

test('resolveCellPhone: các separator cũ (-, /, ,) vẫn hoạt động đúng sau khi thêm ";"', () => {
  assert.equal(resolveCellPhone('0908236202-0903834016'), '0908236202');
  assert.equal(resolveCellPhone('043 833 4170 / 0913 046 557'), '0438334170');
  assert.equal(resolveCellPhone('0983112511 , 61497573478'), '0983112511');
});

test('resolveCellPhone: số đầu tiên không đúng độ dài VN (VD "+01054508182;0938207008", thực tế trong file Solari) -> bỏ qua, lấy số hợp lệ tiếp theo, không phải lấy mù quáng segment đầu tiên', () => {
  assert.equal(resolveCellPhone('+01054508182;0938207008'), '0938207008');
});

test('only Tên/SĐT/Email populate trên đúng header Solari thật: Building/Tên căn/House Style/Ghi Chú tuyệt đối không lọt vào kết quả', () => {
  const columns = resolveColumns(SOLARI_HEADER)!;
  const row = ['BS7', 'BS710.03', 'Đoàn Văn Quốc Huy', '0918676628;0918686628', '1PN + 1', 'Ghi chú nội bộ nào đó'];
  const result = classifyRow(row, columns, NO_DB_DUP, NO_FILE_DUP);
  assert.deepEqual(result, { status: 'ready', ten_KH: 'Đoàn Văn Quốc Huy', so_dien_thoai: '0918676628', email: '' });
  assert.equal(Object.keys(result).length, 4);
});

test('findImportSheets: workbook Solari thật (1 sheet "Tổng", header row 0, không có cột Email) được nhận đúng', () => {
  const sheets = [{
    sheetName: 'Tổng',
    rows: [
      SOLARI_HEADER,
      ['BS7', 'BS710.01', 'Trịnh Thị Hậu', '0908555826', 'Studio', ''],
      ['BS7', 'BS710.02', 'Võ Minh Tuệ', '0388761660', '1PN + 1', ''],
      ['BS7', 'BS710.03', 'Đoàn Văn Quốc Huy', '0918676628;0918686628', '1PN + 1', ''],
    ],
  }];
  const resolved = findImportSheets(sheets);
  assert.equal(resolved.length, 1);
  assert.equal(resolved[0].sheetName, 'Tổng');
  assert.equal(resolved[0].headerRowIndex, 0);
  const dataRows = resolved[0].rows.slice(resolved[0].headerRowIndex + 1);
  assert.equal(dataRows.length, 3);
});
