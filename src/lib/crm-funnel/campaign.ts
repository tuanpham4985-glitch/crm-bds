// Campaign Foundation (M1A) — Campaign là lớp trung gian giữa Customer và
// Telesale: 1 đợt/lý do CSKH cụ thể. CampaignMembership là 1 customer trong 1
// Campaign. KHÔNG bao giờ tạo/sửa KhachHang ở đây — chỉ tham chiếu bằng
// customer_id có sẵn. M1A CHỈ tạo/phân membership — không ghi field
// chăm sóc/qualification trên membership (đó là việc của M1B).
import { prisma } from '../db/client';
import { isPostgresEnabled } from '../db/feature-flags';
import { assertTransactionalCrm } from './transactional-workflow';
import type { CrmSessionUser } from '../crm-auth';

export interface CreateCampaignInput {
  name: string;
  id_du_an?: string;
  ten_du_an?: string;
  status?: string;
  start_date?: string;
  end_date?: string;
  description?: string;
  owner_id?: string;
  owner_name?: string;
  actor: CrmSessionUser;
}

export async function createCampaign(input: CreateCampaignInput) {
  assertTransactionalCrm();
  return prisma.campaign.create({
    data: {
      name: input.name,
      id_du_an: input.id_du_an,
      ten_du_an: input.ten_du_an,
      status: input.status || 'active',
      start_date: input.start_date,
      end_date: input.end_date,
      description: input.description,
      owner_id: input.owner_id,
      owner_name: input.owner_name,
      created_by_id: input.actor.id_nhan_vien,
      created_by_name: input.actor.ho_ten,
    },
  });
}

export async function listCampaigns() {
  assertTransactionalCrm();
  return prisma.campaign.findMany({ orderBy: { created_at: 'desc' } });
}

export async function getCampaign(id: string) {
  assertTransactionalCrm();
  return prisma.campaign.findUnique({ where: { id } });
}

export interface UpdateCampaignPatch {
  name?: string;
  status?: string;
  start_date?: string | null;
  end_date?: string | null;
  description?: string | null;
  owner_id?: string | null;
  owner_name?: string | null;
}

export async function updateCampaign(id: string, patch: UpdateCampaignPatch) {
  assertTransactionalCrm();
  return prisma.campaign.update({ where: { id }, data: patch });
}

export interface CampaignSummary {
  total: number;
  unassigned: number;
  assigned: number;
  byTelesale: { telesale_id: string; telesale_name: string; count: number }[];
}

export async function getCampaignSummary(campaignId: string): Promise<CampaignSummary> {
  assertTransactionalCrm();
  const members = await prisma.campaignMembership.findMany({ where: { campaign_id: campaignId } });
  const unassigned = members.filter(m => m.assignment_status === 'UNASSIGNED').length;
  const byTelesaleMap = new Map<string, { telesale_id: string; telesale_name: string; count: number }>();
  for (const m of members) {
    if (m.assignment_status === 'UNASSIGNED' || !m.telesale_id) continue;
    const existing = byTelesaleMap.get(m.telesale_id);
    if (existing) existing.count += 1;
    else byTelesaleMap.set(m.telesale_id, { telesale_id: m.telesale_id, telesale_name: m.telesale_name || '', count: 1 });
  }
  return {
    total: members.length,
    unassigned,
    assigned: members.length - unassigned,
    byTelesale: [...byTelesaleMap.values()].sort((a, b) => b.count - a.count),
  };
}

export async function getCampaignMembers(campaignId: string) {
  assertTransactionalCrm();
  return prisma.campaignMembership.findMany({ where: { campaign_id: campaignId }, orderBy: { created_at: 'asc' } });
}

/**
 * Dùng cho delete-guard (customerDeleteBlockReason) — trả về danh sách
 * customer_id đã có ít nhất 1 CampaignMembership (bất kỳ campaign nào). KHÔNG
 * throw khi Postgres CRM chưa bật — delete guard phải luôn hoạt động được kể
 * cả khi tính năng Campaign chưa bật ở deployment đó (trả về mảng rỗng).
 */
export async function getCampaignMembershipCustomerRefs(): Promise<{ customer_id: string }[]> {
  if (!isPostgresEnabled('crm') || !process.env.DATABASE_URL) return [];
  return prisma.campaignMembership.findMany({ select: { customer_id: true }, distinct: ['customer_id'] });
}

// --- Bulk distribution ------------------------------------------------

export type DistributionMode = 'round_robin' | 'quantity' | 'none';

export interface TelesaleRef {
  id_nhan_vien: string;
  ho_ten: string;
}

export interface DistributionPlanItem {
  customer_id: string;
  telesale_id: string | null;
  telesale_name: string | null;
  assignment_status: 'ASSIGNED' | 'UNASSIGNED';
}

export interface DistributionInput {
  /** Customer id MỚI (chưa có membership trong campaign này), theo đúng thứ tự cần phân — thuần, không đọc DB. */
  customerIds: readonly string[];
  telesales: readonly TelesaleRef[];
  mode: DistributionMode;
  /** telesale_id -> số lượng, chỉ dùng ở mode 'quantity'. */
  quantities?: Readonly<Record<string, number>>;
}

/**
 * Thuần (không đụng DB) — deterministic theo đúng thứ tự customerIds/telesales
 * truyền vào, không random/shuffle. round_robin: customerIds[i] -> telesales[i % n].
 * quantity: lấp đầy từng telesale theo quota (theo đúng thứ tự telesales), phần dư
 * (nếu tổng quota < số customer) -> UNASSIGNED, không tự ý chia tiếp.
 */
export function planDistribution(input: DistributionInput): DistributionPlanItem[] {
  const { customerIds, telesales, mode } = input;

  if (mode === 'none' || telesales.length === 0) {
    return customerIds.map(customer_id => ({
      customer_id, telesale_id: null, telesale_name: null, assignment_status: 'UNASSIGNED',
    }));
  }

  if (mode === 'round_robin') {
    return customerIds.map((customer_id, i) => {
      const t = telesales[i % telesales.length];
      return { customer_id, telesale_id: t.id_nhan_vien, telesale_name: t.ho_ten, assignment_status: 'ASSIGNED' };
    });
  }

  // mode === 'quantity'
  const quantities = input.quantities || {};
  const plan: DistributionPlanItem[] = [];
  let cursor = 0;
  for (const t of telesales) {
    const quota = Math.max(0, Math.floor(Number(quantities[t.id_nhan_vien]) || 0));
    for (let k = 0; k < quota && cursor < customerIds.length; k++, cursor++) {
      plan.push({ customer_id: customerIds[cursor], telesale_id: t.id_nhan_vien, telesale_name: t.ho_ten, assignment_status: 'ASSIGNED' });
    }
  }
  for (; cursor < customerIds.length; cursor++) {
    plan.push({ customer_id: customerIds[cursor], telesale_id: null, telesale_name: null, assignment_status: 'UNASSIGNED' });
  }
  return plan;
}

export interface BulkDistributeInput {
  campaignId: string;
  /** Id khách hàng do Admin chọn — có thể trùng lặp/không theo thứ tự chuẩn, hàm tự dedupe (giữ thứ tự xuất hiện đầu tiên). */
  customerIds: readonly string[];
  telesales: readonly TelesaleRef[];
  mode: DistributionMode;
  quantities?: Readonly<Record<string, number>>;
  actor: CrmSessionUser;
}

export interface BulkDistributeResult {
  campaignId: string;
  requested: number;
  notFound: string[];
  alreadyMember: number;
  created: number;
  assigned: number;
  unassigned: number;
}

/**
 * Thêm 1 tập customer vào Campaign + phân Telesale trong 1 transaction.
 * KHÔNG BAO GIỜ tạo customer mới — chỉ tham chiếu id đã tồn tại. Customer đã
 * có membership trong ĐÚNG campaign này bị bỏ qua (không tạo trùng, không đổi
 * assignment hiện có) — chạy lại cùng input nhiều lần là an toàn (idempotent).
 * unique(customer_id, campaign_id) ở schema là rào chắn cuối cùng; createMany
 * skipDuplicates là lớp bảo vệ thêm cho trường hợp đụng độ concurrent.
 */
export async function bulkAddAndDistribute(input: BulkDistributeInput): Promise<BulkDistributeResult> {
  assertTransactionalCrm();

  const seen = new Set<string>();
  const orderedIds: string[] = [];
  for (const id of input.customerIds) {
    if (typeof id === 'string' && id.trim() && !seen.has(id)) {
      seen.add(id);
      orderedIds.push(id);
    }
  }

  return prisma.$transaction(async tx => {
    const existingCustomers = orderedIds.length
      ? await tx.khachHang.findMany({ where: { id_khach_hang: { in: orderedIds } }, select: { id_khach_hang: true } })
      : [];
    const existingCustomerIds = new Set(existingCustomers.map(c => c.id_khach_hang));
    const notFound = orderedIds.filter(id => !existingCustomerIds.has(id));
    const validIds = orderedIds.filter(id => existingCustomerIds.has(id));

    const existingMemberships = validIds.length
      ? await tx.campaignMembership.findMany({
          where: { campaign_id: input.campaignId, customer_id: { in: validIds } },
          select: { customer_id: true },
        })
      : [];
    const alreadyMemberSet = new Set(existingMemberships.map(m => m.customer_id));
    const newIds = validIds.filter(id => !alreadyMemberSet.has(id));

    const plan = planDistribution({
      customerIds: newIds, telesales: input.telesales, mode: input.mode, quantities: input.quantities,
    });

    if (plan.length > 0) {
      await tx.campaignMembership.createMany({
        data: plan.map(item => ({
          customer_id: item.customer_id,
          campaign_id: input.campaignId,
          telesale_id: item.telesale_id,
          telesale_name: item.telesale_name,
          assignment_status: item.assignment_status,
          assigned_at: item.assignment_status === 'ASSIGNED' ? new Date() : null,
          assigned_by_id: item.assignment_status === 'ASSIGNED' ? input.actor.id_nhan_vien : null,
          assigned_by_name: item.assignment_status === 'ASSIGNED' ? input.actor.ho_ten : null,
        })),
        skipDuplicates: true,
      });
    }

    return {
      campaignId: input.campaignId,
      requested: orderedIds.length,
      notFound,
      alreadyMember: alreadyMemberSet.size,
      created: plan.length,
      assigned: plan.filter(p => p.assignment_status === 'ASSIGNED').length,
      unassigned: plan.filter(p => p.assignment_status === 'UNASSIGNED').length,
    };
  });
}
