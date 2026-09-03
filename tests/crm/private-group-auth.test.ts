import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isPrivateGroupLeader, isPrivateGroupMember, canViewPrivateGroup, canManagePrivateGroupMembers,
  canRenamePrivateGroup, canChangePrivateGroupLeader, canCreatePrivateGroup, canViewAllGroupCustomers,
  canReassignGroupCustomer, canViewGroupCustomer, filterGroupCustomersForUser, filterPrivateGroupsForUser,
  resolveManualCustomerGroup, buildCustomerGroupBadges,
  type PrivateGroupCustomerLinkLike, type PrivateGroupBadgeSource,
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

// ─── resolveManualCustomerGroup — Flow D bước 0 (multi-group, test bắt buộc #1-#6) ─
// Locked business model: 1 Sale/Leader CÓ THỂ thuộc nhiều Nhóm riêng cùng lúc
// (khác v1 — xem resolveAutoLinkGroup cũ đã bị thay thế: >=2 nhóm không còn
// âm thầm bỏ qua group-link mà BẮT BUỘC actor chọn tường minh qua groupId).

test('resolveManualCustomerGroup: 0 nhóm, không groupId -> "none" (test bắt buộc #2 — manual create bình thường)', () => {
  assert.deepEqual(resolveManualCustomerGroup([], []), { status: 'none' });
});

test('resolveManualCustomerGroup: 0 nhóm nhưng CÓ groupId gửi lên (data lạ/tấn công) -> "forbidden", không có nhóm nào để khớp', () => {
  assert.deepEqual(resolveManualCustomerGroup([], [], 'G1'), { status: 'forbidden' });
});

test('resolveManualCustomerGroup: Leader của ĐÚNG 1 nhóm, không groupId -> auto-select nhóm đó (test bắt buộc #3)', () => {
  const result = resolveManualCustomerGroup([{ id: 'G1', name: 'Nhóm A' }], []);
  assert.deepEqual(result, { status: 'ok', group: { id: 'G1', name: 'Nhóm A' } });
});

test('resolveManualCustomerGroup: Sale member của ĐÚNG 1 nhóm, không groupId -> auto-select nhóm đó (test bắt buộc #3)', () => {
  const result = resolveManualCustomerGroup([], [{ id: 'G1', name: 'Nhóm A' }]);
  assert.deepEqual(result, { status: 'ok', group: { id: 'G1', name: 'Nhóm A' } });
});

test('resolveManualCustomerGroup: ĐÚNG 1 nhóm nhưng groupId gửi lên KHÁC nhóm đó -> "forbidden", không auto-select thay thế', () => {
  const result = resolveManualCustomerGroup([{ id: 'G1', name: 'Nhóm A' }], [], 'G2');
  assert.deepEqual(result, { status: 'forbidden' });
});

test('resolveManualCustomerGroup: ĐÚNG 1 nhóm và groupId gửi lên KHỚP đúng nhóm đó -> "ok"', () => {
  const result = resolveManualCustomerGroup([{ id: 'G1', name: 'Nhóm A' }], [], 'G1');
  assert.deepEqual(result, { status: 'ok', group: { id: 'G1', name: 'Nhóm A' } });
});

test('resolveManualCustomerGroup: actor thuộc 2 nhóm (Leader 1 nhóm + member 1 nhóm khác), KHÔNG gửi groupId -> "required" (test bắt buộc #1 + #4)', () => {
  const result = resolveManualCustomerGroup([{ id: 'G1', name: 'Nhóm A' }], [{ id: 'G2', name: 'Nhóm B' }]);
  assert.deepEqual(result, { status: 'required' });
});

test('resolveManualCustomerGroup: cùng 1 nhóm xuất hiện ở CẢ leaderOf lẫn memberOf (data lỗi giả định) -> vẫn coi là 1 nhóm (không tính nhầm thành 2 nhóm -> required)', () => {
  const result = resolveManualCustomerGroup([{ id: 'G1', name: 'Nhóm A' }], [{ id: 'G1', name: 'Nhóm A' }]);
  assert.deepEqual(result, { status: 'ok', group: { id: 'G1', name: 'Nhóm A' } });
});

test('resolveManualCustomerGroup: actor thuộc >=2 nhóm + groupId hợp lệ (1 trong 2 nhóm) -> "ok", link đúng nhóm được chọn (test bắt buộc #5)', () => {
  const leaderOf = [{ id: 'G1', name: 'Nhóm A' }];
  const memberOf = [{ id: 'G2', name: 'Nhóm B' }];
  assert.deepEqual(resolveManualCustomerGroup(leaderOf, memberOf, 'G1'), { status: 'ok', group: { id: 'G1', name: 'Nhóm A' } });
  assert.deepEqual(resolveManualCustomerGroup(leaderOf, memberOf, 'G2'), { status: 'ok', group: { id: 'G2', name: 'Nhóm B' } });
});

test('resolveManualCustomerGroup: actor thuộc >=2 nhóm + groupId KHÔNG thuộc actor (nhóm lạ) -> "forbidden" (test bắt buộc #6)', () => {
  const leaderOf = [{ id: 'G1', name: 'Nhóm A' }];
  const memberOf = [{ id: 'G2', name: 'Nhóm B' }];
  assert.deepEqual(resolveManualCustomerGroup(leaderOf, memberOf, 'G999'), { status: 'forbidden' });
});

// ─── buildCustomerGroupBadges — badge Nhóm riêng trên /khach-hang ───────────
// (task hiện tại — test bắt buộc #1-#5 của final report)

const GROUP_A: PrivateGroupBadgeSource = { id: 'G1', leader_id: LEADER.id_nhan_vien, name: 'Thu - Yến - Thanh' };
const GROUP_B: PrivateGroupBadgeSource = { id: 'G2', leader_id: 'U_OTHER_LEADER', name: 'Nhóm VIP' };

function link(customer_id: string, group_id: string, entered_by_id: string, assigned_to_id: string): PrivateGroupCustomerLinkLike {
  return { customer_id, group_id, entered_by_id, assigned_to_id };
}

test('buildCustomerGroupBadges: customer có group + actor được phép biết (Leader của group đó) -> trả đúng {id, name} (test bắt buộc #1)', () => {
  const links = [link('KH1', GROUP_A.id, SALE_A.id_nhan_vien, SALE_A.id_nhan_vien)];
  const groupsById = new Map([[GROUP_A.id, GROUP_A]]);
  const result = buildCustomerGroupBadges(LEADER, links, groupsById);
  assert.deepEqual(result, { KH1: { id: 'G1', name: 'Thu - Yến - Thanh' } });
});

test('buildCustomerGroupBadges: customer KHÔNG có link nào trong input -> không có key trong result (test bắt buộc #2, không phải "—"/placeholder)', () => {
  const result = buildCustomerGroupBadges(ADMIN, [], new Map());
  assert.deepEqual(result, {});
  assert.equal(Object.prototype.hasOwnProperty.call(result, 'KH_KHONG_GROUP'), false);
});

test('buildCustomerGroupBadges: actor (Leader) thuộc nhiều group nhưng customer chỉ có link tới ĐÚNG 1 group -> badge CHỈ group đó, không lộ group khác actor cũng quản lý (test bắt buộc #3)', () => {
  // LEADER là leader_id của GROUP_A; giả lập LEADER cũng liên quan GROUP_B
  // (VD từng là leader) nhưng KHÔNG có trong groupsById vì không được truyền
  // vào (route chỉ query group THỰC SỰ được tham chiếu bởi link của trang).
  const links = [link('KH1', GROUP_A.id, SALE_A.id_nhan_vien, SALE_A.id_nhan_vien)];
  const groupsById = new Map([[GROUP_A.id, GROUP_A], [GROUP_B.id, GROUP_B]]);
  const result = buildCustomerGroupBadges(LEADER, links, groupsById);
  assert.deepEqual(result, { KH1: { id: 'G1', name: 'Thu - Yến - Thanh' } });
  assert.equal(Object.keys(result).length, 1);
});

test('buildCustomerGroupBadges: Admin luôn thấy badge (authority hiện tại)', () => {
  const links = [link('KH1', GROUP_A.id, SALE_A.id_nhan_vien, SALE_A.id_nhan_vien)];
  const groupsById = new Map([[GROUP_A.id, GROUP_A]]);
  assert.deepEqual(buildCustomerGroupBadges(ADMIN, links, groupsById), { KH1: { id: 'G1', name: 'Thu - Yến - Thanh' } });
});

test('buildCustomerGroupBadges: Sale là entered_by/assigned_to của chính quan hệ đó -> thấy badge', () => {
  const links = [link('KH1', GROUP_A.id, SALE_A.id_nhan_vien, SALE_A.id_nhan_vien)];
  const groupsById = new Map([[GROUP_A.id, GROUP_A]]);
  assert.deepEqual(buildCustomerGroupBadges(SALE_A, links, groupsById), { KH1: { id: 'G1', name: 'Thu - Yến - Thanh' } });
});

test('buildCustomerGroupBadges: Sale KHÔNG phải entered_by/assigned_to, KHÔNG phải Leader/Admin -> KHÔNG có key trong result (test bắt buộc #4 — không leak tên group)', () => {
  const links = [link('KH1', GROUP_A.id, SALE_B.id_nhan_vien, SALE_B.id_nhan_vien)];
  const groupsById = new Map([[GROUP_A.id, GROUP_A]]);
  const result = buildCustomerGroupBadges(SALE_A, links, groupsById);
  assert.deepEqual(result, {});
});

test('buildCustomerGroupBadges: Sale là member hợp lệ của group nhưng customer là của đồng đội khác trong CÙNG group -> vẫn KHÔNG thấy (đúng rule "Sale không xem toàn bộ customer nhóm", test bắt buộc #4)', () => {
  const links = [link('KH1', GROUP_A.id, SALE_B.id_nhan_vien, SALE_B.id_nhan_vien)];
  const groupsById = new Map([[GROUP_A.id, GROUP_A]]);
  // SALE_A không phải leader_id của GROUP_A (LEADER mới là) và không phải
  // entered_by/assigned_to của KH1 -> false dù cùng nhóm với SALE_B.
  assert.deepEqual(buildCustomerGroupBadges(SALE_A, links, groupsById), {});
});

test('buildCustomerGroupBadges: link.group_id không có trong groupsById (group lạ/dữ liệu thiếu) -> bỏ qua, KHÔNG throw, KHÔNG hiện badge sai', () => {
  const links = [link('KH1', 'G_UNKNOWN', SALE_A.id_nhan_vien, SALE_A.id_nhan_vien)];
  assert.deepEqual(buildCustomerGroupBadges(SALE_A, links, new Map()), {});
});

test('buildCustomerGroupBadges: nhiều customer, mỗi customer badge độc lập theo đúng link/group của chính nó', () => {
  const links = [
    link('KH1', GROUP_A.id, SALE_A.id_nhan_vien, SALE_A.id_nhan_vien),
    link('KH2', GROUP_B.id, SALE_A.id_nhan_vien, SALE_A.id_nhan_vien),
  ];
  const groupsById = new Map([[GROUP_A.id, GROUP_A], [GROUP_B.id, GROUP_B]]);
  const result = buildCustomerGroupBadges(SALE_A, links, groupsById);
  assert.deepEqual(result, {
    KH1: { id: 'G1', name: 'Thu - Yến - Thanh' },
    KH2: { id: 'G2', name: 'Nhóm VIP' },
  });
});
