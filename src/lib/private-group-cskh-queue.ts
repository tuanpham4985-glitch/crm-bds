// Private Group CSKH work queue (task hiện tại) — module thuần (.ts, không
// JSX) để test không cần React runtime, cùng pattern campaign-cskh-range.ts.
// KHÔNG tái dùng matchesMembershipQueueFilter (campaign-cskh-range.ts) —
// hàm đó match theo telesale_name/isMembershipAssigned (khái niệm "phân data
// CSKH theo Campaign"), Nhóm riêng không có — search ở đây match theo
// assigned_to_name ("Sale CSKH" trong nhóm), KHÔNG match theo entered_by_name.
import { bucketOf, type MembershipBucket } from './campaign-cskh-bucket';

export interface PrivateGroupCustomerQueueFilterable {
  customer?: { ten_KH?: string | null; so_dien_thoai?: string | null } | null;
  assigned_to_name?: string | null;
  trang_thai_cham_soc?: string | null;
  ngay_lien_he_tiep?: string | null;
}

export interface PrivateGroupCustomerQueueFilter {
  search?: string;
  /** MembershipBucket | '' ở UI; string ở đây để nhận cả giá trị đã qua JSON
   * (không type-narrow) — so khớp qua === với bucketOf() nên giá trị lạ chỉ
   * đơn giản không match, không throw. */
  bucket?: string;
}

/** Mirror ĐÚNG điều kiện `filtered` useMemo trong PrivateGroupCskhWorkQueue.tsx. */
export function matchesPrivateGroupCustomerQueueFilter(
  relation: PrivateGroupCustomerQueueFilterable,
  filter: PrivateGroupCustomerQueueFilter,
  now: Date = new Date(),
): boolean {
  const q = (filter.search || '').trim().toLowerCase();
  const matchesSearch = !q || [relation.customer?.ten_KH, relation.customer?.so_dien_thoai, relation.assigned_to_name]
    .some(value => (value || '').toLowerCase().includes(q));
  const matchesBucket = !filter.bucket || bucketOf(relation, now) === filter.bucket;
  return matchesSearch && matchesBucket;
}

export type { MembershipBucket as PrivateGroupCustomerBucket };
