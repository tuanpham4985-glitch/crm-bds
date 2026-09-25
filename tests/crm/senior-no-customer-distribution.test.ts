// CEO / Chủ tịch giữ vai_tro 'Sale' (để vào CRM) nhưng KHÔNG nhận khách —
// isActiveSale loại họ nên mọi luồng chia/chuyển khách dựa trên nó
// (eligibleCampaignSales, listActiveSaleDepartments, handoff) đều bỏ qua.
import test from 'node:test';
import assert from 'node:assert/strict';
import type { NhanVien } from '../../src/lib/types';
import {
  eligibleCampaignSales,
  isActiveSale,
  isCustomerDistributionExempt,
  listActiveSaleDepartments,
  resolveDepartmentSaleNames,
} from '../../src/lib/campaign-sale-eligibility';

const emp = (ho_ten: string, employee_type: string, phong_KD = 'VIC-03'): NhanVien =>
  ({ id_nhan_vien: ho_ten, ho_ten, employee_type, vai_tro: 'Sale', trang_thai: 'Chính thức', phong_KD } as NhanVien);

const ceo = emp('CEO A', 'CEO');
const chuTich = emp('Chủ tịch B', 'Chủ tịch', 'BLĐ');
const sale = emp('Sale C', 'NVKD');

test('CEO / Chủ tịch được miễn nhận khách, Sale thường thì không', () => {
  assert.equal(isCustomerDistributionExempt(ceo), true);
  assert.equal(isCustomerDistributionExempt(chuTich), true);
  assert.equal(isCustomerDistributionExempt({ employee_type: ' CEO ' }), true);
  assert.equal(isCustomerDistributionExempt(sale), false);
});

test('isActiveSale loại CEO / Chủ tịch dù vai_tro = Sale', () => {
  assert.equal(isActiveSale(ceo), false);
  assert.equal(isActiveSale(chuTich), false);
  assert.equal(isActiveSale(sale), true);
});

test('Chọn theo Phòng VIC-03 không kéo theo CEO kiêm nhiệm phòng đó', () => {
  const employees = [ceo, chuTich, sale];
  const eligibility = eligibleCampaignSales(true, { id_du_an: null } as never, [], employees);
  assert.equal(eligibility.blocked, false);
  if (eligibility.blocked) return;
  assert.deepEqual(eligibility.sales.map(s => s.ho_ten), ['Sale C']);
  assert.deepEqual(resolveDepartmentSaleNames(eligibility.sales, 'VIC-03'), ['Sale C']);
  assert.deepEqual(listActiveSaleDepartments(employees), ['VIC-03']);
});
