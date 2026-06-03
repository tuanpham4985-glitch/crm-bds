/**
 * POST /api/email/salary-slip/bulk
 *
 * Gửi phiếu lương hàng loạt cho danh sách nhân viên.
 *
 * Body: {
 *   thang: number,
 *   nam:   number,
 *   rows:  (SalaryImportRow & { email?: string })[]
 * }
 *
 * Returns: { success, sent, skipped, failed, errors[] }
 */

import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import type { SalaryImportRow } from '@/lib/types';

type RowWithEmail = SalaryImportRow & { email?: string };

// ── Format tiền tệ ──────────────────────────────────────────────────────────
function fmtM(n?: number): string {
  if (!n) return '—';
  return Math.round(n).toLocaleString('vi-VN') + ' ₫';
}

// ── Build HTML email đầy đủ breakdown ───────────────────────────────────────
function buildHtml(row: RowWithEmail, thang: number, nam: number): string {
  const isKD = row.loai === 'KD';

  // ── Thu nhập rows ──
  const incRows: string[] = [];
  if (isKD) {
    if (row.luong_vi_tri)            incRows.push(tr('Lương vị trí',             fmtM(row.luong_vi_tri)));
    if (row.lcb_theo_ngay_cong)      incRows.push(tr('LCB theo ngày công',        fmtM(row.lcb_theo_ngay_cong)));
    if (row.kpi_quy_mo)              incRows.push(trI('KPI quy mô & duy trì HĐ', fmtM(row.kpi_quy_mo)));
    if (row.kpi_hieu_qua_van_hanh)   incRows.push(trI('KPI hiệu quả vận hành DA',fmtM(row.kpi_hieu_qua_van_hanh)));
    if (row.kpi_chat_luong_quan_ly)  incRows.push(trI('KPI chất lượng quản lý',  fmtM(row.kpi_chat_luong_quan_ly)));
    if (row.kpi_doanh_thu_gdkd)      incRows.push(trI('KPI doanh thu (GĐKD)',    fmtM(row.kpi_doanh_thu_gdkd)));
    if (row.kpi_doanh_thu_nvkd)      incRows.push(trI('KPI doanh thu (NVKD)',    fmtM(row.kpi_doanh_thu_nvkd)));
    if (row.kpi_plus)                incRows.push(trI('KPI Plus — Hiệu quả',     fmtM(row.kpi_plus)));
    if (row.dieu_chinh_ky_truoc)     incRows.push(tr('Điều chỉnh kỳ trước',      fmtM(row.dieu_chinh_ky_truoc)));
  } else {
    if (row.luong_ct)                incRows.push(tr('Lương CT/tháng',            fmtM(row.luong_ct)));
    if (row.luong_tv)                incRows.push(tr('Lương TV/tháng',            fmtM(row.luong_tv)));
    if (row.luong_cong)              incRows.push(tr('Lương Công',                fmtM(row.luong_cong)));
    if (row.luong_ltg)               incRows.push(tr('Lương LTG (làm thêm giờ)', fmtM(row.luong_ltg)));
    if (row.kpi_plus)                incRows.push(tr('KPI Hiệu quả công việc',    fmtM(row.kpi_plus)));
    if (row.thuong_tkkd)             incRows.push(tr('Thưởng TKKD',              fmtM(row.thuong_tkkd)));
    if (row.thuong_thang_13)         incRows.push(tr('Thưởng tháng 13',          fmtM(row.thuong_thang_13)));
    if (row.tong_phu_cap_thuc_nhan)  incRows.push(tr('Phụ cấp thực nhận',        fmtM(row.tong_phu_cap_thuc_nhan)));
    if (row.phu_cap_tien_an_bo)      incRows.push(tr('Phụ cấp tiền ăn (MT)',     fmtM(row.phu_cap_tien_an_bo)));
  }

  // ── Khấu trừ rows ──
  const dedRows: string[] = [];
  if (row.bhxh_nld)           dedRows.push(trRed('BHXH NLĐ đóng (10.5%)',       fmtM(row.bhxh_nld)));
  if (row.giam_tru_ban_than)  dedRows.push(trBlue('Giảm trừ bản thân',          fmtM(row.giam_tru_ban_than)));
  if (row.so_tien_giam_tru)   dedRows.push(trBlue(`Giảm trừ NPT (${row.so_nguoi_giam_tru ?? 0} người)`, fmtM(row.so_tien_giam_tru)));
  if (row.thu_nhap_tinh_thue) dedRows.push(trGray('Thu nhập tính thuế',         fmtM(row.thu_nhap_tinh_thue)));
  if (row.thue_tncn)          dedRows.push(trRed('Thuế TNCN',                   fmtM(row.thue_tncn)));
  if (isKD) {
    if (row.so_phut_di_muon)  dedRows.push(trGray('Số phút đi muộn',            `${Math.round(row.so_phut_di_muon)}&nbsp;phút`));
    if (row.tien_di_muon)     dedRows.push(trRed('Tiền đi muộn',                fmtM(row.tien_di_muon)));
    if (row.tru_khac)         dedRows.push(trRed('Trừ khác',                    fmtM(row.tru_khac)));
    if (row.tam_ung_luong)    dedRows.push(trRed('Tạm ứng lương',               fmtM(row.tam_ung_luong)));
  } else {
    if (row.tien_ung_phat)    dedRows.push(trRed('Tiền đã ứng/phạt',           fmtM(row.tien_ung_phat)));
    if (row.tru_di_muon_bo)   dedRows.push(trRed('Trừ đi muộn về sớm',        fmtM(row.tru_di_muon_bo)));
  }

  const congInfo = isKD && (row.cong_thuc_te || row.cong_tinh_luong) ? `
    <div class="info-item"><div class="info-lbl">Công thực tế</div><strong>${row.cong_thuc_te ?? '—'}</strong></div>
    <div class="info-item"><div class="info-lbl">Công tính lương</div><strong>${row.cong_tinh_luong ?? '—'}</strong></div>` : '';

  return `<!DOCTYPE html><html lang="vi">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
body{margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif;color:#1f2937}
.wrap{max-width:600px;margin:20px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.1)}
.hdr{background:linear-gradient(135deg,#1e3a5f,#2d5a8e);color:#fff;padding:22px 28px}
.hdr h1{margin:0 0 3px;font-size:18px;letter-spacing:.03em}
.hdr p{margin:0;font-size:12px;opacity:.8}
.body{padding:22px 28px}
.greeting{font-size:14px;margin-bottom:14px;color:#374151}
.info-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:14px 16px;margin-bottom:18px;font-size:13px}
.info-item{display:flex;flex-direction:column;gap:2px}
.info-lbl{color:#9ca3af;font-size:11px;text-transform:uppercase;letter-spacing:.04em}
.sec-title{font-size:11px;font-weight:700;color:#fff;background:#4b5563;padding:5px 10px;border-radius:4px;margin:14px 0 6px;text-transform:uppercase;letter-spacing:.05em;display:inline-block}
table{width:100%;border-collapse:collapse;font-size:13px}
td{padding:7px 6px;border-bottom:1px solid #f3f4f6}
td:first-child{color:#374151}
td:last-child{text-align:right;font-weight:600;white-space:nowrap}
.tr-i td:first-child{padding-left:18px;color:#6b7280}
.tr-red td:last-child{color:#dc2626}
.tr-blue td:last-child{color:#2563eb}
.tr-gray td{color:#9ca3af!important}
.tr-total td{background:#d1fae5;color:#065f46!important;font-weight:700!important;font-size:14px;padding:9px 6px;border:none}
.tr-deduct td{background:#fee2e2;color:#991b1b!important;font-weight:700!important;font-size:14px;padding:9px 6px;border:none}
.thuc-linh{background:#064e3b;border-radius:8px;text-align:center;padding:16px;margin-top:18px}
.thuc-linh .lbl{color:rgba(255,255,255,.7);font-size:11px;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px}
.thuc-linh .amt{color:#fff;font-size:24px;font-weight:800}
.note{font-size:12px;color:#6b7280;background:#f9fafb;padding:10px 14px;border-radius:6px;margin-top:14px;line-height:1.5}
.footer{background:#f3f4f6;padding:12px 28px;font-size:11px;color:#9ca3af;text-align:center;border-top:1px solid #e5e7eb}
</style></head>
<body>
<div class="wrap">
  <div class="hdr">
    <h1>VICTORY HOLDINGS</h1>
    <p>Phiếu lương tháng ${thang}/${nam} &middot; ${isKD ? 'Khối Kinh Doanh' : 'Khối Back Office'}</p>
  </div>
  <div class="body">
    <p class="greeting">Kính gửi <strong>${row.ho_ten}</strong>,</p>
    <div class="info-grid">
      <div class="info-item"><div class="info-lbl">Mã nhân viên</div><strong>${row.id_nhan_vien}</strong></div>
      <div class="info-item"><div class="info-lbl">Phòng ban</div><strong>${row.phong_ban || '—'}</strong></div>
      <div class="info-item"><div class="info-lbl">Chức vụ</div><strong>${row.chuc_vu || '—'}</strong></div>
      <div class="info-item"><div class="info-lbl">Kỳ lương</div><strong>Tháng ${thang}/${nam}</strong></div>
      ${congInfo}
    </div>

    ${incRows.length > 0 ? `
    <div class="sec-title">📥 Thu nhập</div>
    <table>
      ${incRows.join('')}
      <tr class="tr-total"><td>TỔNG THU NHẬP</td><td>${fmtM(row.tong_thu_nhap)}</td></tr>
    </table>` : ''}

    ${dedRows.length > 0 ? `
    <div class="sec-title">📤 Khấu trừ</div>
    <table>
      ${dedRows.join('')}
      <tr class="tr-deduct"><td>TỔNG KHẤU TRỪ</td><td>${fmtM(row.tong_khau_tru)}</td></tr>
    </table>` : ''}

    <div class="thuc-linh">
      <div class="lbl">Lương thực lĩnh tháng ${thang}/${nam}</div>
      <div class="amt">${Math.round(row.thuc_linh).toLocaleString('vi-VN')}&nbsp;₫</div>
    </div>

    <p class="note">Mọi thắc mắc về bảng lương vui lòng liên hệ phòng Nhân sự trong vòng <strong>3 ngày làm việc</strong>.</p>
  </div>
  <div class="footer">&copy; ${new Date().getFullYear()} Victory Holdings &middot; victoryholdings.com.vn</div>
</div>
</body></html>`;
}

// ── Table row helpers ──────────────────────────────────────────────────────
const tr     = (l: string, v: string) => `<tr><td>${l}</td><td>${v}</td></tr>`;
const trI    = (l: string, v: string) => `<tr class="tr-i"><td>&nbsp;&nbsp;${l}</td><td>${v}</td></tr>`;
const trRed  = (l: string, v: string) => `<tr class="tr-red"><td>${l}</td><td>${v}</td></tr>`;
const trBlue = (l: string, v: string) => `<tr class="tr-blue"><td>${l}</td><td>${v}</td></tr>`;
const trGray = (l: string, v: string) => `<tr class="tr-gray"><td>${l}</td><td>${v}</td></tr>`;

// ── Main handler ──────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { thang, nam, rows } = body as { thang: number; nam: number; rows: RowWithEmail[] };

    if (!thang || !nam || !Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ success: false, error: 'Thiếu dữ liệu (thang, nam, rows)' }, { status: 400 });
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

    for (const row of rows) {
      if (!row.email?.trim()) {
        result.skipped++;
        continue;
      }
      try {
        await transporter.sendMail({
          from: `"${smtpFrom}" <${smtpUser}>`,
          to: row.email.trim(),
          subject: `Phiếu lương tháng ${thang}/${nam} — ${row.ho_ten}`,
          html: buildHtml(row, thang, nam),
        });
        result.sent++;
      } catch (e: any) {
        result.failed++;
        result.errors.push(`${row.ho_ten} <${row.email}>: ${e?.message ?? String(e)}`);
      }
    }

    return NextResponse.json({
      success: true,
      ...result,
      message: `Đã gửi ${result.sent} email. Bỏ qua ${result.skipped} (thiếu email). Lỗi: ${result.failed}.`,
    });

  } catch (error: any) {
    console.error('[API email/salary-slip/bulk]', error);
    return NextResponse.json({ success: false, error: error?.message || 'Lỗi server' }, { status: 500 });
  }
}
