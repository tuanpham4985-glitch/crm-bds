// Test endpoint: gửi email nhắc lịch mẫu để kiểm tra cấu hình SMTP
// GET /api/cron/task-reminders/test?to=email@example.com
import { NextRequest } from 'next/server';
import nodemailer from 'nodemailer';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const to = new URL(req.url).searchParams.get('to');
  if (!to) return Response.json({ error: 'Thiếu tham số ?to=email' }, { status: 400 });

  const host = process.env.REMINDER_SMTP_HOST || process.env.SMTP_HOST;
  const port = Number(process.env.REMINDER_SMTP_PORT || process.env.SMTP_PORT) || 465;
  const user = process.env.REMINDER_SMTP_USER || process.env.SMTP_USER;
  const pass = process.env.REMINDER_SMTP_PASS || process.env.SMTP_PASS;
  const fromName  = process.env.REMINDER_SMTP_FROM || process.env.SMTP_FROM || 'Victory Holdings CRM';
  const fromEmail = process.env.REMINDER_SMTP_USER || process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER;

  if (!host || !user || !pass) {
    return Response.json({ error: 'Chưa cấu hình SMTP' }, { status: 503 });
  }

  try {
    const transporter = nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } });

    await transporter.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to,
      subject: '⏰ [TEST] Nhắc lịch công việc — Victory Holdings CRM',
      html: `
        <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden">
          <div style="background:#1d4ed8;padding:20px 24px">
            <h2 style="color:#fff;margin:0;font-size:18px">🔔 Nhắc lịch công việc</h2>
          </div>
          <div style="padding:24px">
            <p style="margin:0 0 8px;color:#374151">Xin chào <strong>Nguyễn Văn A</strong>,</p>
            <p style="margin:0 0 20px;color:#374151">Công việc sau sẽ đến hạn vào <strong>ngày mai</strong>:</p>
            <div style="background:#f3f4f6;border-radius:8px;padding:16px;margin-bottom:20px">
              <p style="margin:0 0 6px;font-size:13px;color:#6b7280">T-2026-0001</p>
              <p style="margin:0 0 10px;font-size:16px;font-weight:700;color:#111827">Gọi điện tư vấn 5 khách hàng tiềm năng</p>
              <p style="margin:0;font-size:13px;color:#dc2626">⏰ Hạn chót: Thứ Sáu, 20/06/2026</p>
            </div>
            <p style="margin:0;color:#6b7280;font-size:13px">Vui lòng đăng nhập CRM để cập nhật tiến độ hoặc báo cáo kịp thời.</p>
          </div>
          <div style="background:#f9fafb;padding:12px 24px;border-top:1px solid #e5e7eb">
            <p style="margin:0;font-size:12px;color:#9ca3af">Victory Holdings Việt Nam — Hệ thống CRM nội bộ · <em>Đây là email test</em></p>
          </div>
        </div>
      `,
    });

    return Response.json({ success: true, message: `Đã gửi email test đến ${to}` });
  } catch (err) {
    console.error('[TestReminder]', err);
    return Response.json({ success: false, error: String(err) }, { status: 500 });
  }
}
