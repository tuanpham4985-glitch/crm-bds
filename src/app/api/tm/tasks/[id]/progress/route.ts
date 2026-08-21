import { NextRequest } from 'next/server';
import { getTaskService } from '@/lib/task-management';
import {
  getCurrentTmUser,
  toRbacContext,
  unauthorizedResponse,
  errorResponse,
  okResponse,
} from '@/lib/task-management/auth';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const user = await getCurrentTmUser();
    if (!user) return unauthorizedResponse();

    const { id } = await params;
    const body = await req.json();
    const raw = body?.progress_pct ?? body?.progress;
    const pct = Number(raw);

    if (!Number.isFinite(pct)) return errorResponse('progress_pct là bắt buộc', 400);

    const task = await getTaskService().updateProgress(toRbacContext(user), id, pct);
    return okResponse(task);
  } catch (e: unknown) {
    const err = e as Error;
    if (err.name === 'TaskNotFoundError') return errorResponse('Không tìm thấy công việc', 404);
    if (err.name === 'UnauthorizedError') return errorResponse(err.message, 403);
    if (err.name === 'ValidationError') return errorResponse(err.message, 400);
    console.error('[TM Progress PATCH]', err);
    return errorResponse('Lỗi cập nhật tiến độ');
  }
}
