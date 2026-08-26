import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { canManageCampaign, customerDeleteBlockReason } from '../../src/lib/crm-auth';
import { planDistribution } from '../../src/lib/crm-funnel/campaign';
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

test('bulkAddAndDistribute pre-filter existing memberships trước khi tạo (+ skipDuplicates) -> chạy lại cùng input là idempotent, không tạo trùng', () => {
  const src = readFileSync(resolve('src/lib/crm-funnel/campaign.ts'), 'utf8');
  assert.match(src, /existingMemberships = validIds\.length/);
  assert.match(src, /alreadyMemberSet\.has\(id\)/);
  assert.match(src, /skipDuplicates: true/);
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
