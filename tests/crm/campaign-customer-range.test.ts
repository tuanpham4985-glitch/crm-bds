import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { validateListRangeAgainstTotal, resolveListRange } from '../../src/lib/list-range';
import { matchesCustomerBulkFilter } from '../../src/lib/khach-hang-bulk-filter';
import { planBulkDistribution } from '../../src/lib/crm-funnel/campaign';

// REMEDIATION — CUSTOMER RANGE SELECTION FOR CAMPAIGN. Trên /khach-hang,
// "Chọn khách: Từ [x] đến [y]" chọn KhachHang (Customer) theo STT để đưa vào
// Campaign — KHÁC HẲN authority của membership_range tại CSKH → Theo Campaign
// (chọn CampaignMembership ĐÃ CÓ trong 1 Campaign để chia Sale). 2 feature
// dùng chung 1 utility toán học thuần (list-range.ts) nhưng tự query, tự
// filter, tự gate riêng — không trộn authority/DB nguồn.

const PAGE_PATH = 'src/app/khach-hang/page.tsx';
const MODAL_PATH = 'src/components/crm/CampaignDistributeModal.tsx';
const DISTRIBUTE_ROUTE_PATH = 'src/app/api/campaigns/[id]/distribute/route.ts';
const CAMPAIGN_LIB_PATH = 'src/lib/crm-funnel/campaign.ts';
const CUSTOMER_REPO_PATH = 'src/lib/repository/postgresql/customer.repo.ts';

function customer(id: string, overrides: Partial<{ ten_KH: string; so_dien_thoai: string; email: string; ngay_tao: string }> = {}) {
  return {
    id_khach_hang: id,
    ten_KH: overrides.ten_KH ?? `Khách ${id}`,
    so_dien_thoai: overrides.so_dien_thoai ?? '',
    email: overrides.email ?? '',
    ngay_tao: overrides.ngay_tao ?? '2026-01-01T00:00:00.000Z',
  };
}

// --- A. Range semantics: 1-indexed, inclusive, "1-200 = đúng 200", "301-500 = đúng 200" ---

test('resolveListRange: 1–200 trên danh sách 3.400 Customer -> chọn ĐÚNG 200, đúng phần tử đầu/cuối (không off-by-one)', () => {
  const list = Array.from({ length: 3400 }, (_, i) => customer(`KH_${i}`));
  const result = resolveListRange(list, { from: 1, to: 200 });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.ids.length, 200);
    assert.equal(result.ids[0].id_khach_hang, 'KH_0');
    assert.equal(result.ids[199].id_khach_hang, 'KH_199');
  }
});

test('resolveListRange: 301–500 (đúng ví dụ trong task, "qua nhiều pagination page 20 dòng/trang") -> chọn ĐÚNG 200 Customer, đúng vị trí, không lẫn Customer ngoài range', () => {
  const list = Array.from({ length: 3400 }, (_, i) => customer(`KH_${i}`));
  const result = resolveListRange(list, { from: 301, to: 500 });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.ids.length, 200);
    // STT 301 = index 300 (page 16 nếu limit=20, dòng 1); STT 500 = index 499.
    assert.equal(result.ids[0].id_khach_hang, 'KH_300');
    assert.equal(result.ids[199].id_khach_hang, 'KH_499');
    // Không lẫn KH_300 index trước range (STT 300) hay KH_500 sau range (STT 501).
    assert.equal(result.ids.some(c => c.id_khach_hang === 'KH_299'), false);
    assert.equal(result.ids.some(c => c.id_khach_hang === 'KH_500'), false);
  }
});

test('range invalid: from < 1, to < from, to vượt total, from/to không nguyên', () => {
  const list = Array.from({ length: 50 }, (_, i) => customer(`KH_${i}`));
  assert.equal(resolveListRange(list, { from: 0, to: 10 }).ok, false);
  assert.equal(resolveListRange(list, { from: -5, to: 10 }).ok, false);
  assert.equal(resolveListRange(list, { from: 20, to: 10 }).ok, false);
  assert.equal(resolveListRange(list, { from: 1, to: 51 }).ok, false);
  assert.equal(resolveListRange(list, { from: 1.5, to: 10 }).ok, false);
});

test('validateListRangeAgainstTotal (dùng cho preview client-side KHÔNG cần mảng thật, chỉ cần total) khớp đúng kết quả với resolveListRange (dùng mảng thật) — 1 nguồn logic duy nhất', () => {
  const list = Array.from({ length: 87 }, (_, i) => customer(`KH_${i}`));
  const cases: [number, number][] = [[1, 200], [0, 5], [10, 5], [301, 500], [1, 87], [1, 1], [87, 87]];
  for (const [from, to] of cases) {
    const withArray = resolveListRange(list, { from, to });
    const withTotalOnly = validateListRangeAgainstTotal(list.length, { from, to });
    assert.equal(withArray.ok, withTotalOnly.ok, `mismatch từ (${from},${to})`);
    if (withArray.ok && withTotalOnly.ok) assert.equal(withArray.ids.length, withTotalOnly.count);
  }
});

// --- B. Search/filter + range: range áp dụng trên tập ĐÃ LỌC ---

test('range áp dụng TRÊN TẬP ĐÃ LỌC (search) — vị trí 1-200 tính trong tập đã lọc, không phải toàn dataset', () => {
  const all = [
    customer('1', { ten_KH: 'Vinhomes Cần Giờ - A' }), customer('2', { ten_KH: 'Khác - 1' }),
    customer('3', { ten_KH: 'Vinhomes Cần Giờ - B' }), customer('4', { ten_KH: 'Khác - 2' }),
    customer('5', { ten_KH: 'Vinhomes Cần Giờ - C' }),
  ];
  const filtered = all.filter(c => matchesCustomerBulkFilter(c, { search: 'vinhomes cần giờ' }));
  assert.equal(filtered.length, 3);
  const result = resolveListRange(filtered, { from: 1, to: 2 });
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.ids.map(c => c.id_khach_hang), ['1', '3']);
  // to=3 hợp lệ (đúng total sau filter), to=4 phải invalid dù dataset gốc có 5.
  assert.equal(resolveListRange(filtered, { from: 1, to: 3 }).ok, true);
  assert.equal(resolveListRange(filtered, { from: 1, to: 4 }).ok, false);
});

// --- C. Dataset compatibility (task: "Data Vinhomes Cần Giờ" -> range chỉ resolve trong dataset đó) ---
// Chưa có Dataset capability thật trong repo — task yêu cầu KHÔNG tự triển
// khai kiến trúc đó, chỉ đảm bảo filter model NHẬN ĐƯỢC scope bổ sung sau
// này mà không phải viết lại. matchesCustomerBulkFilter/CustomerRangeSelection
// đã composable (thêm field filter mới không phá vỡ resolveListRange, vốn
// hoàn toàn tách biệt khỏi domain filter) — test này khoá tính composable đó.
test('CustomerBulkFilter/resolveListRange composable — filter domain (search/date) và range (from/to vị trí) tách biệt hoàn toàn, thêm 1 filter field mới (VD dataset scope sau này) không cần sửa resolveListRange', () => {
  const list = Array.from({ length: 10 }, (_, i) => customer(`KH_${i}`));
  // Mô phỏng "dataset scope" bằng field lạ (chưa tồn tại thật) — matchesCustomerBulkFilter
  // hiện tại bỏ qua field không biết (không throw), resolveListRange chỉ cần array đã lọc.
  const fakeDatasetFiltered = list.filter((_, i) => i < 5); // giả lập "chỉ Customer thuộc Data X"
  const result = resolveListRange(fakeDatasetFiltered, { from: 1, to: 5 });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.ids.length, 5);
});

// --- D. Wiring: campaign.ts resolveCustomerIdsByRange ---

test('campaign.ts: resolveCustomerIdsByRange orderBy ngay_tao desc — KHÁC created_at asc của resolveCampaignMembershipCustomerIdsByRange (2 order khác nhau cho 2 domain khác nhau, không nhầm lẫn)', () => {
  const src = readFileSync(resolve(CAMPAIGN_LIB_PATH), 'utf8');
  const fnStart = src.indexOf('export async function resolveCustomerIdsByRange');
  assert.ok(fnStart >= 0);
  const fnBody = src.slice(fnStart, fnStart + 800);
  assert.match(fnBody, /orderBy:\s*\{\s*ngay_tao:\s*'desc'\s*\}/);
  assert.match(fnBody, /matchesCustomerBulkFilter\(/, 'phải reuse matchesCustomerBulkFilter (KhachHang), không viết lại filter');
  assert.match(fnBody, /resolveListRange\(/, 'phải reuse resolveListRange (utility thuần), không tự cắt mảng bằng slice thủ công');
  assert.doesNotMatch(fnBody, /campaignMembership|CampaignMembership/, 'resolveCustomerIdsByRange KHÔNG được đụng CampaignMembership — chỉ query KhachHang, tách biệt authority với membership_range');
});

test('drift guard: orderBy ngay_tao desc trong resolveCustomerIdsByRange PHẢI khớp ĐÚNG order của PostgresCustomerRepository.findAll() (customer.repo.ts) — nguồn thứ tự GET /api/khach-hang đang hiển thị. Nếu 1 bên đổi mà bên kia không đổi theo, test này fail để nhắc soát lại cả 2', () => {
  const repoSrc = readFileSync(resolve(CUSTOMER_REPO_PATH), 'utf8');
  assert.match(repoSrc, /orderBy:\s*\{\s*ngay_tao:\s*'desc'\s*\}/, 'PostgresCustomerRepository.findAll() phải vẫn orderBy ngay_tao desc');
});

test('campaign.ts: resolveCustomerIdsByRange chỉ select field cần cho filter (id_khach_hang/ten_KH/so_dien_thoai/email/ngay_tao) — không load nguyên KhachHang, nhẹ với 3.000+ dòng', () => {
  const src = readFileSync(resolve(CAMPAIGN_LIB_PATH), 'utf8');
  const fnStart = src.indexOf('export async function resolveCustomerIdsByRange');
  const fnBody = src.slice(fnStart, fnStart + 800);
  assert.match(fnBody, /select:\s*\{\s*id_khach_hang: true, ten_KH: true, so_dien_thoai: true, email: true, ngay_tao: true\s*\}/);
});

// --- E. Wiring: distribute route — customer_range branch, Admin-only ---

test('distribute route: nhánh customer_range yêu cầu isCrmAdmin RIÊNG (giống customer_filter) — Leader (owner Campaign, canManageCampaign=true nhưng không phải Admin) KHÔNG được đưa Customer mới vào Campaign theo range', () => {
  const src = readFileSync(resolve(DISTRIBUTE_ROUTE_PATH), 'utf8');
  const branchStart = src.indexOf('body?.customer_range');
  assert.ok(branchStart >= 0);
  const branch = src.slice(branchStart, branchStart + 1400);
  assert.match(branch, /if\s*\(!isCrmAdmin\(user\)\)/);
  assert.match(branch, /status:\s*403/);
  assert.match(branch, /resolveCustomerIdsByRange\(/);
});

test('distribute route: customer_range KHÔNG dùng chung field "from"/"to" với customer_filter (position vs date) — dùng dateFrom/dateTo riêng để không đụng tên, tránh 1 request gửi cả 2 loại "from" gây nhầm lẫn', () => {
  const src = readFileSync(resolve(DISTRIBUTE_ROUTE_PATH), 'utf8');
  const branchStart = src.indexOf('body?.customer_range');
  const branchEnd = src.indexOf('} else if (body?.membership_range', branchStart);
  const branch = src.slice(branchStart, branchEnd);
  assert.match(branch, /dateFrom:/);
  assert.match(branch, /dateTo:/);
  assert.match(branch, /from:\s*Number\(rangeInput\.from\)/, 'from/to trong customer_range phải là Number (vị trí), không phải string (ngày)');
});

test('distribute route: dù customer_ids / customer_filter / customer_range / membership_range, TẤT CẢ đều đổ về ĐÚNG 1 lệnh gọi bulkAddAndDistribute duy nhất — không có write path riêng cho Customer range', () => {
  const src = readFileSync(resolve(DISTRIBUTE_ROUTE_PATH), 'utf8');
  const calls = src.match(/bulkAddAndDistribute\(/g) || [];
  assert.equal(calls.length, 1, 'chỉ được có đúng 1 lệnh gọi bulkAddAndDistribute — mọi selection mode phải hội tụ về cùng 1 chỗ ghi DB');
});

test('distribute route: auth chung canManageCampaign vẫn check TRƯỚC khi đọc body/customer_range — không có cách nào bỏ qua gate bằng cách gửi customer_range', () => {
  const src = readFileSync(resolve(DISTRIBUTE_ROUTE_PATH), 'utf8');
  const authIdx = src.indexOf('canManageCampaign(user, campaign)');
  const rangeIdx = src.indexOf('body?.customer_range');
  assert.ok(authIdx >= 0 && rangeIdx >= 0 && authIdx < rangeIdx);
});

test('distribute route: 4 nhánh selection mode (customer_ids/customer_filter/customer_range/membership_range) là if/else-if LOẠI TRỪ LẪN NHAU — 1 request không thể vừa customer_range vừa membership_range cùng lúc gây mơ hồ authority', () => {
  const src = readFileSync(resolve(DISTRIBUTE_ROUTE_PATH), 'utf8');
  const ifIdx = src.indexOf('if (body?.customer_filter');
  const elseIfRangeIdx = src.indexOf('} else if (body?.customer_range');
  const elseIfMembershipIdx = src.indexOf('} else if (body?.membership_range');
  const elseIdx = src.indexOf('} else {', elseIfMembershipIdx);
  assert.ok(ifIdx >= 0 && elseIfRangeIdx > ifIdx && elseIfMembershipIdx > elseIfRangeIdx && elseIdx > elseIfMembershipIdx);
});

// --- F. Không tạo write path Campaign mới / no telesale/ownership/Handoff/Pipeline side-effect ---

test('campaign.ts: resolveCustomerIdsByRange không có bất kỳ lệnh ghi DB nào (chỉ findMany, read-only) — chỉ resolve id, KHÔNG tự tạo CampaignMembership/Customer/Handoff/Pipeline nào', () => {
  const src = readFileSync(resolve(CAMPAIGN_LIB_PATH), 'utf8');
  const fnStart = src.indexOf('export async function resolveCustomerIdsByRange');
  const fnEnd = src.indexOf('\n}', fnStart);
  const fnBody = src.slice(fnStart, fnEnd);
  assert.doesNotMatch(fnBody, /\.create\(|\.update\(|\.createMany\(|\.updateMany\(|\.delete/, 'resolveCustomerIdsByRange phải hoàn toàn read-only (chỉ findMany)');
});

test('CampaignDistributeModal.tsx + distribute route (toàn bộ code path customer_range mới): không có lệnh gọi nào tới crmHandoff/pipeline/khachHang.update — mode "none" (mặc định, "chỉ thêm vào Campaign") không set telesale_id/sale_phu_trach/sale_nhan_khach', () => {
  const modalSrc = readFileSync(resolve(MODAL_PATH), 'utf8');
  assert.doesNotMatch(modalSrc, /sale_phu_trach|sale_nhan_khach|crmHandoff|CrmHandoff|pipeline\.(create|update)/i);
  const routeSrc = readFileSync(resolve(DISTRIBUTE_ROUTE_PATH), 'utf8');
  assert.doesNotMatch(routeSrc, /sale_phu_trach|sale_nhan_khach|crmHandoff|CrmHandoff|khachHang\.(update|create)/i);
});

test('bulkAddAndDistribute mode "none" (mặc định của customer_range khi Admin chỉ tạo/thêm vào Campaign, không phân Sale ngay): planDistribution trả toàn bộ UNASSIGNED, telesale_id=null — xác nhận lại hành vi có sẵn không đổi cho code path mới', () => {
  const ids = ['KH_1', 'KH_2', 'KH_3'];
  const plan = planBulkDistribution({
    orderedIds: ids, existingCustomerIds: new Set(ids), existingMemberships: [],
    telesales: [], mode: 'none',
  });
  assert.equal(plan.toCreate.length, 3);
  for (const item of plan.toCreate) {
    assert.equal(item.telesale_id, null);
    assert.equal(item.assignment_status, 'UNASSIGNED');
  }
});

// --- G. Duplicate membership safe / Customer vẫn thuộc nhiều Campaign (không đổi @@unique) ---

test('bulkAddAndDistribute (dùng chung cho customer_range) vẫn createMany skipDuplicates: true — dedupe theo @@unique([customer_id, campaign_id]) không đổi bởi feature mới', () => {
  const src = readFileSync(resolve(CAMPAIGN_LIB_PATH), 'utf8');
  const fnStart = src.indexOf('export async function bulkAddAndDistribute');
  const fnBody = src.slice(fnStart, fnStart + 2000);
  assert.match(fnBody, /skipDuplicates:\s*true/);
});

test('prisma schema: @@unique([customer_id, campaign_id]) trên CampaignMembership vẫn còn nguyên — Customer range không đổi/không cần đổi invariant này (1 Customer vẫn thuộc được nhiều Campaign)', () => {
  const schemaSrc = readFileSync(resolve('prisma/schema.prisma'), 'utf8');
  assert.match(schemaSrc, /@@unique\(\[customer_id, campaign_id\]\)/);
  assert.doesNotMatch(schemaSrc, /@@unique\(\[customer_id\]\)/, 'không được có unique riêng trên customer_id — Customer phải thuộc được nhiều Campaign');
});

// --- H. UI wiring: /khach-hang range block, Admin-only, "Tạo Campaign" action ---

test('khach-hang/page.tsx: block "Chọn khách: Từ x đến y" chỉ hiện cho Admin (isAdmin) — Customer range/bulk-add Campaign là Admin-only theo spec, giống customer_filter hiện có', () => {
  const src = readFileSync(resolve(PAGE_PATH), 'utf8');
  assert.match(src, /\{isAdmin && total > 0 && \(/);
});

test('khach-hang/page.tsx: preview range dùng validateListRangeAgainstTotal(total, ...) — KHÔNG tải mảng Customer nào về client để tính, chỉ cần "total" đã có sẵn từ fetchData (không gửi hàng trăm/thousands Customer object)', () => {
  const src = readFileSync(resolve(PAGE_PATH), 'utf8');
  assert.match(src, /import \{ validateListRangeAgainstTotal \} from '@\/lib\/list-range';/);
  assert.match(src, /validateListRangeAgainstTotal\(total, \{ from: rangeFromNum, to: rangeToNum \}\)/);
});

test('khach-hang/page.tsx: hiển thị "Đã chọn N khách hàng" và ghi rõ khi đang lọc — không để Admin tưởng range áp dụng trên toàn dataset khi đang search/filter ngày', () => {
  const src = readFileSync(resolve(PAGE_PATH), 'utf8');
  assert.match(src, /Đã chọn \{rangeValidation\.count\} khách hàng/);
  assert.match(src, /trong \$\{rangeValidation\.total\} khách đang lọc theo bộ lọc\/tìm kiếm hiện tại/);
});

test('khach-hang/page.tsx: nút hành động dùng ĐÚNG label "Tạo Campaign" (action Campaign hiện có, không tạo UI/flow riêng) và bị disable khi range invalid', () => {
  const src = readFileSync(resolve(PAGE_PATH), 'utf8');
  assert.match(src, /Tạo Campaign \(\{rangeValidation\?\.ok \? rangeValidation\.count : 0\}\)/);
  assert.match(src, /disabled=\{!rangeValidation\?\.ok\}/);
});

test('khach-hang/page.tsx: modal range dùng ĐÚNG CampaignDistributeModal có sẵn (không import/tạo modal Campaign nào khác) với customerRange={from/to/search/dateFrom/dateTo/count}', () => {
  const src = readFileSync(resolve(PAGE_PATH), 'utf8');
  const modalCallStart = src.indexOf('showRangeCampaignModal && rangeValidation?.ok && (');
  assert.ok(modalCallStart >= 0);
  const modalCall = src.slice(modalCallStart, modalCallStart + 500);
  assert.match(modalCall, /<CampaignDistributeModal/);
  assert.match(modalCall, /customerRange=\{\{ from: rangeFromNum, to: rangeToNum, search, dateFrom: fromDate, dateTo: toDate, count: rangeValidation\.count \}\}/);
});

test('khach-hang/page.tsx: range state (rangeFrom/rangeTo) reset khi search/fromDate/toDate đổi — KHÔNG reset khi chỉ đổi "page" (range không phải theo trang, không phụ thuộc pagination)', () => {
  const src = readFileSync(resolve(PAGE_PATH), 'utf8');
  assert.match(src, /useEffect\(\(\) => \{ setRangeFrom\(''\); setRangeTo\(''\); \}, \[search, fromDate, toDate\]\);/);
});

test('khach-hang/page.tsx: range selection ĐỘC LẬP hoàn toàn với checkbox selectedIds/selectAllMatching — modal range không nhận customerIds/customerFilter, tránh mơ hồ 2 cơ chế chọn cùng lúc', () => {
  const src = readFileSync(resolve(PAGE_PATH), 'utf8');
  const modalCallStart = src.indexOf('showRangeCampaignModal && rangeValidation?.ok && (');
  const modalCallEnd = src.indexOf('/>', modalCallStart);
  const modalCall = src.slice(modalCallStart, modalCallEnd);
  assert.doesNotMatch(modalCall, /customerIds=/);
  assert.doesNotMatch(modalCall, /customerFilter=/);
});

// --- I. Existing CSKH range (membership_range) không regression — audit lại các bất biến cũ ---

test('regression: membership_range (CSKH → Theo Campaign, resolveCampaignMembershipCustomerIdsByRange) vẫn dùng created_at asc — KHÔNG bị đổi order/authority bởi Customer range mới', () => {
  const src = readFileSync(resolve(CAMPAIGN_LIB_PATH), 'utf8');
  const fnStart = src.indexOf('export async function resolveCampaignMembershipCustomerIdsByRange');
  assert.ok(fnStart >= 0);
  const fnBody = src.slice(fnStart, fnStart + 700);
  assert.match(fnBody, /getCampaignMembersWithCustomers\(campaignId\)/);
  assert.doesNotMatch(fnBody, /orderBy:\s*\{\s*ngay_tao/, 'membership_range KHÔNG được lẫn order ngay_tao của Customer range — vẫn phải qua getCampaignMembersWithCustomers (created_at asc)');
});

test('regression: distribute route nhánh membership_range vẫn dùng canManageCampaign chung (không phải isCrmAdmin riêng như customer_range/customer_filter) — 2 authority không bị trộn lẫn bởi remediation này', () => {
  const src = readFileSync(resolve(DISTRIBUTE_ROUTE_PATH), 'utf8');
  const branchStart = src.indexOf('body?.membership_range');
  const branchEnd = src.indexOf('} else {', branchStart);
  const branch = src.slice(branchStart, branchEnd);
  assert.doesNotMatch(branch, /isCrmAdmin\(user\)/, 'membership_range không được thêm gate isCrmAdmin riêng — vẫn dùng canManageCampaign chung (Admin hoặc Leader/owner Campaign)');
});

test('regression: CampaignCskhWorkQueue.tsx (CSKH range "Chọn khách: Từ x đến y" + "Chia đều cho Sale") vẫn còn nguyên — không bị Customer range mới xoá/thay thế', () => {
  const src = readFileSync(resolve('src/components/crm/CampaignCskhWorkQueue.tsx'), 'utf8');
  assert.match(src, /async function distributeRange\(\)/);
  assert.match(src, /membership_range: \{ from: rangeFromNum, to: rangeToNum, search, bucket: bucketFilter \|\| undefined, assignment: assignmentFilter \}/);
});
