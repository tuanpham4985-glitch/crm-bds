// Bổ nhiệm / Miễn nhiệm chức vụ — capability audience (approved architecture
// HRM_APPOINTMENT_ACCESS_CONTROL). PURE (không import next/headers/data-access)
// — dùng được cả server (API routes, qua re-export ở src/lib/auth/hrm-authority.ts)
// LẪN client ('use client' Sidebar.tsx, menu-registry.ts) — tách file vì
// hrm-authority.ts import next/headers (server-only), không thể import vào
// component client được.
//
// Canonical phong_KD xác nhận TRỰC TIẾP từ dữ liệu thật (query read-only
// GROUP BY "phong_KD" trên nhan_vien, 2026-09-17): "BLĐ", "Phòng HCNS",
// "Phòng TKKD", "Phòng TCKT" — KHÔNG có giá trị "Phòng Kế toán" nào tồn tại;
// "TCKT" (Tài Chính Kế Toán) là tên phòng ban thật cho "Kế toán". Xác nhận
// chéo qua src/lib/task-management/sync-users.ts (normalizeDept, đã duyệt
// trước, độc lập): 'ke toan'/'tai chinh' -> 'Phòng TCKT', 'hcns' -> 'Phòng
// HCNS', 'tkkd' -> 'Phòng TKKD', 'ban lanh dao'/'bld' -> 'BLĐ'. KHÔNG suy
// đoán nhãn hiển thị — dùng đúng giá trị đã xác nhận.
import { SENIOR_EMPLOYEE_TYPES } from '../constants';

const HRM_APPOINTMENT_ALLOWED_DEPARTMENTS = ['BLĐ', 'Phòng HCNS', 'Phòng TKKD', 'Phòng TCKT'] as const;

export interface HrmAppointmentActorSignals {
  vai_tro?: string;
  employee_type?: string;
  phong_KD?: string;
}

/** Pure — test trực tiếp không cần cookie/DB thật. Admin và
 * SENIOR_EMPLOYEE_TYPES (Chủ tịch/CEO/TGĐ/Phó TGĐ — đã dùng làm proxy "cấp
 * lãnh đạo" xuyên suốt HRM qua canManageHRM) luôn được phép, kể cả khi
 * phong_KD của họ không ghi đúng "BLĐ" (tránh lệch vì data-entry không nhất
 * quán) — ngoài ra chỉ 4 phòng ban đã xác nhận ở trên mới được phép. */
export function canAccessHrmAppointment(actor: HrmAppointmentActorSignals | null): boolean {
  if (!actor) return false;
  if (actor.vai_tro === 'Admin') return true;
  if ((SENIOR_EMPLOYEE_TYPES as readonly string[]).includes(actor.employee_type || '')) return true;
  return (HRM_APPOINTMENT_ALLOWED_DEPARTMENTS as readonly string[]).includes(actor.phong_KD || '');
}
