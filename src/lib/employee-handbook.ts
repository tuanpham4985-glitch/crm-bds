// Sổ tay nhân viên — phần PURE, client-safe (không import next/headers hay
// google-sheets). Dùng chung cho page ('use client') và API route.
// Persistence ở employee-handbook-store.ts (server-only).
import { SENIOR_EMPLOYEE_TYPES } from './constants';

export interface HandbookSection {
  key: string;
  title: string;
  description: string;
  content: string;
  updated_at?: string;
  updated_by?: string;
}

export const HANDBOOK_LIMITS = {
  title: 120,
  description: 300,
  // Google Sheets giới hạn 50.000 ký tự/ô — mỗi mục lưu 1 ô riêng, chừa chỗ
  // cho JSON wrapper + metadata.
  content: 40_000,
  sections: 30,
} as const;

/** Khung mặc định khi chưa có dữ liệu nào được lưu. */
export const DEFAULT_HANDBOOK_SECTIONS: HandbookSection[] = [
  { key: 'gioi-thieu', title: 'Giới thiệu công ty', description: 'Lịch sử, tầm nhìn, sứ mệnh và giá trị cốt lõi của Victory Holdings.', content: '' },
  { key: 'noi-quy', title: 'Nội quy & quy định', description: 'Giờ làm việc, trang phục, chấm công và các quy định chung.', content: '' },
  { key: 'phuc-loi', title: 'Chế độ & phúc lợi', description: 'Lương thưởng, hoa hồng, nghỉ phép, bảo hiểm và các chính sách đãi ngộ.', content: '' },
  { key: 'quy-trinh', title: 'Quy trình làm việc', description: 'Quy trình chăm sóc khách hàng, giao dịch và sử dụng hệ thống CRM.', content: '' },
  { key: 'lien-he', title: 'Liên hệ hỗ trợ', description: 'Đầu mối HCNS, kế toán, marketing và IT khi cần hỗ trợ.', content: '' },
];

export interface HandbookEditorSignals {
  vai_tro?: string;
  employee_type?: string;
  phong_KD?: string;
}

function normalize(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().trim();
}

/** Phòng HCNS — giá trị canonical trong nhan_vien.phong_KD là "Phòng HCNS"
 * (xem hrm/appointment-access.ts); chấp nhận thêm biến thể viết tay
 * "HCNS" / "Hành chính nhân sự" để tránh lệch do nhập liệu. */
export function isHcnsDepartment(phongKD: string | undefined | null): boolean {
  if (!phongKD) return false;
  const n = normalize(phongKD);
  return n.includes('hcns') || n.includes('hanh chinh nhan su') || n.includes('hanh chinh - nhan su');
}

/** Ai được sửa/bổ sung Sổ tay: Admin (gồm chức danh cấp cao, cùng định nghĩa
 * isCrmAdmin) và nhân viên Phòng HCNS. Pure — dùng cả client lẫn server. */
export function canEditEmployeeHandbook(actor: HandbookEditorSignals | null): boolean {
  if (!actor) return false;
  if (actor.vai_tro === 'Admin') return true;
  if ((SENIOR_EMPLOYEE_TYPES as readonly string[]).includes(actor.employee_type || '')) return true;
  return isHcnsDepartment(actor.phong_KD);
}

/** Tạo key ổn định từ tiêu đề (dùng khi thêm mục mới). */
export function slugifySectionKey(title: string): string {
  const base = normalize(title).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return base || 'muc';
}

/** Validate 1 mục gửi từ client. Trả về null nếu sai shape. */
export function sanitizeSectionInput(candidate: unknown): Pick<HandbookSection, 'title' | 'description' | 'content'> | null {
  if (typeof candidate !== 'object' || candidate === null) return null;
  const c = candidate as Record<string, unknown>;
  if (typeof c.title !== 'string' || typeof c.content !== 'string') return null;
  const title = c.title.trim();
  const description = typeof c.description === 'string' ? c.description.trim() : '';
  const content = c.content.replace(/\r\n/g, '\n');
  if (!title || title.length > HANDBOOK_LIMITS.title) return null;
  if (description.length > HANDBOOK_LIMITS.description) return null;
  if (content.length > HANDBOOK_LIMITS.content) return null;
  return { title, description, content };
}

export const SECTION_KEY_PATTERN = /^[a-z0-9-]{1,60}$/;
