import { getCurrentTmUser, unauthorizedResponse, errorResponse, okResponse } from '@/lib/task-management/auth';
import { initTaskManagementSheets } from '@/lib/task-management';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const user = await getCurrentTmUser();
    if (!user) return unauthorizedResponse();
    if (user.role !== 'director') return errorResponse('Chỉ Admin mới có thể khởi tạo sheets', 403);
    await initTaskManagementSheets();
    return okResponse({ initialized: true, message: 'Tất cả sheets TM_ đã được tạo thành công' });
  } catch (e: unknown) {
    console.error('[TM Init]', e);
    return errorResponse('Lỗi khởi tạo Task Management Sheets');
  }
}
