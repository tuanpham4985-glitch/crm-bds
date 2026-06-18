import { NextRequest } from 'next/server';
import { ChecklistSheetsRepository } from '@/lib/task-management/sheets/task.repository';
import { getCurrentTmUser, unauthorizedResponse, errorResponse, okResponse } from '@/lib/task-management/auth';

export const dynamic = 'force-dynamic';
type Params = { params: Promise<{ id: string }> };

// Query repo trực tiếp — bypass getTask() cache
const repo = new ChecklistSheetsRepository();

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const user = await getCurrentTmUser();
    if (!user) return unauthorizedResponse();
    const { id } = await params;
    const items = await repo.findByTask(id, 'task');
    return okResponse(items);
  } catch (e: unknown) {
    console.error('[TM Checklists GET]', (e as Error).message);
    return errorResponse('Lỗi tải checklist');
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const user = await getCurrentTmUser();
    if (!user) return unauthorizedResponse();
    const { id } = await params;
    const { items } = await req.json();
    if (!Array.isArray(items) || !items.length) return errorResponse('items là bắt buộc', 400);
    const results = await repo.bulkCreate(id, 'task', items);
    return okResponse(results, 201);
  } catch (e: unknown) {
    console.error('[TM Checklists POST]', (e as Error).message);
    return errorResponse('Lỗi thêm checklist');
  }
}
