import { NextRequest } from 'next/server';
import { getCurrentTmUser, toRbacContext, unauthorizedResponse, errorResponse, okResponse } from '@/lib/task-management/auth';
import { getKpiService } from '@/lib/task-management';

export const dynamic = 'force-dynamic';
type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const user = await getCurrentTmUser();
    if (!user) return unauthorizedResponse();
    const { id } = await params;
    const kpi = await getKpiService().getDeptKpi(toRbacContext(user), id);
    return okResponse(kpi);
  } catch (e: unknown) {
    const err = e as Error;
    if (err.name === 'RbacError') return errorResponse(err.message, 403);
    console.error('[TM KPI Dept]', err);
    return errorResponse('Lỗi tải KPI phòng ban');
  }
}
