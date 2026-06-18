import { NextRequest } from 'next/server';
import { loadRows } from '@/lib/task-management/sheets/client';
import { SHEET_NAMES } from '@/lib/task-management/types';
import { getCurrentTmUser, unauthorizedResponse, okResponse, errorResponse } from '@/lib/task-management/auth';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest) {
  try {
    const user = await getCurrentTmUser();
    if (!user) return unauthorizedResponse();

    const rows = await loadRows(SHEET_NAMES.DEPARTMENTS).catch(() => []);
    const depts = rows
      .filter(r => r.dept_id && r.is_active !== 'FALSE')
      .map(r => ({ dept_id: r.dept_id, name: r.name, code: r.code ?? '' }));

    return okResponse(depts);
  } catch (e: unknown) {
    console.error('[TM Departments GET]', (e as Error).message);
    return errorResponse('Lỗi tải danh sách phòng ban');
  }
}
