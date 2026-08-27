// M1B.2 — CampaignMembership Quan tâm -> Leader/Admin explicit Bàn giao ->
// CrmHandoff WAITING_ACCEPTANCE -> Sale ACCEPT/REJECT -> Customer ownership +
// Pipeline exactly-once. Cùng kiến trúc test đã dùng xuyên suốt session này:
// pure-function unit test cho phần thuần (không đụng DB), source-regex cho
// phần transactional/route (next/headers + Prisma transaction chặn invoke
// trực tiếp trong node:test — không có DB thật trong test runner).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { handoffConflictsWithOtherSource } from '../../src/lib/crm-funnel/transactional-workflow';
import { isHandoffEligible } from '../../src/lib/crm-funnel/handoff-policy';

// --- A. Trigger: Quan tâm -> candidate only, KHÔNG auto-create Handoff ------

test('isHandoffEligible: INTERESTED/QUALIFIED/HOT đều đủ điều kiện — QUALIFIED/HOT không phải trigger khác, chỉ là qualification layer trên cùng business fact Quan tâm', () => {
  assert.equal(isHandoffEligible('INTERESTED'), true);
  assert.equal(isHandoffEligible('QUALIFIED'), true);
  assert.equal(isHandoffEligible('HOT'), true);
  assert.equal(isHandoffEligible('RAW'), false);
  assert.equal(isHandoffEligible('CONTACTED'), false);
  assert.equal(isHandoffEligible('UNQUALIFIED'), false);
});

test('membership-workflow.ts (M1B.1 interaction/qualification save) KHÔNG tự tạo CrmHandoff/Pipeline dù membership đạt Quan tâm/INTERESTED/QUALIFIED/HOT — trigger chỉ đưa vào Leader queue (candidate), KHÔNG auto-create (regression M1B.1, vẫn phải đúng sau khi M1B.2 implement)', () => {
  const src = readFileSync(resolve('src/lib/crm-funnel/membership-workflow.ts'), 'utf8');
  const codeOnly = src.split('\n').filter(line => !line.trim().startsWith('//') && !line.trim().startsWith('*')).join('\n');
  assert.doesNotMatch(codeOnly, /crmHandoff|ensurePipeline|transitionHandoffTransactional|sale_phu_trach/i, 'M1B.1 save path (recordMembershipInteractionTransactional/updateMembershipQualificationTransactional) không được tự trigger Handoff/Pipeline/ownership — chỉ CampaignCskhWorkQueue gọi route Bàn giao riêng mới được');
});

test('CampaignCskhWorkQueue.tsx: isHandoffCandidate() chỉ dựa vào qualification_status IN {INTERESTED,QUALIFIED,HOT} và outcome CHƯA initiated/accepted — không dùng interaction "Quan tâm" trực tiếp làm cờ tạo Handoff', () => {
  const src = readFileSync(resolve('src/components/crm/CampaignCskhWorkQueue.tsx'), 'utf8');
  assert.match(src, /HANDOFF_CANDIDATE_STATUSES = new Set\(\['INTERESTED', 'QUALIFIED', 'HOT'\]\)/);
  assert.match(src, /function isHandoffCandidate\(member: CampaignMembershipWithCustomer\): boolean \{/);
  assert.match(src, /member\.outcome !== 'HANDOFF_INITIATED' && member\.outcome !== 'HANDOFF_ACCEPTED'/);
});

// --- B/D. Guard order + provenance/ownership boundary trong 'handoff' branch

test('transitionHandoffTransactional: nhánh Campaign-aware (campaignHandoff) re-validate ĐÚNG thứ tự — membership tồn tại -> customer khớp -> vẫn Quan tâm -> actor authority -> target Sale active -> (Leader) roster — không tin bất kỳ giá trị nào client gửi mà không kiểm lại', () => {
  const src = readFileSync(resolve('src/lib/crm-funnel/transactional-workflow.ts'), 'utf8');
  const fnStart = src.indexOf('export async function transitionHandoffTransactional');
  const fnBody = src.slice(fnStart, fnStart + 4000);
  const iMembershipFetch = fnBody.indexOf('tx.campaignMembership.findUnique');
  const iNotFound = fnBody.indexOf("throw new Error('MEMBERSHIP_NOT_FOUND')");
  const iMismatch = fnBody.indexOf("throw new Error('MEMBERSHIP_CUSTOMER_MISMATCH')");
  const iNotCandidate = fnBody.indexOf("throw new Error('MEMBERSHIP_NOT_CANDIDATE')");
  const iNotOwner = fnBody.indexOf("throw new Error('NOT_CAMPAIGN_OWNER')");
  const iTargetInvalid = fnBody.indexOf("throw new Error('TARGET_SALE_INVALID')");
  const iNoScope = fnBody.indexOf("throw new Error('NO_SALE_SCOPE')");
  const iOutOfRoster = fnBody.indexOf("throw new Error('TARGET_SALE_OUT_OF_ROSTER')");
  const iConflict = fnBody.indexOf("throw new Error('HANDOFF_CONFLICT_OTHER_SOURCE')");
  const iCreate = fnBody.indexOf('tx.crmHandoff.create');
  const indices = { iMembershipFetch, iNotFound, iMismatch, iNotCandidate, iNotOwner, iTargetInvalid, iNoScope, iOutOfRoster, iConflict, iCreate };
  for (const [key, value] of Object.entries(indices)) assert.ok(value > -1, `mốc ${key} phải tồn tại trong transitionHandoffTransactional`);
  assert.ok(
    iMembershipFetch < iNotFound && iNotFound < iMismatch && iMismatch < iNotCandidate && iNotCandidate < iNotOwner
    && iNotOwner < iTargetInvalid && iTargetInvalid < iNoScope && iNoScope < iOutOfRoster && iOutOfRoster < iConflict && iConflict < iCreate,
    'thứ tự guard bắt buộc: fetch membership -> not found -> customer mismatch -> not candidate -> not owner -> target invalid -> no scope -> out of roster -> conflict -> mới tạo/update CrmHandoff',
  );
});

test('transitionHandoffTransactional: target Sale re-check dùng lại isActiveSale() (đã test qua sale-cskh-model.test.ts) và parseSaleRoster() (dùng chung với eligibleCampaignSales) — không viết lại logic roster song song', () => {
  const src = readFileSync(resolve('src/lib/crm-funnel/transactional-workflow.ts'), 'utf8');
  assert.match(src, /import \{ isActiveSale, parseSaleRoster \} from '\.\.\/campaign-sale-eligibility';/);
  assert.match(src, /if \(!targetEmployee \|\| !isActiveSale\(targetEmployee\)\)/);
  assert.match(src, /const roster = project \? parseSaleRoster\(project\.ds_sale\) : null;/);
});

test('transitionHandoffTransactional: Admin (actorIsAdmin=true) bỏ qua NO_SALE_SCOPE/TARGET_SALE_OUT_OF_ROSTER — chỉ Leader (non-admin) mới bị áp guard roster, đúng Option 3 Hybrid đã LOCK', () => {
  const src = readFileSync(resolve('src/lib/crm-funnel/transactional-workflow.ts'), 'utf8');
  const fnStart = src.indexOf('export async function transitionHandoffTransactional');
  const fnBody = src.slice(fnStart, fnStart + 4000);
  assert.match(fnBody, /if \(!input\.campaignHandoff\.actorIsAdmin\) \{\s*\n\s*if \(!membership\.campaign\.id_du_an\) throw new Error\('NO_SALE_SCOPE'\);/);
});

test('transitionHandoffTransactional: nhánh "handoff" (initiation) KHÔNG BAO GIỜ set sale_phu_trach và KHÔNG gọi ensurePipeline — ownership/Pipeline chỉ được tạo ở nhánh accept, không phải lúc initiate', () => {
  const src = readFileSync(resolve('src/lib/crm-funnel/transactional-workflow.ts'), 'utf8');
  const fnStart = src.indexOf('export async function transitionHandoffTransactional');
  const actionHandoffStart = src.indexOf("if (input.action === 'handoff') {", fnStart);
  const actionHandoffEnd = src.indexOf("if (!active) {", actionHandoffStart); // đầu nhánh accept/reject chung
  const handoffBranch = src.slice(actionHandoffStart, actionHandoffEnd);
  // (?<!tele) loại trừ "telesale_phu_trach" (field CSKH-role hợp lệ, đã có
  // sẵn từ trước) khỏi việc bị coi nhầm là ghi Customer ownership thật
  // ("sale_phu_trach") — 2 field khác nhau hoàn toàn, chỉ trùng substring.
  assert.doesNotMatch(handoffBranch, /(?<!tele)sale_phu_trach:/, 'nhánh handoff không được set Customer ownership');
  assert.doesNotMatch(handoffBranch, /ensurePipeline/, 'nhánh handoff không được tạo Pipeline');
  // Đúng field PHẢI set: campaign_membership_id lúc create, handoff_id + outcome INITIATED lúc link membership.
  assert.match(handoffBranch, /campaign_membership_id: membership\?\.id,/);
  assert.match(handoffBranch, /data: \{ handoff_id: active\.id, outcome: 'HANDOFF_INITIATED', row_version: \{ increment: 1 \} \},/);
});

// --- Multiple-Campaign / conflict policy (pure, unit-testable) -------------

test('handoffConflictsWithOtherSource: cả 2 phía null (legacy re-target chính nó) -> false, KHÔNG conflict', () => {
  assert.equal(handoffConflictsWithOtherSource(null, null), false);
});

test('handoffConflictsWithOtherSource: cả 2 phía cùng đúng 1 membership id (Campaign re-target chính nó, VD Leader đổi Sale trước khi ai accept) -> false, KHÔNG conflict', () => {
  assert.equal(handoffConflictsWithOtherSource('mem-1', 'mem-1'), false);
});

test('handoffConflictsWithOtherSource: active thuộc Campaign X, request đến từ Campaign Y (membership id khác) -> true, PHẢI BLOCK', () => {
  assert.equal(handoffConflictsWithOtherSource('mem-X', 'mem-Y'), true);
});

test('handoffConflictsWithOtherSource: active đã có từ legacy (null), request đến từ Campaign -> true, PHẢI BLOCK (Campaign không được silently chiếm Handoff legacy)', () => {
  assert.equal(handoffConflictsWithOtherSource(null, 'mem-1'), true);
});

test('handoffConflictsWithOtherSource: active đã có từ Campaign, request legacy re-handoff (null) -> true, PHẢI BLOCK (legacy không được silently chiếm Handoff Campaign)', () => {
  assert.equal(handoffConflictsWithOtherSource('mem-1', null), true);
});

test('transitionHandoffTransactional: guard conflict gọi handoffConflictsWithOtherSource() TRƯỚC khi update/tạo CrmHandoff — áp dụng cho CẢ 2 chiều (legacy gọi cũng bị guard này, không chỉ Campaign)', () => {
  const src = readFileSync(resolve('src/lib/crm-funnel/transactional-workflow.ts'), 'utf8');
  const fnStart = src.indexOf('export async function transitionHandoffTransactional');
  const fnBody = src.slice(fnStart, fnStart + 4000);
  const iConflictCheck = fnBody.indexOf('handoffConflictsWithOtherSource(active.campaign_membership_id, requestedMembershipId)');
  const iUpdate = fnBody.indexOf('tx.crmHandoff.update({\n          where: { id: active.id },\n          data: { sale_id:');
  assert.ok(iConflictCheck > -1 && iUpdate > -1);
  assert.ok(iConflictCheck < iUpdate, 'conflict check phải chạy TRƯỚC re-target Handoff đang mở, không phân biệt caller legacy hay Campaign');
});

// --- ACCEPT/REJECT additive outcome, guarded, không đổi hành vi legacy -----

test('transitionHandoffTransactional: nhánh accept — set sale_phu_trach + ensurePipeline (existing) TRƯỚC, rồi MỚI additive update CampaignMembership.outcome=HANDOFF_ACCEPTED, guard bằng if (active.campaign_membership_id) — Handoff legacy (campaign_membership_id null) không bị đụng, hành vi cũ giữ nguyên 100%', () => {
  const src = readFileSync(resolve('src/lib/crm-funnel/transactional-workflow.ts'), 'utf8');
  const fnStart = src.indexOf('export async function transitionHandoffTransactional');
  const acceptStart = src.indexOf("if (input.action === 'accept') {", fnStart);
  const acceptEnd = src.indexOf("if (!validRejectionReason", acceptStart);
  const acceptBranch = src.slice(acceptStart, acceptEnd);
  const iSalePhuTrach = acceptBranch.indexOf('sale_phu_trach');
  const iEnsurePipeline = acceptBranch.indexOf('ensurePipeline(tx, updated)');
  const iGuard = acceptBranch.indexOf('if (active.campaign_membership_id) {');
  const iOutcome = acceptBranch.indexOf("outcome: 'HANDOFF_ACCEPTED'");
  assert.ok(iSalePhuTrach > -1 && iEnsurePipeline > -1 && iGuard > -1 && iOutcome > -1);
  assert.ok(iSalePhuTrach < iEnsurePipeline && iEnsurePipeline < iGuard && iGuard < iOutcome,
    'thứ tự: ownership (existing) -> Pipeline ensure (existing) -> membership outcome update (M1B.2 additive, cuối cùng)');
});

test('transitionHandoffTransactional: nhánh reject — additive update CampaignMembership.outcome=HANDOFF_REJECTED, guard bằng if (active.campaign_membership_id), KHÔNG set sale_phu_trach, KHÔNG gọi ensurePipeline', () => {
  const src = readFileSync(resolve('src/lib/crm-funnel/transactional-workflow.ts'), 'utf8');
  const fnStart = src.indexOf('export async function transitionHandoffTransactional');
  const fnEnd = src.indexOf('export async function assignTelesaleTransactional');
  const rejectStart = src.indexOf('if (!validRejectionReason(input.reason))', fnStart);
  const rejectBranch = src.slice(rejectStart, fnEnd);
  assert.doesNotMatch(rejectBranch, /(?<!tele)sale_phu_trach:/, 'reject không được set ownership');
  assert.doesNotMatch(rejectBranch, /ensurePipeline/, 'reject không được tạo Pipeline');
  assert.match(rejectBranch, /if \(active\.campaign_membership_id\) \{/);
  assert.match(rejectBranch, /outcome: 'HANDOFF_REJECTED'/);
});

// --- E/F. Pipeline exactly-once + atomicity — reuse existing ensurePipeline/CrmPipelineLink, không tạo engine song song

test('transitionHandoffTransactional (nhánh accept) tái dùng nguyên ensurePipeline() hiện có — không tự viết logic tạo Pipeline mới cho M1B.2 (exactly-once qua CrmPipelineLink.customer_id/pipeline_id unique, không đổi)', () => {
  const src = readFileSync(resolve('src/lib/crm-funnel/transactional-workflow.ts'), 'utf8');
  assert.match(src, /async function ensurePipeline\(tx: Tx, customer:/);
  assert.match(src, /existingLink = await tx\.crmPipelineLink\.findUnique\(\{ where: \{ customer_id: customer\.id_khach_hang \} \}\)/);
  const fnStart = src.indexOf('export async function transitionHandoffTransactional');
  const fnEnd = src.indexOf('export async function assignTelesaleTransactional');
  const fnBody = src.slice(fnStart, fnEnd);
  assert.equal((fnBody.match(/ensurePipeline\(/g) || []).length, 1, 'chỉ đúng 1 lời gọi ensurePipeline trong toàn bộ transitionHandoffTransactional (ở nhánh accept)');
});

// --- Provenance ---------------------------------------------------------

test('CrmHandoff.campaign_membership_id được populate lúc create (Campaign-sourced) — Handoff legacy (không có campaignHandoff) vẫn để field này undefined/null như cũ', () => {
  const src = readFileSync(resolve('src/lib/crm-funnel/transactional-workflow.ts'), 'utf8');
  assert.match(src, /campaign_membership_id: membership\?\.id,/, 'membership undefined (legacy) -> membership?.id = undefined -> Prisma bỏ qua field, giữ null mặc định');
});

// --- Server authority first: route không tin sale_id/membershipId client gửi lên mà không re-validate

test('route handoff mới (campaigns/[id]/members/[membershipId]/handoff): initiator chỉ Admin hoặc canManageCampaign (Campaign.owner) — KHÔNG dùng canManageMembership/isMembershipDirectManager (những hàm cho phép Sale CSKH thao tác) — Sale CSKH không tự initiate được', () => {
  const src = readFileSync(resolve('src/app/api/campaigns/[id]/members/[membershipId]/handoff/route.ts'), 'utf8');
  assert.match(src, /import \{ canManageCampaign, eligibleCampaignSales, getCrmSessionUser, isCrmAdmin \} from '@\/lib\/crm-auth';/);
  assert.doesNotMatch(src, /canManageMembership|isMembershipDirectManager/, 'route Bàn giao không được dùng authority của interaction/qualification (rộng hơn) — chỉ Admin/Campaign.owner');
  assert.match(src, /if \(!canManageCampaign\(user, campaign\)\) \{/);
});

test('route handoff mới: không tin body.sale_id — phải resolve qua eligibleCampaignSales() rồi .find() theo id_nhan_vien mới cho qua, không dùng trực tiếp giá trị client gửi', () => {
  const src = readFileSync(resolve('src/app/api/campaigns/[id]/members/[membershipId]/handoff/route.ts'), 'utf8');
  const iEligibility = src.indexOf('eligibleCampaignSales(actorIsAdmin, campaign, projects, employees)');
  const iFind = src.indexOf("eligibility.sales.find(item => item.id_nhan_vien === body.sale_id)");
  const iTransition = src.indexOf('transitionHandoffTransactional({');
  assert.ok(iEligibility > -1 && iFind > -1 && iTransition > -1);
  assert.ok(iEligibility < iFind && iFind < iTransition, 'phải resolve+validate target Sale qua eligibility TRƯỚC khi gọi transaction, không trust id thẳng');
  assert.match(src, /targetSale: \{ id_nhan_vien: target\.id_nhan_vien, ho_ten: target\.ho_ten \}/, 'target Sale truyền vào transaction phải lấy từ record đã validate (target), không phải body.sale_id thô');
});

test('route handoff mới: candidate check (trang_thai_cham_soc === "Quan tâm") ở route level TRƯỚC khi gọi transaction — lỗi sớm rõ ràng, dù transaction vẫn re-check lại (MEMBERSHIP_NOT_CANDIDATE) làm authority thật', () => {
  const src = readFileSync(resolve('src/app/api/campaigns/[id]/members/[membershipId]/handoff/route.ts'), 'utf8');
  assert.match(src, /if \(membership\.trang_thai_cham_soc !== 'Quan tâm'\) \{/);
});

test('route handoff mới: campaignHandoff truyền actorIsAdmin tính từ isCrmAdmin(user) fresh, không phải giá trị cache/gửi từ client', () => {
  const src = readFileSync(resolve('src/app/api/campaigns/[id]/members/[membershipId]/handoff/route.ts'), 'utf8');
  assert.match(src, /const actorIsAdmin = isCrmAdmin\(user\);/);
  assert.match(src, /campaignHandoff: \{ membershipId, actorIsAdmin \}/);
});

test('route handoff mới: error-code mapping đầy đủ cho toàn bộ throw mới trong transitionHandoffTransactional, đúng status hợp lý (403 authority, 409 conflict/state, 400 input, 404 not-found)', () => {
  const src = readFileSync(resolve('src/app/api/campaigns/[id]/members/[membershipId]/handoff/route.ts'), 'utf8');
  const required: [string, number][] = [
    ['MEMBERSHIP_NOT_FOUND', 404], ['MEMBERSHIP_CUSTOMER_MISMATCH', 409], ['MEMBERSHIP_NOT_CANDIDATE', 409],
    ['NOT_CAMPAIGN_OWNER', 403], ['TARGET_SALE_INVALID', 400], ['NO_SALE_SCOPE', 403],
    ['TARGET_SALE_OUT_OF_ROSTER', 403], ['HANDOFF_CONFLICT_OTHER_SOURCE', 409], ['HANDOFF_ALREADY_ACCEPTED', 409],
  ];
  for (const [code, status] of required) {
    const re = new RegExp(`${code}: \\{ status: ${status},`);
    assert.match(src, re, `${code} phải map đúng status ${status}`);
  }
});

// --- I. Legacy compatibility: /api/crm/telesale/handoff (accept/reject) vẫn dùng chung, tự động phản ánh về CampaignMembership khi có nguồn gốc Campaign

test('legacy route /api/crm/telesale/handoff KHÔNG cần sửa để hỗ trợ accept/reject Campaign-sourced Handoff — chỉ thêm đúng 1 error code mới (HANDOFF_CONFLICT_OTHER_SOURCE), authority/luồng accept/reject giữ nguyên 100%', () => {
  const src = readFileSync(resolve('src/app/api/crm/telesale/handoff/route.ts'), 'utf8');
  assert.match(src, /canActOnHandoff\(\{ action, isManager: manager, isReceiver: receiver \}\)/, 'authority accept/reject không đổi');
  assert.match(src, /HANDOFF_CONFLICT_OTHER_SOURCE: 'Khách hàng đang có Handoff chờ xử lý từ nguồn khác'/);
  assert.match(src, /\['HANDOFF_ALREADY_ACCEPTED', 'ACTIVE_HANDOFF_NOT_FOUND', 'HANDOFF_CONFLICT_OTHER_SOURCE'\]\.includes\(code\) \? 409/);
});

test('handoff-policy.ts (isHandoffEligible/isOwnershipLocked/canActOnHandoff/validRejectionReason) không bị sửa đổi bởi M1B.2 — reuse nguyên vẹn cho cả legacy lẫn Campaign', () => {
  const src = readFileSync(resolve('src/lib/crm-funnel/handoff-policy.ts'), 'utf8');
  assert.match(src, /const HANDOFF_ELIGIBLE_STATUSES: readonly QualificationStatus\[\] = \['INTERESTED', 'QUALIFIED', 'HOT'\];/);
  assert.match(src, /export function isOwnershipLocked\(status\?: string \| null\): boolean \{\s*\n\s*return status === 'Đã nhận';/);
  assert.match(src, /export function canActOnHandoff/);
  assert.match(src, /export function validRejectionReason/);
});

// --- UI wiring: modal không auto-select Sale CSKH, Accept/Reject tái dùng đúng endpoint hiện có

test('CampaignCskhWorkQueue.tsx: MembershipHandoffModal khởi tạo saleId rỗng (KHÔNG useState(membership.telesale_id)) — Sale CSKH chỉ được gắn nhãn gợi ý trong option, không auto-select thành ownership ngầm', () => {
  const src = readFileSync(resolve('src/components/crm/CampaignCskhWorkQueue.tsx'), 'utf8');
  const modalStart = src.indexOf('function MembershipHandoffModal');
  const modalBody = src.slice(modalStart); // hàm cuối file — lấy tới hết file
  assert.match(modalBody, /const \[saleId, setSaleId\] = useState\(''\);/, 'saleId phải khởi tạo rỗng, không pre-fill từ telesale_id');
  assert.match(modalBody, /\{item\.ho_ten === suggestedName \? ' · Sale CSKH hiện tại' : ''\}/, 'Sale CSKH hiện tại chỉ gắn nhãn gợi ý trong option text, không set làm value mặc định');
  assert.doesNotMatch(modalBody, /useState\(membership\.telesale_id\)|useState\(membership\.telesale_name\)/);
});

test('CampaignCskhWorkQueue.tsx: modal Bàn giao dùng eligibleCampaignSales() y hệt CampaignDistributeModal (Leader thu hẹp Project.ds_sale, Admin không giới hạn) — không phát minh eligibility riêng cho Handoff', () => {
  const src = readFileSync(resolve('src/components/crm/CampaignCskhWorkQueue.tsx'), 'utf8');
  assert.match(src, /import \{ eligibleCampaignSales \} from '@\/lib\/campaign-sale-eligibility';/);
  const modalStart = src.indexOf('function MembershipHandoffModal');
  const modalBody = src.slice(modalStart, modalStart + 1000);
  assert.match(modalBody, /const eligibility = eligibleCampaignSales\(isAdmin, campaign, projects, employees\);/);
});

test('CampaignCskhWorkQueue.tsx: Accept/Reject của Sale POST đúng endpoint legacy sẵn có POST /api/crm/telesale/handoff — không tạo API/dashboard riêng cho Sale, đúng "reuse existing accept/reject UI/API"', () => {
  const src = readFileSync(resolve('src/components/crm/CampaignCskhWorkQueue.tsx'), 'utf8');
  assert.match(src, /fetch\('\/api\/crm\/telesale\/handoff', \{/);
  assert.match(src, /body: JSON\.stringify\(\{ customer_id: member\.customer_id, idempotency_key: crypto\.randomUUID\(\), action, ghi_chu: reason \}\)/);
});

test('CampaignCskhWorkQueue.tsx: Accept/Reject chỉ hiện cho ĐÚNG người nhận (currentUserName === handoff.sale_name) và khi handoff còn WAITING_ACCEPTANCE — không cho người khác bấm hộ', () => {
  const src = readFileSync(resolve('src/components/crm/CampaignCskhWorkQueue.tsx'), 'utf8');
  assert.match(src, /const isReceiver = Boolean\(currentUserName && member\.handoff\?\.sale_name === currentUserName\);/);
  assert.match(src, /\{isReceiver && member\.handoff\?\.status === 'WAITING_ACCEPTANCE' && <div/);
});

test('CampaignCskhWorkQueue.tsx: nút Bàn giao (initiate) chỉ hiện cho canManageThisCampaign (Admin/Campaign.owner) — Sale CSKH không thấy nút này dù đang phụ trách chăm sóc', () => {
  const src = readFileSync(resolve('src/components/crm/CampaignCskhWorkQueue.tsx'), 'utf8');
  assert.match(src, /\{canManageThisCampaign && isHandoffCandidate\(member\) && <button className="btn btn-secondary btn-sm" onClick=\{\(\) => onHandoff\(member\)\}>/);
});

// --- getCampaignMembersWithCustomers: handoff join read-only, không đổi CSKH isolation

test('getCampaignMembersWithCustomers() join CrmHandoff READ-ONLY (chỉ select id/status/sale_name) khi member.handoff_id đã set — không mutate gì, không phá vỡ isolation Campaign CSKH đã có (M1B.1)', () => {
  const src = readFileSync(resolve('src/lib/crm-funnel/campaign.ts'), 'utf8');
  const fnStart = src.indexOf('export async function getCampaignMembersWithCustomers');
  const fnBody = src.slice(fnStart, fnStart + 1500);
  assert.match(fnBody, /prisma\.crmHandoff\.findMany\(\{ where: \{ id: \{ in: handoffIds \} \}, select: \{ id: true, status: true, sale_name: true \} \}\)/);
  assert.doesNotMatch(fnBody, /crmHandoff\.(update|create|delete)/);
});
