// ROLE_SCOPED_QUERY_AUDIT remediation — CSKH → Theo Campaign trước đây đọc
// TOÀN BỘ CampaignMembership của 1 campaign (N dòng) rồi mới .filter() theo
// telesale_id ở route.ts (APP_FILTER_AFTER_BROAD_READ, hạng mục rủi ro Neon
// Network Transfer cao nhất trong audit). Remediation này đẩy đúng constraint
// đó xuống Prisma WHERE cho actor KHÔNG quản lý toàn Campaign — KHÔNG đổi
// authority (WHO được xem gì), chỉ đổi WHERE nào chạy ở Postgres.
//
// Cùng kỹ thuật đã dùng xuyên suốt session: buildCampaignMembershipReadWhere
// là hàm THUẦN (không đụng DB) tách riêng để test trực tiếp WHERE thật sự sẽ
// chạy — không suy luận qua source-regex cho phần quan trọng nhất (query
// shape). route.ts wiring (ai truyền scope nào) verify bằng source-regex,
// đúng pattern route Next.js không invoke được trực tiếp trong node:test.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildCampaignMembershipReadWhere } from '../../src/lib/crm-funnel/campaign';

const ROUTE_PATH = 'src/app/api/campaigns/[id]/members/route.ts';
const CAMPAIGN_LIB_PATH = 'src/lib/crm-funnel/campaign.ts';

function read(path: string): string {
  return readFileSync(resolve(path), 'utf8');
}

// --- A. Ordinary assigned Sale/CSKH: WHERE chứa CẢ campaign_id LẪN scope ---

test('A) buildCampaignMembershipReadWhere: actor scoped (telesale) -> WHERE chứa CẢ campaign_id LẪN telesale_id, không phải chỉ campaign_id', () => {
  const where = buildCampaignMembershipReadWhere('CAMP_1', 'NV_001');
  assert.deepEqual(where, { campaign_id: 'CAMP_1', telesale_id: 'NV_001' });
});

test('A2) route.ts: actor KHÔNG canManageCampaign -> truyền ĐÚNG user.id_nhan_vien làm scope (không phải tên/telesale_name)', () => {
  const src = read(ROUTE_PATH);
  assert.match(src, /const hasFullView = canManageCampaign\(user, campaign\);/);
  assert.match(src, /getCampaignMembersWithCustomers\(id, hasFullView \? undefined : user\.id_nhan_vien\)/);
});

test('A3) route.ts KHÔNG còn broad-read-rồi-filter cho actor path — không có members.filter(...) nào sau khi gọi getCampaignMembersWithCustomers', () => {
  const src = read(ROUTE_PATH);
  const callIdx = src.indexOf('getCampaignMembersWithCustomers(id,');
  assert.ok(callIdx > -1);
  const afterCall = src.slice(callIdx);
  assert.doesNotMatch(afterCall, /\.filter\(/, 'không được còn bất kỳ .filter() nào áp dụng SAU khi đã gọi query — scope phải nằm trong WHERE, không phải hậu xử lý');
});

// --- B. Admin: giữ nguyên full-campaign visibility ---

test('B) Admin (canManageCampaign true qua isCrmAdmin) -> scope truyền vào là undefined -> buildCampaignMembershipReadWhere trả về WHERE CHỈ campaign_id (full campaign, không hẹp hơn)', () => {
  const where = buildCampaignMembershipReadWhere('CAMP_1', undefined);
  assert.deepEqual(where, { campaign_id: 'CAMP_1' });
});

// --- C. Campaign owner / full-view manager: giữ nguyên full-campaign visibility ---

test('C) canManageCampaign (Admin HOẶC campaign.owner_name === user.ho_ten) — KHÔNG bị đổi bởi remediation này, vẫn đúng 2 nhánh full-view như trước', () => {
  const src = read('src/lib/crm-auth.ts');
  assert.match(src, /export function canManageCampaign\(user: CrmSessionUser, campaign: \{ owner_name\?: string \| null \}\): boolean \{\s*\n\s*return isCrmAdmin\(user\) \|\| campaign\.owner_name === user\.ho_ten;\s*\n\}/);
});

// --- D. Unauthorized/unassigned actor: vẫn đúng semantics CŨ (mảng rỗng, không phải lỗi mới) ---

test('D) actor scoped nhưng KHÔNG có membership nào trong campaign đó -> WHERE vẫn hợp lệ (campaign_id + telesale_id của actor), Prisma tự trả mảng rỗng — KHÔNG có behavior lỗi/reject mới nào được phát minh, giữ nguyên "empty, not error" như route cũ (members.filter trả []) ', () => {
  const where = buildCampaignMembershipReadWhere('CAMP_1', 'NV_KHONG_CO_MEMBERSHIP');
  assert.deepEqual(where, { campaign_id: 'CAMP_1', telesale_id: 'NV_KHONG_CO_MEMBERSHIP' });
  // route.ts không có status mới nào cho trường hợp "actor không có membership
  // nào trong campaign" — chỉ đúng 401 (chưa đăng nhập)/404 (campaign không
  // tồn tại)/503 (Postgres CRM chưa bật)/500 (lỗi khác) như trước remediation,
  // KHÔNG thêm 403 mới cho case này (Prisma tự trả mảng rỗng, response vẫn 200).
  const src = read(ROUTE_PATH);
  const statusCodes = [...src.matchAll(/status:\s*(\d+)/g)].map(m => m[1]).sort();
  assert.deepEqual(statusCodes, ['401', '404', '500', '503'], 'route chỉ có đúng 401/404/500/503 như cũ — KHÔNG thêm 403 mới cho actor không có membership');
});

// --- E. 2 Sale cùng Campaign: cách ly tuyệt đối ---

test('E) buildCampaignMembershipReadWhere: 2 Sale khác nhau trong CÙNG campaign -> 2 WHERE khác nhau, mỗi WHERE chỉ khớp ĐÚNG telesale_id của mình, không thể lẫn membership của người kia', () => {
  const whereA = buildCampaignMembershipReadWhere('CAMP_1', 'NV_SALE_A');
  const whereB = buildCampaignMembershipReadWhere('CAMP_1', 'NV_SALE_B');
  assert.notDeepEqual(whereA, whereB);
  assert.equal(whereA.telesale_id, 'NV_SALE_A');
  assert.equal(whereB.telesale_id, 'NV_SALE_B');
  assert.notEqual(whereA.telesale_id, whereB.telesale_id);
});

// --- F. Response shape (member/customer) không đổi ---

test('F) getCampaignMembersWithCustomers: response shape (...member, customer, handoff) không đổi bởi remediation — chỉ đổi WHERE nào chạy, không đổi hình dạng object trả về', () => {
  const src = read(CAMPAIGN_LIB_PATH);
  const fnStart = src.indexOf('export async function getCampaignMembersWithCustomers');
  const fnEnd = src.indexOf('\nexport interface MembershipRangeSelection');
  const fnBody = src.slice(fnStart, fnEnd);
  assert.match(fnBody, /return members\.map\(member => \(\{\s*\n\s*\.\.\.member,\s*\n\s*customer: customerMap\.get\(member\.customer_id\)/);
  assert.match(fnBody, /handoff: member\.handoff_id \? handoffMap\.get\(member\.handoff_id\) \?\? null : null,/);
});

test('F2) route.ts: response JSON shape { success: true, data: { campaign, members } } không đổi (trước đây field tên "visible", giờ đổi tên biến "members" nhưng SAME shape trả về client — key JSON vẫn "members")', () => {
  const src = read(ROUTE_PATH);
  assert.match(src, /return NextResponse\.json\(\{ success: true, data: \{ campaign, members \} \}\);/);
});

// --- G. Regression: các call site full-view khác không bị đụng ---

test('G) resolveCampaignMembershipCustomerIdsByRange (distribute route, đã gate canManageCampaign TRƯỚC) vẫn gọi getCampaignMembersWithCustomers(campaignId) — 1 tham số, full-view NGUYÊN VẸN, KHÔNG bị remediation này thu hẹp', () => {
  const src = read(CAMPAIGN_LIB_PATH);
  const fnStart = src.indexOf('export async function resolveCampaignMembershipCustomerIdsByRange');
  const fnBody = src.slice(fnStart, fnStart + 700);
  assert.match(fnBody, /getCampaignMembersWithCustomers\(campaignId\)/, 'call site full-view (đã gate canManageCampaign ở distribute route) không được truyền scope thu hẹp');
});

test('G2) getCampaignMembers() (hàm riêng, KHÔNG kèm customer join, dùng cho mục đích khác) không bị đụng bởi remediation này — vẫn where CHỈ campaign_id', () => {
  const src = read(CAMPAIGN_LIB_PATH);
  assert.match(src, /export async function getCampaignMembers\(campaignId: string\) \{\s*\n\s*assertTransactionalCrm\(\);\s*\n\s*return prisma\.campaignMembership\.findMany\(\{ where: \{ campaign_id: campaignId \}, orderBy: \{ created_at: 'asc' \} \}\);\s*\n\}/);
});

test('G3) qualification sync (membership-workflow.ts) và handoff (transitionHandoffTransactional) KHÔNG import/dùng buildCampaignMembershipReadWhere/getCampaignMembersWithCustomers — remediation này hoàn toàn tách biệt khỏi 2 luồng đó', () => {
  const membershipWorkflowSrc = read('src/lib/crm-funnel/membership-workflow.ts');
  const transactionalSrc = read('src/lib/crm-funnel/transactional-workflow.ts');
  assert.doesNotMatch(membershipWorkflowSrc, /buildCampaignMembershipReadWhere|getCampaignMembersWithCustomers/);
  assert.doesNotMatch(transactionalSrc, /buildCampaignMembershipReadWhere|getCampaignMembersWithCustomers/);
});
