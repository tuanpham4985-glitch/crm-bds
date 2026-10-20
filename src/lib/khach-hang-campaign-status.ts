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

/** Giá trị lạ/thiếu từ client -> undefined (= 'all'), không tin string bất kỳ. */
export function parseCampaignStatusFilter(value: unknown): CampaignStatusFilter | undefined {
  return value === 'in_campaign' || value === 'not_in_campaign' || value === 'all' ? value : undefined;
}

export function isCustomerInCampaign(customerId: string, membershipCustomerIds: ReadonlySet<string>): boolean {
  return membershipCustomerIds.has(customerId);
}

/**
 * privateGroupCustomerIds (tuỳ chọn): Customer thuộc Nhóm riêng ĐÃ có người
 * chăm sóc riêng — KHÔNG được coi là "Chưa vào Campaign" (khách trống để chia),
 * tránh trộn khách Nhóm riêng vào Campaign khi chia nhanh/theo khoảng.
 */
export function matchesCampaignStatusFilter(
  customerId: string,
  membershipCustomerIds: ReadonlySet<string>,
  filter: CampaignStatusFilter,
  privateGroupCustomerIds?: ReadonlySet<string>,
): boolean {
  if (filter === 'in_campaign') return membershipCustomerIds.has(customerId);
  if (filter === 'not_in_campaign') return !membershipCustomerIds.has(customerId) && !privateGroupCustomerIds?.has(customerId);
  return true;
}

export interface CampaignMembershipSummary {
  inCampaign: number;
  /** Thuộc Nhóm riêng và chưa vào Campaign — không tính là "Chưa vào Campaign". */
  inPrivateGroup: number;
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
  privateGroupCustomerIds?: ReadonlySet<string>,
): CampaignMembershipSummary {
  const inCampaign = customerIds.filter(id => membershipCustomerIds.has(id)).length;
  const inPrivateGroup = privateGroupCustomerIds
    ? customerIds.filter(id => !membershipCustomerIds.has(id) && privateGroupCustomerIds.has(id)).length
    : 0;
  return { inCampaign, inPrivateGroup, notInCampaign: customerIds.length - inCampaign - inPrivateGroup };
}
