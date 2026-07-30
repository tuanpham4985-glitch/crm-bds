// API bấm tay: "Gửi mail giục quá hạn" — chỉ Ban Giám đốc / Admin (role=director).
//   GET  → xem trước (dry run): trả về số việc/số người, KHÔNG gửi.
//   POST → thực sự gửi email (vẫn chống trùng theo ngày như cron).
import { getCurrentTmUser, unauthorizedResponse, forbiddenResponse, errorResponse, okResponse } from '@/lib/task-management/auth';
import { runOverdueReminders } from '@/lib/task-management/overdue-reminder';

export const dynamic = 'force-dynamic';

async function requireDirector() {
  const user = await getCurrentTmUser();
  if (!user) return { error: unauthorizedResponse() };
  if (user.role !== 'director') {
    return { error: forbiddenResponse('Chỉ Ban Giám đốc / Admin mới được gửi email giục quá hạn') };
  }
  return { user };
}

export async function GET() {
  const guard = await requireDirector();
  if ('error' in guard) return guard.error;
  try {
    const result = await runOverdueReminders({ dryRun: true });
    return okResponse(result);
  } catch (err) {
    if ((err as Error).message === 'SMTP_NOT_CONFIGURED') return errorResponse('Chưa cấu hình SMTP cho nhắc lịch', 503);
    console.error('[TM Overdue preview]', err);
    return errorResponse('Lỗi khi tính danh sách quá hạn');
  }
}

export async function POST() {
  const guard = await requireDirector();
  if ('error' in guard) return guard.error;
  try {
    const result = await runOverdueReminders();
    return okResponse(result);
  } catch (err) {
    if ((err as Error).message === 'SMTP_NOT_CONFIGURED') return errorResponse('Chưa cấu hình SMTP cho nhắc lịch', 503);
    console.error('[TM Overdue send]', err);
    return errorResponse('Lỗi khi gửi email giục quá hạn');
  }
}
