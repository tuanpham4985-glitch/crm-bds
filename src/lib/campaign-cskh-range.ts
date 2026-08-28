// Campaign CSKH work queue — "Chọn khách: Từ [x] đến [y]" + "Chia đều cho
// Sale". Thứ tự DUY NHẤT dùng cho range này là thứ tự CampaignCskhWorkQueue
// đang hiển thị: created_at ASC (nguyên trạng từ getCampaignMembersWithCustomers,
// campaign.ts — KHÔNG đổi) rồi lọc qua matchesMembershipQueueFilter (search +
// bucket) — ĐÚNG bằng useMemo `filtered` trong CampaignCskhWorkQueue.tsx.
// Module thuần (không đụng DB/next-headers) để UI (preview ngay khi gõ số,
// non-authoritative) và server (resolve thật trước khi ghi, campaign.ts) dùng
// chung 1 định nghĩa — tránh 2 nơi tính khác nhau -> off-by-one/lệch kết quả.
import { bucketOf } from './campaign-cskh-bucket';

// Addendum — Assigned Customer Visibility + Overlap Protection: authority
// cho "đã chia hay chưa" là ĐÚNG CampaignMembership.telesale_id (KHÔNG thêm
// field is_assigned riêng). assignment_status cũng phản ánh cùng trạng thái
// (do bulkAddAndDistribute set đồng thời) nhưng task yêu cầu tường minh
// dùng telesale_id — 1 nguồn thật duy nhất, không suy diễn qua field khác.
export interface MembershipAssignable {
  telesale_id?: string | null;
}

export function isMembershipAssigned(member: MembershipAssignable): boolean {
  return Boolean(member.telesale_id);
}

export interface MembershipAssignmentBreakdown {
  total: number;
  assigned: number;
  unassigned: number;
}

/** "Preview: tổng trong range, số đã chia, số chưa chia, số thực tế sẽ được chia" — số sẽ được chia = unassigned (Chia đều luôn bỏ qua khách đã có Sale). */
export function membershipAssignmentBreakdown(members: readonly MembershipAssignable[]): MembershipAssignmentBreakdown {
  const assigned = members.filter(isMembershipAssigned).length;
  return { total: members.length, assigned, unassigned: members.length - assigned };
}

export type MembershipAssignmentFilter = 'all' | 'unassigned' | 'assigned';

export interface MembershipQueueFilter {
  search?: string;
  /**
   * MembershipBucket | '' ở phía UI (state đã typed) — nhưng module này cũng
   * nhận giá trị từ JSON request (server, đã qua JSON.parse, không còn type)
   * nên khai báo string cho khớp cả 2 phía; so khớp qua === với bucketOf() nên
   * giá trị lạ chỉ đơn giản không match (không throw, không cần validate).
   */
  bucket?: string;
  /** Filter "Tất cả | Chưa chia | Đã chia" — bỏ qua/'all' = không lọc theo assignment. */
  assignment?: MembershipAssignmentFilter;
}

export interface MembershipQueueFilterable extends MembershipAssignable {
  customer?: { ten_KH?: string | null; so_dien_thoai?: string | null } | null;
  telesale_name?: string | null;
  trang_thai_cham_soc?: string | null;
  ngay_lien_he_tiep?: string | null;
}

/** Mirror ĐÚNG điều kiện `filtered` useMemo trong CampaignCskhWorkQueue.tsx. */
export function matchesMembershipQueueFilter(
  member: MembershipQueueFilterable,
  filter: MembershipQueueFilter,
  now: Date = new Date(),
): boolean {
  const q = (filter.search || '').trim().toLowerCase();
  const matchesSearch = !q || [member.customer?.ten_KH, member.customer?.so_dien_thoai, member.telesale_name]
    .some(value => (value || '').toLowerCase().includes(q));
  const matchesBucket = !filter.bucket || bucketOf(member, now) === filter.bucket;
  const matchesAssignment = !filter.assignment || filter.assignment === 'all'
    || (filter.assignment === 'assigned' ? isMembershipAssigned(member) : !isMembershipAssigned(member));
  return matchesSearch && matchesBucket && matchesAssignment;
}

export interface MembershipRangeInput {
  from: number;
  to: number;
}

export type MembershipRangeResult<T> =
  | { ok: true; ids: T[]; total: number }
  | { ok: false; error: string; total: number };

/**
 * orderedFiltered PHẢI đã đúng thứ tự (created_at asc) + đã lọc sẵn (search/
 * bucket) trước khi gọi — hàm này chỉ validate + cắt [from, to] (1-indexed,
 * inclusive cả 2 đầu). "to" so với total của CHÍNH tập đã lọc (đúng yêu cầu
 * "range áp dụng trên tập sau filter"), không phải tổng toàn Campaign.
 */
export function resolveMembershipRange<T>(orderedFiltered: readonly T[], range: MembershipRangeInput): MembershipRangeResult<T> {
  const total = orderedFiltered.length;
  if (!Number.isInteger(range.from) || range.from < 1) {
    return { ok: false, error: 'Từ phải là số nguyên >= 1', total };
  }
  if (!Number.isInteger(range.to) || range.to < range.from) {
    return { ok: false, error: 'Đến phải là số nguyên >= Từ', total };
  }
  if (range.to > total) {
    return { ok: false, error: `Đến không được vượt quá tổng số khách phù hợp (${total})`, total };
  }
  // from=1,to=200 -> slice(0,200) -> đúng 200 phần tử (index 0..199) — không off-by-one.
  return { ok: true, ids: orderedFiltered.slice(range.from - 1, range.to), total };
}
