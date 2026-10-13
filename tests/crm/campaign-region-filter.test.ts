// Bộ lọc Khu vực trên CampaignDistributeModal — chỉ là bộ lọc hiển thị
// (NhanVien.khu_vuc), không đổi eligibility/distribution.
import test from 'node:test';
import assert from 'node:assert/strict';
import { filterSalesByRegion, listActiveSaleRegions } from '../../src/lib/campaign-sale-eligibility';
import type { NhanVien } from '../../src/lib/types';

function sale(overrides: Partial<NhanVien> = {}): NhanVien {
  return {
    id_nhan_vien: 'S1', ho_ten: 'Sale 1', so_dien_thoai: '', email: '',
    vai_tro: 'Sale', employee_type: 'Nhân viên Kinh doanh', trang_thai: 'Đang làm', ngay_tao: '',
    ...overrides,
  };
}

const hn1 = sale({ id_nhan_vien: 'H1', ho_ten: 'HN 1', khu_vuc: 'Hà Nội' });
const hn2 = sale({ id_nhan_vien: 'H2', ho_ten: 'HN 2', khu_vuc: ' Hà Nội ' });
const hcm = sale({ id_nhan_vien: 'C1', ho_ten: 'HCM 1', khu_vuc: 'TP.HCM' });
const hcmQuit = sale({ id_nhan_vien: 'C2', ho_ten: 'HCM nghỉ', khu_vuc: 'Đà Nẵng', trang_thai: 'Nghỉ việc' });
const hr = sale({ id_nhan_vien: 'HR', ho_ten: 'HR', vai_tro: 'HR', khu_vuc: 'Cần Thơ' });
const none = sale({ id_nhan_vien: 'X', ho_ten: 'Không KV' });

test('listActiveSaleRegions: distinct + trim + sort, loại Sale nghỉ việc / không phải Sale / rỗng', () => {
  assert.deepEqual(listActiveSaleRegions([hn1, hn2, hcm, hcmQuit, hr, none]), ['Hà Nội', 'TP.HCM']);
});

test('filterSalesByRegion: region rỗng = không lọc; có region = đúng khu vực (trim)', () => {
  const all = [hn1, hn2, hcm, none];
  assert.equal(filterSalesByRegion(all, '').length, 4);
  assert.deepEqual(filterSalesByRegion(all, 'Hà Nội').map(s => s.ho_ten), ['HN 1', 'HN 2']);
  assert.deepEqual(filterSalesByRegion(all, 'Huế'), []);
});
