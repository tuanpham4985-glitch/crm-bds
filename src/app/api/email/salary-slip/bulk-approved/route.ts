/**
 * POST /api/email/salary-slip/bulk-approved
 *
 * Gửi phiếu lương hàng loạt từ bảng lương ĐÃ DUYỆT (status = approved).
 * Client enrich dữ liệu BangLuong với thông tin NV (email, tên, chức vụ) trước khi gửi.
 *
 * Body: {
 *   thang: number,
 *   nam:   number,
 *   records: ApprovedRecord[]
 * }
 *
 * ApprovedRecord = BangLuong fields + { email, ho_ten, chuc_vu?, phong_ban? }
 */

import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

export interface ApprovedRecord {
  id_nhan_vien: string;
  ho_ten: string;
  email: string;
  chuc_vu?: string;
  phong_ban?: string;
  // Income
  salary_by_day: number;
  hoa_hong: number;
  thuong: number;
  ot_pay: number;
  phat: number;
  gross?: number;
  // Deductions
  bao_hiem: number;
  thue: number;
  tong_luong: number;       // net = thực nhận
  luong_dong_bh?: number;
  thu_nhap_chiu_thue?: number;
  so_nguoi_phu_thuoc?: number;
  // Status info
  trang_thai: string;
}

// ── Format tiền ──────────────────────────────────────────────────────────────
const fmtM = (n?: number) => (n != null && n !== 0)
  ? Math.round(n).toLocaleString('vi-VN') + '&nbsp;₫'
  : '—';

// ── Helpers HTML ─────────────────────────────────────────────────────────────
const tr     = (l: string, v: string, cls = '') =>
  `<tr${cls ? ` class="${cls}"` : ''}><td>${l}</td><td class="amt">${v}</td></tr>`;
const trRed  = (l: string, v: string) => tr(l, v, 'red');
const trBlue = (l: string, v: string) => tr(l, v, 'blue');
const trGray = (l: string, v: string) => tr(l, v, 'gray');

// ── Build email HTML từ BangLuong record ─────────────────────────────────────
function buildHtml(rec: ApprovedRecord, thang: number, nam: number): string {
  const gross = rec.gross ?? (rec.salary_by_day + rec.hoa_hong + rec.thuong + rec.ot_pay - rec.phat);
  const totalDeduct = rec.bao_hiem + rec.thue;

  // Income rows
  const incRows: string[] = [];
  if (rec.salary_by_day) incRows.push(tr('Lương theo ngày công',       fmtM(rec.salary_by_day)));
  if (rec.hoa_hong)      incRows.push(tr('Hoa hồng BĐS',               fmtM(rec.hoa_hong)));
  if (rec.thuong)        incRows.push(tr('Thưởng',                     fmtM(rec.thuong)));
  if (rec.ot_pay)        incRows.push(tr('Lương làm thêm giờ (OT)',    fmtM(rec.ot_pay)));
  if (rec.phat)          incRows.push(trRed('Phạt',                    fmtM(rec.phat)));

  // Deduction rows
  const dedRows: string[] = [];
  if (rec.luong_dong_bh)       dedRows.push(trGray('Lương đóng BHXH (cơ sở)',   fmtM(rec.luong_dong_bh)));
  if (rec.bao_hiem)            dedRows.push(trRed('BHXH NLĐ đóng (10.5%)',       fmtM(rec.bao_hiem)));
  const nptLabel = rec.so_nguoi_phu_thuoc
    ? `Giảm trừ NPT (${rec.so_nguoi_phu_thuoc} người)` : null;
  if (rec.thu_nhap_chiu_thue)  dedRows.push(trGray('Thu nhập tính thuế',         fmtM(rec.thu_nhap_chiu_thue)));
  if (rec.thue)                dedRows.push(trRed('Thuế TNCN',                   fmtM(rec.thue)));

  return `<!DOCTYPE html><html lang="vi">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
body{margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif;color:#1f2937}
.wrap{max-width:580px;margin:20px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.1)}
.hdr{background:linear-gradient(135deg,#1e3a5f,#2d5a8e);padding:20px 26px;color:#fff}
.hdr h1{margin:0 0 3px;font-size:18px;letter-spacing:.02em}
.hdr p{margin:0;font-size:12px;opacity:.8}
.approved-badge{display:inline-block;background:rgba(255,255,255,.15);border:1px solid rgba(255,255,255,.3);border-radius:20px;padding:2px 10px;font-size:11px;margin-top:6px}
.body{padding:20px 26px}
.greeting{font-size:14px;margin-bottom:14px;color:#374151}
.info-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:12px 14px;margin-bottom:16px;font-size:13px}
.info-item{display:flex;flex-direction:column;gap:2px}
.info-lbl{color:#9ca3af;font-size:11px;text-transform:uppercase;letter-spacing:.04em}
.sec-title{font-size:11px;font-weight:700;color:#fff;padding:5px 10px;border-radius:4px;margin:14px 0 6px;text-transform:uppercase;letter-spacing:.04em;display:inline-block}
.sec-inc{background:#374151}
.sec-ded{background:#374151}
table{width:100%;border-collapse:collapse;font-size:13px}
td{padding:7px 6px;border-bottom:1px solid #f3f4f6}
td.amt{text-align:right;font-weight:600;white-space:nowrap;color:#374151}
tr.red td.amt{color:#dc2626}
tr.blue td.amt{color:#2563eb}
tr.gray td{color:#9ca3af!important}
.tr-total td{background:#d1fae5;color:#065f46!important;font-weight:700!important;font-size:14px;padding:9px 6px;border:none}
.tr-deduct td{background:#fee2e2;color:#991b1b!important;font-weight:700!important;font-size:14px;padding:9px 6px;border:none}
.thuc-linh{background:#064e3b;border-radius:8px;text-align:center;padding:16px 20px;margin-top:18px}
.thuc-linh .lbl{color:rgba(255,255,255,.7);font-size:11px;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px}
.thuc-linh .amt2{color:#fff;font-size:26px;font-weight:800;letter-spacing:-.01em}
.note{font-size:12px;color:#6b7280;background:#f9fafb;padding:10px 14px;border-radius:6px;margin-top:14px;line-height:1.6}
.footer{background:#f3f4f6;padding:12px 26px;font-size:11px;color:#9ca3af;text-align:center;border-top:1px solid #e5e7eb}
</style></head>
<body><div class="wrap">
  <div class="hdr">
    <h1>VICTORY HOLDINGS</h1>
    <p>Phiếu lương tháng ${thang}/${nam}</p>
    <div class="approved-badge">✓ Đã được duyệt</div>
  </div>
  <div class="body">
    <p class="greeting">Kính gửi <strong>${rec.ho_ten}</strong>,</p>
    <div class="info-grid">
      <div class="info-item"><div class="info-lbl">Mã nhân viên</div><strong>${rec.id_nhan_vien}</strong></div>
      <div class="info-item"><div class="info-lbl">Kỳ lương</div><strong>Tháng ${thang}/${nam}</strong></div>
      <div class="info-item"><div class="info-lbl">Chức vụ</div><strong>${rec.chuc_vu || '—'}</strong></div>
      <div class="info-item"><div class="info-lbl">Phòng ban</div><strong>${rec.phong_ban || '—'}</strong></div>
    </div>

    ${incRows.length > 0 ? `
    <div class="sec-title sec-inc">📥 Thu nhập</div>
    <table>
      ${incRows.join('')}
      <tr class="tr-total"><td>TỔNG THU NHẬP (GROSS)</td><td class="amt">${fmtM(gross)}</td></tr>
    </table>` : ''}

    ${dedRows.length > 0 ? `
    <div class="sec-title sec-ded">📤 Khấu trừ</div>
    <table>
      ${dedRows.join('')}
      ${nptLabel ? trBlue(nptLabel, '') : ''}
      <tr class="tr-deduct"><td>TỔNG KHẤU TRỪ</td><td class="amt">${fmtM(totalDeduct)}</td></tr>
    </table>` : ''}

    <div class="thuc-linh">
      <div class="lbl">Lương thực nhận (NET) — Tháng ${thang}/${nam}</div>
      <div class="amt2">${Math.round(rec.tong_luong).toLocaleString('vi-VN')}&nbsp;₫</div>
    </div>

    <p class="note">
      Bảng lương tháng ${thang}/${nam} đã được <strong>phê duyệt chính thức</strong>.<br>
      Lương sẽ được chuyển khoản theo thông tin ngân hàng đã đăng ký.<br>
      Mọi thắc mắc vui lòng liên hệ phòng Nhân sự trong vòng <strong>3 ngày làm việc</strong>.
    </p>
  </div>
  <div class="footer">&copy; ${new Date().getFullYear()} Victory Holdings &middot; victoryholdings.com.vn</div>
</div></body></html>`;
}

// ── Main handler ──────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { thang, nam, records } = body as {
      thang: number;
      nam: number;
      records: ApprovedRecord[];
    };

    if (!thang || !nam || !Array.isArray(records) || records.length === 0) {
      return NextResponse.json({ success: false, error: 'Thiếu dữ liệu' }, { status: 400 });
    }

    const smtpHost = process.env.SMTP_HOST;
    const smtpPort = Number(process.env.SMTP_PORT) || 465;
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    const smtpFrom = process.env.SMTP_FROM || 'Victory Holdings HR';

    if (!smtpHost || !smtpUser || !smtpPass) {
      return NextResponse.json(
        { success: false, error: 'Chưa cấu hình SMTP (SMTP_HOST, SMTP_USER, SMTP_PASS). Liên hệ Admin.' },
        { status: 503 }
      );
    }

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: { user: smtpUser, pass: smtpPass },
    });

    const result = { sent: 0, skipped: 0, failed: 0, errors: [] as string[] };

    for (const rec of records) {
      if (!rec.email?.trim()) {
        result.skipped++;
        continue;
      }
      try {
        await transporter.sendMail({
          from: `"${smtpFrom}" <${smtpUser}>`,
          to: rec.email.trim(),
          subject: `[Đã duyệt] Phiếu lương tháng ${thang}/${nam} — ${rec.ho_ten}`,
          html: buildHtml(rec, thang, nam),
        });
        result.sent++;
      } catch (e: any) {
        result.failed++;
        result.errors.push(`${rec.ho_ten} <${rec.email}>: ${e?.message ?? String(e)}`);
      }
    }

    return NextResponse.json({
      success: true,
      ...result,
      message: `Đã gửi ${result.sent} email. Bỏ qua ${result.skipped} (thiếu email). Lỗi: ${result.failed}.`,
    });

  } catch (error: any) {
    console.error('[API email/salary-slip/bulk-approved]', error);
    return NextResponse.json({ success: false, error: error?.message || 'Lỗi server' }, { status: 500 });
  }
}
