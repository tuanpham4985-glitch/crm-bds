import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyRow, normalizeHeader, normalizePhone, phoneKey, resolveColumns } from '../../src/lib/khach-hang-excel-import';

// Header layout giống ảnh thực tế: nhiều cột không liên quan (Căn, Tầng, Sảnh, Số CMND...)
// xen giữa 3 cột cần lấy, đặt cố ý KHÔNG theo thứ tự Tên/SĐT/Email cố định.
const REALISTIC_HEADER = [
  'STT', 'Căn', 'Tầng', 'Sảnh', 'Tên NK', 'Số CMND', 'Ngày sinh', 'Giới tính',
  'Địa chỉ', 'Quan hệ', 'SĐT', 'Từ ngày', 'Email',
];

test('file có nhiều cột lạ: chỉ Tên KH/SĐT/Email được lấy, đúng theo header thực tế', () => {
  const columns = resolveColumns(REALISTIC_HEADER);
  assert.ok(columns);
  assert.equal(REALISTIC_HEADER[columns!.name], 'Tên NK');
  assert.equal(REALISTIC_HEADER[columns!.phone], 'SĐT');
  assert.equal(REALISTIC_HEADER[columns!.email], 'Email');

  const row = ['1', 'A1203', '12', 'A', 'Nguyễn Văn A', '079123456789', '01/01/1990', 'Nam', 'Q1, TP.HCM', 'Vợ', '901234567', '01/01/2026', 'a@example.com'];
  const result = classifyRow(row, columns!, new Set());
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
  const result = classifyRow(['Trần Thị B', '0912345678', ''], columns, new Set());
  assert.deepEqual(result, { status: 'ready', ten_KH: 'Trần Thị B', so_dien_thoai: '0912345678', email: '' });
});

test('file không có cột Email vẫn import được (email luôn rỗng)', () => {
  const header = ['Tên KH', 'SĐT'];
  const columns = resolveColumns(header);
  assert.ok(columns);
  assert.equal(columns!.email, -1);
  const result = classifyRow(['Lê Văn C', '0987654321'], columns!, new Set());
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
  assert.equal(columns.phone, 1);
  assert.equal(columns.email, 2);

  const header2 = ['Tên khách hàng', 'Số điện thoại'];
  const columns2 = resolveColumns(header2)!;
  assert.equal(columns2.name, 0);
  assert.equal(columns2.phone, 1);
  assert.equal(columns2.email, -1);
});

test('duplicate phone (theo 9 chữ số cuối) bị đánh dấu trùng, không import lại', () => {
  const header = ['Tên KH', 'SĐT'];
  const columns = resolveColumns(header)!;
  const existingPhoneKeys = new Set([phoneKey('0901234567')]);
  const result = classifyRow(['Người trùng SĐT', '901234567'], columns, existingPhoneKeys);
  assert.deepEqual(result, { status: 'duplicate', ten_KH: 'Người trùng SĐT', so_dien_thoai: '0901234567' });
});

test('thiếu Tên KH hoặc SĐT bị đánh dấu invalid, không âm thầm biến mất', () => {
  const header = ['Tên KH', 'SĐT'];
  const columns = resolveColumns(header)!;
  assert.deepEqual(classifyRow(['', '0901234567'], columns, new Set()), { status: 'invalid', reason: 'Thiếu Tên KH' });
  assert.deepEqual(classifyRow(['Không có SĐT', ''], columns, new Set()), { status: 'invalid', reason: 'Thiếu SĐT' });
  assert.deepEqual(classifyRow(['', ''], columns, new Set()), { status: 'blank' }); // dòng trắng hoàn toàn, không tính invalid
});

test('field Dự án/Nguồn/Sale/Nhu cầu không bao giờ bị populate từ Excel dù file có các cột này', () => {
  const header = ['Dự án', 'Sale', 'Tên KH', 'Nguồn', 'SĐT', 'Nhu cầu', 'Email'];
  const columns = resolveColumns(header)!;
  const row = ['Vinhomes', 'Nguyễn Sale', 'Phạm Văn D', 'Facebook', '0933333333', 'Mua để ở gấp', 'd@example.com'];
  const result = classifyRow(row, columns, new Set());
  assert.equal(result.status, 'ready');
  // Kết quả classifyRow chỉ có đúng 4 khoá: status, ten_KH, so_dien_thoai, email —
  // không có cách nào rò rỉ Dự án/Sale/Nguồn/Nhu cầu vào object trả về.
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
