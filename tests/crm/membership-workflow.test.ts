import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { canManageMembership, isMembershipDirectManager } from '../../src/lib/crm-auth';
import type { CrmSessionUser } from '../../src/lib/crm-auth';
import { buildMembershipScoreInput, planMembershipInteraction, planMembershipQualification } from '../../src/lib/crm-funnel/membership-workflow';
import { calculateLeadQuality } from '../../src/lib/crm-funnel/scoring';
import { bucketOf } from '../../src/lib/campaign-cskh-bucket';
import type { NhanVien } from '../../src/lib/types';

const actorA: CrmSessionUser = { id_nhan_vien: 'TS_A', ho_ten: 'Lan', email: 'a@x.com', vai_tro: 'Telesale' };
const actorB: CrmSessionUser = { id_nhan_vien: 'TS_B', ho_ten: 'Hương', email: 'b@x.com', vai_tro: 'Telesale' };

function membershipFixture(overrides: Record<string, unknown> = {}) {
  return {
    san_pham_quan_tam: null, nhu_cau: null, ngan_sach_min: null, ngan_sach_max: null,
    muc_dich: null, thoi_gian_du_kien: null, phuong_an_tai_chinh: null, khu_vuc_yeu_cau: null,
    hanh_dong_tiep_theo: null, muc_do_quan_tam: 'Chưa xác định' as const, trang_thai_cham_soc: 'Chưa gọi' as const,
    lich_su_cham_soc: null, lead_score_history: null, lead_quality_score: 0, lead_quality_rank: 'UNQUALIFIED',
    ...overrides,
  };
}

// --- 1 & 2: multi-Campaign isolation ---------------------------------------

test('1) cùng 1 Customer trong Campaign A và Campaign B có CSKH state hoàn toàn độc lập', () => {
  const membershipA = membershipFixture();
  const membershipB = membershipFixture();
  const planA = planMembershipInteraction(membershipA, { ten_du_an: 'Green Paradise' }, {
    idempotencyKey: 'kA', result: 'Quan tâm', interest: 'Cao', note: 'A quan tâm', actor: actorA, now: '2026-01-01T00:00:00.000Z',
  });
  const planB = planMembershipInteraction(membershipB, { ten_du_an: 'Xuân Phú' }, {
    idempotencyKey: 'kB', result: 'Không phù hợp', interest: 'Thấp', note: 'B từ chối', actor: actorB, now: '2026-01-01T00:00:00.000Z',
  });
  assert.equal(planA.idempotent, false);
  assert.equal(planB.idempotent, false);
  if (planA.idempotent || planB.idempotent) return;
  assert.equal(planA.patch.trang_thai_cham_soc, 'Quan tâm');
  assert.equal(planB.patch.trang_thai_cham_soc, 'Không phù hợp');
  assert.notEqual(planA.patch.qualification_status, planB.patch.qualification_status);
  assert.ok(!planB.patch.lich_su_cham_soc.includes('A quan tâm'), 'lịch sử B không được lẫn dữ liệu của A');
  assert.ok(!planA.patch.lich_su_cham_soc.includes('B từ chối'), 'lịch sử A không được lẫn dữ liệu của B');
});

test('2) interaction ở Campaign A không thể mutate membership của Campaign B — không có tham chiếu chung, object B giữ nguyên', () => {
  const membershipA = membershipFixture();
  const membershipB = membershipFixture();
  const planA = planMembershipInteraction(membershipA, { ten_du_an: 'A' }, {
    idempotencyKey: 'kA2', result: 'Quan tâm', interest: 'Rất cao', note: 'ghi chú A', actor: actorA,
  });
  assert.equal(planA.idempotent, false);
  if (planA.idempotent) return;
  const updatedA = { ...membershipA, ...planA.patch };
  assert.equal(membershipB.trang_thai_cham_soc, 'Chưa gọi', 'B không hề bị đụng vào');
  assert.notEqual(updatedA.trang_thai_cham_soc, membershipB.trang_thai_cham_soc);
});

// --- 3 & 4: authorization ----------------------------------------------------

test('3) Telesale A không bao giờ thao tác được membership đang gán cho Telesale B', () => {
  const campaign = { owner_name: 'Manager X' };
  const membership = { telesale_id: 'TS_B' };
  assert.equal(canManageMembership(actorA, membership, campaign), false);
  assert.equal(canManageMembership(actorB, membership, campaign), true);
});

test('4) Admin/Campaign owner luôn quản lý được mọi membership, bất kể telesale_id', () => {
  const admin: CrmSessionUser = { id_nhan_vien: 'ADMIN1', ho_ten: 'Sếp', email: 'admin@x.com', vai_tro: 'Admin' };
  const owner: CrmSessionUser = { id_nhan_vien: 'OWN1', ho_ten: 'Manager X', email: 'owner@x.com', vai_tro: 'Sale' };
  const campaign = { owner_name: 'Manager X' };
  const membership = { telesale_id: 'someone-else' };
  assert.equal(canManageMembership(admin, membership, campaign), true);
  assert.equal(canManageMembership(owner, membership, campaign), true);
  assert.equal(canManageMembership(actorA, membership, campaign), false);
});

test('4b) isMembershipDirectManager: quản lý trực tiếp của ĐÚNG Telesale được gán mới thao tác được, người khác thì không', () => {
  const employees: NhanVien[] = [
    { id_nhan_vien: 'TS_A', ho_ten: 'Lan', ql_truc_tiep: 'Quản lý A', so_dien_thoai: '', email: '', vai_tro: 'Telesale', employee_type: 'Telesale', trang_thai: 'Đang làm', ngay_tao: '' },
  ];
  const rightManager: CrmSessionUser = { id_nhan_vien: 'M1', ho_ten: 'Quản lý A', email: 'm1@x.com', vai_tro: 'User' };
  const stranger: CrmSessionUser = { id_nhan_vien: 'M2', ho_ten: 'Người khác', email: 'm2@x.com', vai_tro: 'User' };
  assert.equal(isMembershipDirectManager(rightManager, { telesale_id: 'TS_A' }, employees), true);
  assert.equal(isMembershipDirectManager(stranger, { telesale_id: 'TS_A' }, employees), false);
  assert.equal(isMembershipDirectManager(rightManager, { telesale_id: null }, employees), false);
});

// --- 5 & 6: interaction history / idempotency / callback --------------------

test('5) interaction: gọi lại đúng idempotency_key -> idempotent, không tạo thêm entry lịch sử', () => {
  const membership = membershipFixture();
  const input = { idempotencyKey: 'same-key', result: 'Đã liên hệ' as const, interest: 'Trung bình' as const, note: 'lần đầu', actor: actorA, now: '2026-01-01T00:00:00.000Z' };
  const plan1 = planMembershipInteraction(membership, {}, input);
  assert.equal(plan1.idempotent, false);
  if (plan1.idempotent) return;
  const updated = { ...membership, ...plan1.patch };
  const history = JSON.parse(updated.lich_su_cham_soc) as { id: string }[];
  assert.equal(history.length, 1);
  assert.equal(history[0].id, 'CS_same-key');

  const plan2 = planMembershipInteraction(updated, {}, input);
  assert.equal(plan2.idempotent, true, 'gọi lại đúng idempotency_key không được tạo entry thứ 2');
});

test('6) callback/hẹn gọi lại: ngay_lien_he_tiep set đúng khi có nextContact, null khi không truyền', () => {
  const membership = membershipFixture();
  const withCallback = planMembershipInteraction(membership, {}, {
    idempotencyKey: 'k1', result: 'Gọi lại', interest: 'Chưa xác định', note: '', nextContact: '2026-02-01T09:00:00.000Z', actor: actorA,
  });
  assert.equal(withCallback.idempotent, false);
  if (!withCallback.idempotent) assert.equal(withCallback.patch.ngay_lien_he_tiep, '2026-02-01T09:00:00.000Z');

  const withoutCallback = planMembershipInteraction(membership, {}, {
    idempotencyKey: 'k2', result: 'Đã liên hệ', interest: 'Chưa xác định', note: '', actor: actorA,
  });
  assert.equal(withoutCallback.idempotent, false);
  if (!withoutCallback.idempotent) assert.equal(withoutCallback.patch.ngay_lien_he_tiep, null);
});

// --- 7: scoring reuse --------------------------------------------------------

test('7) scoring reuse: cùng bộ giá trị Customer-shaped và Membership-shaped cho ra CÙNG điểm số (không đổi công thức)', () => {
  const shared = {
    san_pham_quan_tam: 'Căn 2PN', nhu_cau: 'Ở thực', ngan_sach_min: 2_000_000_000, ngan_sach_max: 3_000_000_000,
    muc_dich: 'Để ở', thoi_gian_du_kien: 'Trong 1 tháng', phuong_an_tai_chinh: 'Vốn 50%, vay 50%',
    khu_vuc_yeu_cau: 'Quận 2', hanh_dong_tiep_theo: 'Hẹn xem nhà', muc_do_quan_tam: 'Rất cao', trang_thai_cham_soc: 'Quan tâm',
  };
  const customerShapedScore = calculateLeadQuality({ ...shared, du_an: 'Dự án A' });
  const membershipShapedScore = calculateLeadQuality(buildMembershipScoreInput(shared, { ten_du_an: 'Dự án A' }));
  assert.deepEqual(membershipShapedScore, customerShapedScore);
  assert.equal(membershipShapedScore.score, 100);
  assert.equal(membershipShapedScore.rank, 'HOT');
});

test('7b) planMembershipQualification: recompute điểm sau patch, idempotent theo idempotency_key trong lead_score_history', () => {
  const membership = membershipFixture();
  const input = { idempotencyKey: 'q1', patch: { nhu_cau: 'Ở thực', muc_do_quan_tam: 'Cao' as const }, actor: actorA, now: '2026-01-01T00:00:00.000Z' };
  const plan1 = planMembershipQualification(membership, { ten_du_an: 'Dự án A' }, input);
  assert.equal(plan1.idempotent, false);
  if (plan1.idempotent) return;
  assert.ok(plan1.score.score > 0);
  const updated = { ...membership, ...plan1.patch };
  const plan2 = planMembershipQualification(updated, { ten_du_an: 'Dự án A' }, input);
  assert.equal(plan2.idempotent, true);
});

// --- 8: INTERESTED persists, no handoff -------------------------------------

test('8) membership đạt INTERESTED/QUALIFIED/HOT: patch không chứa bất kỳ field/side-effect handoff nào', () => {
  const membership = membershipFixture();
  const plan = planMembershipInteraction(membership, {}, { idempotencyKey: 'k', result: 'Quan tâm', interest: 'Rất cao', note: '', actor: actorA });
  assert.equal(plan.idempotent, false);
  if (plan.idempotent) return;
  assert.ok(['INTERESTED', 'QUALIFIED', 'HOT'].includes(plan.patch.qualification_status));
  assert.ok(!('handoff_id' in plan.patch));
  assert.ok(!('sale_nhan_khach' in plan.patch));
});

test('8b) membership-workflow.ts không gọi bất kỳ API CrmHandoff/Pipeline nào — M1B.1 không được kích hoạt handoff (chỉ cho phép NHẮC tới trong comment giải thích)', () => {
  const src = readFileSync(resolve('src/lib/crm-funnel/membership-workflow.ts'), 'utf8');
  const codeOnly = src.split('\n').filter(line => !line.trim().startsWith('//') && !line.trim().startsWith('*')).join('\n');
  assert.doesNotMatch(codeOnly, /tx\.crmHandoff|tx\.pipeline|ensurePipeline\(/);
});

// --- 9 & 10: legacy compatibility --------------------------------------------

test('9) membership-workflow.ts KHÔNG BAO GIỜ ghi vào KhachHang — mọi update chỉ target campaignMembership.id', () => {
  const src = readFileSync(resolve('src/lib/crm-funnel/membership-workflow.ts'), 'utf8');
  assert.doesNotMatch(src, /khachHang\.(update|create)/);
  assert.match(src, /campaignMembership\.update/);
  assert.match(src, /where: \{ id: input\.membershipId \}/);
});

test('10) legacy Customer-global CSKH workflow (transactional-workflow.ts) không bị đụng vào bởi M1B.1', () => {
  const src = readFileSync(resolve('src/lib/crm-funnel/transactional-workflow.ts'), 'utf8');
  assert.match(src, /export async function recordInteractionTransactional/);
  assert.match(src, /export async function updateQualificationTransactional/);
  assert.match(src, /export async function transitionHandoffTransactional/);
  assert.match(src, /export async function assignTelesaleTransactional/);
  assert.doesNotMatch(src, /membership-workflow/, 'transactional-workflow.ts không được phụ thuộc vào module membership mới');
});

// --- 11: work-queue bucket derivation ----------------------------------------

test('11) bucketOf: phân loại đúng cả 6 nhóm CSKH theo Campaign, không cần cột trạng thái riêng', () => {
  // Dùng Date(year, month, day, ...) theo local time (không phải chuỗi ISO UTC
  // cố định) để so sánh "cùng ngày"/"quá hạn" nhất quán bất kể timezone máy chạy test.
  const now = new Date(2026, 5, 15, 12, 0, 0);
  const laterSameDay = new Date(2026, 5, 15, 18, 0, 0).toISOString();
  const fiveDaysAgo = new Date(2026, 5, 10, 18, 0, 0).toISOString();
  const fiveDaysAhead = new Date(2026, 5, 20, 0, 0, 0).toISOString();

  assert.equal(bucketOf({ trang_thai_cham_soc: 'Chưa gọi', ngay_lien_he_tiep: null }, now), 'Chưa gọi');
  assert.equal(bucketOf({ trang_thai_cham_soc: null, ngay_lien_he_tiep: null }, now), 'Chưa gọi');
  assert.equal(bucketOf({ trang_thai_cham_soc: 'Gọi lại', ngay_lien_he_tiep: laterSameDay }, now), 'Gọi lại hôm nay');
  assert.equal(bucketOf({ trang_thai_cham_soc: 'Gọi lại', ngay_lien_he_tiep: fiveDaysAgo }, now), 'Quá lịch');
  assert.equal(bucketOf({ trang_thai_cham_soc: 'Đã liên hệ', ngay_lien_he_tiep: fiveDaysAhead }, now), 'Đang chăm sóc');
  assert.equal(bucketOf({ trang_thai_cham_soc: 'Không nghe máy', ngay_lien_he_tiep: null }, now), 'Đang chăm sóc');
  assert.equal(bucketOf({ trang_thai_cham_soc: 'Quan tâm', ngay_lien_he_tiep: null }, now), 'Quan tâm');
  assert.equal(bucketOf({ trang_thai_cham_soc: 'Không phù hợp', ngay_lien_he_tiep: null }, now), 'Hoàn tất / Không phù hợp');
  assert.equal(bucketOf({ trang_thai_cham_soc: 'Sai số', ngay_lien_he_tiep: null }, now), 'Hoàn tất / Không phù hợp');
});

// --- 12: migration safety -----------------------------------------------------

test('12) migration CampaignMembership qualification fields là additive, không backfill/inference từ khach_hang', () => {
  const sql = readFileSync(resolve('prisma/migrations/20260826000002_add_campaign_membership_qualification_fields/migration.sql'), 'utf8');
  assert.doesNotMatch(sql, /\bDROP\b|TRUNCATE|DELETE\s+FROM|ALTER COLUMN.*NOT NULL|UPDATE\s+"campaign_memberships"/i);
  // Comment giải thích được phép nhắc "khach_hang" (không backfill từ đó) —
  // chỉ cấm THAM CHIẾU BẢNG thật (định danh có dấu ngoặc kép trong SQL).
  assert.doesNotMatch(sql, /"khach_hang"/);
  for (const column of ['san_pham_quan_tam', 'nhu_cau', 'ngan_sach_min', 'ngan_sach_max', 'muc_dich', 'thoi_gian_du_kien', 'phuong_an_tai_chinh', 'khu_vuc_yeu_cau', 'hanh_dong_tiep_theo']) {
    assert.match(sql, new RegExp(`ADD COLUMN IF NOT EXISTS "${column}"`));
  }
  assert.match(sql, /ADD COLUMN IF NOT EXISTS "row_version" INTEGER NOT NULL DEFAULT 0/);
});
