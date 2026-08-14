/**
 * POST /api/email/announcement
 * Gửi thông báo nội bộ đến toàn thể nhân viên hoặc 1 email thử.
 *
 * Body (multipart/form-data):
 *   subject      — Tiêu đề email
 *   body         — Nội dung (plain text hoặc HTML)
 *   testEmail    — Nếu có: chỉ gửi đến email này (chế độ thử)
 *   recipientIds — JSON array id_nhan_vien, bỏ trống = gửi tất cả nhân viên đang làm
 *   ccIds        — (tuỳ chọn) JSON array id_nhan_vien để Cc (thêm vào từng email)
 *   bccIds       — (tuỳ chọn) JSON array id_nhan_vien để Bcc (thêm vào từng email)
 *   files        — (tuỳ chọn) File đính kèm (image/*, .pdf)
 */

import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { getNhanVien } from '@/lib/data-access';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();

    const subject   = (formData.get('subject')   as string | null)?.trim();
    const body      = (formData.get('body')       as string | null)?.trim();
    const testEmail = (formData.get('testEmail')  as string | null)?.trim();
    const recipientIdsRaw = formData.get('recipientIds') as string | null;
    const ccIdsRaw  = formData.get('ccIds')  as string | null;
    const bccIdsRaw = formData.get('bccIds') as string | null;

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
    const smtpFromEmail = process.env.SMTP_FROM_EMAIL || smtpUser;

    if (!smtpHost || !smtpUser || !smtpPass) {
      return NextResponse.json(
        { success: false, error: 'Chưa cấu hình SMTP. Vui lòng liên hệ Admin.' },
        { status: 503 }
      );
    }

    // Chế độ gửi thử: chỉ gửi đến testEmail, không cần lấy danh sách nhân viên
    let recipients: { email: string; ho_ten: string }[];
    let ccEmails: string[] = [];
    let bccEmails: string[] = [];
    if (testEmail) {
      recipients = [{ email: testEmail, ho_ten: 'Test' }];
    } else {
      const allEmployees = await getNhanVien();
      const selectedIds: string[] | null = recipientIdsRaw ? JSON.parse(recipientIdsRaw) : null;
      recipients = allEmployees
        .filter(nv => {
          if (nv.trang_thai === 'Nghỉ việc') return false;
          if (!nv.email?.trim()) return false;
          if (selectedIds && !selectedIds.includes(nv.id_nhan_vien)) return false;
          return true;
        })
        .map(nv => ({ email: nv.email.trim(), ho_ten: nv.ho_ten }));

      // Cc/Bcc: giải id nhân viên → email (chỉ lấy người có email)
      const idsToEmails = (raw: string | null): string[] => {
        if (!raw) return [];
        const ids: string[] = JSON.parse(raw);
        return allEmployees
          .filter(nv => ids.includes(nv.id_nhan_vien) && nv.email?.trim())
          .map(nv => nv.email.trim());
      };
      ccEmails  = idsToEmails(ccIdsRaw);
      bccEmails = idsToEmails(bccIdsRaw);
    }

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
    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    for (const { email, ho_ten } of recipients) {
      try {
        // Bỏ trùng: không Cc/Bcc chính người đang nhận ở dòng To
        const cc  = ccEmails.filter(e => e.toLowerCase() !== email.toLowerCase());
        const bcc = bccEmails.filter(e => e.toLowerCase() !== email.toLowerCase());
        await transporter.sendMail({
          from: `"${smtpFrom}" <${smtpFromEmail}>`,
          to: email,
          ...(cc.length ? { cc } : {}),
          ...(bcc.length ? { bcc } : {}),
          subject,
          html: makeHtml(ho_ten),
          attachments,
        });
        sent++;
      } catch (err: any) {
        failed++;
        errors.push(`${ho_ten} <${email}>: ${err?.message || 'Lỗi không xác định'}`);
      }
      // Giới hạn 2 email/giây — chờ 600ms giữa mỗi lần gửi
      await sleep(600);
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
