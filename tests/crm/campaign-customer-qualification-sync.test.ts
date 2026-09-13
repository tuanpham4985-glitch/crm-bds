// CAMPAIGN_CUSTOMER_QUALIFICATION_SYNC — Campaign chỉ là nguồn/quá trình tạo
// lead, không phải lý do loại khách khỏi Data tiềm năng (audit
// DATA_TIEM_NANG_CAMPAIGN_INCLUSION_AUDIT_COMPLETE, root cause B:
// CAMPAIGN_TO_CUSTOMER_SYNC_GAP). File này khoá:
//   1. isQualificationPromotionOrEqual (scoring.ts) — merge rule THUẦN,
//      quyết định có ghi đè canonical Customer hay không.
//   2. planCanonicalQualificationSync (membership-workflow.ts) — áp merge
//      rule đó + timestamp-preservation convention thành patch thật.
//   3. Wiring: cả 2 writer transactional (interaction/qualification) đều gọi
//      patch này trong CÙNG transaction, KHÔNG đụng handoff/ownership.
// Cùng kỹ thuật source-regex/pure-function đã dùng xuyên suốt session (không
// có DB thật trong test runner — prisma.$transaction không invoke được).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isQualificationPromotionOrEqual } from '../../src/lib/crm-funnel/scoring';
import { planCanonicalQualificationSync } from '../../src/lib/crm-funnel/membership-workflow';
import type { QualificationStatus } from '../../src/lib/types';

function customer(overrides: Partial<{
  qualification_status: string; lead_quality_score: number;
  ngay_quan_tam: string | null; qualified_at: string | null; hot_at: string | null;
}> = {}) {
  return {
    qualification_status: 'RAW', lead_quality_score: 0,
    ngay_quan_tam: null, qualified_at: null, hot_at: null,
    ...overrides,
  };
}

function computed(status: QualificationStatus, score = 50) {
  return { qualification_status: status, lead_quality_score: score, lead_quality_rank: 'WARM', lead_score_breakdown: '[]' };
}

// --- A/B/C: Campaign promotes Customer qua funnel ---------------------------

test('A) Campaign INTERESTED promotes Customer RAW -> INTERESTED', () => {
  assert.equal(isQualificationPromotionOrEqual('RAW', 0, 'INTERESTED', 40), true);
});

test('B) Campaign QUALIFIED promotes Customer INTERESTED hoặc RAW -> QUALIFIED', () => {
  assert.equal(isQualificationPromotionOrEqual('RAW', 0, 'QUALIFIED', 65), true);
  assert.equal(isQualificationPromotionOrEqual('INTERESTED', 40, 'QUALIFIED', 65), true);
});

test('C) Campaign HOT promotes Customer -> HOT', () => {
  assert.equal(isQualificationPromotionOrEqual('QUALIFIED', 65, 'HOT', 85), true);
  assert.equal(isQualificationPromotionOrEqual('RAW', 0, 'HOT', 85), true);
});

// --- D: KHÔNG downgrade ------------------------------------------------------

test('D) weaker later Campaign interaction KHÔNG downgrade: HOT -> QUALIFIED/INTERESTED, QUALIFIED -> INTERESTED, INTERESTED -> CONTACTED/RAW', () => {
  assert.equal(isQualificationPromotionOrEqual('HOT', 85, 'QUALIFIED', 65), false);
  assert.equal(isQualificationPromotionOrEqual('HOT', 85, 'INTERESTED', 40), false);
  assert.equal(isQualificationPromotionOrEqual('QUALIFIED', 65, 'INTERESTED', 40), false);
  assert.equal(isQualificationPromotionOrEqual('INTERESTED', 40, 'CONTACTED', 10), false);
  assert.equal(isQualificationPromotionOrEqual('INTERESTED', 40, 'RAW', 0), false);
});

test('D2) cùng rank nhưng điểm thấp hơn cũng KHÔNG được ghi đè (không hạ điểm của cùng 1 trạng thái)', () => {
  assert.equal(isQualificationPromotionOrEqual('INTERESTED', 55, 'INTERESTED', 40), false);
  assert.equal(isQualificationPromotionOrEqual('INTERESTED', 40, 'INTERESTED', 55), true);
});

test('D3) UNQUALIFIED (kết quả loại trừ cục bộ 1 lần tương tác, VD "Sai số" ở Campaign khác) KHÔNG BAO GIỜ ghi đè bất kỳ trạng thái nào Customer đã đạt — kể cả RAW mặc định', () => {
  assert.equal(isQualificationPromotionOrEqual('RAW', 0, 'UNQUALIFIED', 0), false);
  assert.equal(isQualificationPromotionOrEqual('INTERESTED', 40, 'UNQUALIFIED', 0), false);
  assert.equal(isQualificationPromotionOrEqual('HOT', 90, 'UNQUALIFIED', 0), false);
});

// --- E: Multi-Campaign -------------------------------------------------------

test('E) Multi-Campaign: Campaign A đưa Customer lên HOT, Campaign B sau đó chỉ INTERESTED -> canonical Customer VẪN giữ HOT (mô phỏng qua 2 lần gọi tuần tự planCanonicalQualificationSync)', () => {
  let cust = customer();
  const fromCampaignA = planCanonicalQualificationSync(cust, computed('HOT', 90), '2026-01-01T00:00:00.000Z');
  assert.ok(fromCampaignA);
  cust = { ...cust, ...fromCampaignA! } as typeof cust;
  assert.equal(cust.qualification_status, 'HOT');

  const fromCampaignB = planCanonicalQualificationSync(cust, computed('INTERESTED', 40), '2026-01-02T00:00:00.000Z');
  assert.equal(fromCampaignB, null, 'Campaign B yếu hơn -> không được ghi đè, giữ nguyên HOT từ Campaign A');
});

// --- F: milestone timestamps preserved monotonically -------------------------

test('F) ngay_quan_tam/qualified_at/hot_at chỉ set khi LẦN ĐẦU đạt mốc, KHÔNG bị ghi đè bởi lần sau', () => {
  const firstInterested = planCanonicalQualificationSync(customer(), computed('INTERESTED', 40), '2026-01-01T00:00:00.000Z');
  assert.ok(firstInterested);
  assert.equal(firstInterested!.ngay_quan_tam, '2026-01-01T00:00:00.000Z');
  assert.equal(firstInterested!.qualified_at, null);
  assert.equal(firstInterested!.hot_at, null);

  const already = customer({ qualification_status: 'INTERESTED', lead_quality_score: 40, ngay_quan_tam: '2026-01-01T00:00:00.000Z' });
  const toQualified = planCanonicalQualificationSync(already, computed('QUALIFIED', 65), '2026-02-01T00:00:00.000Z');
  assert.ok(toQualified);
  assert.equal(toQualified!.ngay_quan_tam, '2026-01-01T00:00:00.000Z', 'ngay_quan_tam không bị ghi đè bởi lần đạt mốc sau');
  assert.equal(toQualified!.qualified_at, '2026-02-01T00:00:00.000Z', 'qualified_at set đúng LẦN ĐẦU đạt QUALIFIED');

  const alreadyQualified = customer({
    qualification_status: 'QUALIFIED', lead_quality_score: 65,
    ngay_quan_tam: '2026-01-01T00:00:00.000Z', qualified_at: '2026-02-01T00:00:00.000Z',
  });
  const toHot = planCanonicalQualificationSync(alreadyQualified, computed('HOT', 85), '2026-03-01T00:00:00.000Z');
  assert.ok(toHot);
  assert.equal(toHot!.ngay_quan_tam, '2026-01-01T00:00:00.000Z');
  assert.equal(toHot!.qualified_at, '2026-02-01T00:00:00.000Z', 'qualified_at đã set từ trước (QUALIFIED) -> giữ nguyên mốc cũ, không bị ghi đè khi nhảy tiếp lên HOT');
  assert.equal(toHot!.hot_at, '2026-03-01T00:00:00.000Z');
});

// --- Remediation: qualified_at phải set khi đạt QUALIFIED HOẶC HOT (không
// chỉ exactly 'QUALIFIED') — 1 lần sync có thể nhảy thẳng RAW/INTERESTED ->
// HOT (Campaign tính điểm 1 lần/tương tác, không tuần tự qua từng nấc như
// non-Campaign), và HOT tất nhiên đã vượt mốc QUALIFIED.

test('F2-A) RAW -> HOT (1 lần sync, nhảy thẳng): ngay_quan_tam set, qualified_at set, hot_at set — cả 3 mốc cùng lúc, không mốc nào bị bỏ sót', () => {
  const patch = planCanonicalQualificationSync(customer(), computed('HOT', 90), '2026-01-01T00:00:00.000Z');
  assert.ok(patch);
  assert.equal(patch!.ngay_quan_tam, '2026-01-01T00:00:00.000Z');
  assert.equal(patch!.qualified_at, '2026-01-01T00:00:00.000Z', 'HOT đã tất nhiên vượt mốc QUALIFIED -> qualified_at PHẢI được set, không được bỏ sót chỉ vì status không "exactly QUALIFIED"');
  assert.equal(patch!.hot_at, '2026-01-01T00:00:00.000Z');
});

test('F2-B) INTERESTED -> HOT (nhảy thẳng, bỏ qua nấc QUALIFIED): ngay_quan_tam cũ được giữ nguyên, qualified_at set LẦN ĐẦU, hot_at set', () => {
  const already = customer({ qualification_status: 'INTERESTED', lead_quality_score: 40, ngay_quan_tam: '2026-01-01T00:00:00.000Z' });
  const patch = planCanonicalQualificationSync(already, computed('HOT', 90), '2026-02-01T00:00:00.000Z');
  assert.ok(patch);
  assert.equal(patch!.ngay_quan_tam, '2026-01-01T00:00:00.000Z', 'ngay_quan_tam đã set từ trước -> giữ nguyên, không ghi đè');
  assert.equal(patch!.qualified_at, '2026-02-01T00:00:00.000Z', 'qualified_at chưa từng set -> phải set LẦN ĐẦU dù nhảy thẳng qua HOT, không đi qua nấc QUALIFIED riêng');
  assert.equal(patch!.hot_at, '2026-02-01T00:00:00.000Z');
});

test('F2-C) QUALIFIED -> HOT: qualified_at đã set từ trước được GIỮ NGUYÊN (không set lại = now), chỉ hot_at set mới', () => {
  const already = customer({
    qualification_status: 'QUALIFIED', lead_quality_score: 65,
    ngay_quan_tam: '2026-01-01T00:00:00.000Z', qualified_at: '2026-01-15T00:00:00.000Z',
  });
  const patch = planCanonicalQualificationSync(already, computed('HOT', 90), '2026-02-01T00:00:00.000Z');
  assert.ok(patch);
  assert.equal(patch!.ngay_quan_tam, '2026-01-01T00:00:00.000Z');
  assert.equal(patch!.qualified_at, '2026-01-15T00:00:00.000Z', 'qualified_at đã đạt trước đó (QUALIFIED) -> PHẢI giữ nguyên mốc cũ, tuyệt đối không set lại = now');
  assert.equal(patch!.hot_at, '2026-02-01T00:00:00.000Z');
});

// --- G: score/rank/breakdown nội bộ nhất quán với trạng thái được chọn -------

test('G) khi sync xảy ra, lead_quality_score/lead_quality_rank/lead_score_breakdown LUÔN đi cùng bộ với qualification_status được chọn (không trộn từ 2 lần tính khác nhau)', () => {
  const patch = planCanonicalQualificationSync(customer(), computed('QUALIFIED', 72), '2026-01-01T00:00:00.000Z');
  assert.ok(patch);
  assert.equal(patch!.qualification_status, 'QUALIFIED');
  assert.equal(patch!.lead_quality_score, 72);
  assert.equal(patch!.lead_quality_rank, 'WARM');
  assert.equal(patch!.lead_score_breakdown, '[]');
});

test('G2) không average/không merge breakdown giữa canonical cũ và computed mới — patch trả về NGUYÊN breakdown của computed, không tham chiếu tới breakdown cũ', () => {
  const src = readFileSync(resolve('src/lib/crm-funnel/membership-workflow.ts'), 'utf8');
  const fnStart = src.indexOf('export function planCanonicalQualificationSync');
  const fnEnd = src.indexOf('\n}', fnStart);
  const fnBody = src.slice(fnStart, fnEnd);
  assert.doesNotMatch(fnBody, /average|Average|merge.*breakdown/i);
  assert.match(fnBody, /lead_score_breakdown: computed\.lead_score_breakdown,/);
});

// --- H/I: Handoff authority KHÔNG đổi ----------------------------------------

test('H) membership-workflow.ts (kể cả sau khi thêm sync) vẫn KHÔNG tự tạo CrmHandoff/Pipeline/gọi transitionHandoffTransactional dù Customer được promote lên INTERESTED/QUALIFIED/HOT', () => {
  const src = readFileSync(resolve('src/lib/crm-funnel/membership-workflow.ts'), 'utf8');
  const codeOnly = src.split('\n').filter(line => !line.trim().startsWith('//') && !line.trim().startsWith('*')).join('\n');
  assert.doesNotMatch(codeOnly, /tx\.crmHandoff|ensurePipeline|transitionHandoffTransactional/);
});

test('I) khachHang.update trong membership-workflow.ts CHỈ ghi qualification fields (status/score/rank/breakdown/3 mốc/row_version) — KHÔNG BAO GIỜ ghi ownership/handoff fields (sale_nhan_khach/trang_thai_ban_giao/ban_giao_luc/sale_xac_nhan_luc/lich_su_ban_giao) — ranh giới M1B.2 (Leader/Admin "Bàn giao" explicit) giữ nguyên', () => {
  const src = readFileSync(resolve('src/lib/crm-funnel/membership-workflow.ts'), 'utf8');
  const fnStart = src.indexOf('export function planCanonicalQualificationSync');
  const fnEnd = src.indexOf('\nexport interface CampaignContext');
  const fnBody = src.slice(fnStart, fnEnd);
  assert.doesNotMatch(fnBody, /sale_nhan_khach|trang_thai_ban_giao|ban_giao_luc|sale_xac_nhan_luc|lich_su_ban_giao/);
  for (const field of ['qualification_status', 'lead_quality_score', 'lead_quality_rank', 'lead_score_breakdown', 'ngay_quan_tam', 'qualified_at', 'hot_at', 'row_version']) {
    assert.match(fnBody, new RegExp(`${field}:`), `planCanonicalQualificationSync phải set field ${field}`);
  }
});

// --- J: non-Campaign workflow không đổi --------------------------------------

test('J) transactional-workflow.ts (Customer-global, non-Campaign) không bị đụng bởi CAMPAIGN_CUSTOMER_QUALIFICATION_SYNC — vẫn tự ghi trực tiếp qualification_status của chính nó, không qua planCanonicalQualificationSync/isQualificationPromotionOrEqual nào', () => {
  const src = readFileSync(resolve('src/lib/crm-funnel/transactional-workflow.ts'), 'utf8');
  assert.doesNotMatch(src, /planCanonicalQualificationSync|isQualificationPromotionOrEqual|membership-workflow/);
  assert.match(src, /export async function recordInteractionTransactional/);
  assert.match(src, /export async function updateQualificationTransactional/);
});

// --- K: Data tiềm năng Entry Gate không đổi ----------------------------------

test('K) analytics.ts (Data tiềm năng): DATA_TIEM_NANG_WHERE/Entry Gate/queryQualityLeads không bị đụng bởi task này — vẫn ĐÚNG 1 điều kiện qualification_status IN HANDOFF_ELIGIBLE_STATUSES, không tự thêm điều kiện Campaign nào', () => {
  const src = readFileSync(resolve('src/lib/crm-funnel/analytics.ts'), 'utf8');
  assert.match(src, /const DATA_TIEM_NANG_WHERE: Prisma\.KhachHangWhereInput = \{\s*\n\s*qualification_status: \{ in: \[\.\.\.HANDOFF_ELIGIBLE_STATUSES\] \},\s*\n\s*\};/);
  assert.doesNotMatch(src, /[Cc]ampaign/, 'queryQualityLeads() vẫn không được tham chiếu Campaign/CampaignMembership dưới bất kỳ hình thức nào — Data tiềm năng chỉ đọc KhachHang, khách Campaign vào ĐÚNG nhờ canonical qualification_status đã sync, không nhờ query đọc CampaignMembership');
});

// --- L: Customer lookup dùng canonical customer_id, KHÔNG dùng tên/sđt/email --

test('L) cả 2 writer transactional lookup canonical Customer qua membership.customer_id / id_khach_hang — KHÔNG match theo ten_KH/so_dien_thoai/email', () => {
  const src = readFileSync(resolve('src/lib/crm-funnel/membership-workflow.ts'), 'utf8');
  const matches = [...src.matchAll(/tx\.khachHang\.findUnique\(\{ where: \{ id_khach_hang: membership\.customer_id \} \}\)/g)];
  assert.equal(matches.length, 2, 'phải có ĐÚNG 2 lần lookup canonical Customer (1 cho interaction, 1 cho qualification), cùng dùng membership.customer_id -> id_khach_hang');
  assert.doesNotMatch(src, /where:\s*\{\s*(ten_KH|so_dien_thoai|email):/, 'KHÔNG được lookup Customer theo tên/số điện thoại/email');
});

// --- Transaction/atomicity ----------------------------------------------------

test('cả 2 writer transactional sync canonical Customer TRONG CÙNG transaction (tx.khachHang.update nằm trong cùng serializable(async tx => {...}) với tx.campaignMembership.update, không mở transaction thứ 2)', () => {
  const src = readFileSync(resolve('src/lib/crm-funnel/membership-workflow.ts'), 'utf8');
  const interactionStart = src.indexOf('export async function recordMembershipInteractionTransactional');
  const interactionEnd = src.indexOf('\n// --- Qualification', interactionStart);
  const interactionBody = src.slice(interactionStart, interactionEnd);
  assert.equal((interactionBody.match(/serializable\(async tx =>/g) || []).length, 1, 'recordMembershipInteractionTransactional chỉ mở đúng 1 transaction');
  assert.match(interactionBody, /campaignMembership\.update[\s\S]*khachHang\.update/, 'khachHang.update phải nằm SAU campaignMembership.update, trong CÙNG transaction callback');

  const qualStart = src.indexOf('export async function updateMembershipQualificationTransactional');
  const qualBody = src.slice(qualStart);
  assert.equal((qualBody.match(/serializable\(async tx =>/g) || []).length, 1, 'updateMembershipQualificationTransactional chỉ mở đúng 1 transaction');
  assert.match(qualBody, /campaignMembership\.update[\s\S]*khachHang\.update/, 'khachHang.update phải nằm SAU campaignMembership.update, trong CÙNG transaction callback');
});

test('idempotent replay (plan.idempotent === true) KHÔNG chạm tới canonical Customer — sync chỉ chạy trong nhánh !plan.idempotent', () => {
  const src = readFileSync(resolve('src/lib/crm-funnel/membership-workflow.ts'), 'utf8');
  const interactionStart = src.indexOf('export async function recordMembershipInteractionTransactional');
  const interactionEnd = src.indexOf('\n// --- Qualification', interactionStart);
  const interactionBody = src.slice(interactionStart, interactionEnd);
  const idempotentBranchStart = interactionBody.indexOf('return { membership, idempotent: true as const };');
  assert.ok(idempotentBranchStart > -1);
  assert.doesNotMatch(interactionBody.slice(idempotentBranchStart), /khachHang/);
});

// --- CUSTOMER_NOT_FOUND safety (không guess Customer) ------------------------

test('nếu canonical Customer không tồn tại (membership.customer_id không resolve được) -> throw CUSTOMER_NOT_FOUND, KHÔNG guess/skip im lặng, cùng error code convention với transitionHandoffTransactional', () => {
  const src = readFileSync(resolve('src/lib/crm-funnel/membership-workflow.ts'), 'utf8');
  const matches = [...src.matchAll(/if \(!customer\) throw new Error\('CUSTOMER_NOT_FOUND'\);/g)];
  assert.equal(matches.length, 2);
  const transactionalSrc = readFileSync(resolve('src/lib/crm-funnel/transactional-workflow.ts'), 'utf8');
  assert.match(transactionalSrc, /throw new Error\('CUSTOMER_NOT_FOUND'\);/, 'cùng error code convention đã có sẵn');
});

// --- Cross-flow downgrade audit (remediation item 2, READ-ONLY, KHÔNG đổi
// transactional-workflow.ts) — monotonic guard (isQualificationPromotionOrEqual)
// chỉ tồn tại ở phía Campaign sync (planCanonicalQualificationSync). Non-Campaign
// writer (recordInteractionTransactional/updateQualificationTransactional) ghi
// qualification_status/lead_quality_score/rank/breakdown KHÔNG ĐIỀU KIỆN — luôn
// theo kết quả tính MỚI NHẤT, bất kể canonical hiện tại đang mạnh hơn hay yếu
// hơn (kể cả khi canonical đó vừa được Campaign sync đưa lên HOT/QUALIFIED).
// Đây là hành vi ĐÃ CÓ TỪ TRƯỚC (không phải regression của task này) — bảo vệ
// đơn giản là "Campaign-only", KHÔNG phải "global across all writers". Quyết
// định có nên mở rộng guard sang non-Campaign hay không NẰM NGOÀI phạm vi
// remediation này (chờ quyết định riêng).

test('cross-flow: recordInteractionTransactional/updateQualificationTransactional KHÔNG dùng isQualificationPromotionOrEqual/planCanonicalQualificationSync nào — ghi qualification_status/score/rank/breakdown KHÔNG ĐIỀU KIỆN, không so sánh với canonical hiện tại trước khi ghi đè', () => {
  const src = readFileSync(resolve('src/lib/crm-funnel/transactional-workflow.ts'), 'utf8');
  assert.doesNotMatch(src, /isQualificationPromotionOrEqual|planCanonicalQualificationSync/);
  // Cả 2 writer đều gán thẳng field từ scoreResult/result — không có bất kỳ
  // biểu thức so sánh/điều kiện nào (VD "? ... : customer.qualification_status")
  // bọc quanh qualification_status/lead_quality_score/lead_quality_rank —
  // khác hẳn ngay_quan_tam/qualified_at/hot_at (3 dòng NGAY SAU đó, có điều
  // kiện monotonic riêng cho TỪNG MỐC, nhưng KHÔNG áp dụng cho status/score/
  // rank/breakdown chính).
  const unconditionalWrites = [...src.matchAll(/qualification_status: (scoreResult|result)\.qualificationStatus,/g)];
  assert.equal(unconditionalWrites.length, 2, 'cả recordInteractionTransactional và updateQualificationTransactional đều gán thẳng qualification_status, không qua điều kiện nào');
});

test('cross-flow CONFIRMED (báo cáo, không sửa): Customer đang HOT/QUALIFIED (kể cả do Campaign sync) -> 1 lần recordInteractionTransactional/updateQualificationTransactional sau đó tính ra QUALIFIED/INTERESTED/CONTACTED/UNQUALIFIED SẼ ghi đè canonical xuống thấp hơn — vì code path ghi thẳng "qualification_status: scoreResult.qualificationStatus"/"result.qualificationStatus" không có bất kỳ so sánh nào với customer.qualification_status hiện tại trước khi update', () => {
  const src = readFileSync(resolve('src/lib/crm-funnel/transactional-workflow.ts'), 'utf8');
  const interactionStart = src.indexOf('export async function recordInteractionTransactional');
  const interactionEnd = src.indexOf('export async function updateQualificationTransactional');
  const interactionBody = src.slice(interactionStart, interactionEnd);
  // Xác nhận: giữa lúc fetch customer (findUnique) và lúc update, không có
  // dòng nào so sánh customer.qualification_status/lead_quality_score với
  // scoreResult trước khi quyết định ghi — updated luôn = update() trực tiếp.
  assert.doesNotMatch(interactionBody, /customer\.qualification_status\s*(===|!==|>=|<=|>|<)/, 'không có so sánh nào với qualification_status hiện tại trước khi ghi đè -> XÁC NHẬN có thể downgrade');
  assert.doesNotMatch(interactionBody, /customer\.lead_quality_score\s*(===|!==|>=|<=|>|<)/, 'không có so sánh nào với lead_quality_score hiện tại trước khi ghi đè -> XÁC NHẬN có thể downgrade');
});

test('bảo vệ monotonic hiện tại là "Campaign-only", KHÔNG phải "global across all writers" — isQualificationPromotionOrEqual CHỈ được import/dùng bởi membership-workflow.ts', () => {
  const membershipSrc = readFileSync(resolve('src/lib/crm-funnel/membership-workflow.ts'), 'utf8');
  assert.match(membershipSrc, /import \{ calculateLeadQuality, isQualificationPromotionOrEqual, type ScoreableLead \} from '\.\/scoring';/);
  const scoringSrc = readFileSync(resolve('src/lib/crm-funnel/scoring.ts'), 'utf8');
  assert.match(scoringSrc, /export function isQualificationPromotionOrEqual/);
  const transactionalSrc = readFileSync(resolve('src/lib/crm-funnel/transactional-workflow.ts'), 'utf8');
  assert.doesNotMatch(transactionalSrc, /isQualificationPromotionOrEqual/, 'transactional-workflow.ts (non-Campaign) không import/dùng guard này — xác nhận guard chỉ bảo vệ chiều Campaign -> Customer, không bảo vệ non-Campaign -> Customer');
});
