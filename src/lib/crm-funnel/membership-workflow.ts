// Campaign CSKH (M1B.1) — CampaignMembership-scoped interaction/qualification
// workflow. Song song với transactional-workflow.ts (Customer-global, KHÔNG
// đụng vào file đó) — mọi mutation ở đây target ĐÚNG CampaignMembership.id,
// KHÔNG BAO GIỜ ghi ngược lại KhachHang. Khách không có membership tiếp tục
// dùng transactional-workflow.ts như cũ, không thay đổi gì.
//
// KHÔNG tạo CrmHandoff/Pipeline/đổi Sale ownership ở đây dù membership đạt
// INTERESTED/QUALIFIED/HOT — đó là phạm vi M1B.2.
import { Prisma } from '../../generated/prisma/client';
import { prisma } from '../db/client';
import { appendChamSoc, parseJsonList } from '../crm-workflow';
import { calculateLeadQuality, type ScoreableLead } from './scoring';
import { assertTransactionalCrm } from './transactional-workflow';
import type { CrmSessionUser } from '../crm-auth';
import type {
  CrmChamSocEntry, LeadScoreHistoryEntry, LeadScoreResult,
  MucDoQuanTam, QualificationStatus, TrangThaiChamSoc,
} from '../types';

type Tx = Prisma.TransactionClient;

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

export interface CampaignContext {
  ten_du_an?: string | null;
}

// Chủ ý dùng type thuần (khớp ScoreableLead) thay vì Pick<CampaignMembership,...>:
// Prisma trả trang_thai_cham_soc/muc_do_quan_tam/muc_dich/thoi_gian_du_kien dạng
// "string | null" (schema String?), không phải union hẹp — cùng cách xử lý với
// transactional-workflow.ts (customer as Parameters<typeof calculateLeadQuality>[0]).
type ScoreFields = Omit<ScoreableLead, 'du_an'>;

interface HistoryFields {
  lich_su_cham_soc?: string | null;
  lead_score_history?: string | null;
  lead_quality_score: number;
  lead_quality_rank: string;
}

/**
 * CampaignMembership không có field "du_an" riêng (Campaign đã có ten_du_an) —
 * ghép ngữ cảnh dự án từ Campaign vào lúc chấm điểm, không lưu trùng lặp.
 */
export function buildMembershipScoreInput(membership: ScoreFields, campaign: CampaignContext): ScoreableLead {
  return { ...membership, du_an: campaign.ten_du_an ?? null };
}

// --- Interaction (Chăm sóc) ------------------------------------------------

export interface MembershipInteractionInput {
  idempotencyKey: string;
  result: TrangThaiChamSoc;
  interest: MucDoQuanTam;
  note: string;
  nextContact?: string;
  actor: CrmSessionUser;
  /** Chỉ dùng cho test — thời điểm cố định thay vì Date.now(). */
  now?: string;
}

export interface MembershipInteractionPatch {
  trang_thai_cham_soc: TrangThaiChamSoc;
  muc_do_quan_tam: MucDoQuanTam;
  ngay_lien_he_cuoi: string;
  ngay_lien_he_tiep: string | null;
  lich_su_cham_soc: string;
  qualification_status: QualificationStatus;
  lead_quality_score: number;
  lead_quality_rank: string;
  lead_score_breakdown: string;
  lead_score_history: string;
}

export type MembershipInteractionPlan =
  | { idempotent: true }
  | { idempotent: false; patch: MembershipInteractionPatch; score: LeadScoreResult };

type InteractionSnapshot = ScoreFields & HistoryFields;

/**
 * Thuần (không đụng DB) — tách quyết định "ghi gì" ra khỏi phần ghi DB, test
 * được không cần Postgres. Idempotency dựa trên id "CS_${idempotencyKey}"
 * trong lich_su_cham_soc — CÙNG format CrmChamSocEntry với Customer-global,
 * chỉ khác nguồn (Membership thay vì KhachHang).
 */
export function planMembershipInteraction(
  membership: InteractionSnapshot,
  campaign: CampaignContext,
  input: MembershipInteractionInput,
): MembershipInteractionPlan {
  const history = parseJsonList<CrmChamSocEntry>(membership.lich_su_cham_soc ?? undefined);
  const interactionId = `CS_${input.idempotencyKey}`;
  if (history.some(item => item.id === interactionId)) return { idempotent: true };

  const now = input.now || nowIso();
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
  const score = calculateLeadQuality(buildMembershipScoreInput(
    { ...membership, trang_thai_cham_soc: input.result, muc_do_quan_tam: input.interest }, campaign,
  ));
  const scoreHistory = parseJsonList<LeadScoreHistoryEntry>(membership.lead_score_history ?? undefined);
  const scoreEntry: LeadScoreHistoryEntry = {
    at: now, actor_id: input.actor.id_nhan_vien, actor_name: input.actor.ho_ten,
    old_score: membership.lead_quality_score, new_score: score.score,
    old_rank: membership.lead_quality_rank as LeadScoreHistoryEntry['old_rank'], new_rank: score.rank,
    breakdown: score.breakdown,
  };
  return {
    idempotent: false,
    score,
    patch: {
      trang_thai_cham_soc: input.result,
      muc_do_quan_tam: input.interest,
      ngay_lien_he_cuoi: now,
      ngay_lien_he_tiep: input.nextContact || null,
      lich_su_cham_soc: appendChamSoc(membership.lich_su_cham_soc ?? undefined, entry),
      qualification_status: score.qualificationStatus,
      lead_quality_score: score.score,
      lead_quality_rank: score.rank,
      lead_score_breakdown: JSON.stringify(score.breakdown),
      lead_score_history: JSON.stringify([...scoreHistory, scoreEntry]),
    },
  };
}

export async function recordMembershipInteractionTransactional(input: MembershipInteractionInput & { membershipId: string }) {
  return serializable(async tx => {
    const membership = await tx.campaignMembership.findUnique({ where: { id: input.membershipId }, include: { campaign: true } });
    if (!membership) throw new Error('MEMBERSHIP_NOT_FOUND');
    const plan = planMembershipInteraction(membership, membership.campaign, input);
    if (!plan.idempotent) {
      const updated = await tx.campaignMembership.update({
        where: { id: input.membershipId },
        data: { ...plan.patch, so_lan_lien_he: { increment: 1 }, row_version: { increment: 1 } },
      });
      return { membership: updated, idempotent: false as const };
    }
    return { membership, idempotent: true as const };
  });
}

// --- Qualification ----------------------------------------------------------

export interface MembershipQualificationPatchInput {
  san_pham_quan_tam?: string | null;
  nhu_cau?: string | null;
  ngan_sach_min?: number | null;
  ngan_sach_max?: number | null;
  muc_dich?: string | null;
  thoi_gian_du_kien?: string | null;
  phuong_an_tai_chinh?: string | null;
  khu_vuc_yeu_cau?: string | null;
  muc_do_quan_tam?: MucDoQuanTam | null;
  hanh_dong_tiep_theo?: string | null;
}

export interface MembershipQualificationInput {
  idempotencyKey: string;
  patch: MembershipQualificationPatchInput;
  actor: CrmSessionUser;
  now?: string;
}

export type MembershipQualificationPlan =
  | { idempotent: true; score: LeadScoreResult }
  | { idempotent: false; score: LeadScoreResult; patch: MembershipQualificationPatchInput & {
      qualification_status: QualificationStatus; lead_quality_score: number; lead_quality_rank: string;
      lead_score_breakdown: string; lead_score_history: string;
    } };

type QualificationSnapshot = ScoreFields & HistoryFields;

/**
 * Thuần — cùng pattern idempotency với updateQualificationTransactional
 * (Customer-global): so khớp idempotency_key trong lead_score_history.
 */
export function planMembershipQualification(
  membership: QualificationSnapshot,
  campaign: CampaignContext,
  input: MembershipQualificationInput,
): MembershipQualificationPlan {
  const existingHistory = parseJsonList<LeadScoreHistoryEntry>(membership.lead_score_history ?? undefined);
  if (existingHistory.some(item => item.idempotency_key === input.idempotencyKey)) {
    return { idempotent: true, score: calculateLeadQuality(buildMembershipScoreInput(membership, campaign)) };
  }
  const merged: ScoreFields = { ...membership, ...input.patch };
  const score = calculateLeadQuality(buildMembershipScoreInput(merged, campaign));
  const now = input.now || nowIso();
  const historyEntry: LeadScoreHistoryEntry = {
    idempotency_key: input.idempotencyKey, at: now, actor_id: input.actor.id_nhan_vien, actor_name: input.actor.ho_ten,
    old_score: membership.lead_quality_score, new_score: score.score,
    old_rank: membership.lead_quality_rank as LeadScoreHistoryEntry['old_rank'], new_rank: score.rank,
    breakdown: score.breakdown,
  };
  return {
    idempotent: false,
    score,
    patch: {
      ...input.patch,
      qualification_status: score.qualificationStatus,
      lead_quality_score: score.score,
      lead_quality_rank: score.rank,
      lead_score_breakdown: JSON.stringify(score.breakdown),
      lead_score_history: JSON.stringify([...existingHistory, historyEntry]),
    },
  };
}

export async function updateMembershipQualificationTransactional(input: MembershipQualificationInput & { membershipId: string }) {
  return serializable(async tx => {
    const membership = await tx.campaignMembership.findUnique({ where: { id: input.membershipId }, include: { campaign: true } });
    if (!membership) throw new Error('MEMBERSHIP_NOT_FOUND');
    const plan = planMembershipQualification(membership, membership.campaign, input);
    if (!plan.idempotent) {
      const updated = await tx.campaignMembership.update({
        where: { id: input.membershipId },
        data: { ...plan.patch, row_version: { increment: 1 } },
      });
      return { membership: updated, score: plan.score };
    }
    return { membership, score: plan.score };
  });
}
