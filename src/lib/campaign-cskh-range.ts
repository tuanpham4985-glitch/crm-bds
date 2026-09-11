// Campaign CSKH work queue — "Chọn khách: Từ [x] đến [y]" + "Chia đều cho
// Sale". Thứ tự DUY NHẤT dùng cho range này là thứ tự CampaignCskhWorkQueue
// đang hiển thị: created_at ASC (nguyên trạng từ getCampaignMembersWithCustomers,
// campaign.ts — KHÔNG đổi) rồi lọc qua matchesMembershipQueueFilter (search +
// bucket) — ĐÚNG bằng useMemo `filtered` trong CampaignCskhWorkQueue.tsx.
// Module thuần (không đụng DB/next-headers) để UI (preview ngay khi gõ số,
// non-authoritative) và server (resolve thật trước khi ghi, campaign.ts) dùng
// chung 1 định nghĩa — tránh 2 nơi tính khác nhau -> off-by-one/lệch kết quả.
import { bucketOf, type MembershipBucket } from './campaign-cskh-bucket';
import { resolveListRange, type ListRangeInput, type ListRangeResult } from './list-range';

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
  /**
   * CSKH Sale Progress (V1) drill-down — exact-match Sale identity theo
   * CampaignMembership.telesale_id (KHÔNG dùng telesale_name/fuzzy search,
   * tránh trùng tên hiển thị của 2 nhân viên khác nhau). Độc lập với `search`.
   */
  telesaleId?: string;
  /**
   * CSKH Sale Progress (V1) drill-down — additive multi-bucket match, dùng
   * khi 1 cột summary (VD "Đang chăm sóc") gộp NHIỀU bucket gốc của
   * bucketOf() (ở đây: 'Đang chăm sóc' + 'Gọi lại hôm nay') mà KHÔNG đổi ý
   * nghĩa/single-value của `bucket` ở trên — 2 field độc lập, dùng riêng
   * hoặc cùng lúc đều được (AND với nhau nếu cả 2 cùng có mặt).
   */
  buckets?: readonly MembershipBucket[];
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
  const bucket = bucketOf(member, now);
  const matchesBucket = !filter.bucket || bucket === filter.bucket;
  const matchesBuckets = !filter.buckets || filter.buckets.length === 0 || filter.buckets.includes(bucket);
  const matchesAssignment = !filter.assignment || filter.assignment === 'all'
    || (filter.assignment === 'assigned' ? isMembershipAssigned(member) : !isMembershipAssigned(member));
  const matchesTelesale = !filter.telesaleId || member.telesale_id === filter.telesaleId;
  return matchesSearch && matchesBucket && matchesBuckets && matchesAssignment && matchesTelesale;
}

// REMEDIATION (Customer Range Selection): validate+slice thuần chuyển sang
// list-range.ts (generic, dùng chung với Customer range tại /khach-hang) —
// alias lại đúng tên cũ để KHÔNG phải sửa bất kỳ call site/test nào đã có
// (campaign.ts, CampaignCskhWorkQueue.tsx). "orderedFiltered" PHẢI đã đúng
// thứ tự (created_at asc) + đã lọc sẵn (search/bucket/assignment) trước khi
// gọi — "to" so với total của CHÍNH tập đã lọc, không phải tổng toàn Campaign.
export type MembershipRangeInput = ListRangeInput;
export type MembershipRangeResult<T> = ListRangeResult<T>;
export const resolveMembershipRange = resolveListRange;

// ── CSKH Sale Progress (V1) ────────────────────────────────────────────────
// Bảng "Tiến độ Sale" trong CampaignCskhWorkQueue — audit đã xác nhận: aggregate
// CLIENT-SIDE từ đúng `members` (CampaignMembership) đã fetch sẵn cho detail
// queue, KHÔNG fetch/query thêm (tránh tái tạo vấn đề Neon Network Transfer đã
// xử lý ở KhachHang/attendance). Semantics LOCKED theo ChatGPT Architecture
// Review — KHÔNG tạo predicate cạnh tranh với bucketOf()/isMembershipAssigned():
//   - assigned    = isMembershipAssigned(member) (telesale_id, KHÔNG dùng
//                   assignment_status — cùng authority với membershipAssignmentBreakdown).
//   - unprocessed = assigned && bucketOf() === 'Chưa gọi'.
//   - inProgress  = assigned && bucketOf() IN ('Đang chăm sóc', 'Gọi lại hôm nay')
//                   — GỘP 2 bucket gốc CHỈ ở summary này, KHÔNG đổi bucketOf()/
//                   detail queue.
//   - overdue     = assigned && bucketOf() === 'Quá lịch'.
//   - interested  = assigned && bucketOf() === 'Quan tâm'.
//   - completed   = assigned && bucketOf() === 'Hoàn tất / Không phù hợp'.
//   - processed   = assigned - unprocessed (Quá lịch/Quan tâm/Hoàn tất đều tính
//                   là đã xử lý — chỉ 'Chưa gọi' mới là chưa xử lý).
//   - progressPercent = assigned > 0 ? round(processed / assigned * 100) : 0.
export interface SaleProgressSummary {
  telesaleId: string;
  telesaleName: string;
  assigned: number;
  unprocessed: number;
  inProgress: number;
  overdue: number;
  interested: number;
  completed: number;
  processed: number;
  progressPercent: number;
}

/**
 * Group theo telesale_id (identity đáng tin cậy — KHÔNG group theo
 * telesale_name để tránh trộn nhầm 2 nhân viên trùng tên hiển thị).
 * telesale_name chỉ dùng làm display label (lấy giá trị không rỗng gần nhất
 * gặp trong `members` cho cùng 1 telesale_id). KHÔNG mutate `members`.
 * Output sort ổn định theo telesaleName rồi telesaleId (tie-break) — không
 * ranking/scoring.
 */
export function summarizeMembersBySale(
  members: readonly MembershipQueueFilterable[],
  now: Date = new Date(),
): SaleProgressSummary[] {
  interface Accum {
    telesaleName: string;
    assigned: number; unprocessed: number; inProgress: number;
    overdue: number; interested: number; completed: number;
  }
  const byTelesaleId = new Map<string, Accum>();
  for (const member of members) {
    if (!isMembershipAssigned(member)) continue;
    const telesaleId = member.telesale_id as string;
    const entry = byTelesaleId.get(telesaleId) ?? {
      telesaleName: member.telesale_name || telesaleId,
      assigned: 0, unprocessed: 0, inProgress: 0, overdue: 0, interested: 0, completed: 0,
    };
    entry.assigned += 1;
    if (member.telesale_name) entry.telesaleName = member.telesale_name;
    switch (bucketOf(member, now)) {
      case 'Chưa gọi': entry.unprocessed += 1; break;
      case 'Đang chăm sóc': case 'Gọi lại hôm nay': entry.inProgress += 1; break;
      case 'Quá lịch': entry.overdue += 1; break;
      case 'Quan tâm': entry.interested += 1; break;
      case 'Hoàn tất / Không phù hợp': entry.completed += 1; break;
    }
    byTelesaleId.set(telesaleId, entry);
  }
  const rows: SaleProgressSummary[] = [...byTelesaleId.entries()].map(([telesaleId, entry]) => {
    const processed = entry.assigned - entry.unprocessed;
    return {
      telesaleId, telesaleName: entry.telesaleName,
      assigned: entry.assigned, unprocessed: entry.unprocessed, inProgress: entry.inProgress,
      overdue: entry.overdue, interested: entry.interested, completed: entry.completed,
      processed, progressPercent: entry.assigned > 0 ? Math.round((processed / entry.assigned) * 100) : 0,
    };
  });
  rows.sort((a, b) => a.telesaleName.localeCompare(b.telesaleName) || a.telesaleId.localeCompare(b.telesaleId));
  return rows;
}
