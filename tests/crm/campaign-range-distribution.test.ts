import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { matchesMembershipQueueFilter, resolveMembershipRange } from '../../src/lib/campaign-cskh-range';
import { planBulkDistribution, planDistribution } from '../../src/lib/crm-funnel/campaign';

// CAMPAIGN RANGE SELECTION + CHIA ĐỀU SALE — "Từ x đến y" trong CSKH → Theo
// Campaign, resolve server-side theo ĐÚNG thứ tự created_at asc (đã dùng sẵn
// bởi getCampaignMembersWithCustomers/GET .../members, KHÔNG đổi) + filter
// search/bucket hiện có trên UI, rồi feed vào ĐÚNG bulkAddAndDistribute() có
// sẵn (mode round_robin) — không viết lại thuật toán chia, không tạo write
// path mới.

const RANGE_LIB_PATH = 'src/lib/campaign-cskh-range.ts';
const CAMPAIGN_LIB_PATH = 'src/lib/crm-funnel/campaign.ts';
const DISTRIBUTE_ROUTE_PATH = 'src/app/api/campaigns/[id]/distribute/route.ts';
const WORK_QUEUE_PATH = 'src/components/crm/CampaignCskhWorkQueue.tsx';

function member(id: string, overrides: Partial<{ ten_KH: string; so_dien_thoai: string; telesale_name: string | null; trang_thai_cham_soc: string; ngay_lien_he_tiep: string | null; assignment_status: string }> = {}) {
  return {
    id, customer_id: `KH_${id}`,
    customer: { ten_KH: overrides.ten_KH ?? `Khách ${id}`, so_dien_thoai: overrides.so_dien_thoai ?? '' },
    telesale_name: overrides.telesale_name ?? null,
    trang_thai_cham_soc: overrides.trang_thai_cham_soc ?? 'Chưa gọi',
    ngay_lien_he_tiep: overrides.ngay_lien_he_tiep ?? null,
    assignment_status: overrides.assignment_status ?? 'UNASSIGNED',
  };
}

// --- A. resolveMembershipRange (pure) — off-by-one, validate, "1-200 = đúng 200" ---

test('resolveMembershipRange: 1–200 trên danh sách 500 phần tử -> chọn ĐÚNG 200, đúng phần tử đầu tiên/cuối cùng (không off-by-one)', () => {
  const list = Array.from({ length: 500 }, (_, i) => `id_${i}`);
  const result = resolveMembershipRange(list, { from: 1, to: 200 });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.ids.length, 200);
    assert.equal(result.ids[0], 'id_0');
    assert.equal(result.ids[199], 'id_199');
  }
});

test('resolveMembershipRange: range giữa danh sách (VD 201–400, mô phỏng "qua nhiều page" 20 dòng/trang cũ) -> đúng 200 phần tử, đúng vị trí, không lẫn phần tử ngoài range', () => {
  const list = Array.from({ length: 500 }, (_, i) => `id_${i}`);
  const result = resolveMembershipRange(list, { from: 201, to: 400 });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.ids.length, 200);
    assert.equal(result.ids[0], 'id_200');
    assert.equal(result.ids[199], 'id_399');
  }
});

test('resolveMembershipRange: from=to=1 -> đúng 1 phần tử; from=to=total -> đúng phần tử cuối', () => {
  const list = Array.from({ length: 50 }, (_, i) => `id_${i}`);
  const r1 = resolveMembershipRange(list, { from: 1, to: 1 });
  assert.equal(r1.ok, true);
  if (r1.ok) assert.deepEqual(r1.ids, ['id_0']);
  const r2 = resolveMembershipRange(list, { from: 50, to: 50 });
  assert.equal(r2.ok, true);
  if (r2.ok) assert.deepEqual(r2.ids, ['id_49']);
});

test('resolveMembershipRange: invalid — from < 1, to < from, to > total, from/to không phải số nguyên', () => {
  const list = Array.from({ length: 10 }, (_, i) => `id_${i}`);
  assert.equal(resolveMembershipRange(list, { from: 0, to: 5 }).ok, false);
  assert.equal(resolveMembershipRange(list, { from: -3, to: 5 }).ok, false);
  assert.equal(resolveMembershipRange(list, { from: 5, to: 3 }).ok, false);
  assert.equal(resolveMembershipRange(list, { from: 1, to: 11 }).ok, false);
  assert.equal(resolveMembershipRange(list, { from: 1.5, to: 5 }).ok, false);
  assert.equal(resolveMembershipRange(list, { from: 1, to: NaN }).ok, false);
});

test('resolveMembershipRange: error message trả kèm tổng số thật (total) để UI hiển thị "vượt quá tổng số khách phù hợp"', () => {
  const list = Array.from({ length: 37 }, (_, i) => `id_${i}`);
  const result = resolveMembershipRange(list, { from: 1, to: 200 });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.total, 37);
    assert.match(result.error, /37/);
  }
});

// --- B. matchesMembershipQueueFilter — mirror ĐÚNG "filtered" useMemo cũ của CampaignCskhWorkQueue.tsx ---

test('matchesMembershipQueueFilter: search khớp tên/SĐT/Sale CSKH đang phân, case-insensitive', () => {
  const m = member('1', { ten_KH: 'Nguyễn Văn A', so_dien_thoai: '0901234567', telesale_name: 'Hương' });
  assert.equal(matchesMembershipQueueFilter(m, { search: 'nguyễn' }), true);
  assert.equal(matchesMembershipQueueFilter(m, { search: '901234' }), true);
  assert.equal(matchesMembershipQueueFilter(m, { search: 'HƯƠNG' }), true);
  assert.equal(matchesMembershipQueueFilter(m, { search: 'không khớp' }), false);
});

test('matchesMembershipQueueFilter: bucket lọc theo bucketOf() (trạng thái chăm sóc + lịch hẹn) — không filter nào -> luôn true', () => {
  const overdue = member('1', { trang_thai_cham_soc: 'Gọi lại', ngay_lien_he_tiep: '2020-01-01T00:00:00.000Z' });
  assert.equal(matchesMembershipQueueFilter(overdue, {}), true);
  assert.equal(matchesMembershipQueueFilter(overdue, { bucket: 'Quá lịch' }), true);
  assert.equal(matchesMembershipQueueFilter(overdue, { bucket: 'Quan tâm' }), false);
});

test('range áp dụng TRÊN TẬP ĐÃ LỌC — filter trước, resolveMembershipRange sau -> vị trí 1-200 tính trong tập đã lọc, không phải toàn bộ Campaign', () => {
  const all = [
    member('1', { ten_KH: 'Loại A - 1' }), member('2', { ten_KH: 'Loại B - 1' }),
    member('3', { ten_KH: 'Loại A - 2' }), member('4', { ten_KH: 'Loại B - 2' }),
    member('5', { ten_KH: 'Loại A - 3' }),
  ];
  const filtered = all.filter(m => matchesMembershipQueueFilter(m, { search: 'loại a' }));
  assert.equal(filtered.length, 3);
  const result = resolveMembershipRange(filtered, { from: 1, to: 2 });
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.ids.map(m => m.customer_id), ['KH_1', 'KH_3']);
  // to=3 hợp lệ (đúng bằng total SAU filter), to=4 phải invalid dù campaign gốc có 5 member.
  assert.equal(resolveMembershipRange(filtered, { from: 1, to: 3 }).ok, true);
  assert.equal(resolveMembershipRange(filtered, { from: 1, to: 4 }).ok, false);
});

// --- C. Chia đều: divisible / non-divisible, deterministic, không đụng ASSIGNED ngoài scope ---

test('chia đều 200 khách / 4 Sale -> mỗi Sale đúng 50 (chia hết)', () => {
  const ids = Array.from({ length: 200 }, (_, i) => `KH_${i}`);
  const sales = [
    { id_nhan_vien: 'S1', ho_ten: 'Sale A' }, { id_nhan_vien: 'S2', ho_ten: 'Sale B' },
    { id_nhan_vien: 'S3', ho_ten: 'Sale C' }, { id_nhan_vien: 'S4', ho_ten: 'Sale D' },
  ];
  const plan = planDistribution({ customerIds: ids, telesales: sales, mode: 'round_robin' });
  const counts = new Map<string, number>();
  for (const item of plan) counts.set(item.telesale_name!, (counts.get(item.telesale_name!) || 0) + 1);
  for (const s of sales) assert.equal(counts.get(s.ho_ten), 50);
});

test('chia đều 201 khách / 4 Sale (không chia hết) -> phần dư (1 khách) phân theo thứ tự Sale deterministic (Sale đầu tiên nhận thêm), không rơi UNASSIGNED ở mode round_robin', () => {
  const ids = Array.from({ length: 201 }, (_, i) => `KH_${i}`);
  const sales = [
    { id_nhan_vien: 'S1', ho_ten: 'Sale A' }, { id_nhan_vien: 'S2', ho_ten: 'Sale B' },
    { id_nhan_vien: 'S3', ho_ten: 'Sale C' }, { id_nhan_vien: 'S4', ho_ten: 'Sale D' },
  ];
  const plan = planDistribution({ customerIds: ids, telesales: sales, mode: 'round_robin' });
  const counts = new Map<string, number>();
  for (const item of plan) counts.set(item.telesale_name!, (counts.get(item.telesale_name!) || 0) + 1);
  assert.equal(counts.get('Sale A'), 51);
  assert.equal(counts.get('Sale B'), 50);
  assert.equal(counts.get('Sale C'), 50);
  assert.equal(counts.get('Sale D'), 50);
  assert.equal(plan.every(item => item.assignment_status === 'ASSIGNED'), true);
});

test('round_robin deterministic: gọi lại nhiều lần cùng input (range resolve + planDistribution) luôn ra kết quả giống hệt nhau', () => {
  const list = Array.from({ length: 87 }, (_, i) => `id_${i}`);
  const sales = [{ id_nhan_vien: 'S1', ho_ten: 'A' }, { id_nhan_vien: 'S2', ho_ten: 'B' }, { id_nhan_vien: 'S3', ho_ten: 'C' }];
  const r1 = resolveMembershipRange(list, { from: 5, to: 60 });
  const r2 = resolveMembershipRange(list, { from: 5, to: 60 });
  assert.deepEqual(r1, r2);
  if (r1.ok) {
    const p1 = planDistribution({ customerIds: r1.ids, telesales: sales, mode: 'round_robin' });
    const p2 = planDistribution({ customerIds: r1.ids, telesales: sales, mode: 'round_robin' });
    assert.deepEqual(p1, p2);
  }
});

test('chia đều KHÔNG đụng membership đã ASSIGNED trong range (existing assignment không bị ghi đè) — dùng planBulkDistribution như bulkAddAndDistribute thật sự dùng', () => {
  // Range 1-10, trong đó 3 membership đã ASSIGNED cho Sale khác từ trước.
  const rangeIds = Array.from({ length: 10 }, (_, i) => `KH_${i}`);
  const existingMemberships = [
    { customer_id: 'KH_1', assignment_status: 'ASSIGNED' },
    { customer_id: 'KH_4', assignment_status: 'ASSIGNED' },
    { customer_id: 'KH_7', assignment_status: 'ASSIGNED' },
  ];
  const sales = [{ id_nhan_vien: 'S1', ho_ten: 'A' }, { id_nhan_vien: 'S2', ho_ten: 'B' }];
  const plan = planBulkDistribution({
    orderedIds: rangeIds,
    existingCustomerIds: new Set(rangeIds),
    existingMemberships,
    telesales: sales,
    mode: 'round_robin',
  });
  assert.equal(plan.alreadyAssigned, 3);
  // 3 khách đã ASSIGNED không được xuất hiện trong toCreate lẫn toAssignExisting.
  const touchedIds = new Set([...plan.toCreate, ...plan.toAssignExisting].map(item => item.customer_id));
  assert.equal(touchedIds.has('KH_1'), false);
  assert.equal(touchedIds.has('KH_4'), false);
  assert.equal(touchedIds.has('KH_7'), false);
  // 7 khách còn lại (chưa ASSIGNED) mới được chia.
  assert.equal(touchedIds.size, 7);
});

// --- D. Scale (3k+) ---

test('resolveMembershipRange + planDistribution xử lý 3.400 phần tử trong range không lỗi, không chậm bất thường', () => {
  const list = Array.from({ length: 3400 }, (_, i) => `id_${i}`);
  const start = Date.now();
  const result = resolveMembershipRange(list, { from: 1, to: 3400 });
  const sales = [{ id_nhan_vien: 'S1', ho_ten: 'A' }, { id_nhan_vien: 'S2', ho_ten: 'B' }, { id_nhan_vien: 'S3', ho_ten: 'C' }];
  assert.equal(result.ok, true);
  if (result.ok) {
    const plan = planDistribution({ customerIds: result.ids, telesales: sales, mode: 'round_robin' });
    assert.equal(plan.length, 3400);
  }
  assert.ok(Date.now() - start < 2000);
});

// --- E. Wiring: campaign.ts (resolveCampaignMembershipCustomerIdsByRange) ---

test('resolveCampaignMembershipCustomerIdsByRange: dùng getCampaignMembersWithCustomers (đã sort created_at asc) làm nguồn thứ tự — KHÔNG tự sort lại theo tiêu chí khác', () => {
  const src = readFileSync(resolve(CAMPAIGN_LIB_PATH), 'utf8');
  const fnStart = src.indexOf('export async function resolveCampaignMembershipCustomerIdsByRange');
  assert.ok(fnStart >= 0);
  const fnBody = src.slice(fnStart, fnStart + 700);
  assert.match(fnBody, /getCampaignMembersWithCustomers\(campaignId\)/);
  assert.doesNotMatch(fnBody, /\.sort\(/, 'không được tự sort lại — phải tin nguyên thứ tự created_at asc từ getCampaignMembersWithCustomers');
  assert.match(fnBody, /matchesMembershipQueueFilter\(/, 'phải reuse matchesMembershipQueueFilter, không viết lại filter');
  assert.match(fnBody, /resolveMembershipRange\(/, 'phải reuse resolveMembershipRange, không tự cắt mảng lại bằng slice thủ công');
});

test('getCampaignMembersWithCustomers (nguồn order cho cả UI lẫn range): vẫn orderBy created_at asc — bất biến order KHÔNG bị đổi bởi feature range này', () => {
  const src = readFileSync(resolve(CAMPAIGN_LIB_PATH), 'utf8');
  const fnStart = src.indexOf('export async function getCampaignMembersWithCustomers');
  const fnBody = src.slice(fnStart, fnStart + 300);
  assert.match(fnBody, /orderBy:\s*\{\s*created_at:\s*'asc'\s*\}/);
});

// --- F. Wiring: distribute route — membership_range branch ---

test('distribute route: nhánh membership_range dùng ĐÚNG canManageCampaign chung (Admin HOẶC Leader/owner Campaign) — KHÔNG thêm gate Admin-only riêng (khác customer_filter, vì đây là chia data ĐÃ TRONG Campaign, không phải thêm Customer mới)', () => {
  const src = readFileSync(resolve(DISTRIBUTE_ROUTE_PATH), 'utf8');
  const rangeBranchStart = src.indexOf('body?.membership_range');
  assert.ok(rangeBranchStart >= 0);
  const rangeBranchEnd = src.indexOf('} else {', rangeBranchStart);
  const rangeBranch = src.slice(rangeBranchStart, rangeBranchEnd);
  assert.doesNotMatch(rangeBranch, /isCrmAdmin\(user\)/, 'nhánh membership_range không được thêm gate isCrmAdmin riêng — dùng canManageCampaign chung ở đầu route (đã cho Leader/owner Campaign)');
  assert.match(rangeBranch, /resolveCampaignMembershipCustomerIdsByRange\(/);
});

test('distribute route: membership_range resolve lỗi (range invalid) trả 400 kèm đúng message từ resolveMembershipRange, KHÔNG rơi xuống bulkAddAndDistribute với mảng rỗng', () => {
  const src = readFileSync(resolve(DISTRIBUTE_ROUTE_PATH), 'utf8');
  const rangeBranchStart = src.indexOf('body?.membership_range');
  const rangeBranchEnd = src.indexOf('} else {', rangeBranchStart);
  const rangeBranch = src.slice(rangeBranchStart, rangeBranchEnd);
  assert.match(rangeBranch, /if\s*\(\s*'error' in resolved\s*\)/);
  assert.match(rangeBranch, /status:\s*400/);
});

test('distribute route: dù customer_ids / customer_filter / membership_range, CẢ 3 đều đổ về ĐÚNG 1 lệnh gọi bulkAddAndDistribute duy nhất — không có write path riêng cho range', () => {
  const src = readFileSync(resolve(DISTRIBUTE_ROUTE_PATH), 'utf8');
  const calls = src.match(/bulkAddAndDistribute\(/g) || [];
  assert.equal(calls.length, 1);
});

test('distribute route: auth chung canManageCampaign vẫn check TRƯỚC khi đọc body/membership_range — không có cách nào bỏ qua gate bằng cách gửi membership_range', () => {
  const src = readFileSync(resolve(DISTRIBUTE_ROUTE_PATH), 'utf8');
  const authIdx = src.indexOf('canManageCampaign(user, campaign)');
  const rangeIdx = src.indexOf('body?.membership_range');
  assert.ok(authIdx >= 0 && rangeIdx >= 0 && authIdx < rangeIdx);
});

test('distribute route: eligibility Sale (eligibleCampaignSales) vẫn áp dụng KHÔNG đổi cho request từ membership_range — Leader vẫn bị thu hẹp theo Project.ds_sale qua đúng code path telesale_names hiện có, không có nhánh riêng bỏ qua eligibility', () => {
  const src = readFileSync(resolve(DISTRIBUTE_ROUTE_PATH), 'utf8');
  // Chỉ có đúng 1 chỗ gọi eligibleCampaignSales trong route — nhánh
  // membership_range PHẢI đi qua cùng chỗ đó (không tạo nhánh check riêng).
  const calls = src.match(/eligibleCampaignSales\(/g) || [];
  assert.equal(calls.length, 1, 'chỉ 1 chỗ eligibleCampaignSales — mọi selection mode (ids/filter/range) đều dùng chung 1 lần check eligibility Sale, không nhân bản logic');
});

// --- G. Wiring: KHÔNG tạo Handoff/Pipeline/ownership từ toàn bộ đường mới ---

test('campaign.ts + distribute route: không có bất kỳ lệnh gọi crmHandoff.create/pipeline.create/khachHang.update nào trong toàn bộ code path membership_range (resolveCampaignMembershipCustomerIdsByRange + route)', () => {
  const campaignSrc = readFileSync(resolve(CAMPAIGN_LIB_PATH), 'utf8');
  const fnStart = campaignSrc.indexOf('export async function resolveCampaignMembershipCustomerIdsByRange');
  const fnBody = campaignSrc.slice(fnStart, fnStart + 700);
  assert.doesNotMatch(fnBody, /crmHandoff|pipeline\.|khachHang\.(update|create)/i);

  const routeSrc = readFileSync(resolve(DISTRIBUTE_ROUTE_PATH), 'utf8');
  assert.doesNotMatch(routeSrc, /crmHandoff|\bpipeline\.(create|update)|khachHang\.(update|create)/i);
});

// --- H. UI wiring: CampaignCskhWorkQueue.tsx ---

// Addendum (Assigned Customer Visibility) mở rộng filter/request với field
// "assignment" — cập nhật các assertion dưới đây theo đúng cấu trúc mới,
// không phải regression.
test('CampaignCskhWorkQueue.tsx: filtered dùng matchesMembershipQueueFilter (module dùng chung với server), kèm assignmentFilter (addendum) — không còn tự viết search/bucket filter riêng (tránh lệch với server)', () => {
  const src = readFileSync(resolve(WORK_QUEUE_PATH), 'utf8');
  assert.match(src, /const filtered = useMemo\(\s*\(\) => members\.filter\(member => matchesMembershipQueueFilter\(member, \{ search, bucket: bucketFilter, assignment: assignmentFilter \}\)\)/);
});

test('CampaignCskhWorkQueue.tsx: distributeRange() gửi membership_range (from/to/search/bucket/assignment) + mode round_robin + telesale_names = TOÀN BỘ eligibleSales (chia đều tự động, không cần Admin/Leader tick từng Sale) tới ĐÚNG POST /api/campaigns/[id]/distribute hiện có', () => {
  const src = readFileSync(resolve(WORK_QUEUE_PATH), 'utf8');
  const fnStart = src.indexOf('async function distributeRange()');
  assert.ok(fnStart >= 0);
  const fnBody = src.slice(fnStart, fnStart + 1400);
  assert.match(fnBody, /`\/api\/campaigns\/\$\{campaignId\}\/distribute`/);
  assert.match(fnBody, /membership_range: \{ from: rangeFromNum, to: rangeToNum, search, bucket: bucketFilter \|\| undefined, assignment: assignmentFilter \}/);
  assert.match(fnBody, /mode: 'round_robin'/);
  assert.match(fnBody, /telesale_names: saleNames/);
  assert.match(fnBody, /rangeEligibility\.sales\.map\(item => item\.ho_ten\)/);
});

test('CampaignCskhWorkQueue.tsx: distributeRange() có confirm() trước khi submit — đúng câu "Chia đều N khách (chưa phân) cho M Sale?", N = số THỰC TẾ sẽ được chia (rangeBreakdown.unassigned, addendum), không phải tổng cả range', () => {
  const src = readFileSync(resolve(WORK_QUEUE_PATH), 'utf8');
  assert.match(src, /window\.confirm\(`Chia đều \$\{toDistribute\} khách \(chưa phân\) cho \$\{saleNames\.length\} Sale\?\$\{skipNote\}`\)/);
});

test('CampaignCskhWorkQueue.tsx: distributeRange() chặn khi rangeEligibility.blocked (Leader không có Project.ds_sale hợp lệ) — không tự fallback company-wide', () => {
  const src = readFileSync(resolve(WORK_QUEUE_PATH), 'utf8');
  const fnStart = src.indexOf('async function distributeRange()');
  const fnBody = src.slice(fnStart, fnStart + 400);
  assert.match(fnBody, /if\s*\(rangeEligibility\.blocked\)/);
});

test('CampaignCskhWorkQueue.tsx: rangeEligibility dùng ĐÚNG eligibleCampaignSales(isAdmin, selectedCampaign, projects, employees) — cùng hàm/tham số với Phân Sale và Bàn giao hiện có, không viết lại eligibility riêng cho range', () => {
  const src = readFileSync(resolve(WORK_QUEUE_PATH), 'utf8');
  assert.match(src, /const rangeEligibility = selectedCampaign \? eligibleCampaignSales\(isAdmin, selectedCampaign, projects, employees\) : null;/);
});

// Cập nhật theo addendum "Assigned Customer Visibility": preview giờ hiện đủ
// breakdown (tổng/đã chia/chưa chia/sẽ chia — xem campaign-assignment-visibility.test.ts)
// thay vì chỉ "Đã chọn N khách" đơn giản như milestone gốc. Vẫn giữ đúng yêu
// cầu gốc: ghi rõ khi đang lọc, không để Admin tưởng nhầm range áp dụng trên
// toàn Campaign.
test('CampaignCskhWorkQueue.tsx: UI ghi rõ khi đang lọc (search/bucket/assignment) — không để Admin tưởng nhầm range áp dụng trên toàn Campaign', () => {
  const src = readFileSync(resolve(WORK_QUEUE_PATH), 'utf8');
  assert.match(src, /trong \$\{rangeResult\.total\} khách đang lọc theo bộ lọc\/tìm kiếm hiện tại/);
  assert.match(src, /search \|\| bucketFilter \|\| assignmentFilter !== 'all'/, 'điều kiện ghi chú "đang lọc" phải tính cả assignmentFilter, không chỉ search/bucket như trước addendum');
});

test('CampaignCskhWorkQueue.tsx: input Từ/Đến là type="number" min={1} (không âm, không thập phân theo UI)', () => {
  const src = readFileSync(resolve(WORK_QUEUE_PATH), 'utf8');
  const blockStart = src.indexOf('<span style={{ fontSize: 13, color: \'var(--text-label)\', marginLeft: 8 }}>Chọn khách:</span>');
  assert.ok(blockStart >= 0);
  const block = src.slice(blockStart, blockStart + 500);
  const numberInputs = block.match(/type="number" min=\{1\}/g) || [];
  assert.equal(numberInputs.length, 2, 'cả Từ và Đến đều phải là input number min=1');
});
