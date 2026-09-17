// Server-side HRM authorization — cùng logic canManageHRM() đã dùng ở
// src/app/api/nhan-vien/route.ts, tách ra file riêng để dùng chung + test được
// (route gốc không export nên không tái dùng trực tiếp được — KHÔNG sửa route
// đó, chỉ thêm bản dùng chung mới cho các route HRM mới, cùng shape/convention
// hiện có, KHÔNG phải kiến trúc permission mới).
import { cookies } from 'next/headers';
import { SENIOR_EMPLOYEE_TYPES } from '../constants';

export interface HrmSessionUser {
  id_nhan_vien: string;
  ho_ten: string;
  email: string;
  vai_tro: string;
  employee_type: string;
}

export async function getHrmSessionUser(): Promise<HrmSessionUser | null> {
  const cookieStore = await cookies();
  const c = cookieStore.get('crm_session');
  if (!c?.value) return null;
  try {
    return JSON.parse(Buffer.from(c.value, 'base64').toString()) as HrmSessionUser;
  } catch {
    return null;
  }
}

/** HR và Admin (bao gồm chức danh cấp cao) mới được quản lý dữ liệu HRM —
 * pure function, test trực tiếp không cần cookie/session thật. */
export function canManageHRM(user: Pick<HrmSessionUser, 'vai_tro' | 'employee_type'> | null): boolean {
  if (!user) return false;
  return user.vai_tro === 'Admin'
    || user.vai_tro === 'HR'
    || (SENIOR_EMPLOYEE_TYPES as readonly string[]).includes(user.employee_type || '');
}
