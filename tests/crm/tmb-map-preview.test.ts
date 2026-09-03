import assert from 'node:assert/strict';
import test from 'node:test';
import type { StackingListRow } from '../../src/lib/types';
import { buildTmbPreview } from '../../src/app/stacking/tmb-map-preview';

function row(maCan: string, values: Record<string, string | number | null>): StackingListRow {
  return { maCan, values, trangThai: 'con_hang' };
}

test('buildTmbPreview: đọc đúng field từ header thật của nguồn Vinhomes Sài Gòn Park (reuse isPriceColumn, không đoán)', () => {
  const r = row('AS72-02', {
    'STT': 3, 'Phân khu': 'IVY PARK', 'Mã căn': 'AS72-02', 'Đặc điểm': 'Căn góc',
    'TCBG': 'Giãn xây', 'Loại hình': 'LK', 'DT Đất (m2)': 70.5, 'DTXD (m2)': 227.7,
    'Giá gồm VAT+KPBT': 9761323413, 'Hướng': 'Đông Bắc',
  });
  const preview = buildTmbPreview(r);
  assert.equal(preview.maCan, 'AS72-02');
  assert.equal(preview.giaValue, 9761323413);
  assert.equal(preview.areaLabel, 'DT Đất (m2)'); // cột "dt..." đầu tiên tìm thấy
  assert.equal(preview.areaValue, 70.5);
  assert.equal(preview.loaiHinh, 'LK');
  assert.equal(preview.huong, 'Đông Bắc');
});

test('buildTmbPreview: nguồn không có cột nào khớp -> field null, không throw, không suy đoán', () => {
  const r = row('X-01', { 'Cột lạ': 'giá trị' });
  const preview = buildTmbPreview(r);
  assert.equal(preview.maCan, 'X-01');
  assert.equal(preview.giaValue, null);
  assert.equal(preview.areaLabel, null);
  assert.equal(preview.areaValue, null);
  assert.equal(preview.loaiHinh, null);
  assert.equal(preview.huong, null);
});

test('buildTmbPreview: giá trị null trong Sheet -> field null (không format số 0 giả)', () => {
  const r = row('AS72-04', { 'Giá gồm VAT+KPBT': null, 'Hướng': null });
  const preview = buildTmbPreview(r);
  assert.equal(preview.giaValue, null);
  assert.equal(preview.huong, null);
});

test('buildTmbPreview: giá trị kiểu chuỗi ở cột số (VD "Liên hệ") -> không ép thành số sai, trả null', () => {
  const r = row('AS72-04', { 'Giá gồm VAT+KPBT': 'Liên hệ' });
  const preview = buildTmbPreview(r);
  assert.equal(preview.giaValue, null);
});

test('buildTmbPreview: "Loại căn" cũng được nhận diện (không chỉ "Loại hình")', () => {
  const r = row('B-01', { 'Loại căn': '3BR' });
  const preview = buildTmbPreview(r);
  assert.equal(preview.loaiHinh, '3BR');
});
