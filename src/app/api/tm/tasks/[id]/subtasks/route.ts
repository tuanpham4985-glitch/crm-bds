import { NextRequest } from 'next/server';
import { SubtaskSheetsRepository } from '@/lib/task-management/sheets/task.repository';
import { getTaskService } from '@/lib/task-management';
import { getCurrentTmUser, toRbacContext, unauthorizedResponse, errorResponse, okResponse } from '@/lib/task-management/auth';

export const dynamic = 'force-dynamic';
type Params = { params: Promise<{ id: string }> };

// Query repo trực tiếp — bypass getTask() cache
const repo = new SubtaskSheetsRepository();

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const user = await getCurrentTmUser();
    if (!user) return unauthorizedResponse();
    const { id } = await params;
    const subtasks = await repo.findByParentTask(id);
    return okResponse(subtasks);
  } catch (e: unknown) {
    console.error('[TM Subtasks GET]', (e as Error).message);
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
    console.error('[TM Subtasks POST]', err.message);
    return errorResponse('Lỗi tạo subtask');
  }
}
