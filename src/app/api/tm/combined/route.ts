// Gộp me + notifications + pending_count vào 1 API call
// Giảm từ 3 concurrent Sheets requests xuống còn 1 (dùng chung row cache)
import { getCurrentTmUser, unauthorizedResponse, okResponse } from '@/lib/task-management/auth';
import { SHEET_NAMES } from '@/lib/task-management/types';
import { loadAllRows, loadRows } from '@/lib/task-management/sheets/client';

export const dynamic = 'force-dynamic';

const ROLE_APPROVAL_LEVEL: Record<string, number> = {
  director: 99, manager: 2, team_leader: 1,
};

function canCountPendingApproval(user: { role: string; department_id?: string }, task: Record<string, string>): boolean {
  if (task.approval_status !== 'pending') return false;
  const maxLevel = ROLE_APPROVAL_LEVEL[user.role] ?? 0;
  if (maxLevel <= 0) return false;
  if (Number(task.approval_level ?? 1) > maxLevel) return false;
  return user.role === 'director' || task.department_id === user.department_id;
}

export async function GET() {
  try {
    const user = await getCurrentTmUser();
    if (!user) return unauthorizedResponse();

    // Load notifications + tasks song song — dùng chung row cache với nhau và với auth
    const [notifRows, taskRows] = await Promise.all([
      loadAllRows(SHEET_NAMES.NOTIFICATIONS),
      loadRows(SHEET_NAMES.TASKS),
    ]);

    // Notifications của user hiện tại (50 mới nhất)
    const userNotifs = notifRows
      .filter(r => r.user_id === user.user_id)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 50);

    const unreadCount = userNotifs.filter(n => n.status !== 'read').length;

    // Pending approvals count
    const pendingCount = taskRows.filter(t => canCountPendingApproval(user, t)).length;

    return okResponse({
      me:            { user_id: user.user_id, full_name: user.full_name, email: user.email, role: user.role, department_id: user.department_id },
      notifications: userNotifs,
      unread_count:  unreadCount,
      pending_count: pendingCount,
      badge_total:   unreadCount + pendingCount,
    });
  } catch (e) {
    console.error('[TM Combined]', e);
    return okResponse({ me: null, notifications: [], unread_count: 0, pending_count: 0, badge_total: 0 });
  }
}
