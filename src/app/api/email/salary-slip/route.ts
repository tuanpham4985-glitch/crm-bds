/**
 * POST /api/email/salary-slip
 * Gửi phiếu lương qua email cho nhân viên.
 *
 * Cần cấu hình env vars (Vercel / .env.local):
 *   SMTP_HOST     — e.g. smtp.gmail.com
 *   SMTP_PORT     — e.g. 465
 *   SMTP_USER     — địa chỉ email gửi
 *   SMTP_PASS     — mật khẩu ứng dụng (App Password)
 *   SMTP_FROM     — tên hiển thị, e.g. "Victory Holdings HR"
 */

import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

function fmt(n: number) {
  return Math.round(n).toLocaleString('vi-VN') + ' ₫';
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { ho_ten, id_nhan_vien, thuc_linh, loai, thang, nam, email_to } = body;

    if (!email_to || !ho_ten || !thuc_linh) {
      return NextResponse.json({ success: false, error: 'Thiếu thông tin bắt buộc' }, { status: 400 });
    }

    const smtpHost = process.env.SMTP_HOST;
    const smtpPort = Number(process.env.SMTP_PORT) || 465;
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    const smtpFrom = process.env.SMTP_FROM || 'Victory Holdings HR';

    if (!smtpHost || !smtpUser || !smtpPass) {
      return NextResponse.json(
        { success: false, error: 'Chưa cấu hình SMTP (SMTP_HOST, SMTP_USER, SMTP_PASS). Vui lòng liên hệ Admin.' },
        { status: 503 }
      );
    }

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: { user: smtpUser, pass: smtpPass },
    });

    const boPhans = loai === 'KD' ? 'Kinh doanh' : 'Back Office';
    const subject = `Phiếu lương tháng ${thang}/${nam} — ${ho_ten}`;

    const html = `
<!DOCTYPE html>
<html lang="vi">
<head><meta charset="UTF-8"><style>
  body { font-family: Arial, sans-serif; color: #1f2937; margin: 0; padding: 0; background: #f9fafb; }
  .wrap { max-width: 560px; margin: 32px auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 12px rgba(0,0,0,.08); }
  .header { background: #1e3a5f; color: #fff; padding: 24px 32px; }
  .header h1 { margin: 0 0 4px; font-size: 20px; }
  .header p { margin: 0; font-size: 13px; opacity: .8; }
  .body { padding: 28px 32px; }
  .greeting { font-size: 15px; margin-bottom: 20px; }
  .row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #f3f4f6; font-size: 14px; }
  .row:last-child { border: none; }
  .label { color: #6b7280; }
  .amount { font-size: 28px; font-weight: 800; color: #059669; text-align: center; padding: 20px 0 8px; }
  .amount-label { text-align: center; color: #6b7280; font-size: 12px; text-transform: uppercase; letter-spacing: .05em; margin-bottom: 20px; }
  .footer { background: #f9fafb; padding: 16px 32px; font-size: 12px; color: #9ca3af; text-align: center; }
</style></head>
<body>
<div class="wrap">
  <div class="header">
    <h1>VICTORY HOLDINGS</h1>
    <p>Thông báo lương tháng ${thang}/${nam}</p>
  </div>
  <div class="body">
    <p class="greeting">Kính gửi <strong>${ho_ten}</strong>,</p>
    <p style="font-size:14px;color:#6b7280;margin:0 0 20px">Dưới đây là thông tin lương tháng <strong>${thang}/${nam}</strong> của bạn:</p>
    <div class="row"><span class="label">Mã nhân viên</span><span>${id_nhan_vien}</span></div>
    <div class="row"><span class="label">Bộ phận</span><span>${boPhans}</span></div>
    <div class="row"><span class="label">Kỳ lương</span><span>Tháng ${thang}/${nam}</span></div>
    <div class="amount">${fmt(thuc_linh)}</div>
    <div class="amount-label">Thực lĩnh</div>
    <p style="font-size:13px;color:#6b7280;background:#f9fafb;padding:12px 16px;border-radius:8px;margin:0">
      Mọi thắc mắc về bảng lương vui lòng liên hệ phòng Nhân sự trong vòng <strong>3 ngày làm việc</strong>.
    </p>
  </div>
  <div class="footer">© ${new Date().getFullYear()} Victory Holdings · victoryholdings.com.vn</div>
</div>
</body></html>`;

    await transporter.sendMail({
      from: `"${smtpFrom}" <${smtpUser}>`,
      to: email_to,
      subject,
      html,
    });

    return NextResponse.json({ success: true, message: `Đã gửi tới ${email_to}` });

  } catch (error: any) {
    console.error('[API email/salary-slip]', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Lỗi gửi email' },
      { status: 500 }
    );
  }
}
