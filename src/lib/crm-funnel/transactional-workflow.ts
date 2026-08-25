import { Prisma } from '../../generated/prisma/client';
import { prisma } from '../db/client';
import { isPostgresEnabled } from '../db/feature-flags';
import type {
  CrmBanGiaoEntry, CrmChamSocEntry, KhachHang, LeadScoreHistoryEntry,
  MucDoQuanTam, TrangThaiChamSoc,
} from '../types';
import { appendBanGiao, appendChamSoc, parseJsonList } from '../crm-workflow';
import { calculateLeadQuality } from './scoring';
import type { CrmSessionUser } from '../crm-auth';
import { isHandoffEligible, isOwnershipLocked, validRejectionReason } from './handoff-policy';

export class TransactionalCrmRequiredError extends Error {
  constructor() { super('Qualified Lead Funnel yêu cầu PostgreSQL CRM được bật và đã migrate.'); }
}

export function assertTransactionalCrm(): void {
  if (!isPostgresEnabled('crm') || !process.env.DATABASE_URL) throw new TransactionalCrmRequiredError();
}

type Tx = Prisma.TransactionClient;
type DirectManager = { id_nhan_vien: string; ho_ten: string } | null;

async function serializable<T>(operation: (tx: Tx) => Promise<T>): Promise<T> {
  assertTransactionalCrm();
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await prisma.$transaction(operation, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      lastError = error;
      const code = error instanceof Prisma.PrismaClientKnownRequestError ? error.code : '';
      if (code !== 'P2034' && code !== 'P2002') throw error;
    }
  }
  throw lastError;
}

function nowIso(): string { return new Date().toISOString(); }

function customerScoreInput(customer: Record<string, unknown>): Parameters<typeof calculateLeadQuality>[0] {
  return customer as Parameters<typeof calculateLeadQuality>[0];
}

async function maybeCreateHandoff(
  tx: Tx,
  customer: Record<string, unknown> & { id_khach_hang: string; telesale_phu_trach: string | null; trang_thai_ban_giao: string | null },
  actor: CrmSessionUser,
  directManager: DirectManager,
  idempotencyKey: string,
  score: number,
  rank: string,
  note?: string,
) {
  if (!isHandoffEligible(customer.qualification_status as string | null)) return null;
  if (customer.trang_thai_ban_giao === 'Đã nhận' || customer.trang_thai_ban_giao === 'Từ chối') return null;
  const active = await tx.crmHandoff.findUnique({ where: { active_key: customer.id_khach_hang } });
  if (active) return active;

  const status = directManager ? 'WAITING_ACCEPTANCE' : 'NEEDS_MANAGER';
  return tx.crmHandoff.create({
    data: {
      customer_id: customer.id_khach_hang,
      idempotency_key: `handoff:${idempotencyKey}`,
      active_key: customer.id_khach_hang,
      status,
      telesale_name: customer.telesale_phu_trach || actor.ho_ten,
      sale_id: directManager?.id_nhan_vien,
      sale_name: directManager?.ho_ten,
      created_by_id: actor.id_nhan_vien,
      created_by_name: actor.ho_ten,
      manager_note: note,
      qualification_score: score,
      qualification_rank: rank,
    },
  });
}

export async function recordInteractionTransactional(input: {
  customerId: string;
  actor: CrmSessionUser;
  idempotencyKey: string;
  result: TrangThaiChamSoc;
  interest: MucDoQuanTam;
  note: string;
  nextContact?: string;
  directManager: DirectManager;
}) {
  return serializable(async tx => {
    const customer = await tx.khachHang.findUnique({ where: { id_khach_hang: input.customerId } });
    if (!customer) throw new Error('CUSTOMER_NOT_FOUND');
    const history = parseJsonList<CrmChamSocEntry>(customer.lich_su_cham_soc ?? undefined);
    const interactionId = `CS_${input.idempotencyKey}`;
    if (history.some(item => item.id === interactionId)) {
      return { customer, handoff: await tx.crmHandoff.findUnique({ where: { active_key: input.customerId } }), idempotent: true };
    }

    const now = nowIso();
    const entry: CrmChamSocEntry = {
      id: interactionId,
      thoi_gian: now,
      nguoi_thuc_hien: input.actor.ho_ten,
      id_nguoi_thuc_hien: input.actor.id_nhan_vien,
      ket_qua: input.result,
      muc_do_quan_tam: input.interest,
      ghi_chu: input.note,
      ngay_lien_he_tiep: input.nextContact,
    };
    const scoreResult = calculateLeadQuality({
      ...customer,
      trang_thai_cham_soc: input.result,
      muc_do_quan_tam: input.interest,
    } as Parameters<typeof calculateLeadQuality>[0]);
    const scoreHistory = parseJsonList<LeadScoreHistoryEntry>(customer.lead_score_history ?? undefined);
    const scoreEntry: LeadScoreHistoryEntry = {
      at: now,
      actor_id: input.actor.id_nhan_vien,
      actor_name: input.actor.ho_ten,
      old_score: customer.lead_quality_score,
      new_score: scoreResult.score,
      old_rank: customer.lead_quality_rank as LeadScoreHistoryEntry['old_rank'],
      new_rank: scoreResult.rank,
      breakdown: scoreResult.breakdown,
    };
    const updated = await tx.khachHang.update({
      where: { id_khach_hang: input.customerId },
      data: {
        trang_thai_cham_soc: input.result,
        muc_do_quan_tam: input.interest,
        ngay_lien_he_cuoi: now,
        ngay_lien_he_tiep: input.nextContact || null,
        so_lan_lien_he: { increment: 1 },
        lich_su_cham_soc: appendChamSoc(customer.lich_su_cham_soc ?? undefined, entry),
        qualification_status: scoreResult.qualificationStatus,
        lead_quality_score: scoreResult.score,
        lead_quality_rank: scoreResult.rank,
        lead_score_breakdown: JSON.stringify(scoreResult.breakdown),
        lead_score_history: JSON.stringify([...scoreHistory, scoreEntry]),
        ngay_quan_tam: input.result === 'Quan tâm' ? customer.ngay_quan_tam || now : customer.ngay_quan_tam,
        qualified_at: scoreResult.qualificationStatus === 'QUALIFIED' ? customer.qualified_at || now : customer.qualified_at,
        hot_at: scoreResult.qualificationStatus === 'HOT' ? customer.hot_at || now : customer.hot_at,
        row_version: { increment: 1 },
      },
    });
    const handoff = await maybeCreateHandoff(tx, updated, input.actor, input.directManager, input.idempotencyKey, scoreResult.score, scoreResult.rank, input.note);
    if (handoff) {
      const event: CrmBanGiaoEntry = {
        id: handoff.id,
        thoi_gian: handoff.created_at.toISOString(),
        hanh_dong: 'Bàn giao',
        nguoi_thuc_hien: input.actor.ho_ten,
        telesale: handoff.telesale_name,
        sale_nhan: handoff.sale_name || '',
        ghi_chu: input.note,
      };
      const withHandoff = await tx.khachHang.update({
        where: { id_khach_hang: input.customerId },
        data: {
          sale_nhan_khach: handoff.sale_name,
          trang_thai_ban_giao: handoff.status === 'NEEDS_MANAGER' ? 'Thiếu người nhận' : 'Chờ xác nhận',
          ban_giao_luc: handoff.created_at.toISOString(),
          lich_su_ban_giao: appendBanGiao(updated.lich_su_ban_giao ?? undefined, event),
          row_version: { increment: 1 },
        },
      });
      return { customer: withHandoff, handoff, idempotent: false };
    }
    return { customer: updated, handoff: null, idempotent: false };
  });
}

export async function updateQualificationTransactional(input: {
  customerId: string;
  actor: CrmSessionUser;
  idempotencyKey: string;
  patch: Pick<KhachHang, 'du_an' | 'san_pham_quan_tam' | 'nhu_cau' | 'ngan_sach_min' | 'ngan_sach_max' | 'muc_dich' | 'thoi_gian_du_kien' | 'phuong_an_tai_chinh' | 'khu_vuc_yeu_cau' | 'muc_do_quan_tam' | 'hanh_dong_tiep_theo' | 'nguon'>;
  directManager: DirectManager;
}) {
  return serializable(async tx => {
    const customer = await tx.khachHang.findUnique({ where: { id_khach_hang: input.customerId } });
    if (!customer) throw new Error('CUSTOMER_NOT_FOUND');
    const existingHistory = parseJsonList<LeadScoreHistoryEntry>(customer.lead_score_history ?? undefined);
    if (existingHistory.some(item => item.idempotency_key === input.idempotencyKey)) {
      return {
        customer,
        handoff: await tx.crmHandoff.findUnique({ where: { active_key: input.customerId } }),
        score: calculateLeadQuality(customerScoreInput(customer)),
      };
    }
    const merged = { ...customer, ...input.patch };
    const result = calculateLeadQuality(customerScoreInput(merged));
    const now = nowIso();
    const history = existingHistory;
    const historyEntry: LeadScoreHistoryEntry = {
      idempotency_key: input.idempotencyKey,
      at: now, actor_id: input.actor.id_nhan_vien, actor_name: input.actor.ho_ten,
      old_score: customer.lead_quality_score, new_score: result.score,
      old_rank: customer.lead_quality_rank as LeadScoreHistoryEntry['old_rank'], new_rank: result.rank,
      breakdown: result.breakdown,
    };
    const updated = await tx.khachHang.update({
      where: { id_khach_hang: input.customerId },
      data: {
        du_an: input.patch.du_an,
        san_pham_quan_tam: input.patch.san_pham_quan_tam,
        nhu_cau: input.patch.nhu_cau,
        ngan_sach_min: input.patch.ngan_sach_min,
        ngan_sach_max: input.patch.ngan_sach_max,
        muc_dich: input.patch.muc_dich,
        thoi_gian_du_kien: input.patch.thoi_gian_du_kien,
        phuong_an_tai_chinh: input.patch.phuong_an_tai_chinh,
        khu_vuc_yeu_cau: input.patch.khu_vuc_yeu_cau,
        muc_do_quan_tam: input.patch.muc_do_quan_tam,
        hanh_dong_tiep_theo: input.patch.hanh_dong_tiep_theo,
        nguon: input.patch.nguon,
        qualification_status: result.qualificationStatus,
        lead_quality_score: result.score,
        lead_quality_rank: result.rank,
        lead_score_breakdown: JSON.stringify(result.breakdown),
        lead_score_history: JSON.stringify([...history, historyEntry]),
        qualified_at: result.qualificationStatus === 'QUALIFIED' ? customer.qualified_at || now : customer.qualified_at,
        hot_at: result.qualificationStatus === 'HOT' ? customer.hot_at || now : customer.hot_at,
        row_version: { increment: 1 },
      },
    });
    const handoff = await maybeCreateHandoff(tx, updated, input.actor, input.directManager, input.idempotencyKey, result.score, result.rank);
    if (!handoff) return { customer: updated, handoff: null, score: result };
    const event: CrmBanGiaoEntry = {
      id: handoff.id, thoi_gian: handoff.created_at.toISOString(), hanh_dong: 'Bàn giao',
      nguoi_thuc_hien: input.actor.ho_ten, telesale: handoff.telesale_name,
      sale_nhan: handoff.sale_name || '', ghi_chu: 'Tự động từ Qualified Lead Funnel',
    };
    const withHandoff = await tx.khachHang.update({
      where: { id_khach_hang: input.customerId },
      data: {
        sale_nhan_khach: handoff.sale_name,
        trang_thai_ban_giao: handoff.status === 'NEEDS_MANAGER' ? 'Thiếu người nhận' : 'Chờ xác nhận',
        ban_giao_luc: handoff.created_at.toISOString(),
        lich_su_ban_giao: appendBanGiao(updated.lich_su_ban_giao ?? undefined, event),
        row_version: { increment: 1 },
      },
    });
    return { customer: withHandoff, handoff, score: result };
  });
}

async function ensurePipeline(tx: Tx, customer: Awaited<ReturnType<Tx['khachHang']['findUnique']>> & {}) {
  if (!customer) throw new Error('CUSTOMER_NOT_FOUND');
  const existingLink = await tx.crmPipelineLink.findUnique({ where: { customer_id: customer.id_khach_hang } });
  if (existingLink) return tx.pipeline.findUnique({ where: { id_pipeline: existingLink.pipeline_id } });
  let pipeline = await tx.pipeline.findFirst({ where: { id_khach_hang: customer.id_khach_hang }, orderBy: { created_at: 'asc' } });
  if (!pipeline) {
    const project = customer.du_an ? await tx.duAn.findFirst({ where: { ten_du_an: customer.du_an } }) : null;
    const now = nowIso();
    pipeline = await tx.pipeline.create({ data: {
      id_pipeline: `PL_QL_${customer.id_khach_hang}`,
      id_khach_hang: customer.id_khach_hang,
      giai_doan: 'Mới',
      gia_tri_thuc_te: 0,
      sale_phu_trach: customer.sale_nhan_khach || customer.sale_phu_trach || '',
      id_du_an: project?.id_du_an,
      ten_du_an: customer.du_an,
      hoa_hong: 0,
      tien_hoa_hong: 0,
      ngay_cap_nhat: now,
    } });
  }
  await tx.crmPipelineLink.create({ data: { customer_id: customer.id_khach_hang, pipeline_id: pipeline.id_pipeline } });
  return pipeline;
}

export async function transitionHandoffTransactional(input: {
  customerId: string;
  actor: CrmSessionUser;
  idempotencyKey: string;
  action: 'handoff' | 'accept' | 'reject';
  targetSale?: { id_nhan_vien: string; ho_ten: string };
  reason?: string;
}) {
  return serializable(async tx => {
    const customer = await tx.khachHang.findUnique({ where: { id_khach_hang: input.customerId } });
    if (!customer) throw new Error('CUSTOMER_NOT_FOUND');
    const handoffHistory = parseJsonList<CrmBanGiaoEntry>(customer.lich_su_ban_giao ?? undefined);
    const eventId = `BG_${input.idempotencyKey}`;
    if (handoffHistory.some(event => event.id === eventId)) {
      const previous = await tx.crmHandoff.findFirst({ where: { customer_id: input.customerId }, orderBy: { updated_at: 'desc' } });
      const link = await tx.crmPipelineLink.findUnique({ where: { customer_id: input.customerId } });
      const pipeline = link ? await tx.pipeline.findUnique({ where: { id_pipeline: link.pipeline_id } }) : null;
      return { customer, handoff: previous, pipeline };
    }
    if (isOwnershipLocked(customer.trang_thai_ban_giao) && input.action !== 'accept') throw new Error('HANDOFF_ALREADY_ACCEPTED');
    let active = await tx.crmHandoff.findUnique({ where: { active_key: input.customerId } });
    const now = new Date();

    if (input.action === 'handoff') {
      if (!input.targetSale) throw new Error('SALE_REQUIRED');
      if (active) {
        active = await tx.crmHandoff.update({
          where: { id: active.id },
          data: { sale_id: input.targetSale.id_nhan_vien, sale_name: input.targetSale.ho_ten, status: 'WAITING_ACCEPTANCE', manager_note: input.reason },
        });
      } else {
        active = await tx.crmHandoff.create({ data: {
          customer_id: input.customerId, idempotency_key: `handoff:${input.idempotencyKey}`,
          active_key: input.customerId, status: 'WAITING_ACCEPTANCE',
          telesale_name: customer.telesale_phu_trach || '', sale_id: input.targetSale.id_nhan_vien,
          sale_name: input.targetSale.ho_ten, created_by_id: input.actor.id_nhan_vien,
          created_by_name: input.actor.ho_ten, manager_note: input.reason,
          qualification_score: customer.lead_quality_score, qualification_rank: customer.lead_quality_rank,
        } });
      }
      const event: CrmBanGiaoEntry = { id: eventId, thoi_gian: now.toISOString(), hanh_dong: 'Bàn giao', nguoi_thuc_hien: input.actor.ho_ten, telesale: active.telesale_name, sale_nhan: input.targetSale.ho_ten, ghi_chu: input.reason };
      const updated = await tx.khachHang.update({ where: { id_khach_hang: input.customerId }, data: {
        sale_nhan_khach: input.targetSale.ho_ten, trang_thai_ban_giao: 'Chờ xác nhận',
        ban_giao_luc: now.toISOString(), sale_xac_nhan_luc: null,
        lich_su_ban_giao: appendBanGiao(customer.lich_su_ban_giao ?? undefined, event), row_version: { increment: 1 },
      } });
      return { customer: updated, handoff: active, pipeline: null };
    }

    if (!active) {
      const latest = await tx.crmHandoff.findFirst({ where: { customer_id: input.customerId }, orderBy: { created_at: 'desc' } });
      if (latest && ((input.action === 'accept' && latest.status === 'ACCEPTED') || (input.action === 'reject' && latest.status === 'REJECTED'))) {
        return { customer, handoff: latest, pipeline: null };
      }
      throw new Error('ACTIVE_HANDOFF_NOT_FOUND');
    }
    if (input.action === 'accept') {
      if (active.sale_name !== input.actor.ho_ten) throw new Error('NOT_HANDOFF_RECEIVER');
      active = await tx.crmHandoff.update({ where: { id: active.id }, data: {
        status: 'ACCEPTED', active_key: null, accepted_by_id: input.actor.id_nhan_vien,
        accepted_by_name: input.actor.ho_ten, accepted_at: now,
      } });
      const event: CrmBanGiaoEntry = { id: eventId, thoi_gian: now.toISOString(), hanh_dong: 'Xác nhận', nguoi_thuc_hien: input.actor.ho_ten, telesale: active.telesale_name, sale_nhan: active.sale_name || '' };
      const updated = await tx.khachHang.update({ where: { id_khach_hang: input.customerId }, data: {
        sale_nhan_khach: active.sale_name, sale_phu_trach: active.sale_name || '', trang_thai_ban_giao: 'Đã nhận',
        sale_xac_nhan_luc: now.toISOString(), lich_su_ban_giao: appendBanGiao(customer.lich_su_ban_giao ?? undefined, event), row_version: { increment: 1 },
      } });
      const pipeline = await ensurePipeline(tx, updated);
      if (pipeline) await tx.pipeline.update({ where: { id_pipeline: pipeline.id_pipeline }, data: { sale_phu_trach: active.sale_name || '', ngay_cap_nhat: now.toISOString() } });
      return { customer: updated, handoff: active, pipeline };
    }

    if (!validRejectionReason(input.reason)) throw new Error('REJECTION_REASON_REQUIRED');
    if (active.sale_name !== input.actor.ho_ten) throw new Error('NOT_HANDOFF_RECEIVER');
    const rejectionReason = String(input.reason).trim();
    active = await tx.crmHandoff.update({ where: { id: active.id }, data: {
      status: 'REJECTED', active_key: null, rejected_by_id: input.actor.id_nhan_vien,
      rejected_by_name: input.actor.ho_ten, rejected_at: now, rejection_reason: rejectionReason,
    } });
    const event: CrmBanGiaoEntry = { id: eventId, thoi_gian: now.toISOString(), hanh_dong: 'Từ chối', nguoi_thuc_hien: input.actor.ho_ten, telesale: active.telesale_name, sale_nhan: active.sale_name || '', ghi_chu: rejectionReason };
    const updated = await tx.khachHang.update({ where: { id_khach_hang: input.customerId }, data: {
      trang_thai_ban_giao: 'Từ chối', sale_xac_nhan_luc: now.toISOString(),
      lich_su_ban_giao: appendBanGiao(customer.lich_su_ban_giao ?? undefined, event), row_version: { increment: 1 },
    } });
    return { customer: updated, handoff: active, pipeline: null };
  });
}

export async function assignTelesaleTransactional(input: { customerId: string; telesaleName: string; actor: CrmSessionUser }) {
  return serializable(async tx => {
    const customer = await tx.khachHang.findUnique({ where: { id_khach_hang: input.customerId } });
    if (!customer) throw new Error('CUSTOMER_NOT_FOUND');
    if (isOwnershipLocked(customer.trang_thai_ban_giao)) throw new Error('OWNERSHIP_LOCKED');
    return tx.khachHang.update({ where: { id_khach_hang: input.customerId }, data: { telesale_phu_trach: input.telesaleName || null, row_version: { increment: 1 } } });
  });
}
