import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { canManageCampaign, canManageMembership, isMembershipDirectManager, isTelesale } from '../../src/lib/crm-auth';
import { eligibleCampaignSales, isActiveSale } from '../../src/lib/campaign-sale-eligibility';
import { planDistribution } from '../../src/lib/crm-funnel/campaign';
import type { CrmSessionUser } from '../../src/lib/crm-auth';
import type { DuAn, NhanVien } from '../../src/lib/types';

// Business model lock: KHÔNG có role "Telesale" riêng — VAI_TRO chỉ có
// 'Admin' | 'HR' | 'Sale'. Người thực hiện Campaign CSKH luôn là nhân viên
// vai_tro 'Sale'. Leader = Campaign.owner_name, cũng là 1 nhân viên Sale.
const admin: CrmSessionUser = { id_nhan_vien: 'ADMIN1', ho_ten: 'Sếp', email: 'admin@x.com', vai_tro: 'Admin' };
const leader: CrmSessionUser = { id_nhan_vien: 'LEAD1', ho_ten: 'Trưởng phòng A', email: 'lead@x.com', vai_tro: 'Sale' };
const otherLeader: CrmSessionUser = { id_nhan_vien: 'LEAD2', ho_ten: 'Trưởng phòng B', email: 'lead2@x.com', vai_tro: 'Sale' };
const saleA: NhanVien = { id_nhan_vien: 'S_A', ho_ten: 'Sale A', so_dien_thoai: '', email: '', vai_tro: 'Sale', employee_type: 'Nhân viên Kinh doanh', trang_thai: 'Đang làm', ngay_tao: '' };
const saleB: NhanVien = { id_nhan_vien: 'S_B', ho_ten: 'Sale B', so_dien_thoai: '', email: '', vai_tro: 'Sale', employee_type: 'Nhân viên Kinh doanh', trang_thai: 'Đang làm', ngay_tao: '' };
const saleOutsideTeam: NhanVien = { id_nhan_vien: 'S_C', ho_ten: 'Sale C', so_dien_thoai: '', email: '', vai_tro: 'Sale', employee_type: 'Nhân viên Kinh doanh', trang_thai: 'Đang làm', ngay_tao: '' };
const inactiveSale: NhanVien = { id_nhan_vien: 'S_D', ho_ten: 'Sale D (nghỉ)', so_dien_thoai: '', email: '', vai_tro: 'Sale', employee_type: 'Nhân viên Kinh doanh', trang_thai: 'Nghỉ việc', ngay_tao: '' };
const hrEmployee: NhanVien = { id_nhan_vien: 'HR1', ho_ten: 'Nhân sự A', so_dien_thoai: '', email: '', vai_tro: 'HR', employee_type: 'Nhân sự', trang_thai: 'Đang làm', ngay_tao: '' };
const employees = [saleA, saleB, saleOutsideTeam, inactiveSale, hrEmployee];

function project(overrides: Partial<DuAn> = {}): DuAn {
  return { id_du_an: 'DA1', ma_du_an: 'MA1', ten_du_an: 'Dự án A', hien_thi: 1, hoa_hong_mac_dinh: 0, ...overrides };
}

// --- 1. Admin can manage Campaign/distribution -----------------------------

test('1) Admin luôn quản lý được Campaign/distribution, bất kể ai là owner', () => {
  assert.equal(canManageCampaign(admin, { owner_name: 'Người khác' }), true);
});

// --- 2. Campaign Leader can distribute their Campaign -----------------------

test('2) Campaign Leader (đúng owner_name) quản lý/phân data được Campaign của mình', () => {
  assert.equal(canManageCampaign(leader, { owner_name: 'Trưởng phòng A' }), true);
});

// --- 3. unrelated Leader cannot ---------------------------------------------

test('3) Leader KHÔNG liên quan (không phải owner Campaign này) không quản lý/phân data được', () => {
  assert.equal(canManageCampaign(otherLeader, { owner_name: 'Trưởng phòng A' }), false);
});

// --- 4. Leader can only select eligible Sale staff in their scope ----------
// (kiến trúc đã duyệt: nếu KHÔNG xác định được phạm vi Leader→Sale đáng tin
// cậy thì phải CHẶN Leader, KHÔNG được suy diễn/mở rộng thành toàn bộ Sale.)

test('4a) eligibleCampaignSales: Admin không có Dự án liên kết vẫn thấy toàn bộ Sale đang hoạt động — không bao giờ blocked, không bị thu hẹp theo team Dự án', () => {
  const result = eligibleCampaignSales(true, { id_du_an: null }, [], employees);
  assert.equal(result.blocked, false);
  if (result.blocked) return;
  assert.equal(result.scoped, false);
  assert.deepEqual(result.sales.map(e => e.ho_ten).sort(), ['Sale A', 'Sale B', 'Sale C'].sort());
});

test('4a-2) eligibleCampaignSales: Admin với Campaign CÓ Dự án liên kết vẫn không bị thu hẹp theo ds_sale — Admin luôn thấy toàn bộ Sale', () => {
  const campaign = { id_du_an: 'DA1' };
  const projects: DuAn[] = [project({ ds_sale: JSON.stringify(['Sale A']) })];
  const result = eligibleCampaignSales(true, campaign, projects, employees);
  assert.equal(result.blocked, false);
  if (result.blocked) return;
  assert.equal(result.scoped, false);
  assert.deepEqual(result.sales.map(e => e.ho_ten).sort(), ['Sale A', 'Sale B', 'Sale C'].sort());
});

test('4b) eligibleCampaignSales: Leader với Dự án liên kết có ds_sale hợp lệ -> CHỈ đúng Sale trong roster đó hợp lệ, không mở rộng', () => {
  const campaign = { id_du_an: 'DA1' };
  const projects: DuAn[] = [project({ ds_sale: JSON.stringify(['Sale A', 'Sale B']) })];
  const result = eligibleCampaignSales(false, campaign, projects, employees);
  assert.equal(result.blocked, false);
  if (result.blocked) return;
  assert.equal(result.scoped, true);
  assert.deepEqual(result.sales.map(e => e.ho_ten).sort(), ['Sale A', 'Sale B']);
  assert.ok(!result.sales.some(e => e.ho_ten === 'Sale C'), 'Leader không được chọn Sale C ngoài roster');
});

test('4c) eligibleCampaignSales: Leader với Campaign KHÔNG gắn Dự án -> BỊ CHẶN hoàn toàn (không suy diễn thành toàn bộ Sale)', () => {
  const result = eligibleCampaignSales(false, { id_du_an: null }, [], employees);
  assert.equal(result.blocked, true);
  if (!result.blocked) return;
  assert.match(result.reason, /Campaign chưa có phạm vi Sale được cấu hình/);
});

test('4c-2) eligibleCampaignSales: Leader với Dự án liên kết nhưng ds_sale rỗng/thiếu -> BỊ CHẶN, không rơi về toàn bộ Sale công ty', () => {
  const missingRoster: DuAn[] = [project({ ds_sale: undefined })];
  const missing = eligibleCampaignSales(false, { id_du_an: 'DA1' }, missingRoster, employees);
  assert.equal(missing.blocked, true);
  if (missing.blocked) assert.match(missing.reason, /Campaign chưa có phạm vi Sale được cấu hình/);

  const emptyRoster: DuAn[] = [project({ ds_sale: JSON.stringify([]) })];
  const empty = eligibleCampaignSales(false, { id_du_an: 'DA1' }, emptyRoster, employees);
  assert.equal(empty.blocked, true);

  const unparseableRoster: DuAn[] = [project({ ds_sale: 'not-json' })];
  const unparseable = eligibleCampaignSales(false, { id_du_an: 'DA1' }, unparseableRoster, employees);
  assert.equal(unparseable.blocked, true);
});

test('4c-3) eligibleCampaignSales: Campaign.id_du_an trỏ tới Dự án KHÔNG tồn tại trong danh sách projects -> vẫn BỊ CHẶN (không có roster nào để đối chiếu)', () => {
  const result = eligibleCampaignSales(false, { id_du_an: 'DA_KHONG_TON_TAI' }, [project({ ds_sale: JSON.stringify(['Sale A']) })], employees);
  assert.equal(result.blocked, true);
});

test('4d) eligibleCampaignSales/isActiveSale: HR và nhân viên đã nghỉ việc không bao giờ hợp lệ, kể cả Admin cũng không thấy họ', () => {
  assert.equal(isActiveSale(hrEmployee), false);
  assert.equal(isActiveSale(inactiveSale), false);
  const result = eligibleCampaignSales(true, { id_du_an: null }, [], employees);
  assert.equal(result.blocked, false);
  if (result.blocked) return;
  assert.ok(!result.sales.some(e => e.ho_ten === hrEmployee.ho_ten));
  assert.ok(!result.sales.some(e => e.ho_ten === inactiveSale.ho_ten));
});

test('4f) Campaign owner khác DuAn.truong_nhom KHÔNG mở rộng hay thay đổi roster — chỉ ds_sale của Dự án liên kết mới quyết định phạm vi Sale, không liên quan tới ai là owner/truong_nhom', () => {
  const projects: DuAn[] = [project({ truong_nhom: 'Người hoàn toàn khác owner Campaign', ds_sale: JSON.stringify(['Sale A']) })];
  // Campaign.owner_name (Trưởng phòng A) khác hẳn DuAn.truong_nhom ở trên — vẫn phải ra đúng roster ds_sale.
  const result = eligibleCampaignSales(false, { id_du_an: 'DA1' }, projects, employees);
  assert.equal(result.blocked, false);
  if (result.blocked) return;
  assert.deepEqual(result.sales.map(e => e.ho_ten), ['Sale A']);
});

test('4e) không còn role "Telesale" riêng: isTelesale() (free-text employee_type match) KHÔNG được dùng làm authority cho Campaign Sale eligibility nữa', () => {
  const distributeSrc = readFileSync(resolve('src/app/api/campaigns/[id]/distribute/route.ts'), 'utf8');
  assert.doesNotMatch(distributeSrc, /isTelesale/);
  assert.match(distributeSrc, /eligibleCampaignSales/);
  const modalSrc = readFileSync(resolve('src/components/crm/CampaignDistributeModal.tsx'), 'utf8');
  assert.doesNotMatch(modalSrc, /function isTelesale/);
  assert.match(modalSrc, /eligibleCampaignSales/);
});

test('4e-2) distribute route thực sự trả lỗi kèm lý do khi eligibility.blocked, KHÔNG âm thầm cho phép Leader phân data khi không có roster', () => {
  const src = readFileSync(resolve('src/app/api/campaigns/[id]/distribute/route.ts'), 'utf8');
  assert.match(src, /if \(eligibility\.blocked\)/);
  assert.match(src, /error: eligibility\.reason/);
});

// --- 5 & 6. Sale sees/acts on assigned membership; unrelated Sale cannot ---

test('5) Sale được gán (telesale_id đúng) thao tác được membership của mình', () => {
  const membership = { telesale_id: saleA.id_nhan_vien };
  const actorA: CrmSessionUser = { id_nhan_vien: saleA.id_nhan_vien, ho_ten: saleA.ho_ten, email: '', vai_tro: 'Sale' };
  assert.equal(canManageMembership(actorA, membership, { owner_name: 'Trưởng phòng A' }), true);
});

test('6) Sale KHÔNG liên quan không thể mutate membership của Sale khác', () => {
  const membership = { telesale_id: saleA.id_nhan_vien };
  const actorB: CrmSessionUser = { id_nhan_vien: saleB.id_nhan_vien, ho_ten: saleB.ho_ten, email: '', vai_tro: 'Sale' };
  assert.equal(canManageMembership(actorB, membership, { owner_name: 'Trưởng phòng A' }), false);
  assert.equal(isMembershipDirectManager(actorB, membership, employees), false);
});

// --- 7. existing UNASSIGNED can be assigned; 8. round-robin deterministic; 9. quantity remainder correct ---

test('7/8/9) eligibleCampaignSales -> planDistribution: phân đúng theo roster hợp lệ, round-robin deterministic, quantity remainder giữ UNASSIGNED', () => {
  const campaign = { id_du_an: 'DA1' };
  const projects: DuAn[] = [project({ ds_sale: JSON.stringify(['Sale A', 'Sale B']) })];
  const result = eligibleCampaignSales(false, campaign, projects, employees);
  assert.equal(result.blocked, false);
  if (result.blocked) return;
  const telesales = result.sales.map(e => ({ id_nhan_vien: e.id_nhan_vien, ho_ten: e.ho_ten }));

  const roundRobin = planDistribution({ customerIds: ['C1', 'C2', 'C3'], telesales, mode: 'round_robin' });
  assert.deepEqual(roundRobin.map(p => p.telesale_name), ['Sale A', 'Sale B', 'Sale A']);
  assert.ok(roundRobin.every(p => p.assignment_status === 'ASSIGNED'), 'existing UNASSIGNED (customerIds đầu vào) được phân thành ASSIGNED');

  const quantity = planDistribution({
    customerIds: ['C1', 'C2', 'C3', 'C4', 'C5'], telesales, mode: 'quantity', quantities: { S_A: 2, S_B: 1 },
  });
  assert.deepEqual(quantity.filter(p => p.telesale_name === 'Sale A').map(p => p.customer_id), ['C1', 'C2']);
  assert.deepEqual(quantity.filter(p => p.telesale_name === 'Sale B').map(p => p.customer_id), ['C3']);
  const remainder = quantity.filter(p => p.assignment_status === 'UNASSIGNED');
  assert.deepEqual(remainder.map(p => p.customer_id), ['C4', 'C5']);
});

test('4g) Leader không thể chọn 1 Sale ngoài roster liên kết — mô phỏng đúng logic reject của distribute route (find-or-reject trên eligibility.sales)', () => {
  const campaign = { id_du_an: 'DA1' };
  const projects: DuAn[] = [project({ ds_sale: JSON.stringify(['Sale A', 'Sale B']) })];
  const result = eligibleCampaignSales(false, campaign, projects, employees);
  assert.equal(result.blocked, false);
  if (result.blocked) return;
  const target = result.sales.find(item => item.ho_ten === 'Sale C');
  assert.equal(target, undefined, 'Sale C ngoài roster -> route phải trả lỗi, không tìm thấy target hợp lệ');
});

// --- 10. Sale CSKH assignment never writes Sale ownership/Handoff/Pipeline ---

test('10) campaign.ts (bulkAddAndDistribute) và distribute route không bao giờ ghi sale_phu_trach/sale_nhan_khach/CrmHandoff/Pipeline', () => {
  for (const file of ['src/lib/crm-funnel/campaign.ts', 'src/app/api/campaigns/[id]/distribute/route.ts']) {
    const src = readFileSync(resolve(file), 'utf8');
    const codeOnly = src.split('\n').filter(line => !line.trim().startsWith('//') && !line.trim().startsWith('*')).join('\n');
    assert.doesNotMatch(codeOnly, /sale_phu_trach|sale_nhan_khach|tx\.pipeline|khachHang\.(update|create)/i, `${file} không được ghi Sale ownership/Pipeline/KhachHang`);
    // crmHandoff.count() (READ-ONLY, Admin Test Data Cleanup — kiểm tra
    // dependency trước khi xóa Campaign) là ngoại lệ hợp lệ duy nhất; mọi
    // WRITE (create/update/delete/upsert) vào CrmHandoff vẫn bị cấm tuyệt đối.
    assert.doesNotMatch(codeOnly, /crmHandoff\.(create|update|delete|upsert)/i, `${file} không được ghi CrmHandoff`);
  }
});

// --- 11. legacy Project-mode CSKH remains unchanged -------------------------

test('11) legacy CSKH theo Dự án (isTelesale, /api/crm/telesale/*, transactional-workflow.ts) vẫn nguyên vẹn, không bị đụng vào', () => {
  assert.equal(typeof isTelesale, 'function', 'isTelesale() (legacy, free-text employee_type match) vẫn tồn tại cho luồng CSKH theo Dự án cũ');
  const legacyEmployee: Pick<NhanVien, 'employee_type' | 'vai_tro'> = { employee_type: 'Telesale/CSKH', vai_tro: 'Sale' };
  assert.equal(isTelesale(legacyEmployee), true, 'isTelesale() vẫn match theo pattern text cũ, hành vi không đổi');

  const workflowSrc = readFileSync(resolve('src/lib/crm-funnel/transactional-workflow.ts'), 'utf8');
  assert.match(workflowSrc, /export async function recordInteractionTransactional/);
  assert.match(workflowSrc, /export async function transitionHandoffTransactional/);
  assert.doesNotMatch(workflowSrc, /eligibleCampaignSales|campaign-sale-eligibility/, 'legacy workflow không phụ thuộc vào Sale CSKH eligibility mới của Campaign');

  const pageSrc = readFileSync(resolve('src/app/phan-khach/page.tsx'), 'utf8');
  assert.match(pageSrc, /function isTelesale\(employee: NhanVien\)/, 'chế độ Theo Dự án cũ vẫn dùng đúng isTelesale local như trước, không đổi');
  assert.match(pageSrc, /telesales\.filter\(isTelesale\)|activeEmployees\.filter\(isTelesale\)/);
});

test('11b) canAccessPage mở rộng cho Sale KHÔNG làm thay đổi authority bên trong chế độ Project — canManage vẫn dùng đúng logic cũ (Admin/Trưởng nhóm/quản lý trực tiếp)', () => {
  const pageSrc = readFileSync(resolve('src/app/phan-khach/page.tsx'), 'utf8');
  assert.match(pageSrc, /const canManage = Boolean\(isAdmin \|\| \(selectedProject && selectedProject\.truong_nhom === user\?\.ho_ten\) \|\| managesAssignedTelesale\)/);
  assert.match(pageSrc, /const canAccessPage = isAdmin \|\| user\?\.vai_tro === 'Sale'/);
});
