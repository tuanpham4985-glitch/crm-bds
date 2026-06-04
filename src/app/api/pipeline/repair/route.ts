/**
 * POST /api/pipeline/repair
 *
 * Sửa các dòng PIPELINE bị lệch cột do bug trong addKhachHang cũ.
 *
 * Triệu chứng của dòng bị lỗi:
 *   - id_du_an  = "0" hoặc "0 đ" (số 0 được ghi vào nhầm cột)
 *   - ten_du_an = tên sale (người dùng được ghi nhầm vào cột này)
 *   - tien_hoa_hong = chuỗi ISO date (ngày tạo bị ghi nhầm vào đây)
 *   - sale_phu_trach = "MM-YYYY" (thang key bị ghi nhầm vào đây)
 *
 * Phục hồi:
 *   - sale_phu_trach ← lấy từ ten_du_an (giá trị thực)
 *   - thang          ← lấy từ sale_phu_trach cũ (chuỗi "MM-YYYY")
 *   - ngay_cap_nhat  ← reconstruct từ id_pipeline timestamp
 *   - Reset: id_du_an='', ten_du_an='', tien_hoa_hong=0
 *
 * Chỉ Admin mới được gọi endpoint này.
 */

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';

// Regex phát hiện giá trị thang bị ghi nhầm vào sale_phu_trach (vd: "06-2026")
const THANG_REGEX = /^\d{2}-\d{4}$/;

// Regex phát hiện id_du_an bị ghi nhầm (chỉ là số 0, hoặc "0 đ", hoặc empty)
const BAD_IDDA_REGEX = /^0?(\.0+)?\s*(đ|d)?$/i;

function getJWT(): JWT {
  const email = process.env.GOOGLE_CLIENT_EMAIL!;
  const key = (process.env.GOOGLE_PRIVATE_KEY || '')
    .trim().replace(/^"(.*)"$/, '$1').replace(/\\n/g, '\n');
  return new JWT({ email, key, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
}

async function getSessionUser() {
  try {
    const cookieStore = await cookies();
    const session = cookieStore.get('crm_session');
    if (!session) return null;
    const decoded = decodeURIComponent(escape(atob(session.value)));
    return JSON.parse(decoded);
  } catch { return null; }
}

export async function POST(request: NextRequest) {
  // Chỉ Admin
  const user = await getSessionUser();
  if (!user || user.vai_tro !== 'Admin') {
    return NextResponse.json({ success: false, error: 'Chỉ Admin mới có quyền repair' }, { status: 403 });
  }

  const sheetId = process.env.GOOGLE_SHEET_ID;
  if (!sheetId) {
    return NextResponse.json({ success: false, error: 'Thiếu GOOGLE_SHEET_ID' }, { status: 500 });
  }

  const doc = new GoogleSpreadsheet(sheetId, getJWT());
  await doc.loadInfo();
  const sheet = doc.sheetsByTitle['PIPELINE'];
  if (!sheet) {
    return NextResponse.json({ success: false, error: 'Sheet PIPELINE không tồn tại' }, { status: 500 });
  }

  await sheet.loadHeaderRow();
  const h = sheet.headerValues;
  const rows = await sheet.getRows();

  const str = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim());

  let fixed = 0;
  let skipped = 0;
  const details: string[] = [];

  for (const row of rows) {
    const v = row.toObject();

    const saleVal  = str(v['sale_phu_trach']);
    const idDuAn   = str(v['id_du_an']);
    const tenDuAn  = str(v['ten_du_an']);
    const idPL     = str(v['id_pipeline']);

    // Phát hiện dòng bị lỗi: sale_phu_trach chứa thang key ("06-2026")
    if (!THANG_REGEX.test(saleVal)) {
      skipped++;
      continue;
    }

    // Thông tin phục hồi
    const realSale  = tenDuAn;          // tên sale thực được ghi nhầm vào ten_du_an
    const realThang = saleVal;          // thang key thực được ghi nhầm vào sale_phu_trach

    // Reconstruct ngay_cap_nhat từ id_pipeline timestamp
    // id_pipeline dạng: PL_<timestamp> hoặc PL_<timestamp>_<i>
    let realNgay = '';
    const tsMatch = idPL.match(/PL_(\d+)/);
    if (tsMatch) {
      const ts = parseInt(tsMatch[1]);
      if (!isNaN(ts) && ts > 1000000000000) {
        realNgay = new Date(ts).toISOString();
      }
    }
    if (!realNgay) {
      // fallback: derive từ thang "MM-YYYY"
      const [mm, yyyy] = realThang.split('-');
      realNgay = `${yyyy}-${mm}-01T00:00:00.000Z`;
    }

    // Ghi lại đúng
    if (h.includes('sale_phu_trach')) row.set('sale_phu_trach', realSale);
    if (h.includes('thang'))          row.set('thang',          realThang);
    if (h.includes('ngay_cap_nhat'))  row.set('ngay_cap_nhat',  realNgay);
    if (h.includes('id_du_an'))       row.set('id_du_an',       '');
    if (h.includes('ten_du_an'))      row.set('ten_du_an',      '');
    if (h.includes('tien_hoa_hong'))  row.set('tien_hoa_hong',  0);
    if (h.includes('gia_tri_thuc_te')) row.set('gia_tri_thuc_te', 0);

    try {
      await row.save();
      fixed++;
      details.push(`✅ ${idPL} → sale: "${realSale}", thang: ${realThang}`);
    } catch (e) {
      details.push(`❌ ${idPL} → lỗi save: ${e}`);
    }
  }

  return NextResponse.json({
    success: true,
    fixed,
    skipped,
    total: rows.length,
    message: `Đã sửa ${fixed}/${rows.length} dòng bị lệch cột.`,
    details,
  });
}
