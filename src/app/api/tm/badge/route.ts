import { getCurrentTmUser, unauthorizedResponse, okResponse } from '@/lib/task-management/auth';
import { SHEET_NAMES } from '@/lib/task-management/types';
import { loadAllRows } from '@/lib/task-management/sheets/client';

export const dynamic = 'force-dynamic';

const ROLE_APPROVAL_LEVEL: Record<string, number> = {
  director:    99,
  manager:      2,
  team_leader:  1,
};

function canCountPendingApproval(user: { role: string; department_id?: string }, task: Record<string, string>): boolean {
  if (task.approval_status !== 'pending' || task.deleted_at) return false;
  const maxLevel = ROLE_APPROVAL_LEVEL[user.role] ?? 0;
  if (maxLevel <= 0) return false;
  if (Number(task.approval_level ?? 1) > maxLevel) return false;
  return user.role === 'director' || task.department_id === user.department_id;
}

export async function GET() {
  try {
    const user = await getCurrentTmUser();
    if (!user) return unauthorizedResponse();

    const [notifs, tasks] = await Promise.all([
      loadAllRows(SHEET_NAMES.NOTIFICATIONS),
      loadAllRows(SHEET_NAMES.TASKS),
    ]);

    const unread = notifs.filter(n => n.user_id === user.user_id && n.status !== 'read').length;

    const pending = tasks.filter(t => canCountPendingApproval(user, t)).length;

    return okResponse({ count: unread + pending, unread, pending });
  } catch {
    return okResponse({ count: 0, unread: 0, pending: 0 });
  }
}
