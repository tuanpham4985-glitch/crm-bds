import type { KhachHang, LeadScoreBreakdownItem, LeadScoreResult, QualificationStatus, ThoiGianDuKien } from '../types';
import { LEAD_SCORE_THRESHOLDS, LEAD_SCORE_WEIGHTS, rankForScore } from './config';

type ScoreableLead = Pick<KhachHang,
  'du_an' | 'san_pham_quan_tam' | 'nhu_cau' | 'ngan_sach_min' | 'ngan_sach_max' |
  'muc_dich' | 'thoi_gian_du_kien' | 'phuong_an_tai_chinh' | 'khu_vuc_yeu_cau' |
  'muc_do_quan_tam' | 'hanh_dong_tiep_theo' | 'trang_thai_cham_soc'
>;

function filled(value: unknown): boolean {
  return typeof value === 'number' ? value > 0 : String(value || '').trim().length > 0;
}

function timeframePoints(value: ThoiGianDuKien | undefined): number {
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

function interestPoints(value: KhachHang['muc_do_quan_tam']): number {
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
