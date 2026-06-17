import { NextRequest } from 'next/server';
import { getTaskService } from '@/lib/task-management';
import { getCurrentTmUser, toRbacContext, unauthorizedResponse, errorResponse, okResponse } from '@/lib/task-management/auth';

export const dynamic = 'force-dynamic';
type Params = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const user = await getCurrentTmUser();
    if (!user) return unauthorizedResponse();
    const { id } = await params;
    const task = await getTaskService().approveTask(toRbacContext(user), id);
    return okResponse(task);
  } catch (e: unknown) {
    const err = e as Error;
    if (err.name === 'ValidationError')   return errorResponse(err.message, 400);
    if (err.name === 'UnauthorizedError') return errorResponse(err.message, 403);
    if (err.name === 'RbacError')         return errorResponse(err.message, 403);
    console.error('[TM Approve]', err);
    return errorResponse('Lỗi phê duyệt');
  }
}
