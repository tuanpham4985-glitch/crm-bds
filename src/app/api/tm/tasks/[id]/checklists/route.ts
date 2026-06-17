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
    const task = await getTaskService().getTask(toRbacContext(user), id);
    return okResponse(task.checklists ?? []);
  } catch (e: unknown) {
    console.error('[TM Checklists GET]', e);
    return errorResponse('Lỗi tải checklist');
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const user = await getCurrentTmUser();
    if (!user) return unauthorizedResponse();
    const { id } = await params;
    const { items } = await req.json(); // items: [{title, sort_order}]
    if (!Array.isArray(items) || !items.length) return errorResponse('items là bắt buộc', 400);

    const { getTaskService: svc } = await import('@/lib/task-management');
    // Access checklist repo via the UoW directly
    const { ChecklistSheetsRepository } = await import('@/lib/task-management/sheets/task.repository');
    const repo = new ChecklistSheetsRepository();
    const results = await repo.bulkCreate(id, 'task', items);
    return okResponse(results, 201);
  } catch (e: unknown) {
    console.error('[TM Checklists POST]', e);
    return errorResponse('Lỗi thêm checklist');
  }
}
