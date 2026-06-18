import { NextRequest } from 'next/server';
import { loadAllRows, appendRow } from '@/lib/task-management/sheets/client';
import { SHEET_NAMES } from '@/lib/task-management/types';
import { getCurrentTmUser, unauthorizedResponse, errorResponse, okResponse } from '@/lib/task-management/auth';
import { randomUUID } from 'crypto';

export const dynamic = 'force-dynamic';
type Params = { params: Promise<{ id: string }> };

// Query trực tiếp — bypass getTask() cache
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const user = await getCurrentTmUser();
    if (!user) return unauthorizedResponse();
    const { id } = await params;

    const rows = await loadAllRows(SHEET_NAMES.COMMENTS).catch(() => []);
    const comments = rows
      .filter(r => r.task_id === id && r.task_type === 'task' && r.is_deleted !== 'TRUE')
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map(r => ({
        comment_id:        r.comment_id,
        task_id:           r.task_id,
        user_id:           r.user_id,
        body:              r.body,
        parent_comment_id: r.parent_comment_id || null,
        created_at:        r.created_at,
        edited_at:         r.edited_at || null,
      }));

    return okResponse(comments);
  } catch (e: unknown) {
    console.error('[TM Comments GET]', (e as Error).message);
    return errorResponse('Lỗi tải bình luận');
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const user = await getCurrentTmUser();
    if (!user) return unauthorizedResponse();
    const { id } = await params;
    const { body, parent_comment_id } = await req.json();
    if (!body?.trim()) return errorResponse('Nội dung bình luận là bắt buộc', 400);

    const comment = {
      comment_id:        randomUUID(),
      task_id:           id,
      task_type:         'task',
      user_id:           user.user_id,
      body:              body.trim(),
      mentions:          '[]',
      attachment_urls:   '[]',
      parent_comment_id: parent_comment_id ?? '',
      created_at:        new Date().toISOString(),
      edited_at:         '',
      is_deleted:        'FALSE',
    };
    await appendRow(SHEET_NAMES.COMMENTS, comment);

    return okResponse({
      comment_id:        comment.comment_id,
      task_id:           comment.task_id,
      user_id:           comment.user_id,
      body:              comment.body,
      parent_comment_id: parent_comment_id ?? null,
      created_at:        comment.created_at,
    }, 201);
  } catch (e: unknown) {
    console.error('[TM Comments POST]', (e as Error).message);
    return errorResponse('Lỗi thêm bình luận');
  }
}
