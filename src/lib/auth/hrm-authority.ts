// Server-side HRM authorization — cùng logic canManageHRM() đã dùng ở
// src/app/api/nhan-vien/route.ts, tách ra file riêng để dùng chung + test được
// (route gốc không export nên không tái dùng trực tiếp được — KHÔNG sửa route
// đó, chỉ thêm bản dùng chung mới cho các route HRM mới, cùng shape/convention
// hiện có, KHÔNG phải kiến trúc permission mới).
import { cookies } from 'next/headers';
import { SENIOR_EMPLOYEE_TYPES } from '../constants';
import { getNhanVien } from '../data-access';
import { canAccessHrmAppointment, type HrmAppointmentActorSignals } from '../hrm/appointment-access';

// Re-export — canAccessHrmAppointment PHẢI định nghĩa ở src/lib/hrm/appointment-access.ts
// (pure, KHÔNG import next/headers) để dùng được cả client (Sidebar.tsx,
// menu-registry.ts) lẫn server (route API dưới đây) — file này (hrm-authority.ts)
// import next/headers nên KHÔNG thể import trực tiếp vào component client.
export { canAccessHrmAppointment, type HrmAppointmentActorSignals };

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

// ─── Bổ nhiệm / Miễn nhiệm chức vụ — capability audience riêng ─────────────
// canAccessHrmAppointment() được định nghĩa + re-export ở import phía trên
// (src/lib/hrm/appointment-access.ts). Gate này RIÊNG, tách khỏi
// canManageHRM() (canManageHRM vẫn giữ nguyên nghĩa "quản lý dữ liệu HRM nói
// chung", dùng ở /api/nhan-vien và các route HRM khác — không đổi). 2 gate
// này ĐỘC LẬP và phải AND với nhau cho thao tác ghi/sync/đọc file (route tự
// intersect, KHÔNG gộp thành 1 hàm để tránh nới lỏng nhầm canManageHRM cho
// các HRM route khác).

/** Tra phong_KD hiện tại của actor — crm_session cookie KHÔNG chứa phong_KD
 * (chỉ id_nhan_vien/ho_ten/email/vai_tro/employee_type/avatar_url, xem
 * /api/auth/route.ts), nên phải tra lại từ NhanVien (authority hiện có,
 * KHÔNG field mới, KHÔNG đổi shape session cookie). */
export async function getActorPhongKD(idNhanVien: string): Promise<string> {
  const employees = await getNhanVien();
  return employees.find(e => e.id_nhan_vien === idNhanVien)?.phong_KD || '';
}
