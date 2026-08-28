import type { LeadQualityRank, QualificationStatus } from '../types';

// Nhãn tiếng Việt cho DISPLAY LAYER — KHÔNG đổi giá trị enum thật lưu trong
// KhachHang.qualification_status/lead_quality_rank (Postgres/Sheets), API
// filter contract (QualifiedLeadFilters.rank vẫn nhận đúng giá trị enum này),
// hay bất kỳ so sánh logic nào. Dùng import { qualificationStatusLabel,
// leadQualityRankLabel } ở mọi nơi hiển thị 2 field này cho user (trang
// /data-chat-luong + Excel/Google Sheets export) để tránh lệch nhãn giữa
// UI và file export.
export const QUALIFICATION_STATUS_LABELS: Record<QualificationStatus, string> = {
  RAW: 'Chưa chăm sóc',
  CONTACTED: 'Đã liên hệ',
  INTERESTED: 'Quan tâm',
  QUALIFIED: 'Đủ điều kiện',
  HOT: 'Tiềm năng cao',
  UNQUALIFIED: 'Chưa đủ điều kiện',
};

export const LEAD_QUALITY_RANK_LABELS: Record<LeadQualityRank, string> = {
  HOT: 'Tiềm năng cao',
  QUALIFIED: 'Đủ điều kiện',
  WARM: 'Tiềm năng trung bình',
  UNQUALIFIED: 'Chưa đủ điều kiện',
};

/** Trả về nhãn tiếng Việt; nếu gặp giá trị lạ (dữ liệu Sheets cũ/rỗng) thì trả nguyên giá trị gốc thay vì để trống hoặc throw. */
export function qualificationStatusLabel(status: string): string {
  return QUALIFICATION_STATUS_LABELS[status as QualificationStatus] ?? status;
}

export function leadQualityRankLabel(rank: string): string {
  return LEAD_QUALITY_RANK_LABELS[rank as LeadQualityRank] ?? rank;
}
