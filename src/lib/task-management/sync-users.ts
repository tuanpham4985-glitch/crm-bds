// ============================================================
// CRM BĐS — Task Management: Đồng bộ NHAN_VIEN → TM_Users
// Upsert incremental (KHÔNG xoá sạch sheet như scripts/task-management/sync-employees.ts)
//  - Nhân viên mới      → thêm dòng mới vào TM_Users
//  - Nhân viên đã có    → chỉ cập nhật field bị lệch, giữ nguyên role/department_id
//                         nếu admin đã chỉnh tay và chức vụ không đổi
//  - Nghỉ việc          → is_active = FALSE (không xoá dòng, giữ lịch sử task)
// ============================================================
import { getNhanVien } from '@/lib/google-sheets';
import type { NhanVien } from '@/lib/types';
import type { UserRole } from './types';
import { SHEET_NAMES } from './types';
import {
  loadAllRows, appendRows, batchUpdateCells, dedupeRows, withQuotaRetry, type RawRow,
} from './sheets/client';
import { invalidateTmUserCache } from './auth';

export interface SyncTmUsersResult {
  total_nhan_vien: number;
  created: number;
  updated: number;
  deactivated: number;
  departments_created: number;
  duplicates_removed: number;
  skipped_resigned: number;
  skipped: number;
  details: { created: string[]; updated: string[]; deactivated: string[] };
}

/**
 * Khoá so khớp mã nhân viên.
 *
 * NHAN_VIEN lưu id dạng "0009" nhưng Google Sheets tự đổi "0009" thành số 9
 * khi ghi xuống TM_Users → so khớp chuỗi thô luôn trượt và tạo dòng trùng.
 * Chuẩn hoá bằng cách bỏ số 0 ở đầu cho cả hai phía.
 */
function codeKey(value: string): string {
  const v = (value || '').trim();
  if (!v) return '';
  return /^\d+$/.test(v) ? String(Number(v)) : v.toLowerCase();
}

// ─── Helpers dùng chung với auth.ts / sync-employees.ts ────

function normalizeText(value: string): string {
  return (value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(new RegExp('[\\u0300-\\u036f]', 'g'), '')
    .replace(/đ/g, 'd')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Map chức vụ → role RBAC.
 * PHẢI khớp với mapRole() trong auth.ts và getRole() trong scripts/task-management/sync-employees.ts
 */
export function mapRoleFromPosition(vai_tro: string, employee_type: string): UserRole {
  const vt  = (vai_tro || '').trim();
  const etL = (employee_type || '').trim().toLowerCase();
  const etN = normalizeText(employee_type || '');

  // director: Chủ tịch, CEO, Tổng GĐ, Phó GĐ, Admin
  if (
    vt === 'Admin' ||
    etL === 'chủ tịch' || etL === 'chu tich' || etL === 'ct' ||
    etL === 'ceo' ||
    etL.startsWith('tgđ') || etL.startsWith('tgd') ||
    etL.startsWith('pgđ') || etL.startsWith('pgd') ||
    etL.startsWith('phó giám') || etL.startsWith('pho giam') ||
    etL.startsWith('tổng') || etL.startsWith('tong')
  ) return 'director';

  // staff — kiểm tra TRƯỚC manager để TPKD/TKKD không khớp nhầm tp*
  if (
    etL === 'tpkd' || etL === 'nvkd' || etL === 'tkkd' ||
    etL.startsWith('cv ')
  ) return 'staff';

  // team_leader: GĐKD + TP Marketing
  if (
    etL === 'gđkd' || etL === 'gdkd' ||
    etL === 'tp marketing' || etL === 'tp mkt' ||
    ((etN.startsWith('tp ') || etN.startsWith('tp-') || etN.includes('truong phong')) &&
      (etN.includes('marketing') || etN.includes('mkt') || etN.includes('digital'))) ||
    etL.includes('trưởng phòng marketing') || etL.includes('truong phong marketing') ||
    etL.includes('leader') || etL.includes('team lead') ||
    vt === 'leader'
  ) return 'team_leader';

  // manager: GĐ DA, GĐ Marketing + BO Trưởng phòng
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

const INACTIVE_KEYWORDS = ['nghỉ việc', 'nghi viec', 'off', 'inactive', 'thôi việc', 'thoi viec'];

function isActiveFromTrangThai(trang_thai: string): boolean {
  const tt = (trang_thai || '').toLowerCase().trim();
  if (!tt) return true; // Không có trạng thái → coi như còn làm
  return !INACTIVE_KEYWORDS.some(s => tt.includes(s));
}

/** Tên phòng ban suy ra từ NHAN_VIEN — khớp inferDeptName() của script sync-employees */
function inferDeptName(nv: NhanVien): string {
  const explicit = (nv.phong_KD || nv.khu_vuc || '').trim();
  if (explicit) return explicit;

  const source = normalizeText(`${nv.employee_type || ''} ${nv.vai_tro || ''}`);
  if (source.includes('marketing') || source.includes('mkt')) return 'Phòng MKT';
  if (source.includes('tckt') || source.includes('ke toan') || source.includes('tai chinh')) return 'Phòng TCKT';
  if (source.includes('hcns') || source.includes('nhan su') || source.includes('hanh chinh')) return 'Phòng HCNS';
  if (source.includes('tkkd') || source.includes('thu ky kinh doanh')) return 'Phòng TKKD';
  if (source.includes('chu tich') || source.includes('ceo') || source.includes('ban lanh dao') || source.includes('bld')) return 'BLĐ';
  return 'Chưa phân công';
}

function deptIdFromName(name: string): string {
  const slug = name.toLowerCase().replace(/[^\w]/g, '-').slice(0, 20).replace(/-+$/, '');
  return `dept-${slug}`;
}

function deptKey(value: string): string {
  return normalizeText(value).replace(/\s+/g, '');
}

// ─── MAIN ─────────────────────────────────────────────────

export async function syncTmUsersFromNhanVien(): Promise<SyncTmUsersResult> {
  const now = new Date().toISOString();
  const result: SyncTmUsersResult = {
    total_nhan_vien: 0, created: 0, updated: 0, deactivated: 0,
    departments_created: 0, duplicates_removed: 0, skipped_resigned: 0, skipped: 0,
    details: { created: [], updated: [], deactivated: [] },
  };

  // ── 0. Dọn dòng trùng còn sót (do bản sync cũ so khớp "0009" vs "9" bị trượt).
  // Chỉ xoá khi user_id giống hệt dòng được giữ → không thể làm hỏng tham chiếu task.
  const dedupe = await withQuotaRetry(
    () => dedupeRows(
      SHEET_NAMES.USERS,
      // `?? ` không đủ: ô trống trả về '' chứ không phải undefined
      r => codeKey(String(r.employee_code ?? '') || String(r.user_id ?? '')),
      r => String(r.user_id ?? '').trim(),
    ),
    'dedupe TM_Users',
  );
  result.duplicates_removed = dedupe.removed;

  const [nhanVien, tmUsers, tmDepts] = await withQuotaRetry(() => Promise.all([
    getNhanVien(),
    loadAllRows(SHEET_NAMES.USERS),
    loadAllRows(SHEET_NAMES.DEPARTMENTS),
  ]), 'read NHAN_VIEN + TM_Users + TM_Departments');

  const employees = nhanVien.filter(nv => (nv.id_nhan_vien || '').trim());
  result.total_nhan_vien = employees.length;
  result.skipped = nhanVien.length - employees.length;

  // ── 1. Phòng ban: khớp theo dept_id / code / name, tạo mới nếu chưa có
  const deptIndex = new Map<string, string>(); // key chuẩn hoá → dept_id
  for (const d of tmDepts) {
    const id = String(d.dept_id ?? '').trim();
    if (!id) continue;
    for (const field of [d.dept_id, d.code, d.name]) {
      const k = deptKey(String(field ?? ''));
      if (k && !deptIndex.has(k)) deptIndex.set(k, id);
    }
  }

  const newDepts: RawRow[] = [];
  function resolveDeptId(nv: NhanVien): string {
    const name = inferDeptName(nv);
    const key  = deptKey(name);
    const hit  = deptIndex.get(key);
    if (hit) return hit;

    const id = deptIdFromName(name);
    deptIndex.set(key, id);
    deptIndex.set(deptKey(id), id);
    newDepts.push({
      dept_id: id,
      name,
      code: name.replace(/phòng\s*/i, '').trim().slice(0, 12).toUpperCase().replace(/\s+/g, '_') || id,
      manager_id: '', parent_dept_id: '', description: '',
      is_active: 'TRUE', sort_order: '',
      created_at: now, updated_at: now,
    });
    return id;
  }

  // ── 2. Index TM_Users hiện có — khớp mã theo dạng đã chuẩn hoá ("0009" ≡ "9")
  const byCode  = new Map<string, RawRow>();
  const byEmail = new Map<string, RawRow>();
  for (const u of tmUsers) {
    const code  = codeKey(String(u.employee_code ?? '') || String(u.user_id ?? ''));
    const email = String(u.email ?? '').trim().toLowerCase();
    if (code  && !byCode.has(code))   byCode.set(code, u);
    if (email && !byEmail.has(email)) byEmail.set(email, u);
  }

  const toCreate: RawRow[] = [];
  const toUpdate: { keyValue: string; data: Partial<RawRow> }[] = [];

  for (const nv of employees) {
    // Ghi mã ở dạng đã chuẩn hoá để sheet chỉ tồn tại MỘT định dạng duy nhất,
    // khớp với các dòng sẵn có (Sheets vốn đã cắt số 0 đầu của chúng).
    const code   = codeKey(nv.id_nhan_vien);
    const email  = (nv.email || '').trim().toLowerCase();
    const active = isActiveFromTrangThai(nv.trang_thai || '');
    const role   = mapRoleFromPosition(nv.vai_tro || '', nv.employee_type || '');

    const existing = byCode.get(code) || (email ? byEmail.get(email) : undefined);

    if (!existing) {
      // Đã nghỉ việc và chưa từng có trong TM_Users → không tạo mới,
      // tránh làm sheet đầy người không còn làm.
      if (!active) {
        result.skipped_resigned++;
        continue;
      }
      toCreate.push({
        user_id:        code,
        employee_code:  code,
        full_name:      (nv.ho_ten || '').trim(),
        email,
        phone:          (nv.so_dien_thoai || '').trim(),
        department_id:  resolveDeptId(nv),
        team_id:        '',
        role,
        position:       (nv.employee_type || '').trim(),
        avatar_url:     (nv.avatar_url || '').trim(),
        zalo_id:        '',
        is_active:      active ? 'TRUE' : 'FALSE',
        last_active_at: '',
        created_at:     now,
        updated_at:     now,
      });
      result.details.created.push(`${code} — ${nv.ho_ten}`);
      continue;
    }

    const userId = String(existing.user_id ?? '').trim();
    if (!userId) continue;

    const storedPosition = String(existing.position ?? '').trim();
    const newPosition    = (nv.employee_type || '').trim();
    const patch: Partial<RawRow> = {};

    // Field đồng bộ 1 chiều từ NHAN_VIEN
    if (String(existing.full_name ?? '').trim() !== (nv.ho_ten || '').trim()) {
      patch.full_name = (nv.ho_ten || '').trim();
    }
    if (email && String(existing.email ?? '').trim().toLowerCase() !== email) {
      patch.email = email;
    }
    if (codeKey(String(existing.employee_code ?? '')) !== code) {
      patch.employee_code = code;
    }
    if ((nv.so_dien_thoai || '').trim() && String(existing.phone ?? '').trim() !== (nv.so_dien_thoai || '').trim()) {
      patch.phone = (nv.so_dien_thoai || '').trim();
    }
    if (storedPosition !== newPosition) {
      patch.position = newPosition;
      // Chức vụ đổi (thăng chức / chuyển vai trò) → tính lại role.
      // Chức vụ KHÔNG đổi → giữ nguyên role admin đã chỉnh tay.
      patch.role = role;
    } else if (!String(existing.role ?? '').trim()) {
      patch.role = role;
    }
    if (!String(existing.department_id ?? '').trim()) {
      patch.department_id = resolveDeptId(nv);
    }

    const currentActive = String(existing.is_active ?? '').trim().toUpperCase() !== 'FALSE';
    if (currentActive !== active) {
      patch.is_active = active ? 'TRUE' : 'FALSE';
      if (!active) {
        result.deactivated++;
        result.details.deactivated.push(`${code} — ${nv.ho_ten}`);
      }
    }

    if (Object.keys(patch).length > 0) {
      patch.updated_at = now;
      toUpdate.push({ keyValue: userId, data: patch });
      result.details.updated.push(`${code} — ${nv.ho_ten}`);
    }
  }

  // ── 3. Ghi xuống sheet — tuần tự, mỗi bước 1-3 request để không đụng quota ghi
  if (newDepts.length > 0) {
    await withQuotaRetry(() => appendRows(SHEET_NAMES.DEPARTMENTS, newDepts), 'append TM_Departments');
    result.departments_created = newDepts.length;
  }
  if (toCreate.length > 0) {
    await withQuotaRetry(() => appendRows(SHEET_NAMES.USERS, toCreate), 'append TM_Users');
    result.created = toCreate.length;
  }
  if (toUpdate.length > 0) {
    result.updated = await withQuotaRetry(
      () => batchUpdateCells(SHEET_NAMES.USERS, 'user_id', toUpdate),
      'update TM_Users',
    );
  }

  if (result.created || result.updated || result.departments_created || result.duplicates_removed) {
    invalidateTmUserCache();
  }

  console.log('[TM sync-users]', {
    total: result.total_nhan_vien,
    created: result.created,
    updated: result.updated,
    deactivated: result.deactivated,
    duplicates_removed: result.duplicates_removed,
    skipped_resigned: result.skipped_resigned,
    depts: result.departments_created,
  });

  return result;
}
