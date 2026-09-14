// CUSTOMER_DEPARTMENT_DISTRIBUTION — "Chọn theo Phòng" trên CampaignDistributeModal
// (bulk-tick nhân viên/Sale thuộc 1 Phòng thay vì tick từng người) — CHỈ là
// UI/convenience layer resolve Department -> eligible Sale -> ĐÚNG
// selectedSales/recipient representation hiện có -> ĐÚNG distribution engine
// hiện có (planDistribution, không đổi). Không tạo Department model/API mới
// — "Phòng" tái dùng NhanVien.phong_KD đã có sẵn (Postgres + Sheets, cột đã
// index), employees prop CampaignDistributeModal ĐÃ CÓ SẴN field này (không
// fetch thêm). File này test 3 hàm THUẦN mới trong campaign-sale-eligibility.ts
// (listActiveSaleDepartments/resolveDepartmentSaleNames/mergeRecipientNames)
// + xác nhận chúng ghép nối ĐÚNG với planDistribution hiện có — không test
// bằng regex UI khi có thể test logic trực tiếp.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  eligibleCampaignSales, listActiveSaleDepartments,
  mergeRecipientNames, resolveDepartmentSaleNames,
} from '../../src/lib/campaign-sale-eligibility';
import { planDistribution } from '../../src/lib/crm-funnel/campaign';
import type { DuAn, NhanVien } from '../../src/lib/types';

function sale(overrides: Partial<NhanVien> = {}): NhanVien {
  return {
    id_nhan_vien: 'S1', ho_ten: 'Sale 1', so_dien_thoai: '', email: '',
    vai_tro: 'Sale', employee_type: 'Nhân viên Kinh doanh', trang_thai: 'Đang làm', ngay_tao: '',
    ...overrides,
  };
}

function project(overrides: Partial<DuAn> = {}): DuAn {
  return { id_du_an: 'DA1', ma_du_an: 'MA1', ten_du_an: 'Dự án A', hien_thi: 1, hoa_hong_mac_dinh: 0, ...overrides };
}

const saleA1 = sale({ id_nhan_vien: 'S_A1', ho_ten: 'Sale A1', phong_KD: 'Phòng Kinh doanh 1' });
const saleA2 = sale({ id_nhan_vien: 'S_A2', ho_ten: 'Sale A2', phong_KD: 'Phòng Kinh doanh 1' });
const saleA3Inactive = sale({ id_nhan_vien: 'S_A3', ho_ten: 'Sale A3 (nghỉ)', phong_KD: 'Phòng Kinh doanh 1', trang_thai: 'Nghỉ việc' });
const saleB1 = sale({ id_nhan_vien: 'S_B1', ho_ten: 'Sale B1', phong_KD: 'Phòng Kinh doanh 2' });
const saleNoDept = sale({ id_nhan_vien: 'S_X', ho_ten: 'Sale không phòng' });
const hrInDeptA = sale({ id_nhan_vien: 'HR1', ho_ten: 'Nhân sự A', vai_tro: 'HR', employee_type: 'Nhân sự', phong_KD: 'Phòng Kinh doanh 1' });
const employees = [saleA1, saleA2, saleA3Inactive, saleB1, saleNoDept, hrInDeptA];

// --- listActiveSaleDepartments ----------------------------------------------

test('listActiveSaleDepartments: trả đúng danh sách Phòng có >=1 Sale ĐANG HOẠT ĐỘNG, distinct + sort, loại HR và Sale nghỉ việc khỏi việc "làm phòng đó xuất hiện"', () => {
  const depts = listActiveSaleDepartments(employees);
  assert.deepEqual(depts, ['Phòng Kinh doanh 1', 'Phòng Kinh doanh 2']);
});

test('listActiveSaleDepartments: nhân viên không có phong_KD không tạo ra entry rỗng/undefined trong danh sách', () => {
  const depts = listActiveSaleDepartments([saleNoDept]);
  assert.deepEqual(depts, []);
});

// --- B/C. resolveDepartmentSaleNames: đúng nhân viên thuộc phòng, loại người khác phòng ---

test('B) resolveDepartmentSaleNames: resolve ĐÚNG các Sale eligible thuộc phòng đã chọn', () => {
  const names = resolveDepartmentSaleNames(employees, 'Phòng Kinh doanh 1');
  assert.deepEqual(names.sort(), ['Sale A1', 'Sale A2', 'Sale A3 (nghỉ)', 'Nhân sự A'].sort());
  // Lưu ý: hàm này CHỈ intersect theo phong_KD — không tự áp isActiveSale hay
  // vai_tro (đó là việc của eligibleCampaignSales(), caller PHẢI truyền vào
  // eligibleSales đã lọc sẵn — xem test D bên dưới cho đúng luồng thật).
});

test('C) resolveDepartmentSaleNames: nhân viên KHÔNG thuộc phòng được chọn hoàn toàn không có mặt trong kết quả', () => {
  const names = resolveDepartmentSaleNames(employees, 'Phòng Kinh doanh 1');
  assert.ok(!names.includes('Sale B1'), 'Sale B1 thuộc Phòng Kinh doanh 2 không được lẫn vào');
});

// --- D. Ineligible employee trong phòng không bypass existing eligibility rule ---

test('D) luồng thật (đúng cách CampaignDistributeModal gọi): resolveDepartmentSaleNames PHẢI nhận eligibleSales đã qua eligibleCampaignSales() trước — Sale nghỉ việc/HR trong phòng KHÔNG lọt vào recipient set dù cùng phong_KD', () => {
  const eligibility = eligibleCampaignSales(true, { id_du_an: null }, [], employees); // Admin -> toàn bộ Sale ĐANG hoạt động
  assert.equal(eligibility.blocked, false);
  const eligibleSales = eligibility.blocked ? [] : eligibility.sales;
  assert.ok(!eligibleSales.some(item => item.ho_ten === 'Sale A3 (nghỉ)'), 'eligibleCampaignSales phải đã loại Sale nghỉ việc trước khi tới bước resolve theo phòng');
  assert.ok(!eligibleSales.some(item => item.ho_ten === 'Nhân sự A'), 'eligibleCampaignSales phải đã loại HR (không phải vai_tro Sale) trước khi tới bước resolve theo phòng');

  const names = resolveDepartmentSaleNames(eligibleSales, 'Phòng Kinh doanh 1');
  assert.deepEqual(names.sort(), ['Sale A1', 'Sale A2'].sort(), 'CHỈ 2 Sale đang hoạt động của phòng — không có Sale nghỉ việc/HR nào lọt qua');
});

test('D2) Leader bị thu hẹp theo roster Dự án: employee trong phòng nhưng KHÔNG nằm trong ds_sale của Dự án liên kết vẫn bị loại khỏi Department bulk-select — Department KHÔNG bypass roster', () => {
  const projects = [project({ ds_sale: JSON.stringify(['Sale A1']) })]; // roster CHỈ có Sale A1, không có Sale A2
  const eligibility = eligibleCampaignSales(false, { id_du_an: 'DA1' }, projects, employees); // Leader, không phải Admin
  assert.equal(eligibility.blocked, false);
  const eligibleSales = eligibility.blocked ? [] : eligibility.sales;
  const names = resolveDepartmentSaleNames(eligibleSales, 'Phòng Kinh doanh 1');
  assert.deepEqual(names, ['Sale A1'], 'Sale A2 cùng phòng nhưng ngoài roster Dự án phải bị loại — Department không được mở rộng ngoài eligibleCampaignSales()');
});

// --- E/G. Department N eligible Sale -> distribution engine nhận ĐÚNG N Sale, cùng semantics với manual-selection ---

test('E/G) Department có N=2 eligible Sale -> planDistribution (round_robin) nhận đúng 2 telesale, kết quả IDENTICAL với việc Admin tự tick thủ công đúng 2 Sale đó (cùng thứ tự) — không có algorithm thứ hai nào cho luồng Department', () => {
  const eligibility = eligibleCampaignSales(true, { id_du_an: null }, [], employees);
  const eligibleSales = eligibility.blocked ? [] : eligibility.sales;
  const deptNames = resolveDepartmentSaleNames(eligibleSales, 'Phòng Kinh doanh 1'); // ['Sale A1', 'Sale A2']
  assert.equal(deptNames.length, 2);

  // Mô phỏng ĐÚNG cách CampaignDistributeModal build TelesaleRef[] từ tên đã
  // chọn (selectedSales) trước khi gọi planDistribution — cùng eligibleSales
  // pool, tra theo ho_ten (đúng cách component thật sự làm khi submit).
  const toRefs = (names: string[]) => names.map(name => {
    const emp = eligibleSales.find(item => item.ho_ten === name)!;
    return { id_nhan_vien: emp.id_nhan_vien, ho_ten: emp.ho_ten };
  });

  const customerIds = ['C1', 'C2', 'C3', 'C4', 'C5'];
  const planFromDepartment = planDistribution({ customerIds, telesales: toRefs(deptNames), mode: 'round_robin' });
  const planFromManualSelection = planDistribution({ customerIds, telesales: toRefs(['Sale A1', 'Sale A2']), mode: 'round_robin' });
  assert.deepEqual(planFromDepartment, planFromManualSelection, 'Department-resolved recipients phải cho kết quả HỆT như Admin tự tick đúng 2 Sale đó — cùng 1 distribution engine, không có behavior riêng cho Department');
  // Xác nhận đúng round-robin semantics: 5 khách / 2 Sale -> 3/2 (i % n)
  assert.equal(planFromDepartment.filter(p => p.telesale_name === 'Sale A1').length, 3);
  assert.equal(planFromDepartment.filter(p => p.telesale_name === 'Sale A2').length, 2);
});

// --- F. Existing distribution algorithm được reuse, không tạo algorithm thứ hai ---

test('F) CampaignDistributeModal.tsx KHÔNG import/gọi bất kỳ hàm phân phối nào khác ngoài fetch tới ĐÚNG POST /api/campaigns/[id]/distribute hiện có — Department bulk-select chỉ đổi CÁCH điền selectedSales, không tạo endpoint/engine thứ hai', () => {
  const src = readFileSync(resolve('src/components/crm/CampaignDistributeModal.tsx'), 'utf8');
  assert.match(src, /fetch\(`\/api\/campaigns\/\$\{targetId\}\/distribute`/, 'vẫn phải gọi đúng 1 endpoint distribute hiện có');
  assert.doesNotMatch(src, /\/api\/campaigns\/[^`]*department|planDistribution\(/, 'component KHÔNG được tự gọi planDistribution ở client hay endpoint department riêng — mọi tính toán phân phối vẫn ở server qua endpoint hiện có');
});

test('F2) campaign.ts: planDistribution (round-robin/quantity) KHÔNG bị sửa bởi tính năng Department — vẫn đúng công thức cũ (customerIds[i] -> telesales[i % n])', () => {
  const src = readFileSync(resolve('src/lib/crm-funnel/campaign.ts'), 'utf8');
  assert.match(src, /const t = telesales\[i % telesales\.length\];/, 'round-robin formula phải giữ nguyên 100%');
});

// --- H. Empty department / zero eligible Sale bị chặn an toàn ---

test('H) Phòng có 0 Sale eligible (VD toàn bộ đã bị lọc bởi roster Dự án) -> resolveDepartmentSaleNames trả mảng RỖNG, không throw — UI hiển thị "0 Sale" thay vì chạy distribution với recipient rỗng', () => {
  const projects = [project({ ds_sale: JSON.stringify(['Người không cùng phòng nào ở trên']) })];
  const eligibility = eligibleCampaignSales(false, { id_du_an: 'DA1' }, projects, employees);
  const eligibleSales = eligibility.blocked ? [] : eligibility.sales;
  const names = resolveDepartmentSaleNames(eligibleSales, 'Phòng Kinh doanh 1');
  assert.deepEqual(names, []);
});

test('H2) CampaignDistributeModal.tsx: guard "chọn ít nhất 1 Sale" hiện có (áp dụng cho MỌI nguồn selectedSales, kể cả từ Department) vẫn nguyên vẹn — không thêm exception nào cho luồng Department', () => {
  const src = readFileSync(resolve('src/components/crm/CampaignDistributeModal.tsx'), 'utf8');
  assert.match(src, /selectedSales\.length === 0\) \{\s*\n\s*setError\('Chọn ít nhất 1 Sale để phân, hoặc chọn "Chưa phân \(chỉ thêm vào Campaign\)"\.'\);\s*\n\s*return;/, 'guard rỗng-recipient hiện có phải còn nguyên — đây chính là cơ chế chặn "chạy distribution với recipient set rỗng" cho CẢ luồng Department, không cần logic mới riêng');
});

// --- I. Duplicate recipient dedupe ------------------------------------------

test('I) mergeRecipientNames: dedupe khi 1 Sale đã được tick thủ công RỒI LẠI thuộc Phòng vừa bulk-select — chỉ xuất hiện ĐÚNG 1 lần, giữ nguyên thứ tự đã chọn trước đó', () => {
  const merged = mergeRecipientNames(['Sale A1'], ['Sale A1', 'Sale A2']);
  assert.deepEqual(merged, ['Sale A1', 'Sale A2']);
});

test('I2) mergeRecipientNames: chọn 2 Phòng liên tiếp (A rồi B) -> union cả 2, không mất lựa chọn trước, không nhân đôi phần tử trùng', () => {
  const afterDeptA = mergeRecipientNames([], ['Sale A1', 'Sale A2']);
  const afterDeptB = mergeRecipientNames(afterDeptA, ['Sale B1', 'Sale A1']); // Sale A1 lặp lại có chủ đích trong input để test dedupe
  assert.deepEqual(afterDeptB, ['Sale A1', 'Sale A2', 'Sale B1']);
});

// --- A. Manual employee selection (toggleSale) không đổi ---------------------

test('A) CampaignDistributeModal.tsx: toggleSale (chọn/bỏ chọn từng Sale thủ công) giữ nguyên logic cũ — không bị thay thế hay gọi qua Department resolver', () => {
  const src = readFileSync(resolve('src/components/crm/CampaignDistributeModal.tsx'), 'utf8');
  assert.match(src, /function toggleSale\(name: string\) \{\s*\n\s*setSelectedSales\(current => current\.includes\(name\) \? current\.filter\(item => item !== name\) : \[\.\.\.current, name\]\);\s*\n\s*\}/);
  // Checklist vẫn dùng đúng toggleSale cho từng dòng (không đổi sang cơ chế khác).
  assert.match(src, /onChange=\{\(\) => toggleSale\(item\.ho_ten\)\}/);
});

// --- J. Không thay đổi Campaign/CSKH/Handoff/qualification/Data tiềm năng ---

test('J) mergeRecipientNames/resolveDepartmentSaleNames/listActiveSaleDepartments KHÔNG được import ở bất kỳ đâu thuộc Campaign membership workflow/handoff/qualification/Data tiềm năng — tính năng Department hoàn toàn tách biệt khỏi các luồng đó', () => {
  const files = [
    'src/lib/crm-funnel/membership-workflow.ts',
    'src/lib/crm-funnel/transactional-workflow.ts',
    'src/lib/crm-funnel/handoff-policy.ts',
    'src/lib/crm-funnel/analytics.ts',
    'src/app/api/campaigns/[id]/members/route.ts',
    'src/app/api/campaigns/[id]/members/[membershipId]/handoff/route.ts',
  ];
  for (const file of files) {
    const src = readFileSync(resolve(file), 'utf8');
    assert.doesNotMatch(src, /listActiveSaleDepartments|resolveDepartmentSaleNames|mergeRecipientNames/, `${file} không được liên quan gì tới Department bulk-select`);
  }
});

// --- K. Không broad-read Customer/CampaignMembership mới chỉ để resolve phòng ---

test('K) CampaignDistributeModal.tsx: KHÔNG có fetch/useEffect mới nào cho Department — "Phòng" đọc thẳng từ `employees` prop đã có sẵn (không gọi API department/nhân-vien-theo-phòng nào mới)', () => {
  const src = readFileSync(resolve('src/components/crm/CampaignDistributeModal.tsx'), 'utf8');
  const fetchCalls = [...src.matchAll(/fetch\(([^)]*)\)/g)].map(m => m[1]);
  // Đúng 2 fetch hiện có từ trước (GET /api/campaigns lúc mount, POST tạo
  // Campaign, POST distribute) — không có fetch thứ 4 nào mới cho Department.
  assert.ok(fetchCalls.length <= 3, `chỉ được tối đa 3 fetch hiện có (list campaigns, create campaign, distribute) — thấy ${fetchCalls.length}: ${fetchCalls.join(' | ')}`);
  assert.doesNotMatch(src, /fetch\([^)]*department/i, 'không được thêm fetch nào liên quan department');
  assert.doesNotMatch(src, /useEffect\([\s\S]{0,200}phong_KD/, 'listActiveSaleDepartments phải chạy qua useMemo (đồng bộ, từ props có sẵn) — không phải useEffect/fetch bất đồng bộ');
});
