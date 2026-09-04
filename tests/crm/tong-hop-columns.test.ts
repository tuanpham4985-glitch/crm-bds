import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveTongHopColumns } from '../../src/lib/google-sheets';

// Regression cho bug đã audit ("Doanh số tính du lịch" — Trần Võ Khánh hiện
// sai trên Bảng xếp hạng): header thật (52 cột) của sheet "Tổng hợp giao
// dịch chi tiết" — copy nguyên văn từ workbook Excel do user cung cấp làm
// golden reference. Test này khoá lại: colSale PHẢI resolve ra "Sale bán",
// KHÔNG PHẢI "Quà tặng sale từ CĐT" (cột đứng trước, cũng chứa substring
// "sale" trong "quà tặng SALE từ CĐT" — root cause khiến sale_phu_trach rỗng
// cho MỌI dòng trước fix này).
const REAL_HEADERS = [
  'STT', 'Tuần', 'Tháng', 'Năm ', 'Ngày Cọc', 'Ngày ký TTĐC/VBTT', 'Ngày ký HĐMB',
  'Phương án thanh toán', 'Mã Căn', 'Loại căn', 'Dự Án', 'Giỏ Đại lý F1 ',
  ' Giá niêm yết (gồm VAT & KPBT)', ' Giá tính HH (Chưa gồm VAT & KPBT)',
  'Quà tặng sale từ CĐT', '% Tỷ lệ HH NHẬN VỀ', 'HH Bổ sung (Chưa VAT)',
  'Hoa hồng Môi giới đã tạm ứng/Giảm trừ do khách hàng có chiết khấu Vinclub ( chưa VAT)',
  'Tổng Phí HHMG (Chưa VAT)', 'Tổng Phí HHMG (Có VAT)', ' Thưởng nóng (Chưa VAT)',
  'Sale bán', 'GDDA', 'PHÓ GDDA ', 'GĐKD', 'Phòng KD', 'Thưởng nóng sale (Gồm VAT)',
  '% Trả sale', '% KH (nếu có)', '%MKT', '% Lãi phạt ', '%GDKD + TPKD (nếu có)', '% GDDA',
  'Họ tên KH', 'Ngày sinh', 'SĐT', 'Email', 'Địa chỉ liên hệ', 'TKKD',
  'Tình trạng đối chiếu', 'Tổng Phí HHMG trả sale ', 'Tổng phí trả KH',
  'Tổng phí trả GDDA', 'Tổng phí trả GĐKD+TPKD (nếu có)', 'Tổng phí trả MKT',
  'Phí TKKD', 'Lãi phạt phát sinh cty chịu', 'Lãi phạt phát sinh cty trả trừ vào hh sale',
  'Lợi nhuận', 'Tình trạng', 'Ghi chú', 'Tỷ lệ phí hh/thực nhận',
];

test('resolveTongHopColumns: colSale = "Sale bán" — KHÔNG khớp nhầm "Quà tặng sale từ CĐT" đứng trước (regression cho bug root cause "Doanh số tính du lịch" sai)', () => {
  const cols = resolveTongHopColumns(REAL_HEADERS);
  assert.equal(cols.colSale, 'Sale bán');
  assert.notEqual(cols.colSale, 'Quà tặng sale từ CĐT');
});

test('resolveTongHopColumns: colGiaTri = "Giá tính HH (Chưa gồm VAT & KPBT)" — KHÔNG khớp nhầm "Giá niêm yết (gồm VAT & KPBT)" đứng trước', () => {
  const cols = resolveTongHopColumns(REAL_HEADERS);
  assert.equal(cols.colGiaTri?.trim(), 'Giá tính HH (Chưa gồm VAT & KPBT)');
});

test('resolveTongHopColumns: colTyLePhiHH = "Tỷ lệ phí hh/thực nhận" (field mới, cần cho eligibility "Doanh số tính du lịch") — không khớp nhầm các cột "% ..." khác', () => {
  const cols = resolveTongHopColumns(REAL_HEADERS);
  assert.equal(cols.colTyLePhiHH, 'Tỷ lệ phí hh/thực nhận');
});

test('resolveTongHopColumns: colLoaiHinh = "Loại căn" (exact match, không đổi bởi fix này)', () => {
  const cols = resolveTongHopColumns(REAL_HEADERS);
  assert.equal(cols.colLoaiHinh, 'Loại căn');
});

test('resolveTongHopColumns: colPhongKD = "Phòng KD", colDuAn = "Dự Án", colNgayCocStrict = "Ngày Cọc", colNgaySigned = "Ngày ký TTĐC/VBTT" (không đổi bởi fix này)', () => {
  const cols = resolveTongHopColumns(REAL_HEADERS);
  assert.equal(cols.colPhongKD, 'Phòng KD');
  assert.equal(cols.colDuAn, 'Dự Án');
  assert.equal(cols.colNgayCocStrict, 'Ngày Cọc');
  assert.equal(cols.colNgaySigned, 'Ngày ký TTĐC/VBTT');
});

test('resolveTongHopColumns: colNguon = null trên sheet thật (không có cột "Loại nguồn"/"Nội bộ"/"Đối tác" độc lập — Đối tác chỉ đánh dấu qua Phòng KD) — không tự suy đoán ra cột sai', () => {
  const cols = resolveTongHopColumns(REAL_HEADERS);
  assert.equal(cols.colNguon, null);
});

test('resolveTongHopColumns: sheet không có cột "Sale bán" (header lạ hoàn toàn) -> colSale vẫn fallback về pattern rộng, không throw', () => {
  const cols = resolveTongHopColumns(['STT', 'Nhân viên phụ trách', 'Giá trị']);
  assert.equal(cols.colSale, 'Nhân viên phụ trách');
});

test('resolveTongHopColumns: header rỗng hoàn toàn -> mọi field null, không throw', () => {
  const cols = resolveTongHopColumns([]);
  assert.deepEqual(cols, {
    colGiaTri: null, colLoaiHinh: null, colNguon: null, colChiNhanh: null,
    colPhongKD: null, colSale: null, colDuAn: null, colTyLePhiHH: null,
    colNgayCocStrict: null, colNgaySigned: null,
  });
});
