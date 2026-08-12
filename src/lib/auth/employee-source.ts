import { findNhanVienByEmail } from '@/lib/data-access';
import type { NhanVien } from '@/lib/types';

export const ACTIVE_EMPLOYEE_STATUSES = ['đang làm', 'chính thức', 'thử việc'];

export type EmployeeAuthLookup =
  | { ok: true; employee: NhanVien }
  | { ok: false; reason: 'not_found' | 'inactive'; employee?: NhanVien };

export function normalizeAuthEmail(email: string): string {
  return (email || '').trim().toLowerCase();
}

export function isActiveEmployee(employee: Pick<NhanVien, 'trang_thai'>): boolean {
  const status = (employee.trang_thai || '').trim().toLowerCase();
  return ACTIVE_EMPLOYEE_STATUSES.includes(status);
}

/**
 * Đọc nhân viên để xác thực qua data-access.findNhanVienByEmail:
 * ưu tiên PostgreSQL (bản sao đọc-nhanh), chỉ hỏi Google Sheets khi PG chưa có
 * người đó (nhân viên vừa thêm, chưa kịp sync).
 *
 * TRƯỚC ĐÂY hàm này đọc THẲNG Google Sheets mỗi lần đăng nhập VÀ mỗi lần
 * GET /api/auth (useAuth gọi trên gần như mọi trang) → dội quá nhiều lượt đọc,
 * dính lỗi [429] "Read requests per minute per user" của Sheets API, khiến
 * KHÔNG AI đăng nhập được. PG-first cắt phần lớn lượt đọc Sheets.
 *
 * Tính đúng: mọi thao tác ghi HRM đã write-through Google Sheets + PG
 * (updateNhanVien/addNhanVien), và cron sync nạp lại PG hằng ngày, nên PG đủ
 * mới cho mật khẩu/vai trò/trạng thái đổi qua app. Chỉnh sửa trực tiếp trên
 * sheet (không qua app) sẽ có hiệu lực sau lần sync kế tiếp.
 */
export async function findEmployeeForAuth(email: string): Promise<EmployeeAuthLookup> {
  const normalizedEmail = normalizeAuthEmail(email);
  if (!normalizedEmail) return { ok: false, reason: 'not_found' };

  const employee = await findNhanVienByEmail(normalizedEmail);
  if (!employee) return { ok: false, reason: 'not_found' };
  if (!isActiveEmployee(employee)) return { ok: false, reason: 'inactive', employee };
  return { ok: true, employee };
}
