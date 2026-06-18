import { NextRequest } from 'next/server';
import { getTaskService } from '@/lib/task-management';
import {
  getCurrentTmUser, toRbacContext,
  unauthorizedResponse, errorResponse, okResponse,
} from '@/lib/task-management/auth';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const user = await getCurrentTmUser();
    if (!user) return unauthorizedResponse();
    const { id } = await params;
    const task = await getTaskService().getTask(toRbacContext(user), id);
    return okResponse(task);
  } catch (e: unknown) {
    const err = e as Error;
    if (err.name === 'TaskNotFoundError') return errorResponse('Không tìm thấy công việc', 404);
    if (err.name === 'UnauthorizedError') return errorResponse(err.message, 403);
    console.error('[TM Task GET]', err.name, err.message, err.stack?.slice(0, 400));
    return errorResponse(`Lỗi tải công việc: ${err.message}`);
  }
}

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const user = await getCurrentTmUser();
    if (!user) return unauthorizedResponse();
    const { id } = await params;
    const body = await req.json();
    const task = await getTaskService().updateTask(toRbacContext(user), id, body);
    return okResponse(task);
  } catch (e: unknown) {
    const err = e as Error;
    if (err.name === 'TaskNotFoundError')  return errorResponse('Không tìm thấy công việc', 404);
    if (err.name === 'UnauthorizedError')  return errorResponse(err.message, 403);
    if (err.name === 'ValidationError')    return errorResponse(err.message, 400);
    console.error('[TM Task PUT]', err);
    return errorResponse('Lỗi cập nhật công việc');
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const user = await getCurrentTmUser();
    if (!user) return unauthorizedResponse();
    const { id } = await params;
    await getTaskService().deleteTask(toRbacContext(user), id);
    return okResponse({ deleted: true });
  } catch (e: unknown) {
    const err = e as Error;
    if (err.name === 'UnauthorizedError') return errorResponse(err.message, 403);
    console.error('[TM Task DELETE]', err);
    return errorResponse('Lỗi xóa công việc');
  }
}
