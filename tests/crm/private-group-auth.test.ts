import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isPrivateGroupLeader, isPrivateGroupMember, canViewPrivateGroup, canManagePrivateGroupMembers,
  canRenamePrivateGroup, canChangePrivateGroupLeader, canCreatePrivateGroup, canViewAllGroupCustomers,
  canReassignGroupCustomer, canViewGroupCustomer, filterGroupCustomersForUser, filterPrivateGroupsForUser,
  resolveAutoLinkGroup,
} from '../../src/lib/private-group-auth';
import type { CrmSessionUser } from '../../src/lib/crm-auth';

function user(id: string, vai_tro = 'Sale', overrides: Partial<CrmSessionUser> = {}): CrmSessionUser {
  return { id_nhan_vien: id, ho_ten: `Nhân viên ${id}`, email: `${id}@x.com`, vai_tro, ...overrides };
}

const ADMIN = user('U_ADMIN', 'Admin');
const LEADER = user('U_LEADER', 'Sale');
const SALE_A = user('U_SALE_A', 'Sale');
const SALE_B = user('U_SALE_B', 'Sale');
const OUTSIDER = user('U_OUTSIDER', 'Sale');

const GROUP = { id: 'G1', leader_id: LEADER.id_nhan_vien };
const MEMBERS = [
  { group_id: 'G1', employee_id: SALE_A.id_nhan_vien },
  { group_id: 'G1', employee_id: SALE_B.id_nhan_vien },
];

// ─── isPrivateGroupLeader / isPrivateGroupMember ────────────────────────────

test('isPrivateGroupLeader: đúng leader_id -> true; người khác (kể cả member) -> false', () => {
  assert.equal(isPrivateGroupLeader(LEADER, GROUP), true);
  assert.equal(isPrivateGroupLeader(SALE_A, GROUP), false);
  assert.equal(isPrivateGroupLeader(ADMIN, GROUP), false);
});

test('isPrivateGroupMember: có row trong members -> true; không có -> false (kể cả Leader — Leader không có row riêng)', () => {
  assert.equal(isPrivateGroupMember(SALE_A, GROUP, MEMBERS), true);
  assert.equal(isPrivateGroupMember(SALE_B, GROUP, MEMBERS), true);
  assert.equal(isPrivateGroupMember(OUTSIDER, GROUP, MEMBERS), false);
  assert.equal(isPrivateGroupMember(LEADER, GROUP, MEMBERS), false);
});

// ─── canViewPrivateGroup — test #3 (Sale ngoài nhóm không truy cập được) ────

test('canViewPrivateGroup: Admin/Leader/Sale thành viên đều xem được', () => {
  assert.equal(canViewPrivateGroup(ADMIN, GROUP, MEMBERS), true);
  assert.equal(canViewPrivateGroup(LEADER, GROUP, MEMBERS), true);
  assert.equal(canViewPrivateGroup(SALE_A, GROUP, MEMBERS), true);
});

test('canViewPrivateGroup: Sale NGOÀI nhóm -> false (test bắt buộc #3)', () => {
  assert.equal(canViewPrivateGroup(OUTSIDER, GROUP, MEMBERS), false);
});

// ─── canManagePrivateGroupMembers / canRenamePrivateGroup / canChangePrivateGroupLeader / canCreatePrivateGroup ─

test('canManagePrivateGroupMembers: Admin và ĐÚNG Leader của nhóm được; Sale member/outsider không được', () => {
  assert.equal(canManagePrivateGroupMembers(ADMIN, GROUP), true);
  assert.equal(canManagePrivateGroupMembers(LEADER, GROUP), true);
  assert.equal(canManagePrivateGroupMembers(SALE_A, GROUP), false);
  assert.equal(canManagePrivateGroupMembers(OUTSIDER, GROUP), false);
});

test('canRenamePrivateGroup: cùng quyền với canManagePrivateGroupMembers (Admin/Leader)', () => {
  assert.equal(canRenamePrivateGroup(ADMIN, GROUP), true);
  assert.equal(canRenamePrivateGroup(LEADER, GROUP), true);
  assert.equal(canRenamePrivateGroup(SALE_A, GROUP), false);
});

test('canChangePrivateGroupLeader: CHỈ Admin — Leader hiện tại KHÔNG được tự đổi Leader của chính nhóm mình', () => {
  assert.equal(canChangePrivateGroupLeader(ADMIN), true);
  assert.equal(canChangePrivateGroupLeader(LEADER), false);
});

test('canCreatePrivateGroup: CHỈ Admin', () => {
  assert.equal(canCreatePrivateGroup(ADMIN), true);
  assert.equal(canCreatePrivateGroup(LEADER), false);
  assert.equal(canCreatePrivateGroup(SALE_A), false);
});

// ─── canViewAllGroupCustomers — RULE KHOÁ: Sale KHÔNG được xem toàn bộ ──────

test('canViewAllGroupCustomers: Admin và Leader của nhóm -> true', () => {
  assert.equal(canViewAllGroupCustomers(ADMIN, GROUP), true);
  assert.equal(canViewAllGroupCustomers(LEADER, GROUP), true);
});

test('canViewAllGroupCustomers: Sale (kể cả thành viên hợp lệ của nhóm) -> LUÔN false — đây là rule khoá bắt buộc, không có ngoại lệ', () => {
  assert.equal(canViewAllGroupCustomers(SALE_A, GROUP), false);
  assert.equal(canViewAllGroupCustomers(SALE_B, GROUP), false);
  assert.equal(canViewAllGroupCustomers(OUTSIDER, GROUP), false);
});

// ─── canReassignGroupCustomer ────────────────────────────────────────────────

test('canReassignGroupCustomer: Admin/Leader được giao lại customer; Sale (kể cả đang assigned_to chính mình) không được', () => {
  assert.equal(canReassignGroupCustomer(ADMIN, GROUP), true);
  assert.equal(canReassignGroupCustomer(LEADER, GROUP), true);
  assert.equal(canReassignGroupCustomer(SALE_A, GROUP), false);
});

// ─── canViewGroupCustomer / filterGroupCustomersForUser — test #5/#6/#7 ─────

function relation(entered_by_id: string, assigned_to_id: string) {
  return { group_id: 'G1', entered_by_id, assigned_to_id };
}

test('canViewGroupCustomer: Sale xem được customer CHÍNH MÌNH nhập', () => {
  const r = relation(SALE_A.id_nhan_vien, SALE_A.id_nhan_vien);
  assert.equal(canViewGroupCustomer(SALE_A, GROUP, r), true);
});

test('canViewGroupCustomer: Sale xem được customer ĐƯỢC GIAO cho mình dù người khác nhập', () => {
  const r = relation(SALE_B.id_nhan_vien, SALE_A.id_nhan_vien); // B nhập, giao cho A
  assert.equal(canViewGroupCustomer(SALE_A, GROUP, r), true);
});

test('canViewGroupCustomer: Sale KHÔNG xem được customer của Sale khác (không nhập, không được giao) — test bắt buộc #5', () => {
  const r = relation(SALE_B.id_nhan_vien, SALE_B.id_nhan_vien); // của B hoàn toàn
  assert.equal(canViewGroupCustomer(SALE_A, GROUP, r), false);
});

test('filterGroupCustomersForUser: Sale B cùng nhóm KHÔNG thấy customer của Sale A (test bắt buộc #5)', () => {
  const relations = [
    { id: 'r1', ...relation(SALE_A.id_nhan_vien, SALE_A.id_nhan_vien) },
    { id: 'r2', ...relation(SALE_B.id_nhan_vien, SALE_B.id_nhan_vien) },
  ];
  const visibleToB = filterGroupCustomersForUser(SALE_B, GROUP, relations);
  assert.deepEqual(visibleToB.map(r => r.id), ['r2']);
});

test('filterGroupCustomersForUser: Leader nhìn thấy customer của CẢ A và B (test bắt buộc #6)', () => {
  const relations = [
    { id: 'r1', ...relation(SALE_A.id_nhan_vien, SALE_A.id_nhan_vien) },
    { id: 'r2', ...relation(SALE_B.id_nhan_vien, SALE_B.id_nhan_vien) },
  ];
  const visibleToLeader = filterGroupCustomersForUser(LEADER, GROUP, relations);
  assert.deepEqual(visibleToLeader.map(r => r.id).sort(), ['r1', 'r2']);
});

test('filterGroupCustomersForUser: Admin nhìn thấy tất cả (test bắt buộc #7)', () => {
  const relations = [
    { id: 'r1', ...relation(SALE_A.id_nhan_vien, SALE_A.id_nhan_vien) },
    { id: 'r2', ...relation(SALE_B.id_nhan_vien, SALE_B.id_nhan_vien) },
  ];
  const visibleToAdmin = filterGroupCustomersForUser(ADMIN, GROUP, relations);
  assert.deepEqual(visibleToAdmin.map(r => r.id).sort(), ['r1', 'r2']);
});

test('filterGroupCustomersForUser: Sale không nhập/không được giao bất kỳ dòng nào -> mảng rỗng, không lỗi', () => {
  const relations = [{ id: 'r1', ...relation(SALE_B.id_nhan_vien, SALE_B.id_nhan_vien) }];
  assert.deepEqual(filterGroupCustomersForUser(OUTSIDER, GROUP, relations), []);
});

// ─── filterPrivateGroupsForUser — test #7 (Admin thấy tất cả) + #3 (Sale ngoài không thấy) ─

test('filterPrivateGroupsForUser: Admin thấy TẤT CẢ nhóm (test bắt buộc #7)', () => {
  const groups = [{ id: 'G1', leader_id: LEADER.id_nhan_vien }, { id: 'G2', leader_id: SALE_B.id_nhan_vien }];
  assert.equal(filterPrivateGroupsForUser(ADMIN, groups, MEMBERS).length, 2);
});

test('filterPrivateGroupsForUser: Sale chỉ thấy nhóm mình Leader/member — nhóm khác bị loại (test bắt buộc #3)', () => {
  const groups = [{ id: 'G1', leader_id: LEADER.id_nhan_vien }, { id: 'G2', leader_id: 'U_OTHER_LEADER' }];
  const visible = filterPrivateGroupsForUser(SALE_A, groups, MEMBERS); // SALE_A là member của G1 theo MEMBERS
  assert.deepEqual(visible.map(g => g.id), ['G1']);
});

test('filterPrivateGroupsForUser: outsider không thuộc nhóm nào -> mảng rỗng', () => {
  const groups = [{ id: 'G1', leader_id: LEADER.id_nhan_vien }];
  assert.deepEqual(filterPrivateGroupsForUser(OUTSIDER, groups, MEMBERS), []);
});

// ─── resolveAutoLinkGroup — Flow D bước 3+4 (test bắt buộc #4) ──────────────

test('resolveAutoLinkGroup: actor không thuộc nhóm nào -> null (customer thường, không có gì sai)', () => {
  assert.equal(resolveAutoLinkGroup([], []), null);
});

test('resolveAutoLinkGroup: actor là Leader của ĐÚNG 1 nhóm -> auto-link nhóm đó', () => {
  const result = resolveAutoLinkGroup([{ id: 'G1', name: 'Nhóm A' }], []);
  assert.deepEqual(result, { id: 'G1', name: 'Nhóm A' });
});

test('resolveAutoLinkGroup: actor là Sale member của ĐÚNG 1 nhóm -> auto-link nhóm đó (test bắt buộc #4)', () => {
  const result = resolveAutoLinkGroup([], [{ id: 'G1', name: 'Nhóm A' }]);
  assert.deepEqual(result, { id: 'G1', name: 'Nhóm A' });
});

test('resolveAutoLinkGroup: actor thuộc 2+ nhóm (Leader 1 nhóm + member 1 nhóm khác) -> null, KHÔNG đoán bừa', () => {
  const result = resolveAutoLinkGroup([{ id: 'G1', name: 'Nhóm A' }], [{ id: 'G2', name: 'Nhóm B' }]);
  assert.equal(result, null);
});

test('resolveAutoLinkGroup: cùng 1 nhóm xuất hiện ở CẢ leaderOf lẫn memberOf (data lỗi giả định) -> vẫn coi là 1 nhóm, không tính nhầm thành ambiguous', () => {
  const result = resolveAutoLinkGroup([{ id: 'G1', name: 'Nhóm A' }], [{ id: 'G1', name: 'Nhóm A' }]);
  assert.deepEqual(result, { id: 'G1', name: 'Nhóm A' });
});
