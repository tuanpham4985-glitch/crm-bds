// API bấm tay: "Gửi mail giục quá hạn".
// Quyền: Ban Giám đốc (toàn công ty), Trưởng phòng / Nhóm trưởng (phòng mình
//   hoặc việc mình giao). Nhân viên thường không được.
//   GET  → xem trước (dry run) theo phạm vi của người gọi: KHÔNG gửi.
//   POST → thực sự gửi email (vẫn chống trùng theo ngày như cron).
import type { TmUser } from '@/lib/task-management/types';
import { getCurrentTmUser, unauthorizedResponse, forbiddenResponse, errorResponse, okResponse } from '@/lib/task-management/auth';
import { runOverdueReminders, type NudgeScope } from '@/lib/task-management/overdue-reminder';

export const dynamic = 'force-dynamic';

const ALLOWED_ROLES = ['director', 'manager', 'team_leader'];

async function requireNudger() {
  const user = await getCurrentTmUser();
  if (!user) return { error: unauthorizedResponse() };
  if (!ALLOWED_ROLES.includes(user.role)) {
    return { error: forbiddenResponse('Chỉ quản lý (Ban GĐ / Trưởng phòng / Nhóm trưởng) mới được gửi email giục quá hạn') };
  }
  return { user };
}

function scopeOf(user: TmUser): NudgeScope {
  return {
    role: user.role,
    userIds: [user.user_id, user.employee_code].filter(Boolean) as string[],
    departmentId: user.department_id,
  };
}

export async function GET() {
  const guard = await requireNudger();
  if ('error' in guard) return guard.error;
  try {
    const result = await runOverdueReminders({ dryRun: true, scope: scopeOf(guard.user) });
    return okResponse(result);
  } catch (err) {
    if ((err as Error).message === 'SMTP_NOT_CONFIGURED') return errorResponse('Chưa cấu hình SMTP cho nhắc lịch', 503);
    console.error('[TM Overdue preview]', err);
    return errorResponse('Lỗi khi tính danh sách quá hạn');
  }
}

export async function POST() {
  const guard = await requireNudger();
  if ('error' in guard) return guard.error;
  try {
    const result = await runOverdueReminders({ scope: scopeOf(guard.user) });
    return okResponse(result);
  } catch (err) {
    if ((err as Error).message === 'SMTP_NOT_CONFIGURED') return errorResponse('Chưa cấu hình SMTP cho nhắc lịch', 503);
    console.error('[TM Overdue send]', err);
    return errorResponse('Lỗi khi gửi email giục quá hạn');
  }
}
