import { NextRequest } from 'next/server';
import { loadRows } from '@/lib/task-management/sheets/client';
import { SHEET_NAMES } from '@/lib/task-management/types';
import {
  getCurrentTmUser, unauthorizedResponse, okResponse, errorResponse,
} from '@/lib/task-management/auth';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest) {
  try {
    const user = await getCurrentTmUser();
    if (!user) return unauthorizedResponse();

    const rows = await loadRows(SHEET_NAMES.USERS).catch(() => []);
    const users = rows
      .filter(r => r.is_active !== 'FALSE' && r.user_id)
      .map(r => ({
        user_id:       r.user_id,
        employee_code:  r.employee_code ?? '',
        full_name:     r.full_name,
        email:         r.email,
        department_id: r.department_id ?? '',
        role:          r.role ?? '',
        position:      r.position ?? r.employee_type ?? '',
      }));

    return okResponse(users);
  } catch (e: unknown) {
    const err = e as Error;
    console.error('[TM Users GET]', err.message);
    return errorResponse('Lỗi tải danh sách nhân viên');
  }
}
