// Đồng bộ thủ công NHAN_VIEN → TM_Users (Admin/Giám đốc)
// Dùng khi vừa thêm nhân viên mới và không muốn chờ cron chạy lúc 08:00 giờ VN.
import { NextRequest } from 'next/server';
import {
  getCurrentTmUser, unauthorizedResponse, errorResponse, okResponse,
} from '@/lib/task-management/auth';
import { syncTmUsersFromNhanVien } from '@/lib/task-management/sync-users';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(_req: NextRequest) {
  try {
    const user = await getCurrentTmUser();
    if (!user) return unauthorizedResponse();
    if (user.role !== 'director' && user.role !== 'manager') {
      return errorResponse('Chỉ Admin / Trưởng phòng mới được đồng bộ nhân viên', 403);
    }

    const result = await syncTmUsersFromNhanVien();
    return okResponse({
      ...result,
      message: `Đồng bộ xong: thêm mới ${result.created}, cập nhật ${result.updated}, ngừng hoạt động ${result.deactivated}`,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[TM Sync Users]', msg);

    if (msg.includes('429') || msg.includes('exhausted') || msg.includes('Quota')) {
      return errorResponse(
        'Google Sheets đang quá tải (hết quota tạm thời). Vui lòng chờ 1-2 phút rồi bấm đồng bộ lại. ' +
        'Các nhân viên đã ghi được vẫn giữ nguyên, lần sau chỉ đồng bộ phần còn thiếu.',
        429,
      );
    }
    return errorResponse(`Lỗi đồng bộ nhân viên: ${msg}`);
  }
}
