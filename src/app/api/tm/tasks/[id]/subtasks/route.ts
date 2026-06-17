import { NextRequest } from 'next/server';
import { getTaskService } from '@/lib/task-management';
import { getCurrentTmUser, toRbacContext, unauthorizedResponse, errorResponse, okResponse } from '@/lib/task-management/auth';

export const dynamic = 'force-dynamic';
type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const user = await getCurrentTmUser();
    if (!user) return unauthorizedResponse();
    const { id } = await params;
    // Re-use getTask which includes subtasks
    const task = await getTaskService().getTask(toRbacContext(user), id);
    return okResponse(task.subtasks ?? []);
  } catch (e: unknown) {
    const err = e as Error;
    if (err.name === 'TaskNotFoundError') return errorResponse('Không tìm thấy công việc', 404);
    console.error('[TM Subtasks GET]', err);
    return errorResponse('Lỗi tải subtasks');
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const user = await getCurrentTmUser();
    if (!user) return unauthorizedResponse();
    const { id } = await params;
    const body = await req.json();
    const subtask = await getTaskService().createSubtask(toRbacContext(user), id, body);
    return okResponse(subtask, 201);
  } catch (e: unknown) {
    const err = e as Error;
    if (err.name === 'UnauthorizedError') return errorResponse(err.message, 403);
    if (err.name === 'ValidationError')   return errorResponse(err.message, 400);
    console.error('[TM Subtasks POST]', err);
    return errorResponse('Lỗi tạo subtask');
  }
}
