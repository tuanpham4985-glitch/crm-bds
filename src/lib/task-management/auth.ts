// ============================================================
// CRM BĐS — Task Management: Auth Helper
// Maps existing crm_session cookie → TmUser + RbacContext
// ============================================================
import { cookies } from 'next/headers';
import type { TmUser, RbacContext, UserRole } from './types';

interface CrmSession {
  id_nhan_vien: string;
  ho_ten: string;
  email: string;
  vai_tro: string;         // 'Admin' | 'Sale' | 'Leader' | ...
  employee_type: string;   // 'Trưởng phòng' | 'Team Leader' | 'Chuyên viên' ...
  phong_KD?: string;
  department_id?: string;  // injected by TM_Users lookup
  team_id?: string;
}

function mapRole(session: CrmSession): UserRole {
  const vt = (session.vai_tro || '').trim();
  const et = (session.employee_type || '').trim();
  const etL = et.toLowerCase();

  // Director: vai_tro=Admin, hoặc chức vụ Giám đốc (GĐ...)
  if (vt === 'Admin' || etL.startsWith('gđ') || etL.startsWith('giám đốc') || etL.startsWith('giam doc')) return 'director';

  // Manager: chức vụ Trưởng phòng (TP...) hoặc có từ "truong phong"/"trưởng phòng"
  if (etL.startsWith('tp') || etL.includes('trưởng phòng') || etL.includes('truong phong') || etL.includes('tkkd') || vt === 'manager') return 'manager';

  // Team Leader
  if (etL.includes('leader') || etL.includes('team lead') || vt === 'leader') return 'team_leader';

  return 'staff';
}

export async function getCurrentTmUser(): Promise<TmUser | null> {
  try {
    const cookieStore = await cookies();
    const raw = cookieStore.get('crm_session')?.value;
    if (!raw) return null;

    const json = decodeURIComponent(escape(atob(raw)));
    const session: CrmSession = JSON.parse(json);

    const role = mapRole(session);

    return {
      user_id:       session.id_nhan_vien,
      employee_code: session.id_nhan_vien,
      full_name:     session.ho_ten,
      email:         session.email,
      phone:         '',
      department_id: session.department_id || session.phong_KD || '',
      team_id:       session.team_id || '',
      role,
      position:      session.employee_type,
      avatar_url:    '',
      zalo_id:       '',
      is_active:     true,
      last_active_at: new Date().toISOString(),
      created_at:    '',
      updated_at:    '',
    };
  } catch {
    return null;
  }
}

export async function requireTmUser(): Promise<TmUser> {
  const user = await getCurrentTmUser();
  if (!user) throw new Error('UNAUTHORIZED');
  return user;
}

export function toRbacContext(user: TmUser): RbacContext {
  return {
    user_id:       user.user_id,
    role:          user.role,
    department_id: user.department_id,
    team_id:       user.team_id,
  };
}

export function unauthorizedResponse() {
  return Response.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 });
}

export function forbiddenResponse(msg = 'Không có quyền thực hiện') {
  return Response.json({ success: false, error: msg }, { status: 403 });
}

export function errorResponse(msg: string, status = 500) {
  return Response.json({ success: false, error: msg }, { status });
}

export function okResponse(data: unknown, status = 200) {
  return Response.json({ success: true, data }, { status });
}
