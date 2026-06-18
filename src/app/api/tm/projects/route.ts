import { NextRequest } from 'next/server';
import { getDuAn } from '@/lib/google-sheets';
import { getCurrentTmUser, unauthorizedResponse, okResponse, errorResponse } from '@/lib/task-management/auth';

export const dynamic = 'force-dynamic';

// Dự án lấy từ sheet DU_AN (cùng sheet với CRM chính)
export async function GET(_req: NextRequest) {
  try {
    const user = await getCurrentTmUser();
    if (!user) return unauthorizedResponse();

    const list = await getDuAn().catch(() => []);
    const projects = list
      .filter(da => da.id_du_an)
      .map(da => ({
        project_id: da.id_du_an,
        name:       da.ten_du_an,
        code:       da.ma_du_an ?? '',
      }));

    return okResponse(projects);
  } catch (e: unknown) {
    console.error('[TM Projects GET]', (e as Error).message);
    return errorResponse('Lỗi tải danh sách dự án');
  }
}
