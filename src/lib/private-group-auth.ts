// Private Group ("Nhóm riêng") — authorization THUẦN (không đụng DB/Next),
// cùng phong cách với crm-auth.ts (canManageCampaign/canManageMembership):
// mọi hàm nhận object dữ liệu đã fetch sẵn, trả về boolean/mảng đã lọc —
// route gọi các hàm này SAU KHI fetch, KHÔNG bao giờ tin filter phía client.
//
// RULE HIỆN TẠI (đã khoá lại theo quyết định business mới — thay thế rule cũ
// "Sale chỉ thấy customer của chính mình"):
//   READ tách biệt hoàn toàn với WRITE/ACT:
//   - READ: Admin xem toàn bộ; Leader xem toàn bộ Customer của nhóm mình lead;
//     Sale THÀNH VIÊN xem TOÀN BỘ Customer của MỌI nhóm mình là member (kể cả
//     customer do đồng đội khác nhập/được giao) — group membership = quyền
//     xem cả nhóm (canViewAllGroupCustomers/canViewGroupCustomer/
//     filterGroupCustomersForUser/buildCustomerGroupBadges).
//   - WRITE/ACT (CSKH "Chăm sóc"/"Đánh giá"): KHÔNG tự động mở rộng theo
//     membership — Sale CHỈ thao tác được customer chính mình nhập
//     (entered_by_id) hoặc được giao (assigned_to_id); Leader/Admin thao tác
//     được toàn bộ (canActOnPrivateGroupCustomer — dùng cho server route
//     interaction/qualification, KHÔNG dùng canViewGroupCustomer cho việc
//     này nữa để tránh lẫn READ vào WRITE).
// Sale ngoài nhóm (không phải Leader/member) vẫn KHÔNG thấy gì cả (cả 2 chiều).
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

/** Xóa nhóm — CHỈ Admin (cùng nguyên tắc canCreatePrivateGroup/
 * canChangePrivateGroupLeader: thay đổi cấu trúc team, không phải business
 * data hàng ngày) — Leader của CHÍNH nhóm đó cũng KHÔNG được tự xóa nhóm
 * mình lead, giống Leader không được tự đổi Leader của chính nhóm mình. */
export function canDeletePrivateGroup(user: CrmSessionUser): boolean {
  return isCrmAdmin(user);
}

/** Xem được TOÀN BỘ Customer của 1 nhóm (READ) — Admin, Leader của group đó,
 * HOẶC Sale THÀNH VIÊN của group đó (NEW policy: group membership => group-
 * wide READ, xem comment đầu file — thay thế rule cũ chỉ Admin/Leader). Đây
 * là authority CHỈ CHO XEM — KHÔNG dùng hàm này để gate hành động ghi/CSKH,
 * xem canActOnPrivateGroupCustomer bên dưới cho việc đó. */
export function canViewAllGroupCustomers(
  user: CrmSessionUser, group: PrivateGroupLike, members: readonly PrivateGroupMemberLike[]
): boolean {
  return isCrmAdmin(user) || isPrivateGroupLeader(user, group) || isPrivateGroupMember(user, group, members);
}

/** Giao lại (reassign) 1 Customer trong nhóm cho Sale khác — cùng quyền với
 * quản lý member (Leader/Admin), KHÔNG phải Sale thường (kể cả Sale đang là
 * entered_by/assigned_to hiện tại của chính customer đó) — group membership
 * (READ) KHÔNG mở rộng ra hành động quản lý này. */
export function canReassignGroupCustomer(user: CrmSessionUser, group: PrivateGroupLike): boolean {
  return isCrmAdmin(user) || isPrivateGroupLeader(user, group);
}

/** 1 Customer-relation cụ thể user này có được XEM không (READ) — Admin/
 * Leader/Sale thành viên của group đó luôn true (canViewAllGroupCustomers);
 * cộng thêm entered_by/assigned_to phòng hờ trường hợp actor có quan hệ với
 * customer này nhưng dữ liệu member bị thiếu/lệch (defensive, hiếm khi cần
 * vì actor luôn được thêm vào group trước khi nhập/được giao customer đó).
 * KHÔNG dùng hàm này để gate ghi/CSKH — xem canActOnPrivateGroupCustomer. */
export function canViewGroupCustomer(
  user: CrmSessionUser, group: PrivateGroupLike, relation: PrivateGroupCustomerLike,
  members: readonly PrivateGroupMemberLike[]
): boolean {
  return canViewAllGroupCustomers(user, group, members)
    || relation.entered_by_id === user.id_nhan_vien
    || relation.assigned_to_id === user.id_nhan_vien;
}

/** Thao tác (CSKH "Chăm sóc"/"Đánh giá") 1 Customer-relation cụ thể (WRITE/
 * ACT) — CỐ Ý tách riêng khỏi canViewGroupCustomer (đó là READ): Admin/Leader
 * của group luôn true; Sale CHỈ true nếu chính mình nhập (entered_by_id) HOẶC
 * đang được giao (assigned_to_id) — Sale thành viên khác trong CÙNG group
 * (dù xem được customer này qua canViewGroupCustomer) KHÔNG tự động thao tác
 * được. Mirror CHÍNH XÁC canActOnPrivateGroupCustomer (client-side, xem
 * private-group-cskh-authority.ts) — sửa 1 bên phải sửa cả 2, xem comment ở
 * đó. Dùng cho POST .../interaction và PUT .../qualification. */
export function canActOnPrivateGroupCustomer(
  user: CrmSessionUser, group: PrivateGroupLike, relation: PrivateGroupCustomerLike
): boolean {
  return isCrmAdmin(user) || isPrivateGroupLeader(user, group)
    || relation.entered_by_id === user.id_nhan_vien
    || relation.assigned_to_id === user.id_nhan_vien;
}

/** Lọc danh sách Customer-relation của 1 nhóm theo ĐÚNG quyền user (READ) —
 * dùng cho GET .../customers. Admin/Leader/Sale thành viên thấy TOÀN BỘ
 * customer của nhóm (NEW policy — group membership = group-wide READ); người
 * không phải Leader/member (route đã gate canViewPrivateGroup trước khi gọi
 * hàm này, nên nhánh else dưới đây chỉ còn ý nghĩa phòng thủ) chỉ thấy phần
 * của mình. KHÔNG BAO GIỜ trả nguyên mảng cho Sale rồi tin client tự lọc. */
export function filterGroupCustomersForUser<T extends PrivateGroupCustomerLike>(
  user: CrmSessionUser, group: PrivateGroupLike, members: readonly PrivateGroupMemberLike[], relations: readonly T[]
): T[] {
  if (canViewAllGroupCustomers(user, group, members)) return [...relations];
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

/** Union kết quả của resolveManualCustomerGroup — status thay vì throw ngay ở
 * đây (hàm này THUẦN, không phải nơi quyết định HTTP status) để caller
 * (createManualCustomerWithGroupLink) tự map sang lỗi phù hợp. */
export type ManualCustomerGroupResolution =
  /** Actor không thuộc Nhóm riêng nào -> customer thường, không group-link
   * (không phải mọi Customer đều cần thuộc 1 Private Group). */
  | { status: 'none' }
  /** Group đã xác định (auto-select duy nhất 1 nhóm, hoặc groupId hợp lệ đã
   * gửi lên khớp đúng 1 nhóm actor thuộc về). */
  | { status: 'ok'; group: PrivateGroupRef }
  /** Actor thuộc >=2 Nhóm riêng nhưng KHÔNG gửi groupId -> BẮT BUỘC chọn
   * trước khi tạo, KHÔNG đoán (locked business decision). */
  | { status: 'required' }
  /** groupId gửi lên KHÔNG thuộc danh sách Leader/member của actor (nhóm lạ,
   * gõ tay id, hoặc actor chỉ có 1 nhóm nhưng gửi groupId khác nhóm đó) ->
   * chặn, KHÔNG tạo Customer (tránh actor tự ý nhét khách vào nhóm không có
   * quyền qua gọi API trực tiếp — UI ẩn/hiện không phải security boundary). */
  | { status: 'forbidden' };

/**
 * Quyết định THUẦN (Flow D bước 3+4, xem crm-funnel/private-group.ts#
 * createManualCustomerWithGroupLink) — actor CÓ THỂ thuộc nhiều Nhóm riêng
 * cùng lúc (locked business model: 1 Sale có thể vừa ở nhóm A vừa ở nhóm B):
 *   - 0 nhóm -> 'none' (bỏ qua groupId nếu có gửi lên — actor không có nhóm
 *     nào để mà chọn, coi như không gửi).
 *   - ĐÚNG 1 nhóm -> auto-select nhóm đó; nếu client CÓ gửi groupId thì vẫn
 *     phải khớp đúng nhóm này (validate lại, không tin mù client).
 *   - >=2 nhóm -> groupId BẮT BUỘC và phải là 1 trong các nhóm actor thuộc về
 *     (Leader hoặc Sale member) -> 'required' nếu thiếu, 'forbidden' nếu sai.
 * Cùng 1 rule "groupId phải thuộc danh sách actor" áp dụng cho MỌI case khi
 * groupId có gửi lên — đây cũng CHÍNH LÀ đường dùng chung cho "Thêm khách từ
 * group detail" (groupId luôn được gửi tường minh, group đã xác định sẵn).
 */
export function resolveManualCustomerGroup(
  leaderOf: readonly PrivateGroupRef[],
  memberOf: readonly PrivateGroupRef[],
  requestedGroupId?: string | null,
): ManualCustomerGroupResolution {
  const distinct = new Map<string, string>();
  for (const g of [...leaderOf, ...memberOf]) distinct.set(g.id, g.name);
  const groups = [...distinct.entries()].map(([id, name]) => ({ id, name }));

  if (requestedGroupId) {
    const match = groups.find(g => g.id === requestedGroupId);
    return match ? { status: 'ok', group: match } : { status: 'forbidden' };
  }
  if (groups.length === 0) return { status: 'none' };
  if (groups.length === 1) return { status: 'ok', group: groups[0] };
  return { status: 'required' };
}

// ─── Badge "Nhóm riêng" trên bảng /khach-hang ───────────────────────────────

/** 1 dòng PrivateGroupCustomer thô (chưa join tên group) — customer_id thêm
 * vào so với PrivateGroupCustomerLike vì badge cần biết gắn cho khách nào. */
export interface PrivateGroupCustomerLinkLike extends PrivateGroupCustomerLike {
  customer_id: string;
}

/** Group tối thiểu cần để: (a) check quyền qua canViewGroupCustomer (cần
 * leader_id), (b) hiển thị tên thật (cần name) — KHÔNG hard-code label. */
export interface PrivateGroupBadgeSource extends PrivateGroupLike {
  name: string;
}

/**
 * Tính badge {id, name} cho từng customer_id theo ĐÚNG quyền actor — dùng để
 * enrich GET /api/khach-hang (badge Nhóm riêng dưới Tên KH), mirror pattern
 * campaignByCustomer (getCampaignNamesByCustomerIds trong campaign.ts):
 * page-scoped, 1 lần build cho cả trang, KHÔNG N+1 theo từng dòng.
 *
 * Authority tái dùng NGUYÊN VẸN canViewGroupCustomer (đã khoá bởi
 * private-group-auth.test.ts) — KHÔNG tạo rule mới cho riêng badge:
 *   - Admin, hoặc Leader của ĐÚNG group đó -> luôn thấy.
 *   - Sale THÀNH VIÊN của ĐÚNG group đó -> thấy badge của TOÀN BỘ customer
 *     nhóm đó (NEW policy — group membership = group-wide READ, xem comment
 *     đầu file), kể cả customer do đồng đội khác nhập/được giao.
 *   - Sale KHÔNG phải Leader/member của group đó -> vẫn có thể thấy nếu
 *     chính mình là entered_by/assigned_to của ĐÚNG quan hệ đó (defensive,
 *     xem comment canViewGroupCustomer).
 * link.group_id không khớp group nào trong `groupsById` (dữ liệu hiếm/lỗi
 * tham chiếu) -> bỏ qua, KHÔNG throw, KHÔNG hiện badge sai.
 */
export function buildCustomerGroupBadges(
  user: CrmSessionUser,
  links: readonly PrivateGroupCustomerLinkLike[],
  groupsById: ReadonlyMap<string, PrivateGroupBadgeSource>,
  members: readonly PrivateGroupMemberLike[],
): Record<string, { id: string; name: string }> {
  const result: Record<string, { id: string; name: string }> = {};
  for (const link of links) {
    const group = groupsById.get(link.group_id);
    if (!group) continue;
    if (!canViewGroupCustomer(user, group, link, members)) continue;
    result[link.customer_id] = { id: group.id, name: group.name };
  }
  return result;
}
