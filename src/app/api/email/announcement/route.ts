/**
 * POST /api/email/announcement
 * Gửi thông báo nội bộ đến toàn thể nhân viên (hoặc danh sách id chỉ định).
 *
 * Body (multipart/form-data):
 *   subject      — Tiêu đề email
 *   body         — Nội dung (plain text hoặc HTML)
 *   recipientIds — JSON array id_nhan_vien, bỏ trống = gửi tất cả nhân viên đang làm
 *   files        — (tuỳ chọn) File đính kèm (image/*, .pdf)
 */

import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { getNhanVien } from '@/lib/google-sheets';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();

    const subject = (formData.get('subject') as string | null)?.trim();
    const body    = (formData.get('body')    as string | null)?.trim();
    const recipientIdsRaw = formData.get('recipientIds') as string | null;

    if (!subject || !body) {
      return NextResponse.json(
        { success: false, error: 'Thiếu tiêu đề hoặc nội dung email' },
        { status: 400 }
      );
    }

    // SMTP config
    const smtpHost = process.env.SMTP_HOST;
    const smtpPort = Number(process.env.SMTP_PORT) || 465;
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    const smtpFrom = process.env.SMTP_FROM || 'Victory Holdings HR';

    if (!smtpHost || !smtpUser || !smtpPass) {
      return NextResponse.json(
        { success: false, error: 'Chưa cấu hình SMTP. Vui lòng liên hệ Admin.' },
        { status: 503 }
      );
    }

    // Get employee list
    const allEmployees = await getNhanVien();
    const selectedIds: string[] | null = recipientIdsRaw ? JSON.parse(recipientIdsRaw) : null;

    const recipients = allEmployees
      .filter(nv => {
        if (nv.trang_thai === 'Nghỉ việc') return false;
        if (!nv.email?.trim()) return false;
        if (selectedIds && !selectedIds.includes(nv.id_nhan_vien)) return false;
        return true;
      })
      .map(nv => ({ email: nv.email.trim(), ho_ten: nv.ho_ten }));

    if (recipients.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Không có nhân viên nào có email để gửi' },
        { status: 400 }
      );
    }

    // Build attachments from uploaded files
    const attachments: { filename: string; content: Buffer; contentType: string }[] = [];
    for (const entry of formData.getAll('files')) {
      if (entry instanceof File && entry.size > 0) {
        attachments.push({
          filename: entry.name,
          content: Buffer.from(await entry.arrayBuffer()),
          contentType: entry.type || 'application/octet-stream',
        });
      }
    }

    // Detect HTML content, else convert newlines
    const isHtml = /<[a-z][\s\S]*>/i.test(body);
    const htmlContent = isHtml ? body : body.replace(/\n/g, '<br>');

    const makeHtml = (hoTen: string) => `<!DOCTYPE html>
<html lang="vi">
<head><meta charset="UTF-8"><style>
  body{font-family:Arial,sans-serif;color:#1f2937;margin:0;padding:0;background:#f9fafb}
  .wrap{max-width:600px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)}
  .header{background:#1e3a5f;color:#fff;padding:24px 32px}
  .header h1{margin:0 0 4px;font-size:20px}
  .header p{margin:0;font-size:13px;opacity:.8}
  .body{padding:28px 32px;font-size:15px;line-height:1.75;color:#374151}
  .footer{background:#f9fafb;padding:16px 32px;font-size:12px;color:#9ca3af;text-align:center;border-top:1px solid #e5e7eb}
</style></head>
<body>
<div class="wrap">
  <div class="header">
    <h1>VICTORY HOLDINGS</h1>
    <p>Thông báo nội bộ</p>
  </div>
  <div class="body">
    <p>Kính gửi <strong>${hoTen}</strong>,</p>
    ${htmlContent}
  </div>
  <div class="footer">© ${new Date().getFullYear()} Victory Holdings · victoryholdings.com.vn</div>
</div>
</body></html>`;

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: { user: smtpUser, pass: smtpPass },
    });

    let sent = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const { email, ho_ten } of recipients) {
      try {
        await transporter.sendMail({
          from: `"${smtpFrom}" <${smtpUser}>`,
          to: email,
          subject,
          html: makeHtml(ho_ten),
          attachments,
        });
        sent++;
      } catch (err: any) {
        failed++;
        errors.push(`${ho_ten} <${email}>: ${err?.message || 'Lỗi không xác định'}`);
      }
    }

    return NextResponse.json({ success: true, total: recipients.length, sent, failed, errors });

  } catch (error: any) {
    console.error('[API email/announcement]', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Lỗi server' },
      { status: 500 }
    );
  }
}
