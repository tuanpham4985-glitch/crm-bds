import { NextRequest } from 'next/server';
import { getCurrentTmUser, unauthorizedResponse, errorResponse, okResponse } from '@/lib/task-management/auth';
import { SHEET_NAMES } from '@/lib/task-management/types';
import { loadAllRows, updateRow, batchUpdateRows } from '@/lib/task-management/sheets/client';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentTmUser();
    if (!user) return unauthorizedResponse();

    const unreadOnly = new URL(req.url).searchParams.get('unread_only') === 'true';
    const rows = await loadAllRows(SHEET_NAMES.NOTIFICATIONS);
    let notifs = rows.filter(r => r.user_id === user.user_id);
    if (unreadOnly) notifs = notifs.filter(r => r.status !== 'read');

    notifs.sort((a, b) => b.created_at.localeCompare(a.created_at));
    return okResponse(notifs.slice(0, 50));
  } catch (e: unknown) {
    console.error('[TM Notifications GET]', e);
    return errorResponse('Lỗi tải thông báo');
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await getCurrentTmUser();
    if (!user) return unauthorizedResponse();

    const { notif_id, read_all } = await req.json();
    const now = new Date().toISOString();

    if (read_all) {
      const rows = await loadAllRows(SHEET_NAMES.NOTIFICATIONS);
      const userNotifs = rows.filter(r => r.user_id === user.user_id && r.status !== 'read');
      if (userNotifs.length > 0) {
        await batchUpdateRows(SHEET_NAMES.NOTIFICATIONS, 'notif_id',
          userNotifs.map(n => ({ keyValue: n.notif_id, data: { status: 'read', read_at: now } })),
        );
      }
      return okResponse({ marked: userNotifs.length });
    }

    if (notif_id) {
      await updateRow(SHEET_NAMES.NOTIFICATIONS, 'notif_id', notif_id, { status: 'read', read_at: now });
      return okResponse({ marked: 1 });
    }

    return errorResponse('notif_id hoặc read_all là bắt buộc', 400);
  } catch (e: unknown) {
    console.error('[TM Notifications PATCH]', e);
    return errorResponse('Lỗi cập nhật thông báo');
  }
}
