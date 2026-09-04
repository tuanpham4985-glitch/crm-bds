import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { matchesPrivateGroupCustomerQueueFilter } from '../../src/lib/private-group-cskh-queue';
import { canActOnPrivateGroupCustomer } from '../../src/lib/private-group-cskh-authority';

// "Nhóm riêng" CSKH work queue (task hiện tại) — chế độ CSKH thứ 2 tại
// /phan-khach, cạnh Campaign (KHÔNG đụng CampaignCskhWorkQueue/membership-
// workflow.ts). Cùng kỹ thuật với private-group-api.test.ts: pure function
// unit-test được trực tiếp; server auth gate/schema DDL khoá bằng source-regex.

const SCHEMA_PATH = 'prisma/schema.prisma';
const PRIVATE_GROUP_LIB_PATH = 'src/lib/crm-funnel/private-group.ts';
const MEMBERSHIP_WORKFLOW_PATH = 'src/lib/crm-funnel/membership-workflow.ts';
const INTERACTION_ROUTE_PATH = 'src/app/api/private-groups/[id]/customers/[relationId]/interaction/route.ts';
const QUALIFICATION_ROUTE_PATH = 'src/app/api/private-groups/[id]/customers/[relationId]/qualification/route.ts';
const PHAN_KHACH_PAGE_PATH = 'src/app/phan-khach/page.tsx';
const WORK_QUEUE_PATH = 'src/components/crm/PrivateGroupCskhWorkQueue.tsx';

function read(path: string): string {
  return readFileSync(resolve(path), 'utf8');
}

// ─── matchesPrivateGroupCustomerQueueFilter — search/bucket (test bắt buộc #9) ─

function relation(overrides: Partial<Parameters<typeof matchesPrivateGroupCustomerQueueFilter>[0]> = {}) {
  return {
    customer: { ten_KH: 'Nguyen Van A', so_dien_thoai: '0901234567' },
    assigned_to_name: 'Sale A',
    trang_thai_cham_soc: 'Chưa gọi',
    ngay_lien_he_tiep: null,
    ...overrides,
  };
}

test('matchesPrivateGroupCustomerQueueFilter: search theo tên khách -> match', () => {
  assert.equal(matchesPrivateGroupCustomerQueueFilter(relation(), { search: 'nguyen van a' }), true);
});

test('matchesPrivateGroupCustomerQueueFilter: search theo SĐT -> match', () => {
  assert.equal(matchesPrivateGroupCustomerQueueFilter(relation(), { search: '0901234567' }), true);
});

test('matchesPrivateGroupCustomerQueueFilter: search theo Sale CSKH (assigned_to_name) -> match', () => {
  assert.equal(matchesPrivateGroupCustomerQueueFilter(relation(), { search: 'sale a' }), true);
});

test('matchesPrivateGroupCustomerQueueFilter: search không khớp -> false', () => {
  assert.equal(matchesPrivateGroupCustomerQueueFilter(relation(), { search: 'khong ton tai' }), false);
});

test('matchesPrivateGroupCustomerQueueFilter: search rỗng -> luôn match', () => {
  assert.equal(matchesPrivateGroupCustomerQueueFilter(relation(), { search: '' }), true);
});

test('matchesPrivateGroupCustomerQueueFilter: bucket khớp trang_thai_cham_soc -> match', () => {
  assert.equal(matchesPrivateGroupCustomerQueueFilter(relation({ trang_thai_cham_soc: 'Quan tâm' }), { bucket: 'Quan tâm' }), true);
});

test('matchesPrivateGroupCustomerQueueFilter: bucket không khớp -> false', () => {
  assert.equal(matchesPrivateGroupCustomerQueueFilter(relation({ trang_thai_cham_soc: 'Chưa gọi' }), { bucket: 'Quan tâm' }), false);
});

test('matchesPrivateGroupCustomerQueueFilter: cả search lẫn bucket phải cùng khớp (AND)', () => {
  const r = relation({ trang_thai_cham_soc: 'Quan tâm' });
  assert.equal(matchesPrivateGroupCustomerQueueFilter(r, { search: 'nguyen van a', bucket: 'Quan tâm' }), true);
  assert.equal(matchesPrivateGroupCustomerQueueFilter(r, { search: 'khong ton tai', bucket: 'Quan tâm' }), false);
});

// ─── canActOnPrivateGroupCustomer — client-safe gate (NEW policy: data nhóm
// dùng CHUNG cho cả nhóm cùng chăm sóc — WRITE = READ theo group membership,
// KHÔNG còn giới hạn entered_by/assigned_to) ────────────────────────────────

const ADMIN_ACTOR = { id_nhan_vien: 'U_ADMIN', ho_ten: 'Admin' };
const LEADER_ACTOR = { id_nhan_vien: 'U_LEADER', ho_ten: 'Leader' };
const SALE_A_ACTOR = { id_nhan_vien: 'U_SALE_A', ho_ten: 'Sale A' };
const SALE_B_ACTOR = { id_nhan_vien: 'U_SALE_B', ho_ten: 'Sale B' };
const OUTSIDER_ACTOR = { id_nhan_vien: 'U_OUTSIDER', ho_ten: 'Outsider' };
const GROUP = { leader_id: LEADER_ACTOR.id_nhan_vien };
const GROUP_MEMBERS = [
  { employee_id: SALE_A_ACTOR.id_nhan_vien },
  { employee_id: SALE_B_ACTOR.id_nhan_vien },
];

test('canActOnPrivateGroupCustomer: Admin luôn true (test bắt buộc #2 — Leader/Admin xem/act toàn bộ)', () => {
  const r = { entered_by_id: SALE_B_ACTOR.id_nhan_vien, assigned_to_id: SALE_B_ACTOR.id_nhan_vien };
  assert.equal(canActOnPrivateGroupCustomer(ADMIN_ACTOR, true, GROUP, r, GROUP_MEMBERS), true);
});

test('canActOnPrivateGroupCustomer: Leader của ĐÚNG group -> true dù không phải entered_by/assigned_to (test bắt buộc #2)', () => {
  const r = { entered_by_id: SALE_A_ACTOR.id_nhan_vien, assigned_to_id: SALE_B_ACTOR.id_nhan_vien };
  assert.equal(canActOnPrivateGroupCustomer(LEADER_ACTOR, false, GROUP, r, GROUP_MEMBERS), true);
});

test('canActOnPrivateGroupCustomer: Sale A act ĐƯỢC customer của Sale B trong CÙNG group (NEW policy — thay thế rule cũ "chỉ entered_by/assigned_to"; VD Sale A note buổi chiều tiếp nối note Sale B ghi buổi sáng)', () => {
  const r = { entered_by_id: SALE_B_ACTOR.id_nhan_vien, assigned_to_id: SALE_B_ACTOR.id_nhan_vien };
  assert.equal(canActOnPrivateGroupCustomer(SALE_A_ACTOR, false, GROUP, r, GROUP_MEMBERS), true);
});

test('canActOnPrivateGroupCustomer: Sale act được customer chính mình nhập hoặc được giao (vẫn đúng — nay chỉ là 1 trong các lý do dẫn tới true, không còn là ĐIỀU KIỆN DUY NHẤT)', () => {
  const entered = { entered_by_id: SALE_A_ACTOR.id_nhan_vien, assigned_to_id: SALE_B_ACTOR.id_nhan_vien };
  const assigned = { entered_by_id: SALE_B_ACTOR.id_nhan_vien, assigned_to_id: SALE_A_ACTOR.id_nhan_vien };
  assert.equal(canActOnPrivateGroupCustomer(SALE_A_ACTOR, false, GROUP, entered, GROUP_MEMBERS), true);
  assert.equal(canActOnPrivateGroupCustomer(SALE_A_ACTOR, false, GROUP, assigned, GROUP_MEMBERS), true);
});

test('canActOnPrivateGroupCustomer: Sale NGOÀI nhóm (không phải Leader/member) và không phải entered_by/assigned_to -> false (ranh giới duy nhất còn lại)', () => {
  const r = { entered_by_id: SALE_A_ACTOR.id_nhan_vien, assigned_to_id: SALE_A_ACTOR.id_nhan_vien };
  assert.equal(canActOnPrivateGroupCustomer(OUTSIDER_ACTOR, false, GROUP, r, GROUP_MEMBERS), false);
});

test('canActOnPrivateGroupCustomer: actor null -> false, không throw', () => {
  const r = { entered_by_id: SALE_A_ACTOR.id_nhan_vien, assigned_to_id: SALE_A_ACTOR.id_nhan_vien };
  assert.equal(canActOnPrivateGroupCustomer(null, false, GROUP, r, GROUP_MEMBERS), false);
});

// ─── Schema — additive fields, KHÔNG đụng cột đã có (test bắt buộc #4/#8) ────

test('schema: PrivateGroupCustomer CSKH fields mirror ĐÚNG tên với CampaignMembership (để tái dùng scoring.ts/membership-workflow.ts pure function)', () => {
  const schema = read(SCHEMA_PATH);
  const start = schema.indexOf('model PrivateGroupCustomer {');
  const end = schema.indexOf('\n}', start);
  const body = schema.slice(start, end);
  for (const field of [
    'trang_thai_cham_soc', 'muc_do_quan_tam', 'so_lan_lien_he', 'lich_su_cham_soc',
    'ngay_lien_he_cuoi', 'ngay_lien_he_tiep', 'qualification_status', 'lead_quality_score',
    'lead_quality_rank', 'lead_score_breakdown', 'lead_score_history',
    'san_pham_quan_tam', 'nhu_cau', 'ngan_sach_min', 'ngan_sach_max', 'muc_dich',
    'thoi_gian_du_kien', 'phuong_an_tai_chinh', 'khu_vuc_yeu_cau', 'hanh_dong_tiep_theo', 'row_version',
  ]) {
    assert.match(body, new RegExp(`\\b${field}\\b`), `PrivateGroupCustomer thiếu field ${field}`);
  }
});

test('schema: PrivateGroupCustomer CSKH fields KHÔNG có assignment_status/telesale_id/outcome/handoff_id là FIELD THẬT (Private Group không dùng CSKH work-queue assignment hay Handoff) — chỉ check field declaration, không check comment giải thích lý do omit', () => {
  const schema = read(SCHEMA_PATH);
  const start = schema.indexOf('model PrivateGroupCustomer {');
  const end = schema.indexOf('\n}', start);
  const body = schema.slice(start, end);
  // Field declaration thật bắt đầu dòng bằng tên field rồi whitespace rồi kiểu
  // (VD "  outcome   String?") — KHÔNG match được câu comment liệt kê tên field
  // trong 1 đoạn văn (VD "// KHÔNG có ... outcome/handoff_id ...").
  assert.doesNotMatch(body, /^\s*(assignment_status|telesale_id|outcome|handoff_id)\s+\S/m);
});

test('schema: PrivateGroupCustomer.customer_id vẫn @unique (task hiện tại KHÔNG đụng invariant 1 Customer -> tối đa 1 Private Group)', () => {
  const schema = read(SCHEMA_PATH);
  const start = schema.indexOf('model PrivateGroupCustomer {');
  const end = schema.indexOf('\n}', start);
  const body = schema.slice(start, end);
  assert.match(body, /customer_id\s+String\s+@unique/);
});

test('migration: file migration mới additive (ALTER TABLE ... ADD COLUMN IF NOT EXISTS), KHÔNG sửa migration 20260903000001 đã apply production', () => {
  const migration = read('prisma/migrations/20260903000002_add_private_group_cskh/migration.sql');
  assert.match(migration, /ALTER TABLE "private_group_customers"/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS/);
  assert.doesNotMatch(migration, /DROP COLUMN|DROP TABLE|RENAME (COLUMN|TABLE)/i);
  const oldMigration = read('prisma/migrations/20260903000001_add_private_groups/migration.sql');
  assert.doesNotMatch(oldMigration, /trang_thai_cham_soc/, 'migration cũ (đã apply production) không được sửa để thêm field mới');
});

// ─── private-group.ts — reuse đúng, KHÔNG side effect Campaign/Handoff/Pipeline (test bắt buộc #5/#6/#8/#11) ─

test('private-group.ts: recordPrivateGroupCustomerInteractionTransactional/updatePrivateGroupCustomerQualificationTransactional tái dùng planMembershipInteraction/planMembershipQualification (KHÔNG viết lại công thức scoring/idempotency lần 2)', () => {
  const src = read(PRIVATE_GROUP_LIB_PATH);
  assert.match(src, /planMembershipInteraction\(relation, context, input\)/);
  assert.match(src, /planMembershipQualification\(relation, context, input\)/);
});

test('private-group.ts: CSKH work queue CHỈ ghi vào tx.privateGroupCustomer — KHÔNG đụng tx.campaignMembership/tx.crmHandoff/tx.pipeline (test bắt buộc #5/#11)', () => {
  const src = read(PRIVATE_GROUP_LIB_PATH);
  assert.doesNotMatch(src, /tx\.campaignMembership\./);
  assert.doesNotMatch(src, /tx\.crmHandoff\./);
  assert.doesNotMatch(src, /tx\.pipeline\./);
  assert.match(src, /tx\.privateGroupCustomer\.update\(/);
});

test('private-group.ts: interaction ghi so_lan_lien_he increment + row_version increment (test bắt buộc #7)', () => {
  const src = read(PRIVATE_GROUP_LIB_PATH);
  const fnStart = src.indexOf('export async function recordPrivateGroupCustomerInteractionTransactional');
  const fnBody = src.slice(fnStart, fnStart + 900);
  assert.match(fnBody, /so_lan_lien_he:\s*\{\s*increment:\s*1\s*\}/);
  assert.match(fnBody, /row_version:\s*\{\s*increment:\s*1\s*\}/);
});

test('private-group.ts: interaction/qualification đều validate relation.group_id === input.groupId TRƯỚC khi ghi — relationId thuộc nhóm khác bị chặn (test bắt buộc #4 authority, tránh cross-group write)', () => {
  const src = read(PRIVATE_GROUP_LIB_PATH);
  const matches = src.match(/relation\.group_id !== input\.groupId/g) || [];
  assert.equal(matches.length, 2, 'phải có đúng 2 chỗ check (interaction + qualification)');
});

test('membership-workflow.ts (Campaign, KHÔNG bị sửa bởi task này) KHÔNG đụng tx.privateGroupCustomer — 2 context hoàn toàn tách biệt về persistence (test bắt buộc #6)', () => {
  const src = read(MEMBERSHIP_WORKFLOW_PATH);
  assert.doesNotMatch(src, /privateGroupCustomer/);
});

// ─── API routes — permission gate + error mapping (test bắt buộc #10) ───────

test('POST .../interaction: 401 nếu chưa đăng nhập, gate canActOnPrivateGroupCustomer(user, group, relation, members) TRƯỚC khi ghi, 403 nếu không có quyền (test bắt buộc #10)', () => {
  const src = read(INTERACTION_ROUTE_PATH);
  assert.match(src, /if\s*\(!user\)\s*return NextResponse\.json\(\{ success: false, error: 'Chưa đăng nhập' \}, \{ status: 401 \}\);/);
  assert.match(src, /if\s*\(!canActOnPrivateGroupCustomer\(user, group, relation, members\)\)/);
  const idx = src.indexOf('if (!canActOnPrivateGroupCustomer(user, group, relation, members))');
  assert.match(src.slice(idx, idx + 200), /status:\s*403/);
});

test('PUT .../qualification: 401 nếu chưa đăng nhập, gate canActOnPrivateGroupCustomer(user, group, relation, members) TRƯỚC khi ghi, 403 nếu không có quyền, validateQualificationInput chặn score/rank/status tự nhập (test bắt buộc #10)', () => {
  const src = read(QUALIFICATION_ROUTE_PATH);
  assert.match(src, /if\s*\(!user\)\s*return NextResponse\.json\(\{ success: false, error: 'Chưa đăng nhập' \}, \{ status: 401 \}\);/);
  assert.match(src, /if\s*\(!canActOnPrivateGroupCustomer\(user, group, relation, members\)\)/);
  assert.match(src, /validateQualificationInput\(body\)/);
});

test('interaction/qualification routes: gọi ĐÚNG canActOnPrivateGroupCustomer (tên hàm riêng cho WRITE) — KHÔNG gọi thẳng canViewGroupCustomer — dù bên dưới (private-group-auth.ts) giờ 2 hàm cùng logic theo policy mới, route vẫn giữ tên ngữ nghĩa rõ ràng, đã fetch members qua listPrivateGroupMembers TRƯỚC khi gate', () => {
  for (const path of [INTERACTION_ROUTE_PATH, QUALIFICATION_ROUTE_PATH]) {
    const src = read(path);
    assert.doesNotMatch(src, /canViewGroupCustomer\(/, `${path} không được GỌI thẳng canViewGroupCustomer(...) để gate WRITE`);
    assert.match(src, /const members = await listPrivateGroupMembers\(id\);/);
  }
});

test('interaction/qualification routes: relationId không thuộc group trên URL -> 404, KHÔNG lộ dữ liệu nhóm khác', () => {
  for (const path of [INTERACTION_ROUTE_PATH, QUALIFICATION_ROUTE_PATH]) {
    const src = read(path);
    assert.match(src, /relation\.group_id !== id/);
  }
});

// ─── /phan-khach — toggle Campaign | Nhóm riêng (test bắt buộc #1/#9) ────────

test('phan-khach/page.tsx: toggle CHỈ 2 lựa chọn hiển thị "Campaign"/"Nhóm riêng" (không hiện "Theo Dự án")', () => {
  const src = read(PHAN_KHACH_PAGE_PATH);
  assert.match(src, />Campaign</);
  assert.match(src, /Nhóm riêng/);
  assert.match(src, /mode !== 'project'/);
});

test('phan-khach/page.tsx: mode "private_group" render PrivateGroupCskhWorkQueue', () => {
  const src = read(PHAN_KHACH_PAGE_PATH);
  assert.match(src, /mode === 'private_group' \? <PrivateGroupCskhWorkQueue/);
});

test('PrivateGroupCskhWorkQueue.tsx: dùng GET /api/private-groups (list nhóm actor được xem) — KHÔNG tự chế danh sách nhóm ở client', () => {
  const src = read(WORK_QUEUE_PATH);
  assert.match(src, /fetch\('\/api\/private-groups'\)/);
  assert.match(src, /fetch\(`\/api\/private-groups\/\$\{id\}\/customers`\)/);
});
