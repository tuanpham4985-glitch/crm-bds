import { findNhanVienByEmail } from '@/lib/google-sheets';
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
 * Authentication must use NHAN_VIEN in Google Sheets as the source of truth.
 * PostgreSQL is only a read replica and can be stale after email/status changes.
 */
export async function findEmployeeForAuth(email: string): Promise<EmployeeAuthLookup> {
  const normalizedEmail = normalizeAuthEmail(email);
  if (!normalizedEmail) return { ok: false, reason: 'not_found' };

  const employee = await findNhanVienByEmail(normalizedEmail);
  if (!employee) return { ok: false, reason: 'not_found' };
  if (!isActiveEmployee(employee)) return { ok: false, reason: 'inactive', employee };
  return { ok: true, employee };
}
