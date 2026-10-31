import type { MucDoQuanTam } from '../types';

/** Các lựa chọn mới dùng khi Sale ghi nhận cuộc gọi. */
export const INTEREST_OPTIONS: MucDoQuanTam[] = ['Nét', 'Quan tâm', 'Rác'];

/** Giữ lại các giá trị cũ để đọc dữ liệu/lịch sử đã lưu trước đây. */
export const LEGACY_INTEREST_OPTIONS: MucDoQuanTam[] = ['Chưa xác định', 'Thấp', 'Trung bình', 'Cao', 'Rất cao'];

export const ALL_INTEREST_OPTIONS: MucDoQuanTam[] = [...INTEREST_OPTIONS, ...LEGACY_INTEREST_OPTIONS];

export function interestTone(value?: string | null): { bg: string; color: string } {
  switch (value) {
    case 'Quan tâm': return { bg: '#ecfdf5', color: '#047857' };
    case 'Rác': return { bg: '#fef2f2', color: '#b91c1c' };
    case 'Nét': return { bg: '#eff6ff', color: '#1d4ed8' };
    case 'Cao': case 'Rất cao': return { bg: '#ecfdf5', color: '#047857' };
    case 'Thấp': return { bg: '#fff7ed', color: '#c2410c' };
    default: return { bg: '#f1f5f9', color: '#475569' };
  }
}
