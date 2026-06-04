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

// ── Build HTML email — table-based layout, inline styles (email-safe) ────────
function buildHtml(row: RowWithEmail, thang: number, nam: number): string {
  const isKD = row.loai === 'KD';

  // ── Inline-style row helpers ──
  const S = {
    td:      'padding:8px 14px;font-size:13px;color:#374151;border-bottom:1px solid #f0f0f0;',
    tdR:     'padding:8px 14px;font-size:13px;color:#374151;border-bottom:1px solid #f0f0f0;text-align:right;font-weight:600;white-space:nowrap;',
    tdI:     'padding:8px 14px 8px 28px;font-size:12px;color:#6b7280;border-bottom:1px solid #f0f0f0;',
    tdRed:   'padding:8px 14px;font-size:13px;color:#dc2626;border-bottom:1px solid #f0f0f0;text-align:right;font-weight:600;white-space:nowrap;',
    tdBlue:  'padding:8px 14px;font-size:13px;color:#2563eb;border-bottom:1px solid #f0f0f0;text-align:right;font-weight:600;white-space:nowrap;',
    tdGray:  'padding:7px 14px;font-size:12px;color:#9ca3af;border-bottom:1px solid #f0f0f0;',
    tdGrayR: 'padding:7px 14px;font-size:12px;color:#9ca3af;border-bottom:1px solid #f0f0f0;text-align:right;',
    tot:     'padding:10px 14px;font-size:13px;font-weight:700;color:#065f46;background:#d1fae5;',
    ded:     'padding:10px 14px;font-size:13px;font-weight:700;color:#991b1b;background:#fee2e2;',
  };
  const row2 = (l:string,v:string) => `<tr><td style="${S.td}">${l}</td><td style="${S.tdR}">${v}</td></tr>`;
  const rowI = (l:string,v:string) => `<tr><td style="${S.tdI}">&nbsp;&nbsp;${l}</td><td style="${S.tdR}">${v}</td></tr>`;
  const rowR = (l:string,v:string) => `<tr><td style="${S.td}">${l}</td><td style="${S.tdRed}">${v}</td></tr>`;
  const rowB = (l:string,v:string) => `<tr><td style="${S.td}">${l}</td><td style="${S.tdBlue}">${v}</td></tr>`;
  const rowG = (l:string,v:string) => `<tr><td style="${S.tdGray}">${l}</td><td style="${S.tdGrayR}">${v}</td></tr>`;
  const rowTot  = (l:string,v:string) => `<tr><td style="${S.tot}">${l}</td><td style="${S.tot}text-align:right;">${v}</td></tr>`;
  const rowDed  = (l:string,v:string) => `<tr><td style="${S.ded}">${l}</td><td style="${S.ded}text-align:right;">${v}</td></tr>`;

  // ── Info cell helper (2-col table) ──
  const cell = (lbl:string, val:string, borderRight=true) =>
    `<td style="padding:10px 14px;width:50%;vertical-align:top;border-bottom:1px solid #f0f0f0;${borderRight?'border-right:1px solid #e5e7eb;':''}">
      <div style="color:#9ca3af;font-size:10px;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:3px;">${lbl}</div>
      <strong style="font-size:13px;color:#1f2937;">${val || '—'}</strong>
    </td>`;

  // ── Section header ──
  const secHdr = (num:string, title:string) =>
    `<tr><td colspan="2" style="background:#1e3a5f;color:#fff;padding:8px 14px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;">${num}. ${title}</td></tr>`;

  // ── II. CÔNG THÁNG ──
  const congRows: string[] = [];
  if (isKD) {
    if (row.cong_thuc_te)    congRows.push(row2('Công thực tế',          String(row.cong_thuc_te)));
    if (row.cong_tinh_luong) congRows.push(row2('Công tính lương',        String(row.cong_tinh_luong)));
    if (row.cong_tv)         congRows.push(row2('Công thử việc (TV)',     String(row.cong_tv)));
    if (row.cong_ct)         congRows.push(row2('Công chính thức (CT)',   String(row.cong_ct)));
    if (row.luong_tv)        congRows.push(row2('Lương thử việc',         fmtM(row.luong_tv)));
    if (row.luong_ct)        congRows.push(row2('Lương chính thức',       fmtM(row.luong_ct)));
  } else {
    if (row.cong_thuc_te)    congRows.push(row2('Giờ công CT',            String(row.cong_thuc_te)));
    if (row.cong_tv)         congRows.push(row2('Giờ công TV',            String(row.cong_tv)));
    if (row.luong_ct)        congRows.push(row2('Lương CT/tháng',         fmtM(row.luong_ct)));
    if (row.luong_tv)        congRows.push(row2('Lương TV/tháng',         fmtM(row.luong_tv)));
  }

  // ── III. THU NHẬP ──
  const incRows: string[] = [];
  if (isKD) {
    if (row.luong_vi_tri)           incRows.push(row2('Lương vị trí',              fmtM(row.luong_vi_tri)));
    if (row.lcb_theo_ngay_cong)     incRows.push(row2('LCB theo ngày công',         fmtM(row.lcb_theo_ngay_cong)));
    if (row.kpi_quy_mo)             incRows.push(rowI('KPI quy mô & duy trì HĐ',   fmtM(row.kpi_quy_mo)));
    if (row.kpi_hieu_qua_van_hanh)  incRows.push(rowI('KPI hiệu quả vận hành DA',  fmtM(row.kpi_hieu_qua_van_hanh)));
    if (row.kpi_chat_luong_quan_ly) incRows.push(rowI('KPI chất lượng quản lý',    fmtM(row.kpi_chat_luong_quan_ly)));
    if (row.kpi_doanh_thu_gdkd)     incRows.push(rowI('KPI doanh thu (GĐKD)',      fmtM(row.kpi_doanh_thu_gdkd)));
    if (row.kpi_doanh_thu_nvkd)     incRows.push(rowI('KPI doanh thu (NVKD)',      fmtM(row.kpi_doanh_thu_nvkd)));
    if (row.kpi_plus)               incRows.push(rowI('KPI Plus — Hiệu quả',       fmtM(row.kpi_plus)));
    if (row.dieu_chinh_ky_truoc)    incRows.push(row2('Điều chỉnh kỳ trước',       fmtM(row.dieu_chinh_ky_truoc)));
  } else {
    if (row.luong_cong)             incRows.push(row2('Lương Công',                 fmtM(row.luong_cong)));
    if (row.luong_ltg)              incRows.push(row2('Lương LTG (làm thêm giờ)',  fmtM(row.luong_ltg)));
    if (row.kpi_plus)               incRows.push(row2('KPI Hiệu quả công việc',    fmtM(row.kpi_plus)));
    if (row.thuong_tkkd)            incRows.push(row2('Thưởng TKKD',               fmtM(row.thuong_tkkd)));
    if (row.thuong_thang_13)        incRows.push(row2('Thưởng tháng 13',           fmtM(row.thuong_thang_13)));
    if (row.tong_phu_cap_thuc_nhan) incRows.push(row2('Phụ cấp thực nhận',         fmtM(row.tong_phu_cap_thuc_nhan)));
    if (row.phu_cap_tien_an_bo)     incRows.push(row2('Phụ cấp tiền ăn (MT)',      fmtM(row.phu_cap_tien_an_bo)));
  }

  // ── IV. KHẤU TRỪ ──
  const dedRows: string[] = [];
  if (row.luong_dong_bhxh)   dedRows.push(rowG('Lương đóng BHXH (cơ sở tính)',   fmtM(row.luong_dong_bhxh)));
  if (row.bhxh_nld)          dedRows.push(rowR('BHXH NLĐ đóng (10.5%)',           fmtM(row.bhxh_nld)));
  if (row.giam_tru_ban_than) dedRows.push(rowB('Giảm trừ bản thân',               fmtM(row.giam_tru_ban_than)));
  if (row.so_tien_giam_tru)  dedRows.push(rowB(`Giảm trừ NPT (${row.so_nguoi_giam_tru ?? 0} người)`, fmtM(row.so_tien_giam_tru)));
  dedRows.push(rowG('Thu nhập tính thuế', (row.thu_nhap_tinh_thue ?? 0) > 0 ? fmtM(row.thu_nhap_tinh_thue) : 'Miễn thuế'));
  if (row.thue_tncn)         dedRows.push(rowR('Thuế TNCN',                       fmtM(row.thue_tncn)));
  if (isKD) {
    if (row.so_phut_di_muon) dedRows.push(rowG('Số phút đi muộn',                 `${Math.round(row.so_phut_di_muon)} phút`));
    if (row.tien_di_muon)    dedRows.push(rowR('Tiền đi muộn',                    fmtM(row.tien_di_muon)));
    if (row.tru_khac)        dedRows.push(rowR('Trừ khác',                        fmtM(row.tru_khac)));
    if (row.tam_ung_luong)   dedRows.push(rowR('Tạm ứng lương',                   fmtM(row.tam_ung_luong)));
  } else {
    if (row.tien_ung_phat)   dedRows.push(rowR('Tiền đã ứng/phạt',               fmtM(row.tien_ung_phat)));
    if (row.tru_di_muon_bo)  dedRows.push(rowR('Trừ đi muộn về sớm',            fmtM(row.tru_di_muon_bo)));
  }

  const W = 'max-width:620px;margin:20px auto;background:#ffffff;border-radius:12px;overflow:hidden;font-family:Arial,sans-serif;box-shadow:0 4px 24px rgba(0,0,0,0.10);';
  const tableW = 'width:100%;border-collapse:collapse;';

  return `<!DOCTYPE html>
<html lang="vi"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Phiếu lương tháng ${thang}/${nam}</title></head>
<body style="margin:0;padding:16px;background:#f3f4f6;font-family:Arial,sans-serif;">
<table ${tableW} style="${W}">

  <!-- HEADER -->
  <tr><td style="background:linear-gradient(135deg,#1e3a5f 0%,#2d5a8e 100%);padding:24px 28px;">
    <div style="color:#fff;font-size:16px;font-weight:800;letter-spacing:0.06em;margin-bottom:4px;">CÔNG TY TNHH VICTORY HOLDINGS VIỆT NAM</div>
    <div style="color:rgba(255,255,255,0.75);font-size:12px;">PHIẾU LƯƠNG THÁNG ${thang}/${nam} &mdash; ${isKD ? 'KHỐI KINH DOANH' : 'KHỐI BACK OFFICE'}</div>
  </td></tr>

  <!-- BODY -->
  <tr><td style="padding:24px 28px;">

    <p style="margin:0 0 18px;font-size:14px;color:#374151;">Kính gửi <strong>${row.ho_ten}</strong>,<br>
    Dưới đây là thông tin lương tháng <strong>${thang}/${nam}</strong> của bạn:</p>

    <!-- I. THÔNG TIN NHÂN SỰ -->
    <table ${tableW} style="border:1px solid #e5e7eb;border-radius:6px;margin-bottom:20px;overflow:hidden;">
      ${secHdr('I', 'Thông tin nhân sự')}
      <tr>${cell('Mã nhân viên', row.id_nhan_vien)}${cell('Họ và tên', row.ho_ten, false)}</tr>
      <tr>${cell('Chức vụ', row.chuc_vu)}${cell('Phòng ban', row.phong_ban, false)}</tr>
      <tr>${cell('Loại hợp đồng', row.ct_tv)}${cell('Kỳ lương', `Tháng ${thang}/${nam}`, false)}</tr>
    </table>

    ${congRows.length > 0 ? `
    <!-- II. CÔNG THÁNG -->
    <table ${tableW} style="border:1px solid #e5e7eb;border-radius:6px;margin-bottom:20px;overflow:hidden;">
      ${secHdr('II', 'Công tháng')}
      ${congRows.join('')}
    </table>` : ''}

    <!-- III. THU NHẬP -->
    <table ${tableW} style="border:1px solid #e5e7eb;border-radius:6px;margin-bottom:20px;overflow:hidden;">
      ${secHdr('III', 'Thu nhập')}
      ${incRows.join('')}
      ${rowTot('TỔNG THU NHẬP', fmtM(row.tong_thu_nhap))}
    </table>

    <!-- IV. KHẤU TRỪ -->
    <table ${tableW} style="border:1px solid #e5e7eb;border-radius:6px;margin-bottom:20px;overflow:hidden;">
      ${secHdr('IV', 'Khấu trừ')}
      ${dedRows.join('')}
      ${rowDed('TỔNG KHẤU TRỪ', fmtM(row.tong_khau_tru))}
    </table>

    <!-- THỰC LĨNH -->
    <table ${tableW} style="background:#064e3b;border-radius:8px;margin-bottom:16px;">
      <tr><td style="padding:20px;text-align:center;">
        <div style="color:rgba(255,255,255,0.7);font-size:11px;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:6px;">LƯƠNG THỰC LĨNH THÁNG ${thang}/${nam}</div>
        <div style="color:#ffffff;font-size:30px;font-weight:800;letter-spacing:-0.01em;">${Math.round(row.thuc_linh).toLocaleString('vi-VN')}&nbsp;₫</div>
      </td></tr>
    </table>

    <p style="margin:0;font-size:12px;color:#6b7280;background:#f9fafb;padding:12px 16px;border-radius:6px;border:1px solid #e5e7eb;line-height:1.6;">
      Mọi thắc mắc về bảng lương vui lòng liên hệ phòng Nhân sự trong vòng <strong>3 ngày làm việc</strong>.
    </p>

  </td></tr>

  <!-- FOOTER -->
  <tr><td style="background:#f3f4f6;padding:12px 28px;font-size:11px;color:#9ca3af;text-align:center;border-top:1px solid #e5e7eb;">
    &copy; ${new Date().getFullYear()} Công ty TNHH Victory Holdings Việt Nam &middot; victoryholdings.com.vn
  </td></tr>

</table>
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
