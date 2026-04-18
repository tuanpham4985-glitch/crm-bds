// ============================================================
// CRM BĐS — Google Sheets Service (Server-side only)
// Hardened for Vercel serverless production
// ============================================================
import { GoogleSpreadsheet, GoogleSpreadsheetWorksheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import type { DuAn, NhanVien, KhachHang, Pipeline, CongViec, DanhMuc } from './types';

// ---- Environment Variable Validation ----
function validateEnvVars(): { clientEmail: string; privateKey: string; sheetId: string } {
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY;
  const sheetId = process.env.GOOGLE_SHEET_ID;

  const missing: string[] = [];
  if (!clientEmail) missing.push('GOOGLE_CLIENT_EMAIL');
  if (!privateKey) missing.push('GOOGLE_PRIVATE_KEY');
  if (!sheetId) missing.push('GOOGLE_SHEET_ID');

  if (missing.length > 0) {
    throw new Error(
      `[GSheets] Missing required environment variables: ${missing.join(', ')}. ` +
      `Configure them in Vercel Dashboard → Settings → Environment Variables.`
    );
  }

  return { clientEmail: clientEmail!, privateKey: privateKey!, sheetId: sheetId! };
}

// ---- Auth ----
function getJWT(): JWT {
  const { clientEmail, privateKey } = validateEnvVars();

  return new JWT({
    email: clientEmail,
    key: privateKey.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

async function getDoc(): Promise<GoogleSpreadsheet> {
  const { sheetId } = validateEnvVars();

  try {
    const doc = new GoogleSpreadsheet(sheetId, getJWT());
    await doc.loadInfo();
    return doc;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[GSheets] Failed to connect to Google Spreadsheet:', {
      sheetId,
      error: msg,
    });

    // Provide actionable error messages for common issues
    if (msg.includes('invalid_grant') || msg.includes('invalid_client')) {
      throw new Error(
        '[GSheets] Authentication failed. Check GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY values. ' +
        'Ensure the private key newlines are preserved correctly.'
      );
    }
    if (msg.includes('not found') || msg.includes('404')) {
      throw new Error(
        `[GSheets] Spreadsheet "${sheetId}" not found. Check GOOGLE_SHEET_ID and ensure the service account has access.`
      );
    }
    if (msg.includes('ENOTFOUND') || msg.includes('ETIMEDOUT')) {
      throw new Error('[GSheets] Network error connecting to Google APIs. This may be a temporary issue.');
    }
    throw new Error(`[GSheets] Connection error: ${msg}`);
  }
}

// Safe sheet lookup with detailed error
async function getSheet(doc: GoogleSpreadsheet, title: string): Promise<GoogleSpreadsheetWorksheet> {
  const sheet = doc.sheetsByTitle[title];
  if (!sheet) {
    const available = Object.keys(doc.sheetsByTitle).join(', ');
    console.error(`[GSheets] Sheet "${title}" not found. Available sheets: [${available}]`);
    throw new Error(
      `[GSheets] Sheet "${title}" not found in spreadsheet. ` +
      `Available sheets: [${available}]. ` +
      `Please ensure the sheet name matches exactly (case-sensitive).`
    );
  }
  await sheet.loadHeaderRow();
  return sheet;
}

const SHEETS = {
  DANH_MUC: 'DANH_MUC',
  DU_AN: 'DU_AN',
  NHAN_VIEN: 'NHAN_VIEN',
  KHACH_HANG: 'KHACH_HANG',
  PIPELINE: 'PIPELINE',
  CONG_VIEC: 'CONG_VIEC',
  LOG_HE_THONG: 'LOG_HE_THONG',
} as const;

function str(val: unknown): string {
  if (val === null || val === undefined) return '';
  return String(val).trim();
}

function num(val: unknown): number {
  const raw = str(val);
  if (!raw) return 0;
  // Handle scientific notation (e.g., "5E+9")
  if (/[eE][+\-]?\d+/.test(raw)) {
    const n = Number(raw);
    return isNaN(n) ? 0 : n;
  }
  // Detect separator style:
  // "5,000,000,000" (commas as thousands) or "5.000.000.000" (dots as thousands)
  // "1,234.56" (comma=thousands, dot=decimal) or "1.234,56" (dot=thousands, comma=decimal)
  let cleaned = raw;
  // Count commas and dots
  const commaCount = (raw.match(/,/g) || []).length;
  const dotCount = (raw.match(/\./g) || []).length;
  if (commaCount > 1 && dotCount === 0) {
    // "5,000,000,000" → commas are thousands separators
    cleaned = raw.replace(/,/g, '');
  } else if (dotCount > 1 && commaCount === 0) {
    // "5.000.000.000" → dots are thousands separators
    cleaned = raw.replace(/\./g, '');
  } else if (commaCount === 1 && dotCount === 0) {
    // "5,000" → could be thousands separator
    // Check if exactly 3 digits after comma
    if (/,\d{3}$/.test(raw)) {
      cleaned = raw.replace(/,/g, '');
    } else {
      // Decimal comma: "1,5" → "1.5"
      cleaned = raw.replace(',', '.');
    }
  } else if (dotCount >= 1 && commaCount === 1) {
    // "1.000,50" → dot=thousands, comma=decimal
    cleaned = raw.replace(/\./g, '').replace(',', '.');
  } else if (commaCount >= 1 && dotCount === 1) {
    // "1,000.50" → comma=thousands, dot=decimal
    cleaned = raw.replace(/,/g, '');
  }
  // Remove any remaining non-numeric characters except dot and minus
  cleaned = cleaned.replace(/[^\d.\-]/g, '');
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

function toMonthKey(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
}

// ============================================================
// READ OPERATIONS
// ============================================================

export async function getDanhMuc(): Promise<DanhMuc> {
  const doc = await getDoc();
  const sheet = await getSheet(doc, SHEETS.DANH_MUC);
  const rows = await sheet.getRows();
  const h = sheet.headerValues;

  const result: DanhMuc = { giai_doan_pipeline: [], trang_thai_kh: [], trang_thai_cong_viec: [], nguon: [] };
  for (const row of rows) {
    const v = row.toObject();
    if (str(v[h[0]])) result.giai_doan_pipeline.push(str(v[h[0]]));
    if (str(v[h[1]])) result.trang_thai_kh.push(str(v[h[1]]));
    if (str(v[h[2]])) result.trang_thai_cong_viec.push(str(v[h[2]]));
    if (str(v[h[3]])) result.nguon.push(str(v[h[3]]));
  }
  return result;
}

export async function getDuAn(): Promise<DuAn[]> {
  const doc = await getDoc();
  const sheet = await getSheet(doc, SHEETS.DU_AN);
  const rows = await sheet.getRows();
  const h = sheet.headerValues;

  return rows
    .map(row => {
      const v = row.toObject();
      const id = str(v[h[0]]);
      if (!id) return null;
      return {
        id_du_an: id,
        ma_du_an: str(v[h[1]]),
        ten_du_an: str(v[h[2]]),
        hien_thi: num(v[h[3]]),
        hoa_hong_mac_dinh: num(v[h[4]]),
        label: str(v[h[5]]) || `${str(v[h[1]])} - ${str(v[h[2]])}`,
      } as DuAn;
    })
    .filter((x): x is DuAn => x !== null);
}

export async function getNhanVien(): Promise<NhanVien[]> {
  const doc = await getDoc();
  const sheet = await getSheet(doc, SHEETS.NHAN_VIEN);
  const rows = await sheet.getRows();
  const h = sheet.headerValues;

  const result: NhanVien[] = [];
  for (const row of rows) {
    const v = row.toObject();
    let id = str(v[h[0]]);
    const hoTen = str(v[h[1]]);

    // Skip completely empty rows
    if (!id && !hoTen) continue;

    // Auto-repair: generate ID for imported rows missing id_nhan_vien
    if (!id && hoTen) {
      id = `NV${Date.now()}`;
      try {
        row.set(h[0], id);
        await row.save();
        console.log(`[GSheets] Auto-generated id_nhan_vien="${id}" for "${hoTen}"`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[GSheets] Failed to backfill ID for "${hoTen}":`, msg);
        continue; // Skip this row if we can't save
      }
    }

    result.push({
      id_nhan_vien: id,
      ho_ten: hoTen,
      so_dien_thoai: str(v[h[2]]),
      email: str(v[h[3]]),
      vai_tro: str(v[h[4]]),
      trang_thai: str(v[h[5]]),
      ngay_tao: str(v[h[6]]),
      avatar_url: str(v[h[7]]),
    } as NhanVien);
  }
  return result;
}

/**
 * Backfill missing id_nhan_vien for all rows in NHAN_VIEN sheet.
 * Returns the number of rows that were fixed.
 */
export async function backfillNhanVienIds(): Promise<{ fixed: number; total: number; details: string[] }> {
  const doc = await getDoc();
  const sheet = await getSheet(doc, SHEETS.NHAN_VIEN);
  const rows = await sheet.getRows();
  const h = sheet.headerValues;

  let fixed = 0;
  const details: string[] = [];

  for (const row of rows) {
    const v = row.toObject();
    const id = str(v[h[0]]);
    const hoTen = str(v[h[1]]);

    if (!id && hoTen) {
      const newId = `NV${Date.now()}`;
      row.set(h[0], newId);
      await row.save();
      fixed++;
      details.push(`"${hoTen}" → ${newId}`);
      console.log(`[GSheets] Backfill: "${hoTen}" → ${newId}`);
      // Small delay to avoid rate limiting
      await new Promise(r => setTimeout(r, 100));
    }
  }

  return { fixed, total: rows.length, details };
}

export async function getKhachHang(): Promise<KhachHang[]> {
  const doc = await getDoc();
  const sheet = await getSheet(doc, SHEETS.KHACH_HANG);
  const rows = await sheet.getRows();
  const h = sheet.headerValues;

  return rows
    .map(row => {
      const v = row.toObject();
      const id = str(v[h[0]]);
      if (!id) return null;
      const ten = str(v[h[2]]);
      const sdt = str(v[h[3]]);
      return {
        id_khach_hang: id,
        ngay_tao: str(v[h[1]]),
        ten_KH: ten,
        so_dien_thoai: sdt,
        email: str(v[h[4]]),
        nguon: str(v[h[5]]),
        nhu_cau: str(v[h[6]]),
        ghi_chu: str(v[h[7]]),
        sale_phu_trach: str(v[h[8]]),
        label_khach: str(v[h[9]]) || `${ten} - ${sdt}`,
      } as KhachHang;
    })
    .filter((x): x is KhachHang => x !== null);
}

export async function getPipeline(): Promise<Pipeline[]> {
  const doc = await getDoc();
  const sheet = await getSheet(doc, SHEETS.PIPELINE);
  const rows = await sheet.getRows();
  const h = sheet.headerValues;

  return rows
    .map(row => {
      const v = row.toObject();
      const id = str(v[h[0]]);
      if (!id) return null;
      const ngayCapNhat = str(v[h[9]]);
      let thang = str(v[h[10]]);
      if (!thang || thang === 'Invalid Date' || thang === '[object Object]') {
        thang = toMonthKey(ngayCapNhat);
      }
      return {
        id_pipeline: id,
        id_khach_hang: str(v[h[1]]),
        giai_doan: str(v[h[2]]),
        gia_tri_thuc_te: num(v[h[3]]),
        sale_phu_trach: str(v[h[4]]),
        id_du_an: str(v[h[5]]),
        ten_du_an: str(v[h[6]]),
        hoa_hong: num(v[h[7]]),
        tien_hoa_hong: num(v[h[8]]),
        ngay_cap_nhat: ngayCapNhat,
        thang,
      } as Pipeline;
    })
    .filter((x): x is Pipeline => x !== null);
}

export async function getCongViec(): Promise<CongViec[]> {
  const doc = await getDoc();
  const sheet = await getSheet(doc, SHEETS.CONG_VIEC);
  const rows = await sheet.getRows();
  const h = sheet.headerValues;

  return rows
    .map(row => {
      const v = row.toObject();
      const id = str(v[h[0]]);
      if (!id) return null;
      return {
        id_cong_viec: id,
        ngay_tao: str(v[h[1]]),
        ghi_chu: str(v[h[2]]),
        id_pipeline: str(v[h[3]]),
        trang_thai: str(v[h[4]]),
        ngay_hen: str(v[h[5]]),
        sale_phu_trach: str(v[h[6]]),
        ket_qua: str(v[h[7]]),
      } as CongViec;
    })
    .filter((x): x is CongViec => x !== null);
}

// ============================================================
// WRITE OPERATIONS
// ============================================================

async function addLog(
  doc: GoogleSpreadsheet,
  hanh_dong: string,
  doi_tuong: string,
  id_lien_quan: string,
  nguoi_thuc_hien: string
): Promise<void> {
  try {
    const sheet = await getSheet(doc, SHEETS.LOG_HE_THONG);
    const now = new Date().toISOString();
    const h = sheet.headerValues;
    await sheet.addRow({
      [h[0]]: now, [h[1]]: hanh_dong, [h[2]]: doi_tuong,
      [h[3]]: id_lien_quan, [h[4]]: nguoi_thuc_hien, [h[5]]: now,
    });
  } catch (err: unknown) {
    // Log errors should not crash the main operation
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[GSheets] addLog failed (non-fatal):', msg);
  }
}

// --- KHÁCH HÀNG ---
export async function addKhachHang(kh: KhachHang): Promise<void> {
  const doc = await getDoc();

  // 1. Add KH
  const sheetKH = await getSheet(doc, SHEETS.KHACH_HANG);
  const hKH = sheetKH.headerValues;

  await sheetKH.addRow({
    [hKH[0]]: kh.id_khach_hang,
    [hKH[1]]: kh.ngay_tao,
    [hKH[2]]: kh.ten_KH,
    [hKH[3]]: kh.so_dien_thoai,
    [hKH[4]]: kh.email,
    [hKH[5]]: kh.nguon,
    [hKH[6]]: kh.nhu_cau,
    [hKH[7]]: kh.ghi_chu,
    [hKH[8]]: kh.sale_phu_trach,
    [hKH[9]]: `${kh.ten_KH} - ${kh.so_dien_thoai}`,
  });

  // 2. AUTO tạo pipeline
  const sheetPL = await getSheet(doc, SHEETS.PIPELINE);
  const hPL = sheetPL.headerValues;

  const id_pipeline = `PL_${Date.now()}`;

  await sheetPL.addRow({
    [hPL[0]]: id_pipeline,
    [hPL[1]]: kh.id_khach_hang,
    [hPL[2]]: 'Mới',
    [hPL[3]]: 0,
    [hPL[4]]: kh.sale_phu_trach,
    [hPL[5]]: '',
    [hPL[6]]: '',
    [hPL[7]]: 0,
    [hPL[8]]: 0,
    [hPL[9]]: new Date().toISOString(),
    [hPL[10]]: toMonthKey(new Date().toISOString()),
  });

  // 3. AUTO tạo chuỗi công việc chăm sóc (giống CRM thật)
  const sheetCV = await getSheet(doc, SHEETS.CONG_VIEC);
  const hCV = sheetCV.headerValues;

  const ngayHen = new Date();
  ngayHen.setDate(ngayHen.getDate() + 1);

  await sheetCV.addRow({
    [hCV[0]]: `CV_${Date.now()}`,
    [hCV[1]]: new Date().toISOString(),
    [hCV[2]]: 'Gọi khách lần đầu',
    [hCV[3]]: id_pipeline,
    [hCV[4]]: 'Chưa xử lý',
    [hCV[5]]: ngayHen.toISOString(),
    [hCV[6]]: kh.sale_phu_trach,
    [hCV[7]]: '',
  });

  await addLog(doc, 'CREATE_KH_FULL_FLOW', kh.id_khach_hang, id_pipeline, '');
}

export async function updateKhachHang(kh: KhachHang): Promise<boolean> {
  const doc = await getDoc();
  const sheet = await getSheet(doc, SHEETS.KHACH_HANG);
  const rows = await sheet.getRows();
  const h = sheet.headerValues;

  const row = rows.find(r => str(r.toObject()[h[0]]) === kh.id_khach_hang);
  if (!row) return false;

  row.set(h[2], kh.ten_KH); row.set(h[3], kh.so_dien_thoai);
  row.set(h[4], kh.email); row.set(h[5], kh.nguon);
  row.set(h[6], kh.nhu_cau); row.set(h[7], kh.ghi_chu);
  row.set(h[8], kh.sale_phu_trach);
  row.set(h[9], `${kh.ten_KH} - ${kh.so_dien_thoai}`);
  await row.save();
  await addLog(doc, 'UPDATE_KH', kh.id_khach_hang, '', '');
  return true;
}

export async function deleteKhachHang(id: string): Promise<boolean> {
  const doc = await getDoc();
  const sheet = await getSheet(doc, SHEETS.KHACH_HANG);
  const rows = await sheet.getRows();
  const h = sheet.headerValues;

  const row = rows.find(r => str(r.toObject()[h[0]]) === id);
  if (!row) return false;
  await row.delete();
  await addLog(doc, 'DELETE_KH', id, '', '');
  return true;
}

// --- PIPELINE ---
export async function addPipeline(pl: Pipeline): Promise<void> {
  const doc = await getDoc();
  const sheet = await getSheet(doc, SHEETS.PIPELINE);
  const h = sheet.headerValues;
  const thang = pl.thang || toMonthKey(pl.ngay_cap_nhat);
  await sheet.addRow({
    [h[0]]: pl.id_pipeline, [h[1]]: pl.id_khach_hang, [h[2]]: pl.giai_doan,
    [h[3]]: pl.gia_tri_thuc_te, [h[4]]: pl.sale_phu_trach, [h[5]]: pl.id_du_an,
    [h[6]]: pl.ten_du_an, [h[7]]: pl.hoa_hong,
    [h[8]]: pl.gia_tri_thuc_te * pl.hoa_hong,
    [h[9]]: pl.ngay_cap_nhat, [h[10]]: thang,
  });
  await addLog(doc, 'CREATE_PIPELINE', pl.id_pipeline, pl.id_khach_hang, '');
}

export async function updatePipeline(pl: Pipeline): Promise<boolean> {
  const doc = await getDoc();
  const sheet = await getSheet(doc, SHEETS.PIPELINE);
  const rows = await sheet.getRows();
  const h = sheet.headerValues;

  const row = rows.find(r => str(r.toObject()[h[0]]) === pl.id_pipeline);
  if (!row) return false;

  const now = new Date().toISOString();
  row.set(h[1], pl.id_khach_hang); row.set(h[2], pl.giai_doan);
  row.set(h[3], pl.gia_tri_thuc_te); row.set(h[4], pl.sale_phu_trach);
  row.set(h[5], pl.id_du_an); row.set(h[6], pl.ten_du_an);
  row.set(h[7], pl.hoa_hong);
  row.set(h[8], pl.gia_tri_thuc_te * pl.hoa_hong);
  row.set(h[9], now); row.set(h[10], toMonthKey(now));
  await row.save();
  await addLog(doc, 'UPDATE_PIPELINE', pl.id_pipeline, '', '');
  return true;
}

export async function deletePipeline(id: string): Promise<boolean> {
  const doc = await getDoc();
  const sheet = await getSheet(doc, SHEETS.PIPELINE);
  const rows = await sheet.getRows();
  const h = sheet.headerValues;

  const row = rows.find(r => str(r.toObject()[h[0]]) === id);
  if (!row) return false;
  await row.delete();
  await addLog(doc, 'DELETE_PIPELINE', id, '', '');
  return true;
}

// --- CÔNG VIỆC ---
export async function addCongViec(cv: CongViec): Promise<void> {
  const doc = await getDoc();
  const sheet = await getSheet(doc, SHEETS.CONG_VIEC);
  const h = sheet.headerValues;
  await sheet.addRow({
    [h[0]]: cv.id_cong_viec, [h[1]]: cv.ngay_tao, [h[2]]: cv.ghi_chu,
    [h[3]]: cv.id_pipeline, [h[4]]: cv.trang_thai, [h[5]]: cv.ngay_hen,
    [h[6]]: cv.sale_phu_trach, [h[7]]: cv.ket_qua,
  });
  await addLog(doc, 'CREATE_CV', cv.id_cong_viec, cv.id_pipeline, '');
}

export async function updateCongViec(cv: CongViec): Promise<boolean> {
  const doc = await getDoc();
  const sheet = await getSheet(doc, SHEETS.CONG_VIEC);
  const rows = await sheet.getRows();
  const h = sheet.headerValues;

  const row = rows.find(r => str(r.toObject()[h[0]]) === cv.id_cong_viec);
  if (!row) return false;

  row.set(h[2], cv.ghi_chu); row.set(h[3], cv.id_pipeline);
  row.set(h[4], cv.trang_thai); row.set(h[5], cv.ngay_hen);
  row.set(h[6], cv.sale_phu_trach); row.set(h[7], cv.ket_qua);
  await row.save();
  await addLog(doc, 'UPDATE_CV', cv.id_cong_viec, '', '');
  return true;
}

export async function deleteCongViec(id: string): Promise<boolean> {
  const doc = await getDoc();
  const sheet = await getSheet(doc, SHEETS.CONG_VIEC);
  const rows = await sheet.getRows();
  const h = sheet.headerValues;

  const row = rows.find(r => str(r.toObject()[h[0]]) === id);
  if (!row) return false;
  await row.delete();
  await addLog(doc, 'DELETE_CV', id, '', '');
  return true;
}

// --- DỰ ÁN ---
export async function addDuAn(da: DuAn): Promise<void> {
  const doc = await getDoc();
  const sheet = await getSheet(doc, SHEETS.DU_AN);
  const h = sheet.headerValues;
  await sheet.addRow({
    [h[0]]: da.id_du_an, [h[1]]: da.ma_du_an, [h[2]]: da.ten_du_an,
    [h[3]]: da.hien_thi, [h[4]]: da.hoa_hong_mac_dinh,
    [h[5]]: `${da.ma_du_an} - ${da.ten_du_an}`,
  });
  await addLog(doc, 'CREATE_DA', da.id_du_an, '', '');
}

export async function updateDuAn(da: DuAn): Promise<boolean> {
  const doc = await getDoc();
  const sheet = await getSheet(doc, SHEETS.DU_AN);
  const rows = await sheet.getRows();
  const h = sheet.headerValues;

  const row = rows.find(r => str(r.toObject()[h[0]]) === da.id_du_an);
  if (!row) return false;

  row.set(h[1], da.ma_du_an); row.set(h[2], da.ten_du_an);
  row.set(h[3], da.hien_thi); row.set(h[4], da.hoa_hong_mac_dinh);
  row.set(h[5], `${da.ma_du_an} - ${da.ten_du_an}`);
  await row.save();
  await addLog(doc, 'UPDATE_DA', da.id_du_an, '', '');
  return true;
}

export async function deleteDuAn(id: string): Promise<boolean> {
  const doc = await getDoc();
  const sheet = await getSheet(doc, SHEETS.DU_AN);
  const rows = await sheet.getRows();
  const h = sheet.headerValues;

  const row = rows.find(r => str(r.toObject()[h[0]]) === id);
  if (!row) return false;
  await row.delete();
  await addLog(doc, 'DELETE_DA', id, '', '');
  return true;
}

// --- NHÂN VIÊN ---
export async function addNhanVien(nv: NhanVien): Promise<void> {
  const doc = await getDoc();
  const sheet = await getSheet(doc, SHEETS.NHAN_VIEN);
  const h = sheet.headerValues;
  await sheet.addRow({
    [h[0]]: nv.id_nhan_vien, [h[1]]: nv.ho_ten, [h[2]]: nv.so_dien_thoai,
    [h[3]]: nv.email, [h[4]]: nv.vai_tro, [h[5]]: nv.trang_thai,
    [h[6]]: nv.ngay_tao,[h[7]]: nv.avatar_url || '',
  });
  await addLog(doc, 'CREATE_NV', nv.id_nhan_vien, '', '');
}

export async function updateNhanVien(nv: NhanVien): Promise<boolean> {
  const doc = await getDoc();
  const sheet = await getSheet(doc, SHEETS.NHAN_VIEN);
  const rows = await sheet.getRows();
  const h = sheet.headerValues;

  const row = rows.find(r => str(r.toObject()[h[0]]) === nv.id_nhan_vien);
  if (!row) return false;

  row.set(h[1], nv.ho_ten); row.set(h[2], nv.so_dien_thoai);
  row.set(h[3], nv.email); row.set(h[4], nv.vai_tro);
  row.set(h[5], nv.trang_thai);
  row.set(h[7], nv.avatar_url || '');
  await row.save();
  await addLog(doc, 'UPDATE_NV', nv.id_nhan_vien, '', '');
  return true;
}

export async function deleteNhanVien(id: string): Promise<boolean> {
  const doc = await getDoc();
  const sheet = await getSheet(doc, SHEETS.NHAN_VIEN);
  const rows = await sheet.getRows();
  const h = sheet.headerValues;

  const row = rows.find(r => str(r.toObject()[h[0]]) === id);
  if (!row) return false;
  await row.delete();
  await addLog(doc, 'DELETE_NV', id, '', '');
  return true;
}

// --- AUTH helper ---
export async function findNhanVienByEmail(email: string): Promise<NhanVien | null> {
  const list = await getNhanVien();
  const safeEmail = email.trim().toLowerCase();
  return list.find(nv => (nv.email || '').trim().toLowerCase() === safeEmail) || null;
}
