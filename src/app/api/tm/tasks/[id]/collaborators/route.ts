import { NextRequest } from 'next/server';
import { getTaskService } from '@/lib/task-management';
import { getCurrentTmUser, toRbacContext, unauthorizedResponse, errorResponse, okResponse } from '@/lib/task-management/auth';

export const dynamic = 'force-dynamic';
type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const user = await getCurrentTmUser();
    if (!user) return unauthorizedResponse();
    const { id } = await params;
    const { user_id, role } = await req.json();
    if (!user_id) return errorResponse('user_id là bắt buộc', 400);
    await getTaskService().addCollaborator(toRbacContext(user), id, user_id, role || 'contributor');
    return okResponse({ added: true });
  } catch (e: unknown) {
    const err = e as Error;
    if (err.name === 'UnauthorizedError') return errorResponse(err.message, 403);
    if (err.name === 'RbacError')         return errorResponse(err.message, 403);
    console.error('[TM Collab POST]', err);
    return errorResponse('Lỗi thêm người tham gia');
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const user = await getCurrentTmUser();
    if (!user) return unauthorizedResponse();
    const { id } = await params;
    const { user_id } = await req.json();
    await getTaskService().removeCollaborator(toRbacContext(user), id, user_id);
    return okResponse({ removed: true });
  } catch (e: unknown) {
    const err = e as Error;
    if (err.name === 'UnauthorizedError') return errorResponse(err.message, 403);
    console.error('[TM Collab DELETE]', err);
    return errorResponse('Lỗi xóa người tham gia');
  }
}
