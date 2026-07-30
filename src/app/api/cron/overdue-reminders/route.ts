// Cron job: gửi email GIỤC các việc ĐÃ QUÁ HẠN cho từng nhân viên phụ trách.
// Gom mọi việc quá hạn (chưa hoàn thành) theo owner → 1 email tổng hợp/người.
// Gửi lại mỗi ngày cho tới khi việc được hoàn thành (nhắc liên tục).
// Chạy hàng ngày lúc 08:30 giờ Việt Nam (01:30 UTC) — xem vercel.json.
import { NextRequest } from 'next/server';
import nodemailer from 'nodemailer';
import { loadRows } from '@/lib/task-management/sheets/client';
import { SHEET_NAMES } from '@/lib/task-management/types';

export const dynamic = 'force-dynamic';

function getTransporter() {
  const host = process.env.REMINDER_SMTP_HOST || process.env.SMTP_HOST;
  const port = Number(process.env.REMINDER_SMTP_PORT || process.env.SMTP_PORT) || 465;
  const user = process.env.REMINDER_SMTP_USER || process.env.SMTP_USER;
  const pass = process.env.REMINDER_SMTP_PASS || process.env.SMTP_PASS;
  return nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } });
}

interface OverdueItem { task_code: string; title: string; due_date: string; days: number; }

function daysOverdue(due: string, todayStr: string): number {
  const toUTC = (s: string) => {
    const [y, m, d] = s.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.max(0, Math.round((toUTC(todayStr) - toUTC(due)) / 86400000));
}

async function sendOverdueEmail(to: string, ownerName: string, items: OverdueItem[]): Promise<boolean> {
  try {
    const fromName  = process.env.REMINDER_SMTP_FROM  || process.env.SMTP_FROM  || 'Victory Holdings CRM';
    const fromEmail = process.env.REMINDER_SMTP_USER  || process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER;
    const from = `"${fromName}" <${fromEmail}>`;

    const rows = items.map(it => {
      const dueFmt = new Date(it.due_date).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
      return `
        <tr>
          <td style="padding:10px 12px;border-bottom:1px solid #eee;font-size:13px;color:#6b7280">${it.task_code}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #eee;font-size:14px;color:#111827;font-weight:600">${it.title}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #eee;font-size:13px;color:#374151;white-space:nowrap">${dueFmt}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #eee;font-size:13px;color:#dc2626;font-weight:700;white-space:nowrap;text-align:center">${it.days} ngày</td>
        </tr>`;
    }).join('');

    await getTransporter().sendMail({
      from,
      to,
      subject: `🚨 Bạn có ${items.length} công việc ĐÃ QUÁ HẠN cần xử lý`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden">
          <div style="background:#dc2626;padding:20px 24px">
            <h2 style="color:#fff;margin:0;font-size:18px">🚨 Nhắc việc quá hạn</h2>
          </div>
          <div style="padding:24px">
            <p style="margin:0 0 8px;color:#374151">Xin chào <strong>${ownerName}</strong>,</p>
            <p style="margin:0 0 18px;color:#374151">Bạn đang có <strong style="color:#dc2626">${items.length} công việc quá hạn</strong> chưa hoàn thành. Vui lòng xử lý hoặc cập nhật tiến độ sớm:</p>
            <table style="width:100%;border-collapse:collapse;border:1px solid #eee;border-radius:8px;overflow:hidden">
              <thead>
                <tr style="background:#f9fafb">
                  <th style="padding:10px 12px;text-align:left;font-size:12px;color:#6b7280">Mã việc</th>
                  <th style="padding:10px 12px;text-align:left;font-size:12px;color:#6b7280">Tên công việc</th>
                  <th style="padding:10px 12px;text-align:left;font-size:12px;color:#6b7280">Hạn chót</th>
                  <th style="padding:10px 12px;text-align:center;font-size:12px;color:#6b7280">Quá hạn</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
            <p style="margin:18px 0 0;color:#6b7280;font-size:13px">Vui lòng đăng nhập CRM để cập nhật tiến độ hoặc trình duyệt.</p>
          </div>
          <div style="background:#f9fafb;padding:12px 24px;border-top:1px solid #e5e7eb">
            <p style="margin:0;font-size:12px;color:#9ca3af">Victory Holdings Việt Nam — Hệ thống CRM nội bộ</p>
          </div>
        </div>
      `,
    });
    return true;
  } catch (err) {
    console.error('[CronOverdue] sendMail failed:', err);
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

  const smtpUser = process.env.REMINDER_SMTP_USER || process.env.SMTP_USER;
  const smtpPass = process.env.REMINDER_SMTP_PASS || process.env.SMTP_PASS;
  const smtpHost = process.env.REMINDER_SMTP_HOST || process.env.SMTP_HOST;
  if (!smtpHost || !smtpUser || !smtpPass) {
    return Response.json({ success: false, error: 'Chưa cấu hình SMTP cho nhắc lịch' }, { status: 503 });
  }

  const todayStr = new Date().toISOString().slice(0, 10);

  try {
    const [taskRows, userRows] = await Promise.all([
      loadRows(SHEET_NAMES.TASKS),
      loadRows(SHEET_NAMES.USERS),
    ]);

    const userMap = new Map<string, { email: string; full_name: string }>();
    for (const u of userRows) {
      if (u.user_id) userMap.set(u.user_id, { email: u.email || '', full_name: u.full_name || '' });
    }

    // Việc quá hạn: có hạn, hạn < hôm nay, chưa xong, chưa xóa
    const overdue = taskRows.filter(t =>
      t.due_date &&
      t.due_date < todayStr &&
      !t.deleted_at &&
      !['completed', 'closed'].includes(t.status),
    );

    // Gom theo owner
    const byOwner = new Map<string, OverdueItem[]>();
    for (const t of overdue) {
      if (!t.owner_id) continue;
      if (!byOwner.has(t.owner_id)) byOwner.set(t.owner_id, []);
      byOwner.get(t.owner_id)!.push({
        task_code: t.task_code, title: t.title, due_date: t.due_date,
        days: daysOverdue(t.due_date, todayStr),
      });
    }

    let sent = 0, failed = 0, skippedNoEmail = 0;
    for (const [ownerId, items] of byOwner) {
      const owner = userMap.get(ownerId);
      if (!owner?.email) {
        console.warn(`[CronOverdue] Không có email cho owner ${ownerId} (${items.length} việc quá hạn)`);
        skippedNoEmail++;
        continue;
      }
      items.sort((a, b) => b.days - a.days); // quá hạn lâu nhất lên đầu
      const ok = await sendOverdueEmail(owner.email, owner.full_name, items);
      ok ? sent++ : failed++;
    }

    console.log(`[CronOverdue] ${todayStr}: ${sent} người nhận, ${failed} lỗi, ${skippedNoEmail} thiếu email / ${overdue.length} việc quá hạn`);
    return Response.json({
      success: true, date: todayStr,
      overdue_tasks: overdue.length, recipients: byOwner.size,
      sent, failed, skipped_no_email: skippedNoEmail,
    });
  } catch (err) {
    console.error('[CronOverdue] Error:', err);
    return Response.json({ success: false, error: String(err) }, { status: 500 });
  }
}
