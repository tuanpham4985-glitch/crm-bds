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

// DEV_ADMIN_EMAIL (từ .env.local / Vercel env) được cấp quyền director dù chức vụ là gì
const DEV_ADMIN_EMAIL = (process.env.DEV_ADMIN_EMAIL || '').toLowerCase();

// Hierarchy công ty Victory Holdings:
// director   : Chủ tịch, CEO
// manager    : GĐ DA (quản dự án), TP HCNS / TP TC-KT / TP Digital MKT (khối BO)
// team_leader: GĐKD (giám đốc kinh doanh)
// staff      : NVKD, TPKD, TKKD, CV* (chuyên viên)
function mapRole(session: CrmSession): UserRole {
  // Dev/admin account override — luôn là director (quyền cao nhất)
  if (DEV_ADMIN_EMAIL && (session.email || '').toLowerCase() === DEV_ADMIN_EMAIL) {
    return 'director';
  }

  const vt  = (session.vai_tro || '').trim();
  const et  = (session.employee_type || '').trim();
  const etL = et.toLowerCase();

  // ── director: Chủ tịch, CEO, Tổng GĐ, Phó GĐ, Admin
  if (
    vt === 'Admin' ||
    etL === 'chủ tịch' || etL === 'chu tich' || etL === 'ct' ||
    etL === 'ceo' ||
    etL.startsWith('tgđ') || etL.startsWith('tgd') ||
    etL.startsWith('pgđ') || etL.startsWith('pgd') ||
    etL.startsWith('phó giám') || etL.startsWith('pho giam') ||
    etL.startsWith('tổng') || etL.startsWith('tong')
  ) return 'director';

  // ── staff: kiểm tra TRƯỚC manager để TPKD / TKKD không khớp nhầm vào tp*
  if (
    etL === 'tpkd' || etL === 'nvkd' || etL === 'tkkd' ||
    etL.startsWith('cv ')
  ) return 'staff';

  // ── team_leader: GĐKD (Giám đốc Kinh doanh)
  if (
    etL === 'gđkd' || etL === 'gdkd' ||
    etL.includes('leader') || etL.includes('team lead') ||
    vt === 'leader'
  ) return 'team_leader';

  // ── manager: GĐ DA + BO Trưởng phòng (TP*)
  if (
    etL === 'gđ da' || etL === 'gd da' ||
    etL.startsWith('tp ') || etL.startsWith('tp-') ||
    etL.includes('trưởng phòng') || etL.includes('truong phong') ||
    vt === 'manager'
  ) return 'manager';

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
