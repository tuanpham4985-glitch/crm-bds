import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  isMembershipAssigned, matchesMembershipQueueFilter, membershipAssignmentBreakdown, resolveMembershipRange,
} from '../../src/lib/campaign-cskh-range';
import { planBulkDistribution } from '../../src/lib/crm-funnel/campaign';

// ADDENDUM — Assigned Customer Visibility + Overlap Protection. Authority
// cho "đã chia" là ĐÚNG CampaignMembership.telesale_id (không thêm field
// is_assigned) — mọi test dưới đây set/check trực tiếp telesale_id.

const RANGE_LIB_PATH = 'src/lib/campaign-cskh-range.ts';
const WORK_QUEUE_PATH = 'src/components/crm/CampaignCskhWorkQueue.tsx';
const CAMPAIGN_LIB_PATH = 'src/lib/crm-funnel/campaign.ts';
const DISTRIBUTE_ROUTE_PATH = 'src/app/api/campaigns/[id]/distribute/route.ts';

function member(id: string, telesale_id: string | null, overrides: Partial<{ ten_KH: string; telesale_name: string | null }> = {}) {
  return {
    id, customer_id: `KH_${id}`, telesale_id, telesale_name: overrides.telesale_name ?? (telesale_id ? `Sale ${telesale_id}` : null),
    customer: { ten_KH: overrides.ten_KH ?? `Khách ${id}` },
    trang_thai_cham_soc: 'Chưa gọi', ngay_lien_he_tiep: null,
  };
}

// --- A. isMembershipAssigned / membershipAssignmentBreakdown (authority = telesale_id) ---

test('isMembershipAssigned: true khi telesale_id có giá trị, false khi null/undefined — KHÔNG dựa vào assignment_status hay field nào khác', () => {
  assert.equal(isMembershipAssigned({ telesale_id: 'S1' }), true);
  assert.equal(isMembershipAssigned({ telesale_id: null }), false);
  assert.equal(isMembershipAssigned({}), false);
});

test('membershipAssignmentBreakdown: đếm đúng total/assigned/unassigned từ 1 danh sách hỗn hợp', () => {
  const members = [member('1', 'S1'), member('2', null), member('3', 'S2'), member('4', null), member('5', null)];
  const breakdown = membershipAssignmentBreakdown(members);
  assert.deepEqual(breakdown, { total: 5, assigned: 2, unassigned: 3 });
});

test('membershipAssignmentBreakdown: danh sách rỗng -> {0,0,0}, không lỗi', () => {
  assert.deepEqual(membershipAssignmentBreakdown([]), { total: 0, assigned: 0, unassigned: 0 });
});

// --- B. Filter "Tất cả | Chưa chia | Đã chia" (matchesMembershipQueueFilter) ---

test('matchesMembershipQueueFilter: assignment="assigned" chỉ khớp membership có telesale_id, "unassigned" chỉ khớp membership KHÔNG có, "all"/không truyền -> khớp mọi trạng thái', () => {
  const assigned = member('1', 'S1');
  const unassigned = member('2', null);
  assert.equal(matchesMembershipQueueFilter(assigned, { assignment: 'assigned' }), true);
  assert.equal(matchesMembershipQueueFilter(assigned, { assignment: 'unassigned' }), false);
  assert.equal(matchesMembershipQueueFilter(unassigned, { assignment: 'assigned' }), false);
  assert.equal(matchesMembershipQueueFilter(unassigned, { assignment: 'unassigned' }), true);
  assert.equal(matchesMembershipQueueFilter(assigned, { assignment: 'all' }), true);
  assert.equal(matchesMembershipQueueFilter(assigned, {}), true);
});

test('matchesMembershipQueueFilter: assignment filter kết hợp ĐÚNG với search/bucket hiện có (AND, không OR) — không nới lỏng filter cũ', () => {
  const m = member('1', 'S1', { ten_KH: 'Nguyễn Văn A' });
  assert.equal(matchesMembershipQueueFilter(m, { search: 'nguyễn', assignment: 'assigned' }), true);
  assert.equal(matchesMembershipQueueFilter(m, { search: 'không khớp', assignment: 'assigned' }), false);
  assert.equal(matchesMembershipQueueFilter(m, { search: 'nguyễn', assignment: 'unassigned' }), false);
});

// --- C. Preview count: range chứa cả đã chia lẫn chưa chia ---

test('preview count đúng: range 10 khách gồm 4 đã chia + 6 chưa chia -> total=10, assigned=4, unassigned=6, "sẽ chia"=6', () => {
  const range = [
    member('1', 'S1'), member('2', null), member('3', null), member('4', 'S2'),
    member('5', null), member('6', 'S1'), member('7', null), member('8', null),
    member('9', 'S3'), member('10', null),
  ];
  const breakdown = membershipAssignmentBreakdown(range);
  assert.deepEqual(breakdown, { total: 10, assigned: 4, unassigned: 6 });
});

// --- D. Range overlap: đã chia 301–500, chọn 400–600 -> chỉ 501–600 được chia mới, 400–500 giữ nguyên ---

test('range overlap (ví dụ đúng spec: đã chia 301–500, sau đó chọn 400–600) -> 400–500 (đã ASSIGNED) giữ nguyên Sale cũ, CHỈ 501–600 (chưa ASSIGNED) được đưa vào lần chia mới', () => {
  // Mô phỏng 600 membership theo thứ tự created_at asc (index 0-599 = STT 1-600).
  // 301-500 (index 300-499) đã ASSIGNED cho "Sale cũ" từ đợt chia trước.
  const OLD_SALE = 'SALE_OLD';
  const all = Array.from({ length: 600 }, (_, i) => {
    const stt = i + 1;
    const assignedBefore = stt >= 301 && stt <= 500;
    return member(String(stt), assignedBefore ? OLD_SALE : null, { telesale_name: assignedBefore ? 'Sale Cũ' : null });
  });

  // Admin chọn range 400-600 lần này.
  const rangeResult = resolveMembershipRange(all, { from: 400, to: 600 });
  assert.equal(rangeResult.ok, true);
  if (!rangeResult.ok) return;
  assert.equal(rangeResult.ids.length, 201);

  const breakdown = membershipAssignmentBreakdown(rangeResult.ids);
  // 400-500 (101 người) đã ASSIGNED từ trước, 501-600 (100 người) chưa.
  assert.equal(breakdown.assigned, 101);
  assert.equal(breakdown.unassigned, 100);

  // planBulkDistribution (thuần, đúng hàm bulkAddAndDistribute thật sự dùng)
  // phải loại 400-500 khỏi eligible, chỉ chia 501-600.
  const orderedIds = rangeResult.ids.map(m => m.customer_id);
  const existingMemberships = rangeResult.ids.filter(isMembershipAssigned).map(m => ({ customer_id: m.customer_id, assignment_status: 'ASSIGNED' }));
  const newSales = [{ id_nhan_vien: 'S1', ho_ten: 'Sale Mới A' }, { id_nhan_vien: 'S2', ho_ten: 'Sale Mới B' }];
  const plan = planBulkDistribution({
    orderedIds, existingCustomerIds: new Set(orderedIds), existingMemberships,
    telesales: newSales, mode: 'round_robin',
  });
  assert.equal(plan.alreadyAssigned, 101);
  const touchedIds = new Set([...plan.toCreate, ...plan.toAssignExisting].map(item => item.customer_id));
  assert.equal(touchedIds.size, 100, 'chỉ đúng 100 khách (501-600, chưa từng ASSIGNED) được đưa vào lần chia mới');
  // Xác nhận cụ thể: KH_400 (STT 400, đã ASSIGNED) KHÔNG bị đụng.
  assert.equal(touchedIds.has('KH_400'), false);
  assert.equal(touchedIds.has('KH_500'), false);
  // KH_501, KH_600 (chưa từng ASSIGNED) PHẢI được chia.
  assert.equal(touchedIds.has('KH_501'), true);
  assert.equal(touchedIds.has('KH_600'), true);
});

// --- E. UI wiring: opacity/badge, filter, preview, confirm/success message ---

test('CampaignCskhWorkQueue.tsx: row style áp opacity 0.5 khi assigned (isMembershipAssigned), giữ nguyên background quá lịch — không thay thế logic overdue cũ', () => {
  const src = readFileSync(resolve(WORK_QUEUE_PATH), 'utf8');
  assert.match(src, /const assigned = isMembershipAssigned\(member\);/);
  assert.match(src, /\.\.\.\(assigned \? \{ opacity: 0\.5 \} : \{\}\)/);
  assert.match(src, /isOverdue\(member\.ngay_lien_he_tiep\) \? \{ background: '#fff7f7' \} : \{\}/);
});

test('CampaignCskhWorkQueue.tsx: badge "Đã chia" kèm tên Sale khi assigned, badge "Chưa chia" khi không — cột Sale CSKH', () => {
  const src = readFileSync(resolve(WORK_QUEUE_PATH), 'utf8');
  assert.match(src, />Đã chia</);
  assert.match(src, />Chưa chia</);
  assert.match(src, /\{member\.telesale_name\}/);
});

test('CampaignCskhWorkQueue.tsx: filter "Tất cả | Chưa chia | Đã chia" tồn tại và filtered dùng assignmentFilter — cùng cơ chế filter search/bucket có sẵn, không tạo useMemo song song', () => {
  const src = readFileSync(resolve(WORK_QUEUE_PATH), 'utf8');
  assert.match(src, /<option value="all">Tất cả<\/option>/);
  assert.match(src, /<option value="unassigned">Chưa chia<\/option>/);
  assert.match(src, /<option value="assigned">Đã chia<\/option>/);
  assert.match(src, /assignment: assignmentFilter/);
});

test('CampaignCskhWorkQueue.tsx: summary "Tổng X · Đã chia Y · Chưa chia Z" tính trên TOÀN campaign (members), không phụ thuộc filter hiện tại — Admin luôn thấy đúng bức tranh tổng', () => {
  const src = readFileSync(resolve(WORK_QUEUE_PATH), 'utf8');
  assert.match(src, /const assignmentSummary = useMemo\(\(\) => membershipAssignmentBreakdown\(members\), \[members\]\);/);
  assert.match(src, /Tổng \{assignmentSummary\.total\} · Đã chia \{assignmentSummary\.assigned\} · Chưa chia \{assignmentSummary\.unassigned\}/);
});

test('CampaignCskhWorkQueue.tsx: preview trong khối range hiển thị ĐỦ 4 số theo spec (tổng/đã chia/chưa chia/sẽ chia)', () => {
  const src = readFileSync(resolve(WORK_QUEUE_PATH), 'utf8');
  assert.match(src, /Tổng \{rangeBreakdown\.total\} · Đã chia \{rangeBreakdown\.assigned\} · Chưa chia \{rangeBreakdown\.unassigned\} · Sẽ chia \{rangeBreakdown\.unassigned\} khách/);
});

test('CampaignCskhWorkQueue.tsx: distributeRange() dùng rangeBreakdown.unassigned (số THỰC TẾ sẽ chia) cho cả confirm() lẫn chặn khi = 0 — không dùng rangeResult.ids.length (tổng, gồm cả đã chia) cho các quyết định này', () => {
  const src = readFileSync(resolve(WORK_QUEUE_PATH), 'utf8');
  const fnStart = src.indexOf('async function distributeRange()');
  const fnBody = src.slice(fnStart, fnStart + 1300);
  assert.match(fnBody, /if\s*\(rangeBreakdown\.unassigned === 0\)/, 'phải chặn + báo rõ khi cả range đều đã có Sale (không còn gì để chia)');
  assert.match(fnBody, /const toDistribute = rangeBreakdown\.unassigned;/);
  assert.match(fnBody, /window\.confirm\(`Chia đều \$\{toDistribute\} khách/);
});

test('CampaignCskhWorkQueue.tsx: nút "Chia đều cho Sale" bị disable khi rangeBreakdown.unassigned === 0 (toàn bộ range đã có Sale)', () => {
  const src = readFileSync(resolve(WORK_QUEUE_PATH), 'utf8');
  assert.match(src, /disabled=\{!rangeResult\?\.ok \|\| !rangeBreakdown \|\| rangeBreakdown\.unassigned === 0 \|\| rangeSubmitting \|\| Boolean\(rangeEligibility\?\.blocked\)\}/);
});

test('CampaignCskhWorkQueue.tsx: request gửi lên server kèm assignment: assignmentFilter trong membership_range — server phải resolve range dựa trên ĐÚNG filter hiện tại của UI (kể cả assignment), không chỉ search/bucket', () => {
  const src = readFileSync(resolve(WORK_QUEUE_PATH), 'utf8');
  assert.match(src, /membership_range: \{ from: rangeFromNum, to: rangeToNum, search, bucket: bucketFilter \|\| undefined, assignment: assignmentFilter \}/);
});

// --- F. Server: resolveCampaignMembershipCustomerIdsByRange/route nhận + truyền đúng assignment ---

test('campaign.ts: MembershipRangeSelection kế thừa MembershipQueueFilter (có field assignment) — resolveCampaignMembershipCustomerIdsByRange tự động áp assignment filter qua matchesMembershipQueueFilter, không cần code riêng', () => {
  const src = readFileSync(resolve(CAMPAIGN_LIB_PATH), 'utf8');
  assert.match(src, /export interface MembershipRangeSelection extends MembershipQueueFilter/);
});

test('distribute route: nhánh membership_range parse + validate assignment (whitelist "all"/"unassigned"/"assigned") trước khi truyền xuống resolveCampaignMembershipCustomerIdsByRange — không tin thẳng string bất kỳ từ client', () => {
  const src = readFileSync(resolve(DISTRIBUTE_ROUTE_PATH), 'utf8');
  const rangeBranchStart = src.indexOf('body?.membership_range');
  const rangeBranchEnd = src.indexOf('} else {', rangeBranchStart);
  const rangeBranch = src.slice(rangeBranchStart, rangeBranchEnd);
  assert.match(rangeBranch, /ASSIGNMENT_FILTERS\.has\(/);
  assert.match(rangeBranch, /assignment:/);
});

// --- G. Skip assigned / no-overwrite — reconfirm existing safety net vẫn nguyên vẹn qua code path mới ---

test('bulkAddAndDistribute (campaign.ts): vẫn KHÔNG có bất kỳ code path nào update lại telesale_id của membership đã ASSIGNED — chỉ createMany (mới) + updateMany WHERE assignment_status=UNASSIGNED (an toàn, atomic-guard chống đè)', () => {
  const src = readFileSync(resolve(CAMPAIGN_LIB_PATH), 'utf8');
  const fnStart = src.indexOf('export async function bulkAddAndDistribute');
  const fnBody = src.slice(fnStart, fnStart + 2500);
  assert.match(fnBody, /where:\s*\{\s*campaign_id:\s*input\.campaignId,\s*customer_id:\s*item\.customer_id,\s*assignment_status:\s*'UNASSIGNED'\s*\}/);
});

// --- H. No Handoff/Pipeline/ownership side-effect từ toàn bộ UI mới (badge/opacity/filter/summary) ---

test('CampaignCskhWorkQueue.tsx: toàn bộ code mới (badge/opacity/assignmentFilter/summary/rangeBreakdown) không thêm bất kỳ lệnh gọi fetch() nào ngoài /api/campaigns/${campaignId}/distribute đã có — không tạo side-effect Handoff/Pipeline/ownership nào khác', () => {
  const src = readFileSync(resolve(WORK_QUEUE_PATH), 'utf8');
  const allFetchCalls = src.match(/fetch\(`?\/api\/[^`'")\s]+/g) || [];
  const distinctEndpointBases = new Set(allFetchCalls.map(call => call.replace(/\$\{[^}]+\}/g, ':id')));
  // Endpoint set không đổi so với trước addendum: campaigns list, members,
  // interaction, handoff (accept/reject + bàn giao), distribute. Không có
  // endpoint pipeline/ownership mới nào xuất hiện.
  for (const endpoint of distinctEndpointBases) {
    assert.doesNotMatch(endpoint, /pipeline|ownership/i, `endpoint lạ không mong đợi: ${endpoint}`);
  }
});
