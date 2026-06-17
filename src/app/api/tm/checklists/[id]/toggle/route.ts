import { NextRequest } from 'next/server';
import { getCurrentTmUser, toRbacContext, unauthorizedResponse, errorResponse, okResponse } from '@/lib/task-management/auth';

export const dynamic = 'force-dynamic';
type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const user = await getCurrentTmUser();
    if (!user) return unauthorizedResponse();
    const { id } = await params;
    const { is_done } = await req.json();
    const { getTaskService } = await import('@/lib/task-management');
    const result = await getTaskService().toggleChecklist(toRbacContext(user), id, Boolean(is_done));
    return okResponse(result);
  } catch (e: unknown) {
    console.error('[TM Checklist toggle]', e);
    return errorResponse('Lỗi cập nhật checklist');
  }
}
