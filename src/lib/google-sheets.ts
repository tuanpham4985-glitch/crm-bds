// ============================================================
// CRM BĐS — Google Sheets Service (Server-side only)
// Hardened for Vercel serverless production
// ============================================================
import { GoogleSpreadsheet, GoogleSpreadsheetWorksheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import type { DuAn, NhanVien, KhachHang, Pipeline, CongViec, DanhMuc, HopDong, BangLuong, WorkCalendar, AttendanceRaw, Shift, PayrollAdjustment, PayrollRecord, PayrollItemRecord } from './types';

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

  // Strip surrounding quotes if Vercel stored the value with literal " " wrapping
  // Then convert escaped \n to actual newlines
  const cleanKey = privateKey
    .trim()
    .replace(/^"(.*)"$/, '$1')
    .replace(/\\n/g, '\n');

  return new JWT({
    email: clientEmail,
    key: cleanKey,
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
  HOP_DONG: 'HOP_DONG',
  BANG_LUONG: 'BANG_LUONG',
  WORK_CALENDAR: 'WORK_CALENDAR',
  ATTENDANCE_RAW: 'ATTENDANCE_RAW',
  SHIFTS: 'SHIFTS',
  PAYROLL_ADJUSTMENTS: 'PAYROLL_ADJUSTMENTS',
  PAYROLL: 'PAYROLL',
  PAYROLL_ITEMS: 'PAYROLL_ITEMS',
} as const;

// Exact column headers of the BANG_LUONG sheet (must match Google Sheets exactly)
const BANG_LUONG_HEADERS = [
  'id', 'id_nhan_vien', 'thang', 'nam',
  'luong_co_ban', 'doanh_thu', 'hoa_hong', 'thuong', 'phat',
  'so_ngay_cong_chuan', 'so_ngay_lam_viec_thuc_te', 'so_ngay_nghi_khong_luong', 'so_gio_ot',
  'salary_by_day', 'ot_pay', 'bao_hiem', 'bh_company', 'thue',
  'tong_luong', 'trang_thai', 'created_at',
] as const;

const PAYROLL_HEADERS = [
  'id', 'id_nhan_vien', 'thang', 'nam',
  'gross', 'total_deduction', 'net',
  'luong_dong_bh', 'thu_nhap_chiu_thue', 'tong_chi_phi',
  'trang_thai', 'locked_at', 'created_at'
] as const;

const PAYROLL_ITEMS_HEADERS = [
  'id', 'payroll_id', 'loai_khoan', 'nhom', 'so_tien', 'ghi_chu', 'tinh_bhxh', 'tinh_thue'
] as const;

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
  
  // Remove spaces, currency symbols, and any non-numeric/separator chars
  let cleaned = raw.replace(/[^\d.,\-]/g, '');
  if (!cleaned) return 0;

  // Detect separator style:
  // "5,000,000,000" (commas as thousands) or "5.000.000.000" (dots as thousands)
  // "1,234.56" (comma=thousands, dot=decimal) or "1.234,56" (dot=thousands, comma=decimal)
  
  // Count commas and dots
  const commaCount = (cleaned.match(/,/g) || []).length;
  const dotCount = (cleaned.match(/\./g) || []).length;
  
  if (commaCount > 1 && dotCount === 0) {
    cleaned = cleaned.replace(/,/g, '');
  } else if (dotCount > 1 && commaCount === 0) {
    cleaned = cleaned.replace(/\./g, '');
  } else if (commaCount === 1 && dotCount === 0) {
    if (/,\d{3}$/.test(cleaned)) {
      cleaned = cleaned.replace(/,/g, '');
    } else {
      cleaned = cleaned.replace(',', '.');
    }
  } else if (dotCount === 1 && commaCount === 0) {
    if (/\.\d{3}$/.test(cleaned)) {
      cleaned = cleaned.replace(/\./g, '');
    }
  } else if (dotCount >= 1 && commaCount === 1) {
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (commaCount >= 1 && dotCount >= 1) {
    cleaned = cleaned.replace(/,/g, '');
  }
  
  const result = Number(cleaned);
  return isNaN(result) ? 0 : result;
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

  const result: DanhMuc = { 
    giai_doan_pipeline: [], 
    trang_thai_kh: [], 
    trang_thai_cong_viec: [], 
    nguon: [],
    employee_types: [],
    khu_vuc: [],
    gioi_tinh: [],
    phong_KD: []
  };

  for (const row of rows) {
    const v = row.toObject();
    
    // Helper to push if header exists and value is not empty
    const pushIfValid = (headerName: string, target: string[]) => {
      if (h.includes(headerName)) {
        const val = str(v[headerName]);
        if (val) target.push(val);
      }
    };

    pushIfValid('giai_doan_pipeline', result.giai_doan_pipeline);
    pushIfValid('trang_thai_kh', result.trang_thai_kh);
    pushIfValid('trang_thai_cong_viec', result.trang_thai_cong_viec);
    pushIfValid('nguon', result.nguon);
    
    // Column E (index 4) is for Chức danh / employee_type as per user request
    if (h[4]) {
      const val = str(v[h[4]]);
      if (val) result.employee_types.push(val);
    }
    
    pushIfValid('khu_vuc', result.khu_vuc);
    pushIfValid('gioi_tinh', result.gioi_tinh);
    pushIfValid('phong_KD', result.phong_KD);
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
  const h = sheet.headerValues;

  // Auto-add missing columns
  let needsHeaderUpdate = false;
  const newHeaders = [...h];
  
  if (!h.includes('so_nguoi_phu_thuoc')) {
    console.log('[GSheets] Adding missing column "so_nguoi_phu_thuoc" to NHAN_VIEN');
    newHeaders.push('so_nguoi_phu_thuoc');
    needsHeaderUpdate = true;
  }
  if (!h.includes('mat_khau')) {
    console.log('[GSheets] Adding missing column "mat_khau" to NHAN_VIEN');
    newHeaders.push('mat_khau');
    needsHeaderUpdate = true;
  }

  if (needsHeaderUpdate) {
    await sheet.setHeaderRow(newHeaders);
  }

  const rows = await sheet.getRows();
  const updatedHeader = sheet.headerValues;

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

    // Column order: id, ho_ten, sdt, email, employee_type, trang_thai,
    // so_cccd, ngay_cap, noi_cap, HKTT, ngay_sinh, gioi_tinh, ma_so_thue,
    // so_tk_ngan_hang[13], ten_ngan_hang_thu_huong[14], ngay_tao[15], avatar_url[16]
    const baseNhanVien = {
      id_nhan_vien: id,
      ho_ten: hoTen,
      so_dien_thoai: str(v[h[2]]),
      email: str(v[h[3]]),
      employee_type: str(v[h[4]]),
      trang_thai: str(v[h[5]]),
      so_cccd: h[6] ? str(v[h[6]]) : '',
      ngay_cap: h[7] ? str(v[h[7]]) : '',
      noi_cap: h[8] ? str(v[h[8]]) : '',
      HKTT: h[9] ? str(v[h[9]]) : '',
      ngay_sinh: h[10] ? str(v[h[10]]) : '',
      gioi_tinh: h[11] ? str(v[h[11]]) : '',
      ma_so_thue: h[12] ? str(v[h[12]]) : '',
      so_tk_ngan_hang: h[13] ? str(v[h[13]]) : '',
      ten_ngan_hang_thu_huong: h[14] ? str(v[h[14]]) : '',
      avatar_url: h[16] ? str(v[h[16]]) : '',
      so_nguoi_phu_thuoc: num(v['so_nguoi_phu_thuoc'] || v['nguoi_phu_thuoc']),
      mat_khau: str(v['mat_khau']),
    };

    // Backward compatibility: previous bug saved vai_tro into ngay_tao column (h[15])
    const rawNgayTao = h[15] ? str(v[h[15]]) : '';
    const isVaiTroInNgayTao = rawNgayTao === 'Admin' || rawNgayTao === 'Sale';

    const finalVaiTro = v['vai_tro'] ? str(v['vai_tro']) : (isVaiTroInNgayTao ? rawNgayTao : 'Sale');
    const finalNgayTao = isVaiTroInNgayTao ? '' : rawNgayTao;

    result.push({
      ...baseNhanVien,
      ngay_tao: finalNgayTao,
      vai_tro: finalVaiTro,
      khu_vuc: v['khu_vuc'] ? str(v['khu_vuc']) : '',
      phong_KD: v['phong_KD'] ? str(v['phong_KD']) : '',
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
    [h[3]]: nv.email, [h[4]]: nv.employee_type || '', [h[5]]: nv.trang_thai,
    [h[6]]: nv.so_cccd || '', [h[7]]: nv.ngay_cap || '',
    [h[8]]: nv.noi_cap || '', [h[9]]: nv.HKTT || '',
    [h[10]]: nv.ngay_sinh || '', [h[11]]: nv.gioi_tinh || '',
    [h[12]]: nv.ma_so_thue || '',
    [h[13]]: nv.so_tk_ngan_hang || '',
    [h[14]]: nv.ten_ngan_hang_thu_huong || '',
    [h[15]]: nv.ngay_tao || '',
    [h[16]]: nv.avatar_url || '',
    'vai_tro': nv.vai_tro || 'Sale',
    'khu_vuc': nv.khu_vuc || '',
    'phong_KD': nv.phong_KD || '',
    'so_nguoi_phu_thuoc': nv.so_nguoi_phu_thuoc || 0,
    'mat_khau': nv.mat_khau || '',
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
  row.set(h[3], nv.email); row.set(h[4], nv.employee_type || '');
  row.set(h[5], nv.trang_thai);
  if (h[6]) row.set(h[6], nv.so_cccd || '');
  if (h[7]) row.set(h[7], nv.ngay_cap || '');
  if (h[8]) row.set(h[8], nv.noi_cap || '');
  if (h[9]) row.set(h[9], nv.HKTT || '');
  if (h[10]) row.set(h[10], nv.ngay_sinh || '');
  if (h[11]) row.set(h[11], nv.gioi_tinh || '');
  if (h[12]) row.set(h[12], nv.ma_so_thue || '');
  if (h[13]) row.set(h[13], nv.so_tk_ngan_hang || '');
  if (h[14]) row.set(h[14], nv.ten_ngan_hang_thu_huong || '');
  if (h[15]) row.set(h[15], nv.ngay_tao || '');
  if (h[16]) row.set(h[16], nv.avatar_url || '');
  if (h.includes('vai_tro')) row.set('vai_tro', nv.vai_tro || 'Sale');
  if (h.includes('khu_vuc')) row.set('khu_vuc', nv.khu_vuc || '');
  if (h.includes('phong_KD')) row.set('phong_KD', nv.phong_KD || '');
  if (h.includes('so_nguoi_phu_thuoc')) row.set('so_nguoi_phu_thuoc', nv.so_nguoi_phu_thuoc || 0);
  if (h.includes('mat_khau') && nv.mat_khau) row.set('mat_khau', nv.mat_khau);
  
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

// ============================================================
// HỢP ĐỒNG (Contracts) — CORE LAYER: English keys
// ============================================================

const HOP_DONG_HEADERS = ['id', 'id_nhan_vien', 'so_hop_dong', 'phong_KD', 'employee_type', 'department', 'contract_type', 'template_file', 'ngay_bat_dau', 'ngay_ket_thuc', 'luong_co_ban', 'ghi_chu', 'created_at'];

export async function getHopDong(): Promise<HopDong[]> {
  const doc = await getDoc();
  let sheet: GoogleSpreadsheetWorksheet;
  try {
    sheet = await getSheet(doc, SHEETS.HOP_DONG);
  } catch (err) {
    console.log('[GSheets] HOP_DONG not found in getHopDong. Auto-creating...');
    sheet = await doc.addSheet({
      title: SHEETS.HOP_DONG,
      headerValues: HOP_DONG_HEADERS
    });
    return [];
  }
  const rows = await sheet.getRows();
  let h = sheet.headerValues;

  // Auto-add missing columns (e.g. luong_co_ban)
  let needsHeaderUpdate = false;
  const newHeaders = [...h];
  for (const expectedHeader of HOP_DONG_HEADERS) {
    if (!newHeaders.includes(expectedHeader)) {
      console.log(`[GSheets] Adding missing column "${expectedHeader}" to HOP_DONG`);
      newHeaders.push(expectedHeader);
      needsHeaderUpdate = true;
    }
  }

  if (needsHeaderUpdate) {
    await sheet.setHeaderRow(newHeaders);
    h = newHeaders; // update local reference
  }

  return rows
    .map(row => {
      const v = row.toObject();
      const id = str(v['id'] || v[h[0]]);
      if (!id) return null;
      return {
        id,
        id_nhan_vien: str(v['id_nhan_vien']),
        so_hop_dong: str(v['so_hop_dong']),
        phong_KD: str(v['phong_KD']),
        employee_type: str(v['employee_type']),
        department: str(v['department']),
        contract_type: str(v['contract_type']),
        template_file: str(v['template_file']),
        ngay_bat_dau: str(v['ngay_bat_dau']),
        ngay_ket_thuc: str(v['ngay_ket_thuc']),
        luong_co_ban: num(v['luong_co_ban']),
        ghi_chu: str(v['ghi_chu']),
        created_at: str(v['created_at']),
      } as HopDong;
    })
    .filter((x): x is HopDong => x !== null);
}

export async function addHopDong(hd: HopDong): Promise<void> {
  const doc = await getDoc();
  let sheet: GoogleSpreadsheetWorksheet;
  try {
    sheet = await getSheet(doc, SHEETS.HOP_DONG);
  } catch (err) {
    console.log('[GSheets] HOP_DONG not found in addHopDong. Auto-creating...');
    sheet = await doc.addSheet({
      title: SHEETS.HOP_DONG,
      headerValues: HOP_DONG_HEADERS
    });
  }
  const rowData: Record<string, string | number> = {};
  rowData['id'] = hd.id || '';
  rowData['id_nhan_vien'] = hd.id_nhan_vien || '';
  rowData['so_hop_dong'] = hd.so_hop_dong || '';
  rowData['phong_KD'] = hd.phong_KD || '';
  rowData['employee_type'] = hd.employee_type || '';
  rowData['department'] = hd.department || '';
  rowData['contract_type'] = hd.contract_type || '';
  rowData['template_file'] = hd.template_file || '';
  rowData['ngay_bat_dau'] = hd.ngay_bat_dau || '';
  rowData['ngay_ket_thuc'] = hd.ngay_ket_thuc || '';
  rowData['luong_co_ban'] = hd.luong_co_ban || 0;
  rowData['ghi_chu'] = hd.ghi_chu || '';
  rowData['created_at'] = hd.created_at || '';

  await sheet.addRow(rowData);
  await addLog(doc, 'CREATE_HD', hd.id, hd.id_nhan_vien, '');
}

export async function updateHopDong(hd: HopDong): Promise<boolean> {
  const doc = await getDoc();
  let sheet: GoogleSpreadsheetWorksheet;
  try {
    sheet = await getSheet(doc, SHEETS.HOP_DONG);
  } catch (err) {
    return false;
  }
  const rows = await sheet.getRows();
  const h = sheet.headerValues;

  const row = rows.find(r => str(r.toObject()['id'] || r.toObject()[h[0]]) === hd.id);
  if (!row) return false;

  row.assign({
    id_nhan_vien: hd.id_nhan_vien || '',
    so_hop_dong: hd.so_hop_dong || '',
    phong_KD: hd.phong_KD || '',
    employee_type: hd.employee_type || '',
    department: hd.department || '',
    contract_type: hd.contract_type || '',
    template_file: hd.template_file || '',
    ngay_bat_dau: hd.ngay_bat_dau || '',
    ngay_ket_thuc: hd.ngay_ket_thuc || '',
    luong_co_ban: hd.luong_co_ban || 0,
    ghi_chu: hd.ghi_chu || '',
  });

  await row.save();
  await addLog(doc, 'UPDATE_HD', hd.id, '', '');
  return true;
}

export async function deleteHopDong(id: string): Promise<boolean> {
  const doc = await getDoc();
  let sheet: GoogleSpreadsheetWorksheet;
  try {
    sheet = await getSheet(doc, SHEETS.HOP_DONG);
  } catch (err) {
    return false;
  }
  const rows = await sheet.getRows();
  const h = sheet.headerValues;

  const row = rows.find(r => str(r.toObject()[h[0]]) === id);
  if (!row) return false;
  await row.delete();
  await addLog(doc, 'DELETE_HD', id, '', '');
  return true;
}

// ============================================================
// BẢNG LƯƠNG (Payroll)
// ============================================================

/**
 * Tự động tạo sheet BANG_LUONG nếu chưa tồn tại.
 */
async function getOrCreateBangLuongSheet(doc: GoogleSpreadsheet): Promise<GoogleSpreadsheetWorksheet> {
  try {
    return await getSheet(doc, SHEETS.BANG_LUONG);
  } catch {
    console.log('[GSheets] BANG_LUONG sheet not found. Auto-creating...');
    return await doc.addSheet({
      title: SHEETS.BANG_LUONG,
      headerValues: [...BANG_LUONG_HEADERS],
    });
  }
}

export async function getBangLuong(): Promise<BangLuong[]> {
  const doc = await getDoc();
  let sheet: GoogleSpreadsheetWorksheet;
  try {
    sheet = await getSheet(doc, SHEETS.BANG_LUONG);
  } catch {
    console.warn('[GSheets] BANG_LUONG sheet does not exist yet — returning empty list.');
    return [];
  }
  const rows = await sheet.getRows();

  return rows
    .map(row => {
      const v = row.toObject();
      // Đọc theo tên cột (không theo vị trí) để an toàn với thứ tự cột
      const id = str(v['id']);
      if (!id) return null;
      return {
        id,
        id_nhan_vien: str(v['id_nhan_vien']),
        thang:        num(v['thang']),
        nam:          num(v['nam']),
        luong_co_ban: num(v['luong_co_ban']),
        doanh_thu:    num(v['doanh_thu']),
        hoa_hong:     num(v['hoa_hong']),
        thuong:       num(v['thuong']),
        phat:         num(v['phat']),
        so_ngay_cong_chuan:       num(v['so_ngay_cong_chuan']),
        so_ngay_lam_viec_thuc_te: num(v['so_ngay_lam_viec_thuc_te']),
        so_ngay_nghi_khong_luong: num(v['so_ngay_nghi_khong_luong']),
        so_gio_ot:     num(v['so_gio_ot']),
        salary_by_day: num(v['salary_by_day']),
        ot_pay:        num(v['ot_pay']),
        bao_hiem:      num(v['bao_hiem']),
        bh_company:    num(v['bh_company']),
        thue:          num(v['thue']),
        tong_luong:    num(v['tong_luong']),
        trang_thai:    (str(v['trang_thai']) || 'draft') as 'draft' | 'confirmed' | 'paid',
        created_at:    str(v['created_at']),
      } as BangLuong;
    })
    .filter((x): x is BangLuong => x !== null);
}

export async function addBangLuong(
  bl: Omit<BangLuong, 'id' | 'created_at'>
): Promise<string> {
  const doc = await getDoc();
  const sheet = await getOrCreateBangLuongSheet(doc);
  const id = `BL_${Date.now()}`;
  const created_at = new Date().toISOString();

  // Ghi theo tên cột — an toàn với thứ tự cột bất kỳ
  await sheet.addRow({
    id,
    id_nhan_vien: bl.id_nhan_vien,
    thang:        Number(bl.thang),
    nam:          Number(bl.nam),
    luong_co_ban: Number(bl.luong_co_ban),
    doanh_thu:    Number(bl.doanh_thu),
    hoa_hong:     Number(bl.hoa_hong),
    thuong:       Number(bl.thuong),
    phat:         Number(bl.phat),
    so_ngay_cong_chuan:       Number(bl.so_ngay_cong_chuan),
    so_ngay_lam_viec_thuc_te: Number(bl.so_ngay_lam_viec_thuc_te),
    so_ngay_nghi_khong_luong: Number(bl.so_ngay_nghi_khong_luong),
    so_gio_ot:     Number(bl.so_gio_ot),
    salary_by_day: Number(bl.salary_by_day),
    ot_pay:        Number(bl.ot_pay),
    bao_hiem:      Number(bl.bao_hiem),
    bh_company:    Number(bl.bh_company),
    thue:          Number(bl.thue),
    tong_luong:    Number(bl.tong_luong),
    trang_thai:    bl.trang_thai || 'draft',
    created_at,
  });

  await addLog(doc, 'CREATE_BL', id, bl.id_nhan_vien, '');
  return id;
}

// --- PAYROLL (DYNAMIC) ---

/**
 * Safe migration: tạo mới hoặc thêm cột còn thiếu vào sheet PAYROLL.
 * KHÔNG xóa cột cũ, KHÔNG ảnh hưởng dữ liệu đã có.
 */
async function getOrCreatePayrollSheet(doc: GoogleSpreadsheet): Promise<GoogleSpreadsheetWorksheet> {
  let sheet = doc.sheetsByTitle[SHEETS.PAYROLL];
  if (!sheet) {
    console.log('[GSheets] PAYROLL sheet not found — creating with full headers...');
    sheet = await doc.addSheet({ title: SHEETS.PAYROLL, headerValues: [...PAYROLL_HEADERS] });
    await sheet.loadHeaderRow();
    return sheet;
  }

  // Load header row (handle empty sheet gracefully)
  try {
    await sheet.loadHeaderRow();
  } catch {
    console.log('[GSheets] PAYROLL: empty sheet, setting initial headers...');
    await sheet.setHeaderRow([...PAYROLL_HEADERS]);
    await sheet.loadHeaderRow();
    return sheet;
  }

  // Safe migration: only APPEND missing columns — never overwrite existing data
  const existing = new Set(sheet.headerValues || []);
  const missing  = [...PAYROLL_HEADERS].filter(h => !existing.has(h));
  if (missing.length > 0) {
    console.log(`[GSheets] PAYROLL migration: adding missing columns [${missing.join(', ')}]`);
    const merged = [...(sheet.headerValues || []), ...missing];
    await sheet.setHeaderRow(merged);
    await sheet.loadHeaderRow();
  }

  console.log(`[GSheets] PAYROLL ready. Headers: [${sheet.headerValues?.join(', ')}]`);
  return sheet;
}

/**
 * Safe migration: tạo mới hoặc thêm cột còn thiếu vào sheet PAYROLL_ITEMS.
 */
async function getOrCreatePayrollItemsSheet(doc: GoogleSpreadsheet): Promise<GoogleSpreadsheetWorksheet> {
  let sheet = doc.sheetsByTitle[SHEETS.PAYROLL_ITEMS];
  if (!sheet) {
    console.log('[GSheets] PAYROLL_ITEMS sheet not found — creating with full headers...');
    sheet = await doc.addSheet({ title: SHEETS.PAYROLL_ITEMS, headerValues: [...PAYROLL_ITEMS_HEADERS] });
    await sheet.loadHeaderRow();
    return sheet;
  }

  try {
    await sheet.loadHeaderRow();
  } catch {
    console.log('[GSheets] PAYROLL_ITEMS: empty sheet, setting initial headers...');
    await sheet.setHeaderRow([...PAYROLL_ITEMS_HEADERS]);
    await sheet.loadHeaderRow();
    return sheet;
  }

  // Safe migration
  const existing = new Set(sheet.headerValues || []);
  const missing  = [...PAYROLL_ITEMS_HEADERS].filter(h => !existing.has(h));
  if (missing.length > 0) {
    console.log(`[GSheets] PAYROLL_ITEMS migration: adding missing columns [${missing.join(', ')}]`);
    const merged = [...(sheet.headerValues || []), ...missing];
    await sheet.setHeaderRow(merged);
    await sheet.loadHeaderRow();
  }

  console.log(`[GSheets] PAYROLL_ITEMS ready. Headers: [${sheet.headerValues?.join(', ')}]`);
  return sheet;
}

export async function getPayrollRecords(thang: number, nam: number): Promise<PayrollRecord[]> {
  const doc = await getDoc();
  let sheet: GoogleSpreadsheetWorksheet;
  try {
    sheet = await getSheet(doc, SHEETS.PAYROLL);
  } catch {
    return [];
  }
  const rows = await sheet.getRows();
  return rows
    .map(r => {
      const v = r.toObject();
      return {
        id: str(v.id),
        id_nhan_vien: str(v.id_nhan_vien),
        thang: num(v.thang),
        nam: num(v.nam),
        gross: num(v.gross),
        total_deduction: num(v.total_deduction),
        net: num(v.net),
        luong_dong_bh: num(v.luong_dong_bh),
        thu_nhap_chiu_thue: num(v.thu_nhap_chiu_thue),
        tong_chi_phi: num(v.tong_chi_phi),
        trang_thai: (str(v.trang_thai) || 'draft') as any,
        locked_at: str(v.locked_at) || undefined,
        created_at: str(v.created_at),
      };
    })
    .filter(p => p.thang === thang && p.nam === nam);
}

export async function getPayrollItems(payrollIds: string[]): Promise<PayrollItemRecord[]> {
  const doc = await getDoc();
  let sheet: GoogleSpreadsheetWorksheet;
  try {
    sheet = await getSheet(doc, SHEETS.PAYROLL_ITEMS);
  } catch {
    return [];
  }
  const rows = await sheet.getRows();
  const ids = new Set(payrollIds);
  return rows
    .map(r => {
      const v = r.toObject();
      return {
        id: str(v.id),
        payroll_id: str(v.payroll_id),
        loai_khoan: str(v.loai_khoan),
        nhom: str(v.nhom) as any,
        so_tien: num(v.so_tien),
        ghi_chu: str(v.ghi_chu),
        tinh_bhxh: str(v.tinh_bhxh) === 'TRUE' || str(v.tinh_bhxh) === 'true',
        tinh_thue: str(v.tinh_thue) === 'TRUE' || str(v.tinh_thue) === 'true',
      };
    })
    .filter(item => ids.has(item.payroll_id));
}

/**
 * Lưu hàng loạt bản ghi lương vào PAYROLL + PAYROLL_ITEMS.
 * Mở kết nối Google Sheets 1 lần duy nhất, load header 1 lần,
 * và ghi tất cả dòng bằng addRows() để tránh vượt quota API.
 */
export async function savePayrollBatch(
  payrollEntries: Array<{
    payroll: Omit<PayrollRecord, 'id' | 'created_at'>;
    items: Omit<PayrollItemRecord, 'id' | 'payroll_id'>[];
  }>
): Promise<{ savedIds: string[]; errors: string[] }> {
  if (payrollEntries.length === 0) {
    return { savedIds: [], errors: [] };
  }

  const doc = await getDoc();
  const pSheet = await getOrCreatePayrollSheet(doc);
  const iSheet = await getOrCreatePayrollItemsSheet(doc);

  const createdAt = new Date().toISOString();
  const savedIds: string[] = [];
  const errors: string[] = [];

  // Build all payroll header rows
  const payrollRows: Record<string, string | number>[] = [];
  const itemRows: Record<string, string | number>[] = [];

  for (const { payroll, items } of payrollEntries) {
    const payrollId = `PR_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    savedIds.push(payrollId);

    payrollRows.push({
      id: payrollId,
      id_nhan_vien: payroll.id_nhan_vien,
      thang: payroll.thang,
      nam: payroll.nam,
      gross: payroll.gross,
      total_deduction: payroll.total_deduction,
      net: payroll.net,
      luong_dong_bh: payroll.luong_dong_bh,
      thu_nhap_chiu_thue: payroll.thu_nhap_chiu_thue,
      tong_chi_phi: payroll.tong_chi_phi,
      trang_thai: payroll.trang_thai,
      locked_at: payroll.locked_at || '',
      created_at: createdAt,
    });

    for (const item of items) {
      itemRows.push({
        id: `PRI_${Math.random().toString(36).substr(2, 9)}`,
        payroll_id: payrollId,
        loai_khoan: item.loai_khoan,
        nhom: item.nhom,
        so_tien: item.so_tien,
        ghi_chu: item.ghi_chu || '',
        tinh_bhxh: item.tinh_bhxh ? 'TRUE' : 'FALSE',
        tinh_thue: item.tinh_thue ? 'TRUE' : 'FALSE',
      });
    }
  }

  // Batch write all PAYROLL rows
  console.log(`[GSheets] Batch writing ${payrollRows.length} payroll rows...`);
  try {
    await pSheet.addRows(payrollRows);
  } catch (err: any) {
    console.error(`[GSheets] Batch addRows failed for PAYROLL:`, err.message);
    return { savedIds: [], errors: [`PAYROLL batch write failed: ${err.message}`] };
  }

  // Batch write all PAYROLL_ITEMS rows
  if (itemRows.length > 0) {
    console.log(`[GSheets] Batch writing ${itemRows.length} payroll item rows...`);
    try {
      await iSheet.addRows(itemRows);
    } catch (err: any) {
      console.error(`[GSheets] Batch addRows failed for PAYROLL_ITEMS:`, err.message);
      errors.push(`PAYROLL_ITEMS batch write failed: ${err.message}`);
    }
  }

  // Single log entry for the batch operation
  await addLog(doc, 'CREATE_PAYROLL_BATCH', `${savedIds.length} records`, '', '');

  return { savedIds, errors };
}

/**
 * Cập nhật trạng thái hoặc thông tin bản ghi bảng lương.
 * Hỗ trợ cả bảng mới (PAYROLL) và bảng cũ (BANG_LUONG).
 */
export async function updateBangLuong(
  id: string,
  updates: Partial<Pick<BangLuong, 'trang_thai' | 'thuong' | 'phat' | 'tong_luong' | 'so_ngay_nghi_khong_luong' | 'so_gio_ot'>> & { locked_at?: string }
): Promise<boolean> {
  const doc = await getDoc();
  const sheetName = id.startsWith('PR_') ? SHEETS.PAYROLL : SHEETS.BANG_LUONG;
  
  let sheet: GoogleSpreadsheetWorksheet;
  try {
    sheet = await getSheet(doc, sheetName);
  } catch {
    return false;
  }
  
  const rows = await sheet.getRows();
  const row = rows.find(r => str(r.toObject()['id']) === id);
  if (!row) return false;

  const currentStatus = str(row.toObject()['trang_thai']);
  if (currentStatus === 'locked') {
    throw new Error('Bản ghi đã khóa, không thể cập nhật.');
  }

  // Cập nhật trạng thái
  if (updates.trang_thai !== undefined) {
    row.set('trang_thai', updates.trang_thai);
    if (updates.trang_thai === 'locked') {
      row.set('locked_at', new Date().toISOString());
    }
  }
  
  // Với bản ghi cũ BANG_LUONG, cho phép cập nhật thêm các field khác nếu cần
  if (!id.startsWith('PR_')) {
    if (updates.thuong     !== undefined) row.set('thuong',     Number(updates.thuong));
    if (updates.phat       !== undefined) row.set('phat',       Number(updates.phat));
    if (updates.so_ngay_nghi_khong_luong !== undefined) row.set('so_ngay_nghi_khong_luong', Number(updates.so_ngay_nghi_khong_luong));
    if (updates.so_gio_ot !== undefined) row.set('so_gio_ot', Number(updates.so_gio_ot));
    if (updates.tong_luong !== undefined) row.set('tong_luong', Number(updates.tong_luong));
  }
  
  await row.save();
  await addLog(doc, 'UPDATE_PAYROLL', id, '', '');
  return true;
}

/**
 * Xóa bản ghi bảng lương.
 */
export async function deleteBangLuong(id: string): Promise<boolean> {
  const doc = await getDoc();
  const sheetName = id.startsWith('PR_') ? SHEETS.PAYROLL : SHEETS.BANG_LUONG;
  
  let sheet: GoogleSpreadsheetWorksheet;
  try {
    sheet = await getSheet(doc, sheetName);
  } catch {
    return false;
  }
  
  const rows = await sheet.getRows();
  const row = rows.find(r => str(r.toObject()['id']) === id);
  if (!row) return false;

  if (str(row.toObject()['trang_thai']) === 'locked') {
    throw new Error('Bản ghi đã khóa, không thể xóa.');
  }
  await row.delete();

  // Xóa các items tương ứng trong PAYROLL_ITEMS nếu là bản ghi mới
  if (id.startsWith('PR_')) {
    try {
      const itemsSheet = await getSheet(doc, SHEETS.PAYROLL_ITEMS);
      const itemRows = await itemsSheet.getRows();
      // Iterate backwards when deleting multiple rows to avoid index shifting issues
      for (let i = itemRows.length - 1; i >= 0; i--) {
        if (str(itemRows[i].toObject()['payroll_id']) === id) {
          await itemRows[i].delete();
        }
      }
    } catch {
      // Ignored: If PAYROLL_ITEMS doesn't exist or deletion fails, main record is already gone
    }
  }

  await addLog(doc, 'DELETE_PAYROLL', id, '', '');
  return true;
}

// --- WORK CALENDAR ---
export async function getWorkCalendar(): Promise<WorkCalendar[]> {
  const doc = await getDoc();
  let sheet: GoogleSpreadsheetWorksheet;
  try {
    sheet = await getSheet(doc, SHEETS.WORK_CALENDAR);
  } catch {
    return [];
  }
  const rows = await sheet.getRows();
  return rows.map(r => {
    const v = r.toObject();
    return {
      date: str(v.date),
      day_type: str(v.day_type) as any,
      description: str(v.description),
      weight: num(v.weight),
    };
  });
}

// --- ATTENDANCE RAW ---
export async function getAttendanceRaw(thang: number, nam: number): Promise<AttendanceRaw[]> {
  const doc = await getDoc();
  let sheet: GoogleSpreadsheetWorksheet;
  try {
    sheet = await getSheet(doc, SHEETS.ATTENDANCE_RAW);
  } catch {
    return [];
  }
  const rows = await sheet.getRows();
  return rows
    .map(r => {
      const v = r.toObject();
      return {
        id: str(v.id),
        id_nhan_vien: str(v.id_nhan_vien),
        date: str(v.date),
        check_in: str(v.check_in),
        check_out: str(v.check_out),
      };
    })
    .filter(a => {
      const d = new Date(a.date);
      return (d.getMonth() + 1) === thang && d.getFullYear() === nam;
    });
}

// --- SHIFTS ---
export async function getShifts(): Promise<Shift[]> {
  const doc = await getDoc();
  let sheet: GoogleSpreadsheetWorksheet;
  try {
    sheet = await getSheet(doc, SHEETS.SHIFTS);
  } catch {
    return [];
  }
  const rows = await sheet.getRows();
  return rows.map(r => {
    const v = r.toObject();
    return {
      id: str(v.id),
      name: str(v.name),
      start_time: str(v.start_time),
      end_time: str(v.end_time),
      break_start: str(v.break_start),
      break_end: str(v.break_end),
      grace_period: num(v.grace_period),
    };
  });
}

// --- PAYROLL ADJUSTMENTS ---
export async function getPayrollAdjustments(thang: number, nam: number): Promise<PayrollAdjustment[]> {
  const doc = await getDoc();
  let sheet: GoogleSpreadsheetWorksheet;
  try {
    sheet = await getSheet(doc, SHEETS.PAYROLL_ADJUSTMENTS);
  } catch {
    return [];
  }
  const rows = await sheet.getRows();
  return rows
    .map(r => {
      const v = r.toObject();
      return {
        id: str(v.id),
        id_nhan_vien: str(v.id_nhan_vien),
        thang: num(v.thang),
        nam: num(v.nam),
        type: str(v.type) as any,
        amount: num(v.amount),
        reason: str(v.reason),
      };
    })
    .filter(adj => adj.thang === thang && adj.nam === nam);
}
