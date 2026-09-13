import type { LeadScoreBreakdownItem, LeadScoreResult, MucDoQuanTam, QualificationStatus, ThoiGianDuKien, TrangThaiChamSoc } from '../types';
import { LEAD_SCORE_THRESHOLDS, LEAD_SCORE_WEIGHTS, rankForScore } from './config';

/**
 * Input thuần cho calculateLeadQuality — KHÔNG gắn với KhachHang hay
 * CampaignMembership cụ thể, chỉ cần đúng tên field. Cho phép cả 2 nguồn
 * (Customer-global và CampaignMembership) dùng chung 1 công thức chấm điểm
 * duy nhất (không đổi threshold/weight/logic — chỉ nới lỏng typing).
 */
export interface ScoreableLead {
  du_an?: string | null;
  san_pham_quan_tam?: string | null;
  nhu_cau?: string | null;
  ngan_sach_min?: number | null;
  ngan_sach_max?: number | null;
  muc_dich?: string | null;
  thoi_gian_du_kien?: ThoiGianDuKien | string | null;
  phuong_an_tai_chinh?: string | null;
  khu_vuc_yeu_cau?: string | null;
  muc_do_quan_tam?: MucDoQuanTam | string | null;
  hanh_dong_tiep_theo?: string | null;
  trang_thai_cham_soc?: TrangThaiChamSoc | string | null;
}

function filled(value: unknown): boolean {
  return typeof value === 'number' ? value > 0 : String(value || '').trim().length > 0;
}

function timeframePoints(value: ThoiGianDuKien | string | null | undefined): number {
  const max = LEAD_SCORE_WEIGHTS.timeframe;
  switch (value) {
    case 'Trong 1 tháng': return max;
    case '1-3 tháng': return 14;
    case '3-6 tháng': return 10;
    case '6-12 tháng': return 6;
    case 'Trên 12 tháng': return 3;
    default: return 0;
  }
}

function interestPoints(value: MucDoQuanTam | string | null | undefined): number {
  switch (value) {
    case 'Rất cao': return 15;
    case 'Cao': return 12;
    case 'Trung bình': return 8;
    case 'Thấp': return 3;
    default: return 0;
  }
}

function qualificationStatus(lead: ScoreableLead, score: number): QualificationStatus {
  if (lead.trang_thai_cham_soc === 'Sai số' || lead.trang_thai_cham_soc === 'Không phù hợp') return 'UNQUALIFIED';
  if (!lead.trang_thai_cham_soc || lead.trang_thai_cham_soc === 'Chưa gọi') return 'RAW';
  if (lead.trang_thai_cham_soc !== 'Quan tâm') return 'CONTACTED';
  if (score >= LEAD_SCORE_THRESHOLDS.HOT) return 'HOT';
  if (score >= LEAD_SCORE_THRESHOLDS.QUALIFIED) return 'QUALIFIED';
  return 'INTERESTED';
}

// CAMPAIGN_CUSTOMER_QUALIFICATION_SYNC — thứ tự tăng dần của phễu qualification,
// dùng để merge kết quả tính điểm từ nhiều nguồn (Campaign/non-Campaign) vào
// CÙNG 1 canonical Customer mà KHÔNG BAO GIỜ downgrade trạng thái đã đạt được.
// UNQUALIFIED đứng NGOÀI phễu tăng dần (kết quả loại trừ CỤC BỘ của 1 lần
// tương tác — VD "Sai số"/"Không phù hợp" ở MỘT Campaign khác) — xếp thấp
// nhất để không bao giờ ghi đè bất kỳ trạng thái nào Customer đã đạt được,
// kể cả RAW mặc định.
const QUALIFICATION_FUNNEL_RANK: Record<QualificationStatus, number> = {
  UNQUALIFIED: -1, RAW: 0, CONTACTED: 1, INTERESTED: 2, QUALIFIED: 3, HOT: 4,
};

/**
 * True khi (next, nextScore) đủ tư cách thay thế canonical hiện tại
 * (current, currentScore) mà KHÔNG downgrade. Rank khác nhau -> so rank
 * (chỉ chấp nhận mạnh hơn). Rank bằng nhau -> chỉ chấp nhận nếu điểm KHÔNG
 * thấp hơn (không hạ điểm của cùng 1 trạng thái).
 */
export function isQualificationPromotionOrEqual(
  current: QualificationStatus, currentScore: number,
  next: QualificationStatus, nextScore: number,
): boolean {
  const currentRank = QUALIFICATION_FUNNEL_RANK[current];
  const nextRank = QUALIFICATION_FUNNEL_RANK[next];
  if (nextRank !== currentRank) return nextRank > currentRank;
  return nextScore >= currentScore;
}

export function calculateLeadQuality(lead: ScoreableLead): LeadScoreResult {
  const contacted = Boolean(lead.trang_thai_cham_soc && lead.trang_thai_cham_soc !== 'Chưa gọi');
  const interested = lead.trang_thai_cham_soc === 'Quan tâm';
  const interactionPoints = interested ? 10 : contacted ? 6 : 0;
  const projectProductPoints = (filled(lead.du_an) ? 5 : 0) + (filled(lead.san_pham_quan_tam) ? 5 : 0);
  const budgetPoints = filled(lead.ngan_sach_min) || filled(lead.ngan_sach_max) ? LEAD_SCORE_WEIGHTS.budget : 0;
  const timePoints = timeframePoints(lead.thoi_gian_du_kien);
  const interest = interestPoints(lead.muc_do_quan_tam);

  const breakdown: LeadScoreBreakdownItem[] = [
    { key: 'interaction', label: 'Tương tác đã xác minh', points: interactionPoints, maxPoints: 10, reason: interested ? 'Khách xác nhận quan tâm' : contacted ? 'Đã liên hệ được' : 'Chưa liên hệ' },
    { key: 'projectProduct', label: 'Dự án / sản phẩm', points: projectProductPoints, maxPoints: 10, reason: projectProductPoints === 10 ? 'Đủ dự án và sản phẩm' : projectProductPoints ? 'Mới có một thông tin' : 'Chưa có' },
    { key: 'need', label: 'Nhu cầu', points: filled(lead.nhu_cau) ? 10 : 0, maxPoints: 10, reason: filled(lead.nhu_cau) ? 'Đã xác định' : 'Chưa xác định' },
    { key: 'budget', label: 'Ngân sách', points: budgetPoints, maxPoints: LEAD_SCORE_WEIGHTS.budget, reason: budgetPoints ? 'Có khoảng ngân sách' : 'Chưa có ngân sách' },
    { key: 'purpose', label: 'Mục đích', points: filled(lead.muc_dich) ? 10 : 0, maxPoints: 10, reason: filled(lead.muc_dich) ? String(lead.muc_dich) : 'Chưa xác định' },
    { key: 'timeframe', label: 'Thời gian dự kiến', points: timePoints, maxPoints: 15, reason: lead.thoi_gian_du_kien || 'Chưa xác định' },
    { key: 'finance', label: 'Phương án tài chính', points: filled(lead.phuong_an_tai_chinh) ? 10 : 0, maxPoints: 10, reason: filled(lead.phuong_an_tai_chinh) ? 'Đã xác định' : 'Chưa xác định' },
    { key: 'region', label: 'Khu vực / yêu cầu', points: filled(lead.khu_vuc_yeu_cau) ? 5 : 0, maxPoints: 5, reason: filled(lead.khu_vuc_yeu_cau) ? 'Đã xác định' : 'Chưa xác định' },
    { key: 'interest', label: 'Mức độ quan tâm', points: interest, maxPoints: LEAD_SCORE_WEIGHTS.interest, reason: lead.muc_do_quan_tam || 'Chưa xác định' },
    { key: 'nextAction', label: 'Hành động tiếp theo', points: filled(lead.hanh_dong_tiep_theo) ? 5 : 0, maxPoints: 5, reason: filled(lead.hanh_dong_tiep_theo) ? 'Đã có kế hoạch' : 'Chưa có kế hoạch' },
  ];
  const score = Math.max(0, Math.min(100, breakdown.reduce((sum, item) => sum + item.points, 0)));
  return { score, rank: rankForScore(score), qualificationStatus: qualificationStatus(lead, score), breakdown };
}
