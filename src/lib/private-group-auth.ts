// Private Group ("Nhóm riêng") — authorization THUẦN (không đụng DB/Next),
// cùng phong cách với crm-auth.ts (canManageCampaign/canManageMembership):
// mọi hàm nhận object dữ liệu đã fetch sẵn, trả về boolean/mảng đã lọc —
// route gọi các hàm này SAU KHI fetch, KHÔNG bao giờ tin filter phía client.
//
// RULE BẮT BUỘC (đã khoá theo yêu cầu): Sale KHÔNG được xem toàn bộ Customer
// của nhóm — chỉ thấy customer do chính mình nhập (entered_by_id) hoặc được
// giao (assigned_to_id). Leader/Admin xem được toàn bộ Customer của nhóm.
import type { CrmSessionUser } from './crm-auth';
import { isCrmAdmin } from './crm-auth';

export interface PrivateGroupLike {
  id: string;
  leader_id: string;
}

export interface PrivateGroupMemberLike {
  group_id: string;
  employee_id: string;
}

export interface PrivateGroupCustomerLike {
  group_id: string;
  entered_by_id: string;
  assigned_to_id: string;
}

/** True nếu user là ĐÚNG Leader của group này (so theo id, không theo tên —
 * tránh trùng tên giữa 2 nhân viên, cùng lý do CampaignMembership dùng
 * telesale_id thay vì tên). */
export function isPrivateGroupLeader(user: CrmSessionUser, group: PrivateGroupLike): boolean {
  return group.leader_id === user.id_nhan_vien;
}

/** True nếu user là Sale THÀNH VIÊN của group này (không tính Leader — Leader
 * xác định qua isPrivateGroupLeader, không có row riêng trong members). */
export function isPrivateGroupMember(
  user: CrmSessionUser, group: PrivateGroupLike, members: readonly PrivateGroupMemberLike[]
): boolean {
  return members.some(m => m.group_id === group.id && m.employee_id === user.id_nhan_vien);
}

/** Xem được THÔNG TIN nhóm (tên, danh sách member, Leader) — Admin, Leader
 * của group, hoặc Sale thành viên. Sale thành viên CHỈ xem thông tin nhóm ở
 * mức này (tên/Leader/đồng đội) — KHÔNG suy ra được quyền xem toàn bộ customer
 * (đó là canViewAllGroupCustomers, chặt hơn). */
export function canViewPrivateGroup(
  user: CrmSessionUser, group: PrivateGroupLike, members: readonly PrivateGroupMemberLike[]
): boolean {
  return isCrmAdmin(user) || isPrivateGroupLeader(user, group) || isPrivateGroupMember(user, group, members);
}

/** Quản lý nhóm (đổi tên, đổi Leader, thêm/xoá member) — Admin luôn được;
 * Leader CHỈ được thêm/xoá MEMBER của chính nhóm mình (route phải tự chặn
 * riêng việc đổi tên/đổi Leader chỉ Admin, xem canChangePrivateGroupLeader —
 * KHÔNG dùng hàm này cho quyết định đó). */
export function canManagePrivateGroupMembers(user: CrmSessionUser, group: PrivateGroupLike): boolean {
  return isCrmAdmin(user) || isPrivateGroupLeader(user, group);
}

/** Đổi tên nhóm — Admin hoặc chính Leader của nhóm (đổi thông tin mô tả,
 * KHÔNG phải đổi ai là Leader). */
export function canRenamePrivateGroup(user: CrmSessionUser, group: PrivateGroupLike): boolean {
  return isCrmAdmin(user) || isPrivateGroupLeader(user, group);
}

/** Đổi CHÍNH Leader của nhóm — CHỈ Admin (giống campaignOwnerFieldsTouched:
 * Leader hiện tại không được tự đổi Leader của chính nhóm mình). */
export function canChangePrivateGroupLeader(user: CrmSessionUser): boolean {
  return isCrmAdmin(user);
}

/** Tạo nhóm mới — CHỈ Admin (giống tạo Campaign: thay đổi cấu trúc team,
 * không phải business data hàng ngày). */
export function canCreatePrivateGroup(user: CrmSessionUser): boolean {
  return isCrmAdmin(user);
}

/** Xem được TOÀN BỘ Customer của 1 nhóm — CHỈ Admin hoặc Leader của group đó.
 * Sale (kể cả thành viên) KHÔNG BAO GIỜ true ở đây — đây CHÍNH LÀ rule khoá:
 * "Sale KHÔNG ĐƯỢC XEM TOÀN BỘ CUSTOMER CỦA NHÓM". */
export function canViewAllGroupCustomers(user: CrmSessionUser, group: PrivateGroupLike): boolean {
  return isCrmAdmin(user) || isPrivateGroupLeader(user, group);
}

/** Giao lại (reassign) 1 Customer trong nhóm cho Sale khác — cùng quyền với
 * quản lý member (Leader/Admin), KHÔNG phải Sale thường (kể cả Sale đang là
 * entered_by/assigned_to hiện tại của chính customer đó). */
export function canReassignGroupCustomer(user: CrmSessionUser, group: PrivateGroupLike): boolean {
  return isCrmAdmin(user) || isPrivateGroupLeader(user, group);
}

/** 1 Customer-relation cụ thể user này có được xem/chăm sóc không — Admin/
 * Leader luôn true; Sale CHỈ true nếu chính mình nhập HOẶC đang được giao. */
export function canViewGroupCustomer(
  user: CrmSessionUser, group: PrivateGroupLike, relation: PrivateGroupCustomerLike
): boolean {
  return canViewAllGroupCustomers(user, group)
    || relation.entered_by_id === user.id_nhan_vien
    || relation.assigned_to_id === user.id_nhan_vien;
}

/** Lọc danh sách Customer-relation của 1 nhóm theo ĐÚNG quyền user — dùng
 * cho GET .../customers. Admin/Leader thấy hết; Sale chỉ thấy phần của mình
 * (entered_by HOẶC assigned_to) — KHÔNG BAO GIỜ trả nguyên mảng cho Sale rồi
 * tin client tự lọc (đây là chỗ SERVER phải tự quyết định, không phải UI). */
export function filterGroupCustomersForUser<T extends PrivateGroupCustomerLike>(
  user: CrmSessionUser, group: PrivateGroupLike, relations: readonly T[]
): T[] {
  if (canViewAllGroupCustomers(user, group)) return [...relations];
  return relations.filter(r => r.entered_by_id === user.id_nhan_vien || r.assigned_to_id === user.id_nhan_vien);
}

/** Lọc danh sách nhóm user được PHÉP THẤY trong "danh sách Nhóm riêng" (GET
 * /api/private-groups) — Admin thấy hết; người khác chỉ thấy nhóm mình là
 * Leader hoặc member. */
export function filterPrivateGroupsForUser<G extends PrivateGroupLike>(
  user: CrmSessionUser, groups: readonly G[], members: readonly PrivateGroupMemberLike[]
): G[] {
  if (isCrmAdmin(user)) return [...groups];
  return groups.filter(g => isPrivateGroupLeader(user, g) || isPrivateGroupMember(user, g, members));
}

export interface PrivateGroupRef { id: string; name: string }

/**
 * Quyết định THUẦN (Flow D bước 3+4, xem crm-funnel/private-group.ts#
 * createManualCustomerWithGroupLink): actor thuộc ĐÚNG 1 Nhóm riêng (gộp cả
 * vai trò Leader lẫn Sale member, loại trùng theo id) -> tự động gắn Customer
 * mới nhập vào ĐÚNG nhóm đó.
 *   - 0 nhóm -> null (customer thường, không có gì sai — không phải mọi
 *     Customer đều cần thuộc 1 Private Group).
 *   - ĐÚNG 1 nhóm -> group đó.
 *   - >1 nhóm (hiếm, VD vừa Leader nhóm A vừa Sale member nhóm B) -> KHÔNG
 *     đoán, trả về null (ambiguous) — v1 chưa xây UI chọn nhóm thủ công cho
 *     case hiếm này, an toàn hơn là tự ý chọn 1 trong nhiều nhóm.
 */
export function resolveAutoLinkGroup(
  leaderOf: readonly PrivateGroupRef[], memberOf: readonly PrivateGroupRef[]
): PrivateGroupRef | null {
  const distinct = new Map<string, string>();
  for (const g of [...leaderOf, ...memberOf]) distinct.set(g.id, g.name);
  if (distinct.size !== 1) return null;
  const [id, name] = [...distinct.entries()][0];
  return { id, name };
}
