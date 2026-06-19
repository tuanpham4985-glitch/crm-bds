// Cron job: gửi nhắc lịch Zalo cho task đến hạn ngày mai
// Chạy hàng ngày lúc 8:00 sáng giờ Việt Nam (01:00 UTC)
// Vercel Cron xác thực qua CRON_SECRET header
import { NextRequest } from 'next/server';
import { loadRows, updateRow } from '@/lib/task-management/sheets/client';
import { SHEET_NAMES } from '@/lib/task-management/types';
import { sendZaloMessage } from '@/lib/zalo';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get('authorization');
    if (auth !== `Bearer ${secret}`) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().slice(0, 10); // YYYY-MM-DD

  try {
    const [taskRows, userRows] = await Promise.all([
      loadRows(SHEET_NAMES.TASKS),
      loadRows(SHEET_NAMES.USERS),
    ]);

    // Map user_id → zalo_id
    const zaloIdMap = new Map<string, string>();
    for (const u of userRows) {
      if (u.user_id && u.zalo_id) zaloIdMap.set(u.user_id, u.zalo_id);
    }

    // Tasks due tomorrow with Zalo reminder enabled and not yet sent
    const pending = taskRows.filter(t =>
      t.due_date === tomorrowStr &&
      t.zalo_reminder === '1' &&
      t.zalo_reminder_sent !== '1' &&
      !t.deleted_at &&
      !['completed', 'closed'].includes(t.status),
    );

    let sent = 0;
    let failed = 0;

    for (const task of pending) {
      const zaloId = zaloIdMap.get(task.owner_id);
      if (!zaloId) {
        console.warn(`[CronReminder] Không có zalo_id cho owner ${task.owner_id} (task ${task.task_code})`);
        failed++;
        continue;
      }

      const msg =
        `🔔 Nhắc lịch công việc\n` +
        `📌 ${task.task_code}: ${task.title}\n` +
        `⏰ Hạn chót: ${task.due_date}\n` +
        `Vui lòng hoàn thành đúng hạn. Truy cập CRM để cập nhật tiến độ.`;

      const ok = await sendZaloMessage(zaloId, msg);
      if (ok) {
        await updateRow(SHEET_NAMES.TASKS, 'task_id', task.task_id, {
          zalo_reminder_sent: '1',
          updated_at: new Date().toISOString(),
        });
        sent++;
      } else {
        failed++;
      }
    }

    console.log(`[CronReminder] ${tomorrowStr}: ${sent} sent, ${failed} failed, ${pending.length - sent - failed} skipped`);
    return Response.json({ success: true, date: tomorrowStr, sent, failed, total: pending.length });
  } catch (err) {
    console.error('[CronReminder] Error:', err);
    return Response.json({ success: false, error: String(err) }, { status: 500 });
  }
}
