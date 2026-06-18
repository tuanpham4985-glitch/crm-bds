import { NextRequest } from 'next/server';
import { loadRows } from '@/lib/task-management/sheets/client';
import { SHEET_NAMES } from '@/lib/task-management/types';
import { getCurrentTmUser, unauthorizedResponse, okResponse, errorResponse } from '@/lib/task-management/auth';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest) {
  try {
    const user = await getCurrentTmUser();
    if (!user) return unauthorizedResponse();

    const rows = await loadRows(SHEET_NAMES.PROJECTS, 'archived_at').catch(() => []);
    const projects = rows
      .filter(r => r.project_id && r.status !== 'cancelled')
      .map(r => ({ project_id: r.project_id, name: r.name, code: r.code ?? '' }));

    return okResponse(projects);
  } catch (e: unknown) {
    console.error('[TM Projects GET]', (e as Error).message);
    return errorResponse('Lỗi tải danh sách dự án');
  }
}
