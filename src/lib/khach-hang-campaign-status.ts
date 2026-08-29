// CUSTOMER USED-IN-CAMPAIGN VISIBILITY — pure predicate/count helpers dùng
// chung bởi GET /api/khach-hang (filter tri-state + summary + badge) và
// route range-campaign-status (preview cho Customer Range). Authority DUY
// NHẤT ở đây: "tồn tại >= 1 CampaignMembership với customer_id = Customer.id"
// (membershipCustomerIds, lấy từ getCampaignMembershipCustomerRefs) — KHÔNG
// BAO GIỜ dùng telesale_id (đó là authority của /phan-khach → Theo Campaign,
// hoàn toàn độc lập, xem campaign-cskh-range.ts). Đây chỉ là
// visibility/provenance warning trên /khach-hang, KHÔNG phải global lock —
// Customer đã ở Campaign A vẫn match matchesCampaignStatusFilter('not_in_campaign')
// = false một cách bình thường khi thêm vào Campaign B (mỗi Campaign tự tính
// theo đúng distinct customer_id, không theo cặp customer+campaign cụ thể vì
// đây là view "đã từng vào bất kỳ Campaign nào chưa", không phải "vào Campaign
// đích này chưa" — dedupe/idempotent khi thêm vào ĐÚNG Campaign đích vẫn hoàn
// toàn do @@unique([customer_id, campaign_id]) + skipDuplicates lo, không
// liên quan tới module này).
export type CampaignStatusFilter = 'all' | 'in_campaign' | 'not_in_campaign';

export function isCustomerInCampaign(customerId: string, membershipCustomerIds: ReadonlySet<string>): boolean {
  return membershipCustomerIds.has(customerId);
}

export function matchesCampaignStatusFilter(
  customerId: string,
  membershipCustomerIds: ReadonlySet<string>,
  filter: CampaignStatusFilter,
): boolean {
  if (filter === 'in_campaign') return membershipCustomerIds.has(customerId);
  if (filter === 'not_in_campaign') return !membershipCustomerIds.has(customerId);
  return true;
}

export interface CampaignMembershipSummary {
  inCampaign: number;
  notInCampaign: number;
}

/**
 * customerIds PHẢI là tập ĐÃ áp mọi filter khác (search/nguon/sale/du_an/
 * from/to/permission) NHƯNG CHƯA áp campaignStatus — dùng để tính summary
 * "Tổng X · Đã vào Campaign Y · Chưa vào Campaign Z" phản ánh đúng scope hiện
 * tại, không lệch giữa các tab Tất cả/Đã vào/Chưa vào (cả 3 số PHẢI giống
 * nhau ở cả 3 tab vì cùng tính trên 1 scope duy nhất).
 */
export function summarizeCampaignMembership(
  customerIds: readonly string[],
  membershipCustomerIds: ReadonlySet<string>,
): CampaignMembershipSummary {
  const inCampaign = customerIds.filter(id => membershipCustomerIds.has(id)).length;
  return { inCampaign, notInCampaign: customerIds.length - inCampaign };
}
