// Campaign CSKH work queue (M1B.1) — bản CLIENT-SIDE thuần của
// canManageMembership/isMembershipDirectManager (src/lib/crm-auth.ts).
// KHÔNG import trực tiếp crm-auth.ts vào component 'use client' vì file đó
// import next/headers (server-only) — tách riêng để dùng an toàn ở client và
// test được độc lập. Đây CHỈ điều khiển việc HIỂN THỊ nút; authority thật sự
// vẫn được enforce lại ở server (API routes) không phụ thuộc vào module này.
export interface ActingUser {
  id_nhan_vien: string;
  ho_ten: string;
}

export function canActOnMembership(
  actor: ActingUser | null | undefined,
  isAdmin: boolean,
  member: { telesale_id?: string | null },
  campaign: { owner_name?: string | null } | undefined,
  employees: { id_nhan_vien: string; ql_truc_tiep?: string | null }[],
): boolean {
  if (!actor) return false;
  if (isAdmin) return true;
  if (campaign?.owner_name === actor.ho_ten) return true;
  if (member.telesale_id === actor.id_nhan_vien) return true;
  const telesale = member.telesale_id ? employees.find(employee => employee.id_nhan_vien === member.telesale_id) : undefined;
  return Boolean(telesale && telesale.ql_truc_tiep === actor.ho_ten);
}
