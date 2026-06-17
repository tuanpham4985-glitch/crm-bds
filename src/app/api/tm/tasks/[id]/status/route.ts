import { NextRequest } from 'next/server';
import { getTaskService } from '@/lib/task-management';
import { getCurrentTmUser, toRbacContext, unauthorizedResponse, errorResponse, okResponse } from '@/lib/task-management/auth';

export const dynamic = 'force-dynamic';
type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const user = await getCurrentTmUser();
    if (!user) return unauthorizedResponse();
    const { id } = await params;
    const { status, reason, blocked_by_user_id } = await req.json();
    if (!status) return errorResponse('status là bắt buộc', 400);
    const task = await getTaskService().transitionStatus(toRbacContext(user), id, status, reason, blocked_by_user_id);
    return okResponse(task);
  } catch (e: unknown) {
    const err = e as Error;
    if (err.name === 'ValidationError')  return errorResponse(err.message, 400);
    if (err.name === 'UnauthorizedError') return errorResponse(err.message, 403);
    console.error('[TM Status PATCH]', err);
    return errorResponse('Lỗi cập nhật trạng thái');
  }
}
