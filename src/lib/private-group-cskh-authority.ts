// Private Group CSKH work queue — bản CLIENT-SIDE thuần của
// canViewGroupCustomer (src/lib/private-group-auth.ts). KHÔNG import trực
// tiếp private-group-auth.ts vào component 'use client' vì file đó import
// crm-auth.ts (next/headers, server-only) — tách riêng để dùng an toàn ở
// client và test được độc lập, CÙNG pattern với campaign-cskh-authority.ts.
// Đây CHỈ điều khiển việc HIỂN THỊ nút; authority thật sự vẫn được enforce
// lại ở server (API routes /interaction, /qualification) không phụ thuộc
// vào module này.
export interface ActingUser {
  id_nhan_vien: string;
  ho_ten: string;
}

/** CÙNG boundary với canViewGroupCustomer (server): Admin, hoặc Leader của
 * ĐÚNG group này, hoặc chính actor là entered_by/assigned_to của ĐÚNG quan hệ
 * này — Sale member khác trong cùng group KHÔNG tự động true. */
export function canActOnPrivateGroupCustomer(
  actor: ActingUser | null | undefined,
  isAdmin: boolean,
  group: { leader_id: string } | undefined,
  relation: { entered_by_id: string; assigned_to_id: string },
): boolean {
  if (!actor) return false;
  if (isAdmin) return true;
  if (group?.leader_id === actor.id_nhan_vien) return true;
  return relation.entered_by_id === actor.id_nhan_vien || relation.assigned_to_id === actor.id_nhan_vien;
}
