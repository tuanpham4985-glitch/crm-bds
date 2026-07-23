// ============================================================
// CRM BĐS — Task Management: Auth Helper
// Maps existing crm_session cookie → TmUser + RbacContext
// ============================================================
import { cookies } from 'next/headers';
import type { TmUser, RbacContext, UserRole } from './types';
import { appendRow, loadRows } from './sheets/client';
import { SHEET_NAMES } from './types';

// Module-level cache: email/employee_code → TM user info, TTL 5 phút
// Tránh gọi loadRows(TM_Users) lặp lại trên mỗi API request trong cùng 1 serverless instance
const _emailCache = new Map<string, { data: { user_id: string; department_id: string } | null; ts: number }>();
const EMAIL_CACHE_TTL = 5 * 60_000;

function tmUserCacheKey(email: string, employeeCode: string): string {
  return `${(email || '').trim().toLowerCase()}|${(employeeCode || '').trim()}`;
}

/** Xoá cache tra cứu TM_Users — gọi sau khi sync ghi thêm/sửa nhân viên */
export function invalidateTmUserCache(): void {
  _emailCache.clear();
}

/**
 * Chuẩn hoá mã nhân viên để so khớp.
 * NHAN_VIEN lưu "0009" nhưng Google Sheets tự cắt số 0 đầu khi ghi xuống
 * TM_Users thành "9" → so khớp chuỗi thô luôn trượt.
 */
function codeKey(value: string): string {
  const v = (value || '').trim();
  if (!v) return '';
  return /^\d+$/.test(v) ? String(Number(v)) : v.toLowerCase();
}

async function lookupTmUser(email: string, employeeCode: string): Promise<{ user_id: string; department_id: string } | null> {
  const normalizedEmail = (email || '').trim().toLowerCase();
  const normalizedEmployeeCode = codeKey(employeeCode);
  const cacheKey = tmUserCacheKey(normalizedEmail, normalizedEmployeeCode);
  const hit = _emailCache.get(cacheKey);
  if (hit && Date.now() - hit.ts < EMAIL_CACHE_TTL) return hit.data;

  try {
    const rows = await loadRows(SHEET_NAMES.USERS);
    const r = rows.find((r: Record<string, unknown>) => {
      const rowEmail = String(r.email ?? '').trim().toLowerCase();
      const rowEmployeeCode = codeKey(String(r.employee_code ?? '') || String(r.user_id ?? ''));
      return (normalizedEmail && rowEmail === normalizedEmail)
        || (normalizedEmployeeCode && rowEmployeeCode === normalizedEmployeeCode);
    });
    const result = r ? { user_id: String(r.user_id ?? ''), department_id: String(r.department_id ?? '') } : null;
    _emailCache.set(cacheKey, { data: result, ts: Date.now() });
    return result;
  } catch {
    return null;
  }
}

function normalizeText(value: string): string {
  return (value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/\s+/g, ' ')
    .trim();
}

function inferDepartmentCode(session: CrmSession): string {
  const source = normalizeText([
    session.department_id,
    session.phong_KD,
    session.employee_type,
    session.vai_tro,
  ].filter(Boolean).join(' '));

  const vic = source.match(/\bvic[-\s]?(\d{1,2})\b/);
  if (vic) return `VIC-${vic[1].padStart(2, '0')}`;
  if (source.includes('marketing') || source.includes('mkt')) return 'MKT';
  if (source.includes('tckt') || source.includes('ke toan') || source.includes('tai chinh')) return 'TCKT';
  if (source.includes('hcns') || source.includes('nhan su') || source.includes('hanh chinh')) return 'HCNS';
  if (source.includes('tkkd') || source.includes('thu ky kinh doanh')) return 'TKKD';
  if (source.includes('chu tich') || source.includes('ceo') || source.includes('ban lanh dao') || source.includes('bld')) return 'BLD';
  return '';
}

async function resolveDepartmentId(session: CrmSession, tmDepartmentId?: string): Promise<string> {
  const candidates = [
    tmDepartmentId || '',
    session.department_id || '',
    session.phong_KD || '',
    inferDepartmentCode(session),
  ].filter(Boolean);

  try {
    const rows = await loadRows(SHEET_NAMES.DEPARTMENTS);
    for (const candidate of candidates) {
      const normalizedCandidate = normalizeText(candidate).replace(/\s+/g, '');
      const match = rows.find(row => {
        const deptId = String(row.dept_id ?? '');
        const code = String(row.code ?? '');
        const name = String(row.name ?? '');
        return normalizeText(deptId).replace(/\s+/g, '') === normalizedCandidate
          || normalizeText(code).replace(/\s+/g, '') === normalizedCandidate
          || normalizeText(name).replace(/\s+/g, '') === normalizedCandidate;
      });
      if (match?.dept_id) return String(match.dept_id);
    }
  } catch {
    // Fallback below keeps auth usable even if TM_Departments cannot be read.
  }

  const inferredCode = inferDepartmentCode(session);
  const fallbackByCode: Record<string, string> = {
    MKT: 'dept-ph-ng-mkt',
    TCKT: 'dept-ph-ng-tckt',
    HCNS: 'dept-ph-ng-hcns',
    TKKD: 'dept-ph-ng-tkkd',
    BLD: 'dept-bl',
  };
  if (fallbackByCode[inferredCode]) return fallbackByCode[inferredCode];
  if (/^VIC-\d{2}$/.test(inferredCode)) return `dept-${inferredCode.toLowerCase()}`;
  return tmDepartmentId || session.department_id || session.phong_KD || '';
}

async function provisionTmUser(session: CrmSession, role: UserRole, departmentId: string): Promise<void> {
  const now = new Date().toISOString();
  try {
    await appendRow(SHEET_NAMES.USERS, {
      // Ghi mã đã chuẩn hoá: Sheets vốn cắt số 0 đầu, ghi thẳng "0009" sẽ thành "9"
      // và lần tra cứu sau lại trượt → sinh dòng trùng.
      user_id:        codeKey(session.id_nhan_vien),
      employee_code:  codeKey(session.id_nhan_vien),
      email:          (session.email || '').trim().toLowerCase(),
      full_name:      session.ho_ten || '',
      phone:          '',
      role,
      department_id:  departmentId,
      team_id:        session.team_id || '',
      position:       session.employee_type || '',
      employee_type:  session.employee_type || '',
      avatar_url:     '',
      zalo_id:        '',
      is_active:      'TRUE',
      last_active_at: now,
      created_at:     now,
      updated_at:     now,
    });
  } catch (err) {
    console.warn('[TM Auth] Auto-provision TM_Users failed:', err instanceof Error ? err.message : err);
  }
}

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
  const etN = normalizeText(et);

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

  // ── team_leader: GĐKD + TP Marketing (quản team, báo cáo lên GĐ Marketing)
  if (
    etL === 'gđkd' || etL === 'gdkd' ||
    etL === 'tp marketing' || etL === 'tp mkt' ||
    ((etN.startsWith('tp ') || etN.startsWith('tp-') || etN.includes('truong phong')) &&
      (etN.includes('marketing') || etN.includes('mkt') || etN.includes('digital'))) ||
    etL.includes('trưởng phòng marketing') || etL.includes('truong phong marketing') ||
    etL.includes('leader') || etL.includes('team lead') ||
    vt === 'leader'
  ) return 'team_leader';

  // ── manager: GĐ DA, GĐ Marketing + BO Trưởng phòng (TP*)
  if (
    etL === 'gđ da' || etL === 'gd da' ||
    etL === 'gđ marketing' || etL === 'gd marketing' ||
    etL.includes('giám đốc marketing') || etL.includes('giam doc marketing') ||
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

    // Tra cứu TM_Users theo email để lấy đúng user_id và department_id
    // (tránh lệch format giữa id_nhan_vien "0002" và user_id "2" trong Sheets)
    const tmRecord = await lookupTmUser(session.email, session.id_nhan_vien);
    const departmentId = await resolveDepartmentId(session, tmRecord?.department_id);

    if (!tmRecord) {
      await provisionTmUser(session, role, departmentId);
      _emailCache.set(tmUserCacheKey(session.email, codeKey(session.id_nhan_vien)), {
        data: { user_id: codeKey(session.id_nhan_vien), department_id: departmentId },
        ts: Date.now(),
      });
    }

    return {
      user_id:       tmRecord?.user_id || codeKey(session.id_nhan_vien),
      // Giữ nguyên mã thô: rbac.userIds() gộp cả user_id lẫn employee_code nên
      // task cũ tham chiếu "0002" vẫn khớp, còn dạng chuẩn hoá đã nằm ở user_id.
      employee_code: session.id_nhan_vien,
      full_name:     session.ho_ten,
      email:         session.email,
      phone:         '',
      department_id: departmentId,
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
    employee_code: user.employee_code,
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
