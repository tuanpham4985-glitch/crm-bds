import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyRow, detectDuplicateNameWarnings, normalizeHeader, normalizeName,
  normalizePhone, phoneKey, resolveColumns, resolveRowPhone,
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
