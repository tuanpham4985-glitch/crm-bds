import type { MucDichLead, MucDoQuanTam, ThoiGianDuKien } from '../types';

export const PURPOSE_VALUES: MucDichLead[] = ['Để ở', 'Đầu tư', 'Cho thuê', 'Khác'];
export const TIMEFRAME_VALUES: ThoiGianDuKien[] = ['Trong 1 tháng', '1-3 tháng', '3-6 tháng', '6-12 tháng', 'Trên 12 tháng', 'Chưa xác định'];
export const INTEREST_VALUES: MucDoQuanTam[] = ['Chưa xác định', 'Thấp', 'Trung bình', 'Cao', 'Rất cao'];

export function validateQualificationInput(body: Record<string, unknown>): string | null {
  if ('lead_quality_score' in body || 'lead_quality_rank' in body || 'qualification_status' in body) {
    return 'Score/rank/status do server tính, không được nhập trực tiếp';
  }
  if (body.muc_dich && !PURPOSE_VALUES.includes(body.muc_dich as MucDichLead)) return 'Mục đích không hợp lệ';
  if (body.thoi_gian_du_kien && !TIMEFRAME_VALUES.includes(body.thoi_gian_du_kien as ThoiGianDuKien)) return 'Thời gian dự kiến không hợp lệ';
  if (body.muc_do_quan_tam && !INTEREST_VALUES.includes(body.muc_do_quan_tam as MucDoQuanTam)) return 'Mức độ quan tâm không hợp lệ';
  const min = body.ngan_sach_min === '' || body.ngan_sach_min == null ? undefined : Number(body.ngan_sach_min);
  const max = body.ngan_sach_max === '' || body.ngan_sach_max == null ? undefined : Number(body.ngan_sach_max);
  if ((min !== undefined && (!Number.isFinite(min) || min < 0)) || (max !== undefined && (!Number.isFinite(max) || max < 0))) return 'Ngân sách không hợp lệ';
  if (min !== undefined && max !== undefined && min > max) return 'Ngân sách từ không được lớn hơn ngân sách đến';
  return null;
}
