// Cron job: gửi nhắc lịch email cho task đến hạn ngày mai
// Chạy hàng ngày lúc 8:00 sáng giờ Việt Nam (01:00 UTC)
import { NextRequest } from 'next/server';
import nodemailer from 'nodemailer';
import { loadRows, updateRow } from '@/lib/task-management/sheets/client';
import { SHEET_NAMES } from '@/lib/task-management/types';

export const dynamic = 'force-dynamic';

function getTransporter() {
  return nodemailer.createTransport({
    host:   process.env.SMTP_HOST,
    port:   Number(process.env.SMTP_PORT) || 465,
    secure: (Number(process.env.SMTP_PORT) || 465) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

async function sendReminderEmail(to: string, ownerName: string, taskCode: string, taskTitle: string, dueDate: string): Promise<boolean> {
  try {
    const from = `"${process.env.SMTP_FROM || 'Victory Holdings CRM'}" <${process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER}>`;
    const dueFmt = new Date(dueDate).toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });

    await getTransporter().sendMail({
      from,
      to,
      subject: `⏰ Nhắc lịch: ${taskCode} đến hạn ngày mai`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden">
          <div style="background:#1d4ed8;padding:20px 24px">
            <h2 style="color:#fff;margin:0;font-size:18px">🔔 Nhắc lịch công việc</h2>
          </div>
          <div style="padding:24px">
            <p style="margin:0 0 8px;color:#374151">Xin chào <strong>${ownerName}</strong>,</p>
            <p style="margin:0 0 20px;color:#374151">Công việc sau sẽ đến hạn vào <strong>ngày mai</strong>:</p>
            <div style="background:#f3f4f6;border-radius:8px;padding:16px;margin-bottom:20px">
              <p style="margin:0 0 6px;font-size:13px;color:#6b7280">${taskCode}</p>
              <p style="margin:0 0 10px;font-size:16px;font-weight:700;color:#111827">${taskTitle}</p>
              <p style="margin:0;font-size:13px;color:#dc2626">⏰ Hạn chót: ${dueFmt}</p>
            </div>
            <p style="margin:0;color:#6b7280;font-size:13px">Vui lòng đăng nhập CRM để cập nhật tiến độ hoặc báo cáo kịp thời.</p>
          </div>
          <div style="background:#f9fafb;padding:12px 24px;border-top:1px solid #e5e7eb">
            <p style="margin:0;font-size:12px;color:#9ca3af">Victory Holdings Việt Nam — Hệ thống CRM nội bộ</p>
          </div>
        </div>
      `,
    });
    return true;
  } catch (err) {
    console.error('[CronReminder] sendMail failed:', err);
    return false;
  }
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get('authorization');
    if (auth !== `Bearer ${secret}`) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return Response.json({ success: false, error: 'Chưa cấu hình SMTP' }, { status: 503 });
  }

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().slice(0, 10);

  try {
    const [taskRows, userRows] = await Promise.all([
      loadRows(SHEET_NAMES.TASKS),
      loadRows(SHEET_NAMES.USERS),
    ]);

    // Map user_id → { email, full_name }
    const userMap = new Map<string, { email: string; full_name: string }>();
    for (const u of userRows) {
      if (u.user_id) userMap.set(u.user_id, { email: u.email || '', full_name: u.full_name || '' });
    }

    const pending = taskRows.filter(t =>
      t.due_date === tomorrowStr &&
      t.email_reminder === '1' &&
      t.email_reminder_sent !== '1' &&
      !t.deleted_at &&
      !['completed', 'closed'].includes(t.status),
    );

    let sent = 0;
    let failed = 0;

    for (const task of pending) {
      const owner = userMap.get(task.owner_id);
      if (!owner?.email) {
        console.warn(`[CronReminder] Không có email cho owner ${task.owner_id} (${task.task_code})`);
        failed++;
        continue;
      }

      const ok = await sendReminderEmail(owner.email, owner.full_name, task.task_code, task.title, task.due_date);
      if (ok) {
        await updateRow(SHEET_NAMES.TASKS, 'task_id', task.task_id, {
          email_reminder_sent: '1',
          updated_at: new Date().toISOString(),
        });
        sent++;
      } else {
        failed++;
      }
    }

    console.log(`[CronReminder] ${tomorrowStr}: ${sent} sent, ${failed} failed / ${pending.length} total`);
    return Response.json({ success: true, date: tomorrowStr, sent, failed, total: pending.length });
  } catch (err) {
    console.error('[CronReminder] Error:', err);
    return Response.json({ success: false, error: String(err) }, { status: 500 });
  }
}
