import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { campaignOwnerFieldsTouched, canManageCampaign, customerDeleteBlockReason, isCrmAdmin } from '../../src/lib/crm-auth';
import { planBulkDistribution, planDistribution } from '../../src/lib/crm-funnel/campaign';
import type { KhachHang, Pipeline } from '../../src/lib/types';

function customer(overrides: Partial<KhachHang> = {}): KhachHang {
  return {
    id_khach_hang: 'KH1', ngay_tao: '2026-01-01', ten_KH: 'Nguyễn Văn A', so_dien_thoai: '0901234567',
    email: '', nguon: '', nhu_cau: '', ghi_chu: '', sale_phu_trach: '', label_khach: 'A - 0901234567',
    trang_thai_ban_giao: 'Chưa bàn giao', so_lan_lien_he: 0, lich_su_cham_soc: '[]', lich_su_ban_giao: '[]',
    ...overrides,
  };
}

const MIGRATION_PATH = 'prisma/migrations/20260826000001_add_campaign_foundation/migration.sql';

// --- Schema / migration safety ------------------------------------------

test('Campaign migration là additive: 2 bảng mới + 1 cột nullable trên crm_handoffs, không có statement phá hoại', () => {
  const sql = readFileSync(resolve(MIGRATION_PATH), 'utf8');
  assert.doesNotMatch(sql, /\bDROP\b|TRUNCATE|DELETE\s+FROM|ALTER COLUMN.*NOT NULL/i);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS "campaign_membership_id" TEXT/);
  assert.doesNotMatch(sql, /"campaign_membership_id" TEXT NOT NULL/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "campaigns"/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "campaign_memberships"/);
});

test('CampaignMembership có unique(customer_id, campaign_id) ở cả schema.prisma lẫn migration.sql -> DB tự chặn duplicate membership cùng 1 campaign', () => {
  const schema = readFileSync(resolve('prisma/schema.prisma'), 'utf8');
  assert.match(schema, /@@unique\(\[customer_id, campaign_id\]\)/);
  const sql = readFileSync(resolve(MIGRATION_PATH), 'utf8');
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS "campaign_memberships_customer_id_campaign_id_key" ON "campaign_memberships"\("customer_id", "campaign_id"\)/);
});

test('CampaignMembership KHÔNG có unique riêng trên customer_id -> 1 customer được phép có membership ở nhiều campaign khác nhau (Campaign A + Campaign B)', () => {
  const schema = readFileSync(resolve('prisma/schema.prisma'), 'utf8');
  const start = schema.indexOf('model CampaignMembership');
  const closeMatch = /\r?\n\}\r?\n/.exec(schema.slice(start)); // đóng khối model — chấp nhận cả CRLF lẫn LF
  const block = closeMatch ? schema.slice(start, start + closeMatch.index) : schema.slice(start, start + 2200);
  assert.doesNotMatch(block, /customer_id\s+String\s+@unique(?!\w)/);
});

test('bulkAddAndDistribute pre-filter existing memberships (mọi assignment_status) trước khi tạo (+ skipDuplicates) -> chạy lại cùng input là idempotent, không tạo trùng', () => {
  const src = readFileSync(resolve('src/lib/crm-funnel/campaign.ts'), 'utf8');
  assert.match(src, /existingMemberships = orderedIds\.length/);
  assert.match(src, /membershipByCustomer\.has\(item\.customer_id\)/);
  assert.match(src, /skipDuplicates: true/);
  // Membership ASSIGNED có sẵn tuyệt đối không bị update lại (chỉ update khi vẫn còn UNASSIGNED).
  assert.match(src, /assignment_status: 'UNASSIGNED' },\s*\n\s*data: {/);
  // Không bao giờ tạo customer mới trong hàm này.
  assert.doesNotMatch(src, /khachHang\.create/);
});

test('getCampaignMembershipCustomerRefs không throw khi Postgres CRM chưa bật -> delete guard luôn hoạt động được bất kể Campaign feature đã bật hay chưa', () => {
  const src = readFileSync(resolve('src/lib/crm-funnel/campaign.ts'), 'utf8');
  const fnStart = src.indexOf('export async function getCampaignMembershipCustomerRefs');
  const fnBody = src.slice(fnStart, fnStart + 400);
  assert.match(fnBody, /if \(!isPostgresEnabled\('crm'\)[^)]*\) return \[\];/);
  assert.doesNotMatch(fnBody, /assertTransactionalCrm/);
});

test('cả 4 route xóa customer (single-delete, bulk-delete, import-batch preview, import-batch delete) đều lấy campaignMemberships -> guard mới có hiệu lực ở mọi đường xóa, không chỉ 1 chỗ', () => {
  const files = [
    'src/app/api/khach-hang/route.ts',
    'src/app/api/khach-hang/bulk-delete/route.ts',
    'src/app/api/khach-hang/import-batches/[id]/route.ts',
    'src/app/api/khach-hang/import-batches/[id]/delete/route.ts',
  ];
  for (const file of files) {
    const src = readFileSync(resolve(file), 'utf8');
    assert.match(src, /getCampaignMembershipCustomerRefs/, `${file} phải gọi getCampaignMembershipCustomerRefs`);
  }
});

// --- planDistribution: thuần, không đụng DB ------------------------------

const TS = (id: string, name: string) => ({ id_nhan_vien: id, ho_ten: name });

test('round_robin: deterministic đúng thứ tự — customerIds[i] -> telesales[i % n]', () => {
  const plan = planDistribution({
    customerIds: ['C1', 'C2', 'C3', 'C4', 'C5'],
    telesales: [TS('T1', 'Lan'), TS('T2', 'Hương')],
    mode: 'round_robin',
  });
  assert.deepEqual(plan.map(p => p.telesale_name), ['Lan', 'Hương', 'Lan', 'Hương', 'Lan']);
  assert.ok(plan.every(p => p.assignment_status === 'ASSIGNED'));
});

test('round_robin: gọi lại nhiều lần với cùng input luôn ra kết quả giống hệt nhau (deterministic, không random/shuffle)', () => {
  const input = { customerIds: ['C1', 'C2', 'C3'], telesales: [TS('T1', 'Lan'), TS('T2', 'Hương'), TS('T3', 'Minh')], mode: 'round_robin' as const };
  assert.deepEqual(planDistribution(input), planDistribution(input));
});

test('quantity: lấp đầy đúng theo quota từng telesale theo thứ tự truyền vào, phần dư -> UNASSIGNED (không tự ý chia tiếp)', () => {
  const plan = planDistribution({
    customerIds: ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7'],
    telesales: [TS('T1', 'Lan'), TS('T2', 'Hương')],
    mode: 'quantity',
    quantities: { T1: 3, T2: 2 },
  });
  assert.deepEqual(plan.filter(p => p.telesale_name === 'Lan').map(p => p.customer_id), ['C1', 'C2', 'C3']);
  assert.deepEqual(plan.filter(p => p.telesale_name === 'Hương').map(p => p.customer_id), ['C4', 'C5']);
  const remainder = plan.filter(p => p.assignment_status === 'UNASSIGNED');
  assert.deepEqual(remainder.map(p => p.customer_id), ['C6', 'C7']);
  assert.ok(remainder.every(p => p.telesale_id === null && p.telesale_name === null));
});

test('quantity: tổng quota >= số customer -> không còn ai rơi vào UNASSIGNED', () => {
  const plan = planDistribution({
    customerIds: ['C1', 'C2'], telesales: [TS('T1', 'Lan')], mode: 'quantity', quantities: { T1: 10 },
  });
  assert.equal(plan.length, 2);
  assert.ok(plan.every(p => p.assignment_status === 'ASSIGNED' && p.telesale_name === 'Lan'));
});

test('quantity: quota âm hoặc không phải số -> coi như 0, không crash, khách vẫn rơi vào UNASSIGNED', () => {
  const plan = planDistribution({
    customerIds: ['C1'], telesales: [TS('T1', 'Lan')], mode: 'quantity', quantities: { T1: -5 },
  });
  assert.deepEqual(plan, [{ customer_id: 'C1', telesale_id: null, telesale_name: null, assignment_status: 'UNASSIGNED' }]);
});

test('mode "none" hoặc không có Telesale nào -> toàn bộ UNASSIGNED, vẫn được thêm vào Campaign (không phải lỗi)', () => {
  const plan1 = planDistribution({ customerIds: ['C1', 'C2'], telesales: [], mode: 'round_robin' });
  assert.ok(plan1.every(p => p.assignment_status === 'UNASSIGNED' && p.telesale_id === null));

  const plan2 = planDistribution({ customerIds: ['C1'], telesales: [TS('T1', 'Lan')], mode: 'none' });
  assert.deepEqual(plan2, [{ customer_id: 'C1', telesale_id: null, telesale_name: null, assignment_status: 'UNASSIGNED' }]);
});

test('customerIds rỗng -> plan rỗng, không lỗi', () => {
  assert.deepEqual(planDistribution({ customerIds: [], telesales: [TS('T1', 'Lan')], mode: 'round_robin' }), []);
});

// --- Authorization ---------------------------------------------------------

test('canManageCampaign: Admin luôn quản lý được mọi Campaign, kể cả không phải owner', () => {
  assert.equal(
    canManageCampaign({ id_nhan_vien: 'NV1', ho_ten: 'Admin A', email: 'a@x.com', vai_tro: 'Admin' }, { owner_name: 'Người khác' }),
    true,
  );
});

test('canManageCampaign: đúng owner của Campaign được quản lý dù không phải Admin', () => {
  assert.equal(
    canManageCampaign({ id_nhan_vien: 'NV2', ho_ten: 'Trưởng nhóm B', email: 'b@x.com', vai_tro: 'Sale' }, { owner_name: 'Trưởng nhóm B' }),
    true,
  );
});

test('canManageCampaign: không phải Admin và không phải owner -> false', () => {
  assert.equal(
    canManageCampaign({ id_nhan_vien: 'NV3', ho_ten: 'Telesale C', email: 'c@x.com', vai_tro: 'Telesale' }, { owner_name: 'Người khác' }),
    false,
  );
});

test('canManageCampaign: Campaign chưa gán owner (null) -> chỉ Admin quản lý được, không ai khác đoán trúng bằng tên trùng ngẫu nhiên', () => {
  assert.equal(
    canManageCampaign({ id_nhan_vien: 'NV4', ho_ten: 'Bất kỳ', email: 'd@x.com', vai_tro: 'Sale' }, { owner_name: null }),
    false,
  );
});

// --- Delete guard (customerDeleteBlockReason) -----------------------------

test('customerDeleteBlockReason: khách có CampaignMembership (dù chưa có lịch sử CSKH nào) vẫn bị chặn xóa', () => {
  const kh = customer({ id_khach_hang: 'KH_CAMPAIGN' });
  const reason = customerDeleteBlockReason(kh, [], [{ customer_id: 'KH_CAMPAIGN' }]);
  assert.ok(reason);
  assert.match(reason!, /Campaign/);
});

test('customerDeleteBlockReason: membership của KHÁCH KHÁC không ảnh hưởng tới khách đang xét (không suy diễn theo campaign, chỉ đúng customer_id)', () => {
  const kh = customer({ id_khach_hang: 'KH_CLEAN' });
  const reason = customerDeleteBlockReason(kh, [], [{ customer_id: 'KH_OTHER' }]);
  assert.equal(reason, null);
});

test('customerDeleteBlockReason: guard cũ (CRM history/handoff/Pipeline) vẫn nguyên vẹn — không bị nới lỏng khi thêm tham số campaignMemberships', () => {
  const khHistory = customer({ id_khach_hang: 'KH_A', so_lan_lien_he: 2 });
  assert.ok(customerDeleteBlockReason(khHistory, []));

  const khHandoff = customer({ id_khach_hang: 'KH_B', trang_thai_ban_giao: 'Đã nhận' });
  assert.ok(customerDeleteBlockReason(khHandoff, []));

  const khPipeline = customer({ id_khach_hang: 'KH_C' });
  const pipelines: Pipeline[] = [{ id_khach_hang: 'KH_C' } as Pipeline];
  assert.ok(customerDeleteBlockReason(khPipeline, pipelines));

  const khClean = customer({ id_khach_hang: 'KH_D' });
  assert.equal(customerDeleteBlockReason(khClean, []), null);
});

test('customerDeleteBlockReason: signature backward-compatible — gọi không truyền campaignMemberships (2 tham số như cũ) vẫn chạy đúng cho khách sạch', () => {
  const kh = customer({ id_khach_hang: 'KH_E' });
  assert.equal(customerDeleteBlockReason(kh, []), null);
});

// --- planBulkDistribution: production remediation — membership UNASSIGNED có
// sẵn phải được phân được ở lần gọi sau, membership đã ASSIGNED thì tuyệt đối
// không đụng vào. ---------------------------------------------------------

const ALL_EXIST = new Set(['C1', 'C2', 'C3', 'C4', 'C5']);

test('1) existing UNASSIGNED -> round-robin vẫn phân được (đúng bug production: trước fix, membership UNASSIGNED có sẵn bị loại vĩnh viễn khỏi phân phối)', () => {
  const plan = planBulkDistribution({
    orderedIds: ['C1', 'C2', 'C3'],
    existingCustomerIds: ALL_EXIST,
    existingMemberships: [
      { customer_id: 'C1', assignment_status: 'UNASSIGNED' },
      { customer_id: 'C2', assignment_status: 'UNASSIGNED' },
      { customer_id: 'C3', assignment_status: 'UNASSIGNED' },
    ],
    telesales: [TS('T1', 'Lan'), TS('T2', 'Hương')],
    mode: 'round_robin',
  });
  assert.equal(plan.toCreate.length, 0, 'không tạo mới — cả 3 đã là membership có sẵn');
  assert.equal(plan.toAssignExisting.length, 3, 'cả 3 membership UNASSIGNED có sẵn đều được phân trong lần gọi này');
  assert.deepEqual(plan.toAssignExisting.map(p => p.telesale_name), ['Lan', 'Hương', 'Lan']);
  assert.equal(plan.alreadyMember, 3);
  assert.equal(plan.alreadyAssigned, 0);
});

test('2) existing UNASSIGNED -> quantity vẫn phân được, đúng theo quota, phần dư (nếu có) vẫn ở lại UNASSIGNED', () => {
  const plan = planBulkDistribution({
    orderedIds: ['C1', 'C2', 'C3'],
    existingCustomerIds: ALL_EXIST,
    existingMemberships: [
      { customer_id: 'C1', assignment_status: 'UNASSIGNED' },
      { customer_id: 'C2', assignment_status: 'UNASSIGNED' },
      { customer_id: 'C3', assignment_status: 'UNASSIGNED' },
    ],
    telesales: [TS('T1', 'Lan')],
    mode: 'quantity',
    quantities: { T1: 2 },
  });
  assert.equal(plan.toCreate.length, 0);
  assert.equal(plan.toAssignExisting.length, 2, 'chỉ đúng quota 2 được phân, phần dư giữ UNASSIGNED (không update)');
  assert.deepEqual(plan.toAssignExisting.map(p => p.customer_id), ['C1', 'C2']);
  // Counter fix: trạng thái CUỐI CÙNG phải phản ánh đúng — 3 membership UNASSIGNED
  // có sẵn, quota chỉ đủ gán 2 -> stillUnassigned PHẢI = 1, không phải 0 (đây là
  // đúng bug counter báo cáo sai mà production phát hiện: alreadyMember=3,
  // newlyAssigned=2 nhưng cũ hiển thị unassigned=0 dù C3 vẫn UNASSIGNED thật).
  assert.equal(plan.stillUnassigned, 1, 'C3 vẫn UNASSIGNED sau vòng phân này (không đủ quota)');
});

test('3) mixed: khách mới (chưa có membership) + khách đã có membership UNASSIGNED -> cả 2 nhóm đều vào cùng 1 vòng round-robin theo đúng thứ tự request', () => {
  const plan = planBulkDistribution({
    orderedIds: ['C1', 'C2', 'C3', 'C4'],
    existingCustomerIds: ALL_EXIST,
    existingMemberships: [
      { customer_id: 'C1', assignment_status: 'UNASSIGNED' }, // đã có, UNASSIGNED
      // C2, C3, C4: hoàn toàn mới
    ],
    telesales: [TS('T1', 'Lan'), TS('T2', 'Hương')],
    mode: 'round_robin',
  });
  assert.equal(plan.toCreate.length, 3, 'C2, C3, C4 là membership mới');
  assert.deepEqual(plan.toCreate.map(p => p.customer_id), ['C2', 'C3', 'C4']);
  assert.equal(plan.toAssignExisting.length, 1, 'C1 (UNASSIGNED có sẵn) được phân, không tạo trùng');
  assert.deepEqual(plan.toAssignExisting.map(p => p.customer_id), ['C1']);
  // Thứ tự round-robin tính trên toàn bộ eligibleIds (C1,C2,C3,C4) theo đúng thứ tự request.
  assert.equal(plan.toAssignExisting[0].telesale_name, 'Lan');
  assert.deepEqual(plan.toCreate.map(p => p.telesale_name), ['Hương', 'Lan', 'Hương']);
  assert.equal(plan.stillUnassigned, 0, 'round-robin với telesales > 0 luôn gán hết eligible, không ai còn UNASSIGNED');
});

test('4) existing ASSIGNED -> không bao giờ tự động gán lại, không chiếm chỗ trong round-robin, không xuất hiện ở toCreate lẫn toAssignExisting', () => {
  const plan = planBulkDistribution({
    orderedIds: ['C1', 'C2', 'C3'],
    existingCustomerIds: ALL_EXIST,
    existingMemberships: [
      { customer_id: 'C1', assignment_status: 'ASSIGNED' }, // đã phân từ trước cho Lan (giả định)
    ],
    telesales: [TS('T1', 'Lan'), TS('T2', 'Hương')],
    mode: 'round_robin',
  });
  assert.ok(!plan.toCreate.some(p => p.customer_id === 'C1'));
  assert.ok(!plan.toAssignExisting.some(p => p.customer_id === 'C1'));
  assert.equal(plan.alreadyAssigned, 1);
  // C2, C3 (mới) vẫn được phân bình thường, không bị lệch bởi việc C1 bị loại khỏi vòng quay.
  assert.deepEqual(plan.toCreate.map(p => p.customer_id), ['C2', 'C3']);
  assert.deepEqual(plan.toCreate.map(p => p.telesale_name), ['Lan', 'Hương']);
});

test('5) gọi lại đúng input sau khi đã áp dụng kết quả lần 1 (giả lập DB state mới) -> lần 2 idempotent: không toCreate, không toAssignExisting nào nữa', () => {
  const round1 = planBulkDistribution({
    orderedIds: ['C1', 'C2', 'C3'],
    existingCustomerIds: ALL_EXIST,
    existingMemberships: [],
    telesales: [TS('T1', 'Lan'), TS('T2', 'Hương')],
    mode: 'round_robin',
  });
  assert.equal(round1.toCreate.length, 3);

  // Giả lập DB sau khi áp dụng round1: cả 3 giờ đã là membership ASSIGNED.
  const membershipsAfterRound1 = round1.toCreate.map(p => ({ customer_id: p.customer_id, assignment_status: p.assignment_status }));

  const round2 = planBulkDistribution({
    orderedIds: ['C1', 'C2', 'C3'],
    existingCustomerIds: ALL_EXIST,
    existingMemberships: membershipsAfterRound1,
    telesales: [TS('T1', 'Lan'), TS('T2', 'Hương')],
    mode: 'round_robin',
  });
  assert.equal(round2.toCreate.length, 0, 'không tạo trùng membership ở lần gọi lại');
  assert.equal(round2.toAssignExisting.length, 0, 'không tự động gán lại membership đã ASSIGNED');
  assert.equal(round2.alreadyAssigned, 3);
});

test('6) membership uniqueness: customer đã có membership (dù UNASSIGNED hay ASSIGNED) không bao giờ xuất hiện ở toCreate -> không bao giờ tạo 2 membership cùng customer_id+campaign_id', () => {
  const plan = planBulkDistribution({
    orderedIds: ['C1', 'C2'],
    existingCustomerIds: ALL_EXIST,
    existingMemberships: [
      { customer_id: 'C1', assignment_status: 'UNASSIGNED' },
      { customer_id: 'C2', assignment_status: 'ASSIGNED' },
    ],
    telesales: [TS('T1', 'Lan')],
    mode: 'round_robin',
  });
  const createdIds = new Set(plan.toCreate.map(p => p.customer_id));
  assert.ok(!createdIds.has('C1') && !createdIds.has('C2'));
});

test('7) counters phân biệt rõ: alreadyMember (tổng cũ) vs alreadyAssigned (cũ đã ASSIGNED, không đổi) vs toCreate (mới) vs toAssignExisting (cũ UNASSIGNED vừa được phân)', () => {
  const plan = planBulkDistribution({
    orderedIds: ['C1', 'C2', 'C3', 'C4', 'C5'],
    existingCustomerIds: ALL_EXIST,
    existingMemberships: [
      { customer_id: 'C1', assignment_status: 'ASSIGNED' }, // already-assigned/unmodified
      { customer_id: 'C2', assignment_status: 'UNASSIGNED' }, // existing -> newly-assigned lần này
      // C3, C4, C5: mới hoàn toàn (newly-created)
    ],
    telesales: [TS('T1', 'Lan'), TS('T2', 'Hương')],
    mode: 'round_robin',
  });
  assert.equal(plan.alreadyMember, 2, 'existing = C1 + C2');
  assert.equal(plan.alreadyAssigned, 1, 'already-assigned/unmodified = chỉ C1');
  assert.equal(plan.toCreate.length, 3, 'newly-created = C3, C4, C5');
  assert.equal(plan.toAssignExisting.length, 1, 'newly-assigned (từ existing UNASSIGNED) = chỉ C2');
  assert.deepEqual(plan.toAssignExisting.map(p => p.customer_id), ['C2']);
  assert.equal(plan.stillUnassigned, 0, 'round-robin gán hết mọi eligible (C2,C3,C4,C5) -> không ai còn UNASSIGNED');
});

test('8) mixed final state (new + existing UNASSIGNED + existing ASSIGNED, mode quantity với phần dư) -> mọi counter phản ánh đúng trạng thái CUỐI CÙNG của tập đã chọn', () => {
  const plan = planBulkDistribution({
    orderedIds: ['C1', 'C2', 'C3', 'C4', 'C5', 'C6'],
    existingCustomerIds: new Set(['C1', 'C2', 'C3', 'C4', 'C5', 'C6']),
    existingMemberships: [
      { customer_id: 'C1', assignment_status: 'ASSIGNED' }, // đã phân từ trước -> giữ nguyên
      { customer_id: 'C2', assignment_status: 'UNASSIGNED' }, // có sẵn, sẽ được phân trong quota
      { customer_id: 'C3', assignment_status: 'UNASSIGNED' }, // có sẵn, sẽ được phân trong quota
      // C4, C5, C6: hoàn toàn mới
    ],
    telesales: [TS('T1', 'Lan')],
    mode: 'quantity',
    quantities: { T1: 3 }, // đủ cho C2, C3, C4 — C5, C6 rơi vào phần dư
  });

  assert.equal(plan.alreadyMember, 3, 'existing = C1 + C2 + C3');
  assert.equal(plan.alreadyAssigned, 1, 'chỉ C1 đã ASSIGNED từ trước -> không đổi');
  assert.equal(plan.toCreate.length, 3, 'newly-created = C4, C5, C6');
  assert.deepEqual(plan.toCreate.map(p => p.customer_id).sort(), ['C4', 'C5', 'C6']);
  assert.equal(plan.toAssignExisting.length, 2, 'C2, C3 (UNASSIGNED có sẵn) lấp đủ phần đầu quota, C1 không tham gia');
  assert.deepEqual(plan.toAssignExisting.map(p => p.customer_id), ['C2', 'C3']);

  const newlyAssigned = plan.toCreate.filter(p => p.assignment_status === 'ASSIGNED').length + plan.toAssignExisting.length;
  assert.equal(newlyAssigned, 3, 'C2, C3 (có sẵn) + C4 (mới) = 3 được phân trong lần này');
  assert.equal(plan.stillUnassigned, 2, 'C5, C6 rơi vào phần dư của quota -> vẫn UNASSIGNED thật sự, phải được đếm');
});

// --- Campaign Leader edit remediation: chỉ Admin được gán/thay/xóa Leader ---
// (owner_id/owner_name), current Leader (canManageCampaign qua owner_name)
// không được tự đổi owner của chính mình. -----------------------------------

const adminUser = { id_nhan_vien: 'ADM1', ho_ten: 'Sếp', email: 'a@x.com', vai_tro: 'Admin' };
const leaderUser = { id_nhan_vien: 'LD1', ho_ten: 'Leader X', email: 'l@x.com', vai_tro: 'Sale' };
const strangerUser = { id_nhan_vien: 'ST1', ho_ten: 'Người khác', email: 's@x.com', vai_tro: 'Sale' };
const campaignOwnedByLeader = { owner_name: 'Leader X' };

test('campaignOwnerFieldsTouched: body có key owner_id -> true (kể cả giá trị null/empty) — check theo presence, không theo truthiness', () => {
  assert.equal(campaignOwnerFieldsTouched({ owner_id: null }), true);
  assert.equal(campaignOwnerFieldsTouched({ owner_id: '' }), true);
  assert.equal(campaignOwnerFieldsTouched({ owner_id: 'NV1' }), true);
});

test('campaignOwnerFieldsTouched: body có key owner_name -> true (kể cả giá trị null/empty)', () => {
  assert.equal(campaignOwnerFieldsTouched({ owner_name: null }), true);
  assert.equal(campaignOwnerFieldsTouched({ owner_name: '' }), true);
});

test('campaignOwnerFieldsTouched: body KHÔNG có owner_id/owner_name (chỉ sửa field khác) -> false, không kích hoạt Admin gate oan', () => {
  assert.equal(campaignOwnerFieldsTouched({ name: 'Đợt 2', status: 'active', description: null, start_date: null }), false);
  assert.equal(campaignOwnerFieldsTouched({}), false);
});

test('Remediation: non-admin current Campaign Leader (canManageCampaign=true qua owner_name) KHÔNG được đụng owner_id/owner_name — route phải chặn dù canManageCampaign cho phép sửa field khác', () => {
  assert.equal(canManageCampaign(leaderUser, campaignOwnedByLeader), true, 'leader vẫn quản lý được Campaign của chính mình (field khác)');
  const bodyChangingOwner = { owner_id: 'OTHER_ID', owner_name: 'Người khác' };
  assert.equal(campaignOwnerFieldsTouched(bodyChangingOwner), true);
  assert.equal(isCrmAdmin(leaderUser), false, '-> route phải trả 403 vì campaignOwnerFieldsTouched=true && isCrmAdmin=false');
});

test('Remediation: Admin gán/thay Leader được phép (isCrmAdmin=true) dù body chỉ chứa owner_id/owner_name', () => {
  const bodyChangingOwner = { owner_id: 'NEW_ID', owner_name: 'Leader Mới' };
  assert.equal(campaignOwnerFieldsTouched(bodyChangingOwner), true);
  assert.equal(isCrmAdmin(adminUser), true, '-> route phải cho qua vì isCrmAdmin=true');
});

test('Remediation: Admin xóa Leader (gửi owner_id/owner_name = null) vẫn được phép — presence check không chặn Admin', () => {
  const bodyClearingOwner = { owner_id: null, owner_name: null };
  assert.equal(campaignOwnerFieldsTouched(bodyClearingOwner), true);
  assert.equal(isCrmAdmin(adminUser), true);
});

test('Remediation: existing non-owner update (không đụng owner_id/owner_name) vẫn giữ nguyên authority cũ — canManageCampaign, không cần isCrmAdmin', () => {
  const bodyOnlyStatus = { status: 'paused', description: 'Tạm dừng' };
  assert.equal(campaignOwnerFieldsTouched(bodyOnlyStatus), false, '-> route KHÔNG kích hoạt Admin gate, dùng canManageCampaign như cũ');
  assert.equal(canManageCampaign(leaderUser, campaignOwnedByLeader), true, 'leader vẫn sửa được field khác của Campaign mình phụ trách');
  assert.equal(canManageCampaign(strangerUser, campaignOwnedByLeader), false, 'người không liên quan vẫn bị chặn như cũ');
});

test('Remediation: người lạ (không phải Admin, không phải owner) vẫn bị canManageCampaign chặn trước khi tới Admin gate — không có lỗ hổng mới', () => {
  assert.equal(canManageCampaign(strangerUser, campaignOwnedByLeader), false);
});

test('route.ts: wiring đúng — import isCrmAdmin/campaignOwnerFieldsTouched, gate đặt SAU canManageCampaign check và TRƯỚC updateCampaign, dùng đúng field-presence helper (không tái tạo logic truthiness riêng)', () => {
  const src = readFileSync(resolve('src/app/api/campaigns/[id]/route.ts'), 'utf8');
  assert.match(src, /import \{[^}]*campaignOwnerFieldsTouched[^}]*isCrmAdmin[^}]*\} from '@\/lib\/crm-auth'|import \{[^}]*isCrmAdmin[^}]*campaignOwnerFieldsTouched[^}]*\} from '@\/lib\/crm-auth'/);
  const putStart = src.indexOf('export async function PUT');
  const putBody = src.slice(putStart);
  const canManageIdx = putBody.indexOf('canManageCampaign(user, campaign)');
  const gateIdx = putBody.indexOf('campaignOwnerFieldsTouched(body) && !isCrmAdmin(user)');
  const updateIdx = putBody.indexOf('updateCampaign(id,');
  assert.ok(canManageIdx > -1 && gateIdx > -1 && updateIdx > -1, 'cả 3 điểm mốc phải tồn tại trong PUT handler');
  assert.ok(canManageIdx < gateIdx && gateIdx < updateIdx, 'thứ tự phải là: canManageCampaign -> Admin owner-field gate -> updateCampaign');
  assert.match(putBody, /status: 403 \}\)/, 'Admin gate phải trả 403 giống pattern lỗi quyền hiện có');
});

test('route.ts: PUT vẫn tái sử dụng updateCampaign() hiện có, không tạo endpoint mới, không tự viết prisma.campaign.update trực tiếp trong route', () => {
  const src = readFileSync(resolve('src/app/api/campaigns/[id]/route.ts'), 'utf8');
  assert.match(src, /await updateCampaign\(id,/);
  assert.doesNotMatch(src, /prisma\.campaign\.update/);
});

test('POST /api/campaigns (tạo Campaign) không bị đụng bởi remediation — vẫn Admin-only như cũ, không regression', () => {
  const src = readFileSync(resolve('src/app/api/campaigns/route.ts'), 'utf8');
  assert.match(src, /if \(!isCrmAdmin\(user\)\) \{/);
  assert.match(src, /Chỉ Admin\/Ban lãnh đạo mới được tạo Campaign/);
});

test('CampaignCskhWorkQueue: control Gán/Sửa Leader chỉ render khi isAdmin (Admin-only UI, business authority không duplicate sang client — server vẫn là nguồn thật)', () => {
  const src = readFileSync(resolve('src/components/crm/CampaignCskhWorkQueue.tsx'), 'utf8');
  assert.match(src, /\{isAdmin && <button className="btn btn-ghost btn-sm" onClick=\{\(\) => setShowLeaderEdit\(true\)\}>/);
});

test('CampaignCskhWorkQueue: CampaignLeaderEditModal dùng active employee eligibility giống Leader picker của CampaignDistributeModal (trang_thai !== "Nghỉ việc"), không phát minh rule mới', () => {
  const src = readFileSync(resolve('src/components/crm/CampaignCskhWorkQueue.tsx'), 'utf8');
  const modalStart = src.indexOf('function CampaignLeaderEditModal');
  const modalBody = src.slice(modalStart, modalStart + 2500);
  assert.match(modalBody, /employees\.filter\(item => item\.trang_thai !== 'Nghỉ việc'\)/);
});

test('CampaignCskhWorkQueue: CampaignLeaderEditModal save qua existing PUT /api/campaigns/${campaign.id} với owner_id/owner_name, thành công thì cập nhật state Campaign để label đổi ngay (không cần reload trang)', () => {
  const src = readFileSync(resolve('src/components/crm/CampaignCskhWorkQueue.tsx'), 'utf8');
  const modalStart = src.indexOf('function CampaignLeaderEditModal');
  const modalBody = src.slice(modalStart, modalStart + 2500);
  assert.match(modalBody, /method: 'PUT'/);
  assert.match(modalBody, /\/api\/campaigns\/\$\{campaign\.id\}/);
  assert.match(modalBody, /owner_id: leader\?\.id_nhan_vien \|\| null, owner_name: leader\?\.ho_ten \|\| null/);
  assert.match(src, /setCampaigns\(current => current\.map\(item => item\.id === updated\.id \? updated : item\)\)/, 'onSaved phải cập nhật campaigns state để label Leader đổi ngay');
});
