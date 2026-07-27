import { NextRequest } from 'next/server';
import { getTaskService } from '@/lib/task-management';
import {
  getCurrentTmUser, toRbacContext,
  unauthorizedResponse, errorResponse, okResponse,
} from '@/lib/task-management/auth';
import type { TaskFilters, PaginationOptions } from '@/lib/task-management/types';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentTmUser();
    if (!user) return unauthorizedResponse();
    const ctx = toRbacContext(user);

    const sp = new URL(req.url).searchParams;

    const filters: TaskFilters = {
      status:        sp.get('status')        ? (sp.get('status')!.split(',') as TaskFilters['status']) : undefined,
      priority:      sp.get('priority')      ? (sp.get('priority')!.split(',') as TaskFilters['priority']) : undefined,
      owner_id:      sp.get('owner_id')      || undefined,
      department_id: sp.get('department_id') || undefined,
      project_id:    sp.get('project_id')    || undefined,
      participant_id: sp.get('participant_id') || undefined,
      requester_department_id: sp.get('requester_department_id') || undefined,
      due_before:    sp.get('due_before')    || undefined,
      due_after:     sp.get('due_after')     || undefined,
      search:        sp.get('search')        || undefined,
      overdue_only:  sp.get('overdue_only') === 'true',
      tags:          sp.get('tags')          ? sp.get('tags')!.split(',') : undefined,
    };

    const pagination: PaginationOptions = {
      page:  parseInt(sp.get('page')  || '1'),
      limit: parseInt(sp.get('limit') || '50'),
    };

    const result = await getTaskService().listTasks(ctx, filters, pagination);
    return okResponse(result);
  } catch (e: unknown) {
    const err = e as Error;
    if (err.message === 'UNAUTHORIZED') return unauthorizedResponse();
    console.error('[TM Tasks GET]', err);
    return errorResponse('Lỗi tải danh sách công việc');
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentTmUser();
    if (!user) return unauthorizedResponse();
    const ctx = toRbacContext(user);

    const body = await req.json();
    const task = await getTaskService().createTask(ctx, body);
    return okResponse(task, 201);
  } catch (e: unknown) {
    const err = e as Error;
    if (err.message === 'UNAUTHORIZED') return unauthorizedResponse();
    if (err.name === 'RbacError')       return Response.json({ success: false, error: err.message }, { status: 403 });
    if (err.name === 'ValidationError') return Response.json({ success: false, error: err.message }, { status: 400 });
    console.error('[TM Tasks POST]', err);
    return errorResponse('Lỗi tạo công việc');
  }
}
