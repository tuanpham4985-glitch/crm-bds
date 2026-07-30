// Cron job: gửi email GIỤC các việc ĐÃ QUÁ HẠN cho từng nhân viên phụ trách.
// Chạy hàng ngày lúc 08:30 giờ Việt Nam (01:30 UTC) — xem vercel.json.
// Logic (gom theo người + chống trùng theo ngày) nằm ở lib dùng chung:
//   src/lib/task-management/overdue-reminder.ts (chia sẻ với nút bấm tay).
import { NextRequest } from 'next/server';
import { runOverdueReminders } from '@/lib/task-management/overdue-reminder';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get('authorization');
    if (auth !== `Bearer ${secret}`) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    const result = await runOverdueReminders();
    console.log(`[CronOverdue] ${result.date}: ${result.sent} gửi, ${result.failed} lỗi, ${result.skipped_no_email} thiếu email, ${result.already_reminded_today} đã nhắc / ${result.overdue_tasks} việc quá hạn`);
    return Response.json({ success: true, ...result });
  } catch (err) {
    if ((err as Error).message === 'SMTP_NOT_CONFIGURED') {
      return Response.json({ success: false, error: 'Chưa cấu hình SMTP cho nhắc lịch' }, { status: 503 });
    }
    console.error('[CronOverdue] Error:', err);
    return Response.json({ success: false, error: String(err) }, { status: 500 });
  }
}
