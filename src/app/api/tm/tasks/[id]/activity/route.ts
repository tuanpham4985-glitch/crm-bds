import { NextRequest } from 'next/server';
import { requireTmUser, unauthorizedResponse, errorResponse, okResponse, toRbacContext } from '@/lib/task-management/auth';
import { getTaskService } from '@/lib/task-management';
import { loadRows } from '@/lib/task-management/sheets/client';
import { SHEET_NAMES } from '@/lib/task-management/types';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireTmUser();
  if (!user) return unauthorizedResponse();

  try {
    const svc  = getTaskService();
    const task = await svc.getTask(toRbacContext(user), id);
    if (!task) return errorResponse('Task không tồn tại', 404);

    const rows = await loadRows(SHEET_NAMES.ACTIVITY_LOGS, '__none__');
    const logs = rows
      .filter(r => r.task_id === id)
      .slice(-50)
      .reverse();
    return okResponse(logs);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Lỗi server';
    return errorResponse(msg, 500);
  }
}
