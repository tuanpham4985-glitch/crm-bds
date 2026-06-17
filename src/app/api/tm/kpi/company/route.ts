import { getCurrentTmUser, toRbacContext, unauthorizedResponse, errorResponse, okResponse } from '@/lib/task-management/auth';
import { getKpiService } from '@/lib/task-management';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const user = await getCurrentTmUser();
    if (!user) return unauthorizedResponse();
    const dashboard = await getKpiService().getCompanyDashboard(toRbacContext(user));
    return okResponse(dashboard);
  } catch (e: unknown) {
    const err = e as Error;
    if (err.name === 'RbacError') return errorResponse(err.message, 403);
    console.error('[TM KPI Company]', err);
    return errorResponse('Lỗi tải KPI');
  }
}
