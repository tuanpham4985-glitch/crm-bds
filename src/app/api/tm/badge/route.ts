import { getCurrentTmUser, unauthorizedResponse, okResponse } from '@/lib/task-management/auth';
import { SHEET_NAMES } from '@/lib/task-management/types';
import { loadAllRows } from '@/lib/task-management/sheets/client';

export const dynamic = 'force-dynamic';

const ROLE_APPROVAL_LEVEL: Record<string, number> = {
  director:    99,
  manager:      2,
  team_leader:  1,
};

export async function GET() {
  try {
    const user = await getCurrentTmUser();
    if (!user) return unauthorizedResponse();

    const [notifs, tasks] = await Promise.all([
      loadAllRows(SHEET_NAMES.NOTIFICATIONS),
      loadAllRows(SHEET_NAMES.TASKS),
    ]);

    const unread = notifs.filter(n => n.user_id === user.user_id && n.status !== 'read').length;

    const maxLevel = ROLE_APPROVAL_LEVEL[user.role] ?? 0;
    const pending = maxLevel > 0
      ? tasks.filter(t =>
          t.approval_status === 'pending' &&
          Number(t.approval_level ?? 1) <= maxLevel &&
          !t.deleted_at,
        ).length
      : 0;

    return okResponse({ count: unread + pending, unread, pending });
  } catch {
    return okResponse({ count: 0, unread: 0, pending: 0 });
  }
}
