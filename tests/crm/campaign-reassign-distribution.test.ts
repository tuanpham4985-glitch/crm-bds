// Thu hồi & chia lại khách ĐÃ có Sale (reassignAssigned) + cảnh báo trước khi
// xác nhận (/distribute preview: true) + Sale CSKH thấy khách mới phân lên đầu.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { planBulkDistribution } from '../../src/lib/crm-funnel/campaign';
import { sortMembershipsNewestAssignedFirst } from '../../src/lib/campaign-cskh-range';

const TS = (id: string, name: string) => ({ id_nhan_vien: id, ho_ten: name });
const ALL = new Set(['C1', 'C2', 'C3', 'C4', 'C5']);
const EXISTING = [
  { customer_id: 'C1', assignment_status: 'ASSIGNED', telesale_id: 'OLD1', handoff_id: null },
  { customer_id: 'C2', assignment_status: 'ASSIGNED', telesale_id: 'OLD2', handoff_id: null },
  { customer_id: 'C3', assignment_status: 'ASSIGNED', telesale_id: 'OLD1', handoff_id: 'H1' },
  { customer_id: 'C4', assignment_status: 'ASSIGNED', telesale_id: 'T1', handoff_id: null },
];

test('mặc định (không tick): khách đã ASSIGNED giữ nguyên Sale cũ, chỉ khách mới được phân', () => {
  const plan = planBulkDistribution({
    orderedIds: ['C1', 'C2', 'C3', 'C4', 'C5'], existingCustomerIds: ALL, existingMemberships: EXISTING,
    telesales: [TS('T1', 'Quân'), TS('T2', 'Thảo')], mode: 'round_robin',
  });
  assert.equal(plan.toReassign.length, 0);
  assert.deepEqual(plan.toCreate.map(p => p.customer_id), ['C5']);
  assert.equal(plan.alreadyAssigned, 4);
  assert.equal(plan.lockedHandoff, 1);
});

test('reassignAssigned: thu hồi khách của Sale khác, bỏ qua khách đã handoff và khách đang thuộc chính Sale được chọn', () => {
  const plan = planBulkDistribution({
    orderedIds: ['C1', 'C2', 'C3', 'C4', 'C5'], existingCustomerIds: ALL, existingMemberships: EXISTING,
    telesales: [TS('T1', 'Quân'), TS('T2', 'Thảo')], mode: 'round_robin', reassignAssigned: true,
  });
  // eligible theo đúng thứ tự: C1, C2, C5 -> Quân, Thảo, Quân
  assert.deepEqual(plan.toReassign.map(p => [p.customer_id, p.telesale_name, p.previous_telesale_id]), [
    ['C1', 'Quân', 'OLD1'], ['C2', 'Thảo', 'OLD2'],
  ]);
  assert.deepEqual(plan.toCreate.map(p => [p.customer_id, p.telesale_name]), [['C5', 'Quân']]);
  assert.equal(plan.toAssignExisting.length, 0);
  assert.equal(plan.stillUnassigned, 0);
});

test('reassignAssigned + quantity: phần dư KHÔNG bị thu hồi (giữ Sale cũ), không tính là chưa phân', () => {
  const plan = planBulkDistribution({
    orderedIds: ['C1', 'C2'], existingCustomerIds: ALL, existingMemberships: EXISTING,
    telesales: [TS('T1', 'Quân')], mode: 'quantity', quantities: { T1: 1 }, reassignAssigned: true,
  });
  assert.deepEqual(plan.toReassign.map(p => p.customer_id), ['C1']);
  assert.equal(plan.toAssignExisting.length, 0);
  assert.equal(plan.stillUnassigned, 0);
});

test('reassignAssigned không có tác dụng khi mode none', () => {
  const plan = planBulkDistribution({
    orderedIds: ['C1'], existingCustomerIds: ALL, existingMemberships: EXISTING,
    telesales: [], mode: 'none', reassignAssigned: true,
  });
  assert.equal(plan.toReassign.length, 0);
});

test('distribute route: reassign_assigned chỉ Admin; preview read-only trả về TRƯỚC mọi bước ghi', () => {
  const src = readFileSync(resolve('src/app/api/campaigns/[id]/distribute/route.ts'), 'utf8');
  assert.match(src, /reassignAssigned && !isCrmAdmin\(user\)/);
  const previewAt = src.indexOf('body?.preview === true');
  assert.ok(previewAt > src.indexOf('canManageCampaign(user, campaign)'), 'preview sau gate quyền');
  assert.ok(previewAt < src.indexOf('bulkAddAndDistribute({'), 'preview trả về trước khi ghi');
});

test('sortMembershipsNewestAssignedFirst: mới phân lên đầu, rơi về created_at, ổn định khi trùng mốc', () => {
  const rows = [
    { id: 'a', created_at: '2026-09-01T00:00:00Z', assigned_at: '2026-09-02T00:00:00Z' },
    { id: 'b', created_at: '2026-09-05T00:00:00Z', assigned_at: null },
    { id: 'c', created_at: '2026-08-01T00:00:00Z', assigned_at: '2026-10-20T08:04:00Z' },
    { id: 'd', created_at: '2026-08-02T00:00:00Z', assigned_at: '2026-10-20T08:04:00Z' },
  ];
  assert.deepEqual(sortMembershipsNewestAssignedFirst(rows).map(r => r.id), ['c', 'd', 'b', 'a']);
});

test('members route: chỉ Sale (không full view) được sort mới phân lên đầu; Admin/Leader giữ thứ tự range', () => {
  const src = readFileSync(resolve('src/app/api/campaigns/[id]/members/route.ts'), 'utf8');
  assert.match(src, /hasFullView \? scopedMembers : sortMembershipsNewestAssignedFirst\(scopedMembers\)/);
});
