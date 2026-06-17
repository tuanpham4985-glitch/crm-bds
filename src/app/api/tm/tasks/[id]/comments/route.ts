import { NextRequest } from 'next/server';
import { getCurrentTmUser, toRbacContext, unauthorizedResponse, errorResponse, okResponse } from '@/lib/task-management/auth';

export const dynamic = 'force-dynamic';
type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const user = await getCurrentTmUser();
    if (!user) return unauthorizedResponse();
    const { id } = await params;
    const { getTaskService } = await import('@/lib/task-management');
    const task = await getTaskService().getTask(toRbacContext(user), id);
    return okResponse(task.comments ?? []);
  } catch (e: unknown) {
    console.error('[TM Comments GET]', e);
    return errorResponse('Lỗi tải bình luận');
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const user = await getCurrentTmUser();
    if (!user) return unauthorizedResponse();
    const { id } = await params;
    const { body, mentions, parent_comment_id } = await req.json();
    if (!body?.trim()) return errorResponse('Nội dung bình luận là bắt buộc', 400);

    const { SHEET_NAMES } = await import('@/lib/task-management/types');
    const { appendRow } = await import('@/lib/task-management/sheets/client');
    const { randomUUID } = await import('crypto');

    const comment = {
      comment_id:        randomUUID(),
      task_id:           id,
      task_type:         'task',
      user_id:           user.user_id,
      body,
      mentions:          JSON.stringify(mentions ?? []),
      attachment_urls:   '[]',
      parent_comment_id: parent_comment_id ?? '',
      created_at:        new Date().toISOString(),
      edited_at:         '',
      is_deleted:        'FALSE',
    };
    await appendRow(SHEET_NAMES.COMMENTS, comment);

    // Audit log
    const { getTaskService } = await import('@/lib/task-management');
    const svc = getTaskService();
    // @ts-ignore — access private uow for logging
    await (svc as any).uow?.activityLogs?.log(id, 'task', user.user_id, 'comment_added', undefined, { comment_id: comment.comment_id });

    return okResponse({ ...comment, mentions: mentions ?? [], is_deleted: false }, 201);
  } catch (e: unknown) {
    console.error('[TM Comments POST]', e);
    return errorResponse('Lỗi thêm bình luận');
  }
}
