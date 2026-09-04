// Private Group CSKH work queue — bản CLIENT-SIDE thuần của
// canActOnPrivateGroupCustomer (src/lib/private-group-auth.ts, WRITE/ACT
// authority). KHÔNG import trực tiếp private-group-auth.ts vào component
// 'use client' vì file đó import crm-auth.ts (next/headers, server-only) —
// tách riêng để dùng an toàn ở client và test được độc lập, CÙNG pattern
// với campaign-cskh-authority.ts. Đây CHỈ điều khiển việc HIỂN THỊ nút;
// authority thật sự vẫn được enforce lại ở server (API routes /interaction,
// /qualification qua canActOnPrivateGroupCustomer server-side) không phụ
// thuộc vào module này.
export interface ActingUser {
  id_nhan_vien: string;
  ho_ten: string;
}

export interface ActingGroupMember {
  employee_id: string;
}

/** CÙNG boundary với canActOnPrivateGroupCustomer (server, private-group-
 * auth.ts) — theo quyết định business mới nhất: data Nhóm riêng dùng CHUNG
 * cho cả nhóm cùng chăm sóc, nên WRITE ĐỒNG NHẤT với READ (group membership)
 * thay vì chỉ giới hạn entered_by/assigned_to: Admin, Leader của ĐÚNG group
 * này, HOẶC bất kỳ Sale thành viên nào của group đó đều act được trên MỌI
 * customer của group — cộng thêm entered_by/assigned_to phòng hờ data
 * member thiếu/lệch (defensive, cùng lý do canViewGroupCustomer). */
export function canActOnPrivateGroupCustomer(
  actor: ActingUser | null | undefined,
  isAdmin: boolean,
  group: { leader_id: string } | undefined,
  relation: { entered_by_id: string; assigned_to_id: string },
  members: readonly ActingGroupMember[],
): boolean {
  if (!actor) return false;
  if (isAdmin) return true;
  if (group?.leader_id === actor.id_nhan_vien) return true;
  if (members.some(m => m.employee_id === actor.id_nhan_vien)) return true;
  return relation.entered_by_id === actor.id_nhan_vien || relation.assigned_to_id === actor.id_nhan_vien;
}
