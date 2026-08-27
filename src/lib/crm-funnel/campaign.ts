// Campaign Foundation (M1A) — Campaign là lớp trung gian giữa Customer và
// Telesale: 1 đợt/lý do CSKH cụ thể. CampaignMembership là 1 customer trong 1
// Campaign. KHÔNG bao giờ tạo/sửa KhachHang ở đây — chỉ tham chiếu bằng
// customer_id có sẵn. M1A CHỈ tạo/phân membership — không ghi field
// chăm sóc/qualification trên membership (đó là việc của M1B).
import { prisma } from '../db/client';
import { isPostgresEnabled } from '../db/feature-flags';
import { assertTransactionalCrm } from './transactional-workflow';
import type { CrmSessionUser } from '../crm-auth';
import type { PrismaClient } from '../../generated/prisma/client';

type TxClient = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

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
 * Dùng cho Campaign CSKH work queue (M1B.1) — danh sách membership kèm định
 * danh Customer (Tên/SĐT/Email) chỉ để HIỂN THỊ, read-only. KHÔNG BAO GIỜ ghi
 * vào KhachHang từ đây — mọi mutation CSKH của membership đi qua
 * membership-workflow.ts và chỉ target CampaignMembership.id.
 */
export async function getCampaignMembersWithCustomers(campaignId: string) {
  assertTransactionalCrm();
  const members = await prisma.campaignMembership.findMany({ where: { campaign_id: campaignId }, orderBy: { created_at: 'asc' } });
  const customerIds = [...new Set(members.map(member => member.customer_id))];
  const customers = customerIds.length
    ? await prisma.khachHang.findMany({
        where: { id_khach_hang: { in: customerIds } },
        select: { id_khach_hang: true, ten_KH: true, so_dien_thoai: true, email: true },
      })
    : [];
  const customerMap = new Map(customers.map(customer => [customer.id_khach_hang, customer]));
  // M1B.2 — join read-only CrmHandoff summary (status/sale_name) khi membership
  // đã có handoff_id, để UI biết ai là receiver hiện tại (hiện nút Accept/
  // Reject đúng người) mà không cần fetch riêng cho từng membership.
  const handoffIds = [...new Set(members.map(member => member.handoff_id).filter((id): id is string => Boolean(id)))];
  const handoffs = handoffIds.length
    ? await prisma.crmHandoff.findMany({ where: { id: { in: handoffIds } }, select: { id: true, status: true, sale_name: true } })
    : [];
  const handoffMap = new Map(handoffs.map(handoff => [handoff.id, handoff]));
  return members.map(member => ({
    ...member,
    customer: customerMap.get(member.customer_id)
      ? {
          ten_KH: customerMap.get(member.customer_id)!.ten_KH,
          so_dien_thoai: customerMap.get(member.customer_id)!.so_dien_thoai || '',
          email: customerMap.get(member.customer_id)!.email || '',
        }
      : null,
    handoff: member.handoff_id ? handoffMap.get(member.handoff_id) ?? null : null,
  }));
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
  /** Tổng số id đã có membership trong campaign này TỪ TRƯỚC (mọi assignment_status), trước khi gọi này. */
  alreadyMember: number;
  /** Trong alreadyMember: đã ASSIGNED từ trước — giữ nguyên, KHÔNG đụng vào trong lần gọi này. */
  alreadyAssigned: number;
  /** Membership hoàn toàn mới được tạo trong lần gọi này (mọi assignment_status). */
  created: number;
  /** Được gán ASSIGNED trong lần gọi này — gồm cả membership mới tạo lẫn membership UNASSIGNED có sẵn vừa được phân. */
  newlyAssigned: number;
  /**
   * Trạng thái CUỐI CÙNG sau lần gọi này: còn UNASSIGNED trong số các id hợp lệ
   * đã chọn (created hoặc có sẵn từ trước đều tính — KHÔNG chỉ đếm membership
   * mới tạo). VD: 3 membership UNASSIGNED có sẵn, quota chỉ đủ gán 2 -> đây
   * PHẢI = 1, không phải 0 (đây chính là fix cho counter bị hiểu sai).
   */
  stillUnassigned: number;
}

interface ExistingMembershipRef {
  customer_id: string;
  assignment_status: string;
}

interface BulkDistributionPlan {
  notFound: string[];
  alreadyMember: number;
  alreadyAssigned: number;
  toCreate: DistributionPlanItem[];
  toAssignExisting: DistributionPlanItem[];
  /** Xem BulkDistributeResult.stillUnassigned — tính trên toàn bộ id hợp lệ, không riêng toCreate. */
  stillUnassigned: number;
}

/**
 * Thuần (không đụng DB) — tách phần "quyết định phân ai" ra khỏi phần ghi DB để
 * test được không cần Postgres. Nguyên tắc:
 * - customer chưa có membership trong campaign này -> coi là "eligible", được
 *   đưa vào planDistribution như bình thường (tạo mới).
 * - customer đã có membership UNASSIGNED -> VẪN "eligible" để phân lần này
 *   (đây là fix cho bug: trước đây bị loại hoàn toàn nên không bao giờ phân được).
 * - customer đã có membership ASSIGNED -> loại khỏi eligible hoàn toàn, không
 *   bao giờ tự động gán lại (không chiếm chỗ trong round-robin/quantity).
 */
export function planBulkDistribution(input: {
  orderedIds: readonly string[];
  existingCustomerIds: ReadonlySet<string>;
  existingMemberships: readonly ExistingMembershipRef[];
  telesales: readonly TelesaleRef[];
  mode: DistributionMode;
  quantities?: Readonly<Record<string, number>>;
}): BulkDistributionPlan {
  const { orderedIds, existingCustomerIds, existingMemberships, telesales, mode, quantities } = input;

  const notFound = orderedIds.filter(id => !existingCustomerIds.has(id));
  const validIds = orderedIds.filter(id => existingCustomerIds.has(id));

  const membershipByCustomer = new Map(existingMemberships.map(m => [m.customer_id, m]));
  const alreadyAssignedIds = new Set(
    [...membershipByCustomer.values()].filter(m => m.assignment_status !== 'UNASSIGNED').map(m => m.customer_id),
  );

  const eligibleIds = validIds.filter(id => !alreadyAssignedIds.has(id));
  const plan = planDistribution({ customerIds: eligibleIds, telesales, mode, quantities });

  const toCreate = plan.filter(item => !membershipByCustomer.has(item.customer_id));
  const toAssignExisting = plan.filter(
    item => membershipByCustomer.has(item.customer_id) && item.assignment_status === 'ASSIGNED',
  );
  // plan chỉ chứa đúng các id "eligible" (mới + UNASSIGNED có sẵn) — nên phần còn
  // lại vẫn UNASSIGNED sau vòng phân này (mới tạo VẪN unassigned, hoặc có sẵn
  // nhưng rớt vào phần dư của quantity/mode 'none') đều nằm trong chính plan.
  const stillUnassigned = plan.filter(item => item.assignment_status === 'UNASSIGNED').length;

  return {
    notFound,
    alreadyMember: membershipByCustomer.size,
    alreadyAssigned: alreadyAssignedIds.size,
    toCreate,
    toAssignExisting,
    stillUnassigned,
  };
}

/**
 * Thêm 1 tập customer vào Campaign + phân Telesale trong 1 transaction.
 * KHÔNG BAO GIỜ tạo customer mới — chỉ tham chiếu id đã tồn tại. Customer đã
 * ASSIGNED trong ĐÚNG campaign này bị bỏ qua hoàn toàn (không đổi assignment
 * hiện có). Customer đã có membership nhưng còn UNASSIGNED thì được phân
 * trong lần gọi này (update, không tạo trùng) — chạy lại cùng input nhiều lần
 * vẫn an toàn (idempotent): lần 2 trở đi các membership đã ASSIGNED sẽ không
 * còn bị đổi nữa. unique(customer_id, campaign_id) ở schema là rào chắn cuối
 * cùng; createMany skipDuplicates + updateMany theo WHERE assignment_status
 * = 'UNASSIGNED' là lớp bảo vệ thêm cho trường hợp đụng độ concurrent.
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

    const existingMemberships = orderedIds.length
      ? await tx.campaignMembership.findMany({
          where: { campaign_id: input.campaignId, customer_id: { in: orderedIds } },
          select: { customer_id: true, assignment_status: true },
        })
      : [];

    const plan = planBulkDistribution({
      orderedIds, existingCustomerIds, existingMemberships,
      telesales: input.telesales, mode: input.mode, quantities: input.quantities,
    });

    if (plan.toCreate.length > 0) {
      await tx.campaignMembership.createMany({
        data: plan.toCreate.map(item => ({
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

    for (const item of plan.toAssignExisting) {
      // WHERE assignment_status: 'UNASSIGNED' là guard chống đụng độ concurrent —
      // nếu một transaction khác đã gán customer này trước, updateMany này
      // khớp 0 dòng thay vì ghi đè assignment đã có.
      await tx.campaignMembership.updateMany({
        where: { campaign_id: input.campaignId, customer_id: item.customer_id, assignment_status: 'UNASSIGNED' },
        data: {
          telesale_id: item.telesale_id,
          telesale_name: item.telesale_name,
          assignment_status: 'ASSIGNED',
          assigned_at: new Date(),
          assigned_by_id: input.actor.id_nhan_vien,
          assigned_by_name: input.actor.ho_ten,
        },
      });
    }

    return {
      campaignId: input.campaignId,
      requested: orderedIds.length,
      notFound: plan.notFound,
      alreadyMember: plan.alreadyMember,
      alreadyAssigned: plan.alreadyAssigned,
      created: plan.toCreate.length,
      newlyAssigned: plan.toCreate.filter(p => p.assignment_status === 'ASSIGNED').length + plan.toAssignExisting.length,
      stillUnassigned: plan.stillUnassigned,
    };
  });
}

// --- Admin Test Data Cleanup: xóa Campaign (+ memberships) an toàn --------
//
// CampaignMembership.campaign_id -> Campaign.id là FK thật với
// ON DELETE RESTRICT (migration 20260826000001) — Postgres tự chặn xóa
// Campaign còn membership. Vì vậy phải tự xóa memberships trước Campaign
// trong 1 transaction (không có cascade nào ở DB, không thêm cascade mới).
//
// KHÔNG BAO GIỜ đụng KhachHang ở đây — Customer cleanup vẫn hoàn toàn thuộc
// customerDeleteBlockReason() (crm-auth.ts), không tự động xóa Customer kèm
// Campaign.

const CAMPAIGN_DELETE_SAMPLE_LIMIT = 10;

export interface CampaignDeletePreflightSample {
  customer_id: string;
  ten_KH: string;
  telesale_name: string | null;
}

export interface CampaignDeletePreflight {
  campaign: { id: string; name: string; ten_du_an: string | null; owner_name: string | null } | null;
  membershipCount: number;
  sample: CampaignDeletePreflightSample[];
  blocked: boolean;
  blockedReason?: string;
}

/**
 * Quyết định THUẦN (không đụng DB) cho guard 2 CHIỀU chống orphan Handoff —
 * tách riêng khỏi truy vấn để test được logic block mà không cần Postgres
 * thật (đúng kiến trúc plan/execute đã dùng cho customerDeleteBlockReason).
 *
 * Chiều 1: CampaignMembership.handoff_id đã được set trên chính membership.
 * Chiều 2: CrmHandoff.campaign_membership_id (loose reference — KHÔNG có FK
 * ở schema, xem comment trên model CrmHandoff trong schema.prisma) có dòng
 * nào trỏ ngược tới 1 trong các membership này. Vì không có FK, DB sẽ KHÔNG
 * tự chặn hay báo lỗi nếu ta lỡ xóa membership đang bị CrmHandoff tham chiếu
 * — phải tự truy vấn bảng CrmHandoff thật để phát hiện (xem
 * queryHandoffBlockReason bên dưới), không thể suy diễn hay bỏ qua chỉ vì
 * hiện tại (M1B.2 đóng) chưa có code path nào ghi 2 field này (xác nhận bằng
 * grep toàn bộ src/ — xem campaign-delete-cleanup.test.ts).
 */
export function campaignHandoffBlockReason(input: { hasMembershipHandoffId: boolean; hasReferencingHandoff: boolean }): string | null {
  if (input.hasMembershipHandoffId) {
    return 'Campaign có membership đã liên kết Handoff (CampaignMembership.handoff_id) — không thể xóa.';
  }
  if (input.hasReferencingHandoff) {
    return 'Tồn tại Handoff tham chiếu tới membership của Campaign này (CrmHandoff.campaign_membership_id) — không thể xóa.';
  }
  return null;
}

/**
 * Truy vấn DB thật cho cả 2 chiều rồi gọi campaignHandoffBlockReason() — chạy
 * được cả ngoài transaction (preflight, dùng `prisma`) lẫn trong transaction
 * (re-check trước delete thật, dùng `tx`) — cùng 1 hàm, tránh lệch logic giữa
 * preflight và transaction-time check (TOCTOU).
 */
async function queryHandoffBlockReason(client: PrismaClient | TxClient, membershipIds: string[]): Promise<string | null> {
  if (membershipIds.length === 0) return null;
  const hasMembershipHandoffId = await client.campaignMembership.count({
    where: { id: { in: membershipIds }, handoff_id: { not: null } },
  }) > 0;
  const hasReferencingHandoff = await client.crmHandoff.count({
    where: { campaign_membership_id: { in: membershipIds } },
  }) > 0;
  return campaignHandoffBlockReason({ hasMembershipHandoffId, hasReferencingHandoff });
}

/**
 * Preflight cho Admin Test Data Cleanup — KHÔNG xóa gì, chỉ trả đủ thông tin
 * để Admin quyết định: Campaign, số membership, mẫu customer/sale, và
 * blocked+reason nếu có dependency Handoff không an toàn.
 */
export async function getCampaignDeletePreflight(campaignId: string): Promise<CampaignDeletePreflight> {
  assertTransactionalCrm();
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { id: true, name: true, ten_du_an: true, owner_name: true },
  });
  if (!campaign) return { campaign: null, membershipCount: 0, sample: [], blocked: false };

  const memberships = await prisma.campaignMembership.findMany({
    where: { campaign_id: campaignId },
    select: { id: true, customer_id: true, telesale_name: true },
    orderBy: { created_at: 'asc' },
  });

  const sampleMemberships = memberships.slice(0, CAMPAIGN_DELETE_SAMPLE_LIMIT);
  const customerIds = [...new Set(sampleMemberships.map(m => m.customer_id))];
  const customers = customerIds.length
    ? await prisma.khachHang.findMany({ where: { id_khach_hang: { in: customerIds } }, select: { id_khach_hang: true, ten_KH: true } })
    : [];
  const customerNameById = new Map(customers.map(c => [c.id_khach_hang, c.ten_KH]));
  const sample: CampaignDeletePreflightSample[] = sampleMemberships.map(m => ({
    customer_id: m.customer_id,
    ten_KH: customerNameById.get(m.customer_id) || m.customer_id,
    telesale_name: m.telesale_name,
  }));

  const blockedReason = await queryHandoffBlockReason(prisma, memberships.map(m => m.id));

  return {
    campaign,
    membershipCount: memberships.length,
    sample,
    blocked: Boolean(blockedReason),
    blockedReason: blockedReason || undefined,
  };
}

export class CampaignDeleteBlockedError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'CampaignDeleteBlockedError';
  }
}

/**
 * Xóa Campaign + toàn bộ CampaignMembership của nó trong 1 transaction.
 * KHÔNG BAO GIỜ đụng KhachHang. Re-check queryHandoffBlockReason() BÊN TRONG
 * transaction (không chỉ ở preflight) để tránh TOCTOU — nếu một Handoff vừa
 * được tạo tham chiếu tới membership này giữa lúc Admin xem preflight và lúc
 * bấm xác nhận, transaction phải phát hiện và rollback, không xóa liều.
 * Không tạo cascade DB mới — schema vẫn giữ nguyên ON DELETE RESTRICT; thứ
 * tự xóa (memberships trước, Campaign sau) hoàn toàn ở tầng application.
 */
export async function deleteCampaignWithMemberships(campaignId: string): Promise<{ campaignId: string; deletedMemberships: number }> {
  assertTransactionalCrm();
  return prisma.$transaction(async tx => {
    const campaign = await tx.campaign.findUnique({ where: { id: campaignId }, select: { id: true } });
    if (!campaign) throw new Error('Không tìm thấy Campaign');

    const memberships = await tx.campaignMembership.findMany({ where: { campaign_id: campaignId }, select: { id: true } });
    const membershipIds = memberships.map(m => m.id);

    const blockedReason = await queryHandoffBlockReason(tx, membershipIds);
    if (blockedReason) throw new CampaignDeleteBlockedError(blockedReason);

    if (membershipIds.length > 0) {
      await tx.campaignMembership.deleteMany({ where: { campaign_id: campaignId } });
    }
    await tx.campaign.delete({ where: { id: campaignId } });

    return { campaignId, deletedMemberships: membershipIds.length };
  });
}
