// ============================================================
// CRM BĐS — Google Sheets Service (Server-side only)
// Hardened for Vercel serverless production
// ============================================================
import { GoogleSpreadsheet, GoogleSpreadsheetWorksheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import type { DuAn, NhanVien, KhachHang, Pipeline, CongViec, DanhMuc, HopDong, BangLuong, PayrollAdjustment, PayrollRecord, PayrollItemRecord, StackingSheetMeta, StackingUnit, PhanKhachConfig, ChamCongNgoai } from './types';

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

let cachedDoc: GoogleSpreadsheet | null = null;
let lastLoadTime = 0;
const CACHE_DURATION = 60000; // 1 minute cache for sheet metadata

async function getDoc(): Promise<GoogleSpreadsheet> {
  const { sheetId } = validateEnvVars();

  const now = Date.now();
  if (cachedDoc && (now - lastLoadTime < CACHE_DURATION)) {
    return cachedDoc;
  }

  try {
    const doc = new GoogleSpreadsheet(sheetId, getJWT());
    await doc.loadInfo();
    cachedDoc = doc;
    lastLoadTime = now;
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
  PAYROLL_ADJUSTMENTS: 'PAYROLL_ADJUSTMENTS',
  PAYROLL: 'PAYROLL',
  PAYROLL_ITEMS: 'PAYROLL_ITEMS',
  NHIEM_VU: 'NHIEM_VU',
  TAI_CHINH_HISTORY: 'TAI_CHINH_HISTORY',
  CHAM_CONG_NGOAI: 'CHAM_CONG_NGOAI',
} as const;

/**
 * Recover leading zeros stripped by Google Sheets number auto-detection.
 * e.g. "1" → "0001", "44" → "0044", "0001" → "0001" (idempotent)
 * Only applies to purely numeric IDs with 1–4 digits (matches the 0001-9999 format).
 */
function padEmployeeId(id: string): string {
  if (!id) return '';
  if (/^\d{1,4}$/.test(id)) return id.padStart(4, '0');
  return id;
}

// Exact column headers of the BANG_LUONG sheet (must match Google Sheets exactly)
const BANG_LUONG_HEADERS = [
  'id', 'id_nhan_vien', 'thang', 'nam',
  'luong_co_ban', 'doanh_thu', 'hoa_hong', 'thuong', 'phat',
  'so_ngay_cong_chuan', 'so_ngay_lam_viec_thuc_te', 'so_ngay_nghi_khong_luong', 'so_gio_ot',
  'salary_by_day', 'ot_pay', 'bao_hiem', 'bh_company', 'thue',
  'tong_luong', 'trang_thai', 'isProbation', 'isCollaborator', 'isIntern', 'created_at',
] as const;

const PAYROLL_HEADERS = [
  'id', 'id_nhan_vien', 'thang', 'nam',
  'gross', 'total_deduction', 'net',
  'luong_dong_bh', 'thu_nhap_chiu_thue', 'tong_chi_phi',
  'trang_thai', 'isProbation', 'isCollaborator', 'isIntern', 'locked_at', 'created_at'
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

  // Handle percentage sign
  const isPercent = raw.includes('%');

  // Handle scientific notation (e.g., "5E+9")
  if (/[eE][+-]?\d+/.test(raw)) {
    const n = Number(raw.replace('%', ''));
    const result = isNaN(n) ? 0 : n;
    return isPercent ? result / 100 : result;
  }
  
  // Remove spaces, currency symbols, and any non-numeric/separator chars
  // Keep dots and commas
  let cleaned = raw.replace(/[^\d.,-]/g, '');
  if (!cleaned) return 0;

  // Detect separator style:
  // "5,000,000,000" (commas as thousands) or "5.000.000.000" (dots as thousands)
  // "1,234.56" (comma=thousands, dot=decimal) or "1.234,56" (dot=thousands, comma=decimal)
  
  const commaCount = (cleaned.match(/,/g) || []).length;
  const dotCount = (cleaned.match(/\./g) || []).length;
  
  if (commaCount > 1 && dotCount === 0) {
    // 5,000,000 -> 5000000
    cleaned = cleaned.replace(/,/g, '');
  } else if (dotCount > 1 && commaCount === 0) {
    // 5.000.000 -> 5000000
    cleaned = cleaned.replace(/\./g, '');
  } else if (commaCount === 1 && dotCount === 0) {
    // Ambiguous: 2,000 could be 2.0 or 2000
    // If it's a percentage (2,000%), it's almost certainly a decimal in VN locale
    if (isPercent || !/,\d{3}$/.test(cleaned)) {
      cleaned = cleaned.replace(',', '.');
    } else {
      // Still treat as thousands for large integers like "5,000" VND
      cleaned = cleaned.replace(/,/g, '');
    }
  } else if (dotCount === 1 && commaCount === 0) {
    // Ambiguous: 2.000
    if (/\.\d{3}$/.test(cleaned) && !isPercent) {
      cleaned = cleaned.replace(/\./g, '');
    }
  } else if (dotCount >= 1 && commaCount === 1) {
    // 1,234.56 or 1.234,56
    const commaIndex = cleaned.indexOf(',');
    const dotIndex = cleaned.indexOf('.');
    if (commaIndex < dotIndex) {
      // 1,234.56 (US)
      cleaned = cleaned.replace(/,/g, '');
    } else {
      // 1.234,56 (VN)
      cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    }
  }
  
  let result = Number(cleaned);
  if (isNaN(result)) result = 0;
  
  return isPercent ? result / 100 : result;
}


function toMonthKey(dateStr: string): string {
  if (!dateStr) return '';
  
  // Thử parse định dạng DD/MM/YYYY (Việt Nam) trước
  const parts = dateStr.split(/[/-]/);
  if (parts.length === 3) {
    const p1 = parseInt(parts[0]);
    const p2 = parseInt(parts[1]);
    const p3 = parseInt(parts[2]);
    
    // Nếu p2 (tháng) <= 12 và p3 (năm) > 2000
    // Ưu tiên p2 là tháng (định dạng DD/MM/YYYY)
    if (p2 >= 1 && p2 <= 12 && p3 > 2000) {
      return `${String(p2).padStart(2, '0')}-${p3}`;
    }
  }

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
    trang_thai_nhan_vien: [],
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
    pushIfValid('khu_vuc', result.khu_vuc);
    pushIfValid('gioi_tinh', result.gioi_tinh);
    pushIfValid('phong_KD', result.phong_KD);
  }

  // Đọc employee_types và trang_thai_nhan_vien trực tiếp từ sheet NHAN_VIEN
  // để đảm bảo luôn đồng bộ với dữ liệu thực tế
  try {
    const nvSheet = await getSheet(doc, SHEETS.NHAN_VIEN);
    const nvRows = await nvSheet.getRows();
    const nvH = nvSheet.headerValues;

    const employeeTypeSet = new Set<string>();
    const trangThaiSet = new Set<string>();

    // Danh sách trạng thái mặc định — luôn hiển thị dù chưa có nhân viên nào dùng
    const DEFAULT_TRANG_THAI_NV = [
      'Chính thức', 'CTV', 'Đang làm', 'Học viên', 'Nghỉ sinh', 'Nghỉ việc', 'Thử việc'
    ];
    DEFAULT_TRANG_THAI_NV.forEach(tt => trangThaiSet.add(tt));

    for (const row of nvRows) {
      const v = row.toObject();
      // employee_type is column index 4
      const empType = nvH[4] ? str(v[nvH[4]]) : '';
      if (empType) employeeTypeSet.add(empType);
      // trang_thai is column index 5
      const trangThai = nvH[5] ? str(v[nvH[5]]) : '';
      if (trangThai) trangThaiSet.add(trangThai);
    }

    result.employee_types = Array.from(employeeTypeSet).sort();
    result.trang_thai_nhan_vien = Array.from(trangThaiSet).sort();
  } catch (err) {
    console.warn('[GSheets] Could not read NHAN_VIEN for dropdown values:', err);
    // Fallback defaults
    result.employee_types = [];
    result.trang_thai_nhan_vien = ['Chính thức', 'CTV', 'Đang làm', 'Học viên', 'Nghỉ sinh', 'Nghỉ việc', 'Thử việc'];
  }

  return result;
}

export async function getDuAn(): Promise<DuAn[]> {
  const doc = await getDoc();
  const sheet = await getSheet(doc, SHEETS.DU_AN);
  let h = sheet.headerValues;

  const missingDuAnCols = ['stacking_config', 'truong_nhom', 'ds_sale'].filter(c => !h.includes(c));
  if (missingDuAnCols.length > 0) {
    h = [...h, ...missingDuAnCols];
    await sheet.setHeaderRow(h);
  }

  const rows = await sheet.getRows();

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
        link_tai_lieu: str(v[h[5]]),
        chu_dau_tu: str(v[h[6]]),
        link_du_an: str(v[h[7]]),
        stacking_config: str(v['stacking_config'] ?? ''),
        truong_nhom: str(v['truong_nhom'] ?? ''),
        ds_sale: str(v['ds_sale'] ?? ''),
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
  if (!h.includes('vai_tro')) {
    console.log('[GSheets] Adding missing column "vai_tro" to NHAN_VIEN');
    newHeaders.push('vai_tro');
    needsHeaderUpdate = true;
  }
  if (!h.includes('ql_truc_tiep')) {
    console.log('[GSheets] Adding missing column "ql_truc_tiep" to NHAN_VIEN');
    newHeaders.push('ql_truc_tiep');
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
    // Read by explicit column name first; fall back to position for legacy sheets
    // padEmployeeId recovers leading zeros stripped by Sheets auto-detection (e.g. "0001" → stored as 1 → read as "1" → restored to "0001")
    let id = padEmployeeId(str(v['id_nhan_vien'] ?? v[h[0]]));
    const hoTen = str(v['ho_ten'] ?? v[h[1]]);

    // Skip completely empty rows
    if (!id && !hoTen) continue;

    // Auto-repair: generate ID for imported rows missing id_nhan_vien
    if (!id && hoTen) {
      id = `NV${Date.now()}`;
      try {
        row.set('id_nhan_vien', id);
        await row.save();
        console.log(`[GSheets] Auto-generated id_nhan_vien="${id}" for "${hoTen}"`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[GSheets] Failed to backfill ID for "${hoTen}":`, msg);
        continue; // Skip this row if we can't save
      }
    }

    const baseNhanVien = {
      id_nhan_vien: id,
      ho_ten: hoTen,
      so_dien_thoai: str(v['so_dien_thoai']),
      email: str(v['email']),
      employee_type: str(v['employee_type']),
      trang_thai: str(v['trang_thai']),
      so_cccd: str(v['so_cccd']),
      ngay_cap: str(v['ngay_cap']),
      noi_cap: str(v['noi_cap']),
      HKTT: str(v['HKTT']),
      ngay_sinh: str(v['ngay_sinh']),
      gioi_tinh: str(v['gioi_tinh']),
      ma_so_thue: str(v['ma_so_thue']),
      so_tk_ngan_hang: str(v['so_tk_ngan_hang']),
      ten_ngan_hang_thu_huong: str(v['ten_ngan_hang_thu_huong']),
      avatar_url: str(v['avatar_url']),
      so_nguoi_phu_thuoc: num(v['so_nguoi_phu_thuoc'] || v['nguoi_phu_thuoc']),
      mat_khau: str(v['mat_khau']),
    };

    // Backward compatibility: previous bug saved vai_tro into ngay_tao column (h[15])
    const rawNgayTao = str(v['ngay_tao']);
    const isVaiTroInNgayTao = rawNgayTao === 'Admin' || rawNgayTao === 'Sale' || rawNgayTao === 'HR';

    const finalVaiTro = v['vai_tro'] ? str(v['vai_tro']) : (isVaiTroInNgayTao ? rawNgayTao : 'Sale');
    const finalNgayTao = isVaiTroInNgayTao ? '' : rawNgayTao;

    result.push({
      ...baseNhanVien,
      ngay_tao: finalNgayTao,
      vai_tro: finalVaiTro,
      khu_vuc: v['khu_vuc'] ? str(v['khu_vuc']) : '',
      phong_KD: v['phong_KD'] ? str(v['phong_KD']) : '',
      ql_truc_tiep: str(v['ql_truc_tiep']) || undefined,
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

  const h = sheet.headerValues;
  const missingKHCols = [
    'du_an', 'sale_lan_1', 'ghi_chu_lan_1', 'sale_lan_2', 'ghi_chu_lan_2', 'sale_lan_3', 'ghi_chu_lan_3',
    'telesale_phu_trach', 'sale_nhan_khach', 'trang_thai_cham_soc', 'muc_do_quan_tam',
    'ngay_lien_he_cuoi', 'ngay_lien_he_tiep', 'so_lan_lien_he', 'lich_su_cham_soc',
    'trang_thai_ban_giao', 'ban_giao_luc', 'sale_xac_nhan_luc', 'lich_su_ban_giao',
  ]
    .filter(c => !h.includes(c));
  if (missingKHCols.length > 0) {
    await sheet.setHeaderRow([...h, ...missingKHCols]);
  }

  const rows = await sheet.getRows();
  const headers = sheet.headerValues;

  return rows
    .map(row => {
      const v = row.toObject();
      const id = str(v[headers[0]]);
      if (!id) return null;
      const ten = str(v[headers[2]]);
      const sdt = str(v[headers[3]]);
      return {
        id_khach_hang:  id,
        ngay_tao:       str(v[headers[1]]),
        ten_KH:         ten,
        so_dien_thoai:  sdt,
        email:          str(v[headers[4]]),
        nguon:          str(v[headers[5]]),
        nhu_cau:        str(v[headers[6]]),
        ghi_chu:        str(v[headers[7]]),
        sale_phu_trach: str(v[headers[8]]),
        label_khach:    str(v[headers[9]]) || `${ten} - ${sdt}`,
        du_an:          str(v['du_an'] || ''),
        sale_lan_1:     str(v['sale_lan_1'] || ''),
        ghi_chu_lan_1:  str(v['ghi_chu_lan_1'] || ''),
        sale_lan_2:     str(v['sale_lan_2'] || ''),
        ghi_chu_lan_2:  str(v['ghi_chu_lan_2'] || ''),
        sale_lan_3:     str(v['sale_lan_3'] || ''),
        ghi_chu_lan_3:  str(v['ghi_chu_lan_3'] || ''),
        telesale_phu_trach: str(v['telesale_phu_trach'] || ''),
        sale_nhan_khach: str(v['sale_nhan_khach'] || ''),
        trang_thai_cham_soc: (str(v['trang_thai_cham_soc']) || 'Chưa gọi') as KhachHang['trang_thai_cham_soc'],
        muc_do_quan_tam: (str(v['muc_do_quan_tam']) || 'Chưa xác định') as KhachHang['muc_do_quan_tam'],
        ngay_lien_he_cuoi: str(v['ngay_lien_he_cuoi'] || ''),
        ngay_lien_he_tiep: str(v['ngay_lien_he_tiep'] || ''),
        so_lan_lien_he: num(v['so_lan_lien_he']),
        lich_su_cham_soc: str(v['lich_su_cham_soc'] || ''),
        trang_thai_ban_giao: (str(v['trang_thai_ban_giao']) || 'Chưa bàn giao') as KhachHang['trang_thai_ban_giao'],
        ban_giao_luc: str(v['ban_giao_luc'] || ''),
        sale_xac_nhan_luc: str(v['sale_xac_nhan_luc'] || ''),
        lich_su_ban_giao: str(v['lich_su_ban_giao'] || ''),
      } as KhachHang;
    })
    .filter((x): x is KhachHang => x !== null);
}

/** Export projection: creates a new tab in the configured CRM spreadsheet. */
export async function exportQualityProjectionToGoogleSheet(
  headers: readonly string[],
  records: Record<string, string | number>[],
): Promise<{ title: string; url: string; rowCount: number }> {
  const doc = await getDoc();
  const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const title = `DATA_CL_${timestamp}`.slice(0, 99);
  const sheet = await doc.addSheet({ title, headerValues: [...headers] });
  if (records.length > 0) await sheet.addRows(records);
  const { sheetId } = validateEnvVars();
  return { title, url: `https://docs.google.com/spreadsheets/d/${sheetId}/edit#gid=${sheet.sheetId}`, rowCount: records.length };
}

export async function getPipeline(): Promise<Pipeline[]> {
  const doc = await getDoc();
  const sheet = await getSheet(doc, SHEETS.PIPELINE);
  const rows = await sheet.getRows();
  const h = sheet.headerValues;

  return rows
    .map(row => {
      const v = row.toObject();
      
      // Helper đọc cột theo tên chữ một cách an toàn và bền vững
      const getVal = (colName: string) => {
        // Tìm key thực tế trong v khớp khi đã loại bỏ khoảng trắng / newline
        const cleanCol = colName.replace(/\s+/g, '').toLowerCase();
        const actualKey = Object.keys(v).find(k => k.replace(/\s+/g, '').toLowerCase() === cleanCol);
        if (actualKey) return str(v[actualKey]);

        if (colName === 'tkkd') {
          const aliasKey = Object.keys(v).find(k => {
            const ck = k.replace(/\s+/g, '').toLowerCase();
            return ck === 'tkkd' || ck.includes('thưkýkinhdoanh') || ck.includes('thukykinhdoanh');
          });
          if (aliasKey) return str(v[aliasKey]);
        }

        if (colName === 'ngay_coc') {
          const aliasKey = Object.keys(v).find(k => {
            const ck = k.replace(/\s+/g, '').toLowerCase();
            return ck === 'ngaycoc' || ck === 'ngàycọc' || ck === 'ngay_coc' || ck.includes('ngàycọc');
          });
          if (aliasKey) return str(v[aliasKey]);
        }

        // Fallback backward-compatibility
        const idx = [
          'id_pipeline', 'id_khach_hang', 'giai_doan', 'gia_tri_thuc_te',
          'sale_phu_trach', 'id_du_an', 'ten_du_an', 'hoa_hong', 'tien_hoa_hong',
          'ngay_cap_nhat', 'thang'
        ].indexOf(colName);
        if (idx !== -1 && h[idx]) return str(v[h[idx]]);
        return '';
      };

      const getNum = (colName: string) => {
        const cleanCol = colName.replace(/\s+/g, '').toLowerCase();
        const actualKey = Object.keys(v).find(k => k.replace(/\s+/g, '').toLowerCase() === cleanCol);
        if (actualKey) return num(v[actualKey]);

        if (colName === 'gia_tri_thuc_te') {
          const aliasKey = Object.keys(v).find(k => {
            const ck = k.replace(/\s+/g, '').toLowerCase();
            return ck === 'giatrithucte' || ck === 'giatinhhh' || ck.includes('giátínhhh') || ck.includes('giatinhhh');
          });
          if (aliasKey) return num(v[aliasKey]);
        }

        if (colName === 'thuong_nong') {
          const aliasKey = Object.keys(v).find(k => {
            const ck = k.replace(/\s+/g, '').toLowerCase();
            return ck.includes('thuongnong') || ck.includes('thưởngnóng');
          });
          if (aliasKey) {
            const rawVal = str(v[aliasKey]);
            if (rawVal.includes('%') || !/^\d+/.test(rawVal.replace(/[.,\s]/g, ''))) {
              return 0;
            }
            return num(rawVal);
          }
        }

        if (colName === 'phi_tkkd') {
          const aliasKey = Object.keys(v).find(k => {
            const ck = k.replace(/\s+/g, '').toLowerCase();
            return ck === 'phitkkd' || ck.includes('phítkkd') || ck.includes('phi_tkkd');
          });
          if (aliasKey) return num(v[aliasKey]);
        }

        const idx = [
          'id_pipeline', 'id_khach_hang', 'giai_doan', 'gia_tri_thuc_te',
          'sale_phu_trach', 'id_du_an', 'ten_du_an', 'hoa_hong', 'tien_hoa_hong',
          'ngay_cap_nhat', 'thang'
        ].indexOf(colName);
        if (idx !== -1 && h[idx]) return num(v[h[idx]]);
        return 0;
      };

      const id = getVal('id_pipeline');
      if (!id) return null;

      const ngayCapNhat = getVal('ngay_cap_nhat');
      let thang = getVal('thang');
      if (!thang || thang === 'Invalid Date' || thang === '[object Object]') {
        thang = toMonthKey(ngayCapNhat);
      }

      return {
        id_pipeline: id,
        id_khach_hang: getVal('id_khach_hang'),
        giai_doan: getVal('giai_doan'),
        gia_tri_thuc_te: getNum('gia_tri_thuc_te'),
        sale_phu_trach: getVal('sale_phu_trach'),
        id_du_an: getVal('id_du_an'),
        ten_du_an: getVal('ten_du_an'),
        hoa_hong: getNum('hoa_hong'),
        tien_hoa_hong: getNum('tien_hoa_hong'),
        ngay_cap_nhat: ngayCapNhat,
        ngay_coc: getVal('ngay_coc'),
        thang,

        // Các cột mới đồng bộ từ Victory
        ma_can: getVal('ma_can'),
        loai_can: getVal('loai_can'),
        gdda: getVal('gdda'),
        gdkd: getVal('gdkd'),
        phong_kd: getVal('phong_kd'),
        ty_le_tra_sale: getNum('ty_le_tra_sale'),
        ty_le_kh: getNum('ty_le_kh'),
        ty_le_gdda: getNum('ty_le_gdda'),
        ty_le_gdkd: getNum('ty_le_gdkd'),
        ty_le_mkt: getNum('ty_le_mkt'),
        phi_tra_sale: getNum('phi_tra_sale'),
        phi_tra_kh: getNum('phi_tra_kh'),
        phi_tra_gdda: getNum('phi_tra_gdda'),
        phi_tra_gdkd: getNum('phi_tra_gdkd'),
        phi_tra_mkt: getNum('phi_tra_mkt'),
        phi_admin: getNum('phi_admin'),
        loi_nhuan: getNum('loi_nhuan'),
        thuong_nong: (() => {
          const val = getNum('thuong_nong');
          return val < 10000 ? 0 : val;
        })(),
        tkkd: getVal('tkkd'),
        phi_tkkd: getNum('phi_tkkd'),
        ho_ten_kh: getVal('ho_ten_kh'),
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

/**
 * Đọc sheet NHIEM_VU: "Vị trí" → "Công việc phải làm"
 * Trả về map { [vi_tri]: cong_viec_phai_lam }
 * Dùng để tự động điền {{cong_viec_phai_lam}} vào mẫu hợp đồng theo chức danh.
 */
export async function getNhiemVu(): Promise<Record<string, string>> {
  const doc = await getDoc();
  let sheet: GoogleSpreadsheetWorksheet;
  try {
    sheet = await getSheet(doc, SHEETS.NHIEM_VU);
  } catch {
    console.warn('[GSheets] NHIEM_VU sheet not found — returning empty map.');
    return {};
  }
  const rows = await sheet.getRows();
  const h = sheet.headerValues;
  console.log('[GSheets] NHIEM_VU headers:', h);

  const result: Record<string, string> = {};
  for (const row of rows) {
    const v = row.toObject();
    // Hỗ trợ cả tên cột tiếng Anh (employee_type / cong_viec_phai_lam)
    // lẫn tiếng Việt ("Vị trí" / "Công việc phải làm")
    const viTri = str(
      v['employee_type'] ??
      v['Vị trí'] ??
      v['vi_tri'] ??
      v['chuc_danh'] ??
      (h[0] ? v[h[0]] : '') ??
      ''
    );
    const congViec = str(
      v['cong_viec_phai_lam'] ??
      v['Công việc phải làm'] ??
      v['cong_viec'] ??
      (h[1] ? v[h[1]] : '') ??
      ''
    );
    if (viTri) result[viTri] = congViec;
  }
  console.log('[GSheets] NHIEM_VU loaded:', Object.keys(result).length, 'entries:', Object.keys(result));
  return result;
}

// ============================================================
// TỔNG HỢP GIAO DỊCH — External sheet reader
// ============================================================

export interface TongHopRow {
  du_an: string;
  loai_hinh: string;   // Cao tầng / Thấp tầng
  loai_nguon: string;  // Nội bộ / Đối tác
  gia_tri: number;
  chi_nhanh: string;   // Chi nhánh / Vùng KD
  phong_kd: string;    // Phòng KD
  sale_phu_trach: string;
  ngay_ky: string;     // Ngày ký (for date filtering)
  ngay_coc?: string;
}

// Normalize Vietnamese header text for flexible column matching
function normVi(s: string): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/\s+/g, '');
}

export async function getTongHopGiaoDich(
  fromDate?: Date,
  toDate?: Date,
  dateSource: 'signed' | 'deposit' = 'signed'
): Promise<TongHopRow[]> {
  const sheetId = process.env.TONG_HOP_SHEET_ID;
  if (!sheetId) {
    console.warn('[GSheets] TONG_HOP_SHEET_ID not set — skipping getTongHopGiaoDich');
    return [];
  }

  try {
    const doc = new GoogleSpreadsheet(sheetId, getJWT());
    await doc.loadInfo();

    // Access by gid=444476674 or by name
    const sheet =
      doc.sheetsById[444476674] ||
      doc.sheetsByTitle['Tổng hợp giao dịch chi tiết'] ||
      doc.sheetsByTitle['Tong hop giao dich chi tiet'] ||
      Object.values(doc.sheetsByTitle)[0];

    if (!sheet) {
      console.warn('[GSheets] "Tổng hợp giao dịch chi tiết" sheet not found in TONG_HOP_SHEET_ID');
      return [];
    }

    // Headers are at row 3 (rows 1–2 are decorative/merged). Same layout as getTinhTrangGiaoDich.
    try {
      await sheet.loadHeaderRow(3);
    } catch {
      await sheet.loadHeaderRow(1);
    }
    const rows = await sheet.getRows();
    const h = sheet.headerValues;

    console.log('[TongHop] Sheet:', sheet.title, '— headers:', h.join(', '));

    // Find a column whose normalized name matches any of the given patterns
    const findCol = (...patterns: string[]): string | null => {
      for (const col of h) {
        const norm = normVi(col);
        if (patterns.some(p => norm.includes(p))) return col;
      }
      return null;
    };

    const colGiaTri  = findCol('giatinhhh', 'giatri', 'doanhso', 'giaban', 'tongtien', 'giatrihd', 'doanhso');
    // Prioritize exact "Loại căn" column (apartment type codes: 1BR, 2BR, etc.)
    // before broader "Loại hình" patterns, to avoid grabbing the wrong column
    const colLoaiHinh = h.find(c => normVi(c) === 'loaican')
      || h.find(c => { const n = normVi(c); return n.includes('loai') && n.includes('can') && !n.includes('hinh'); })
      || findCol('loaihinhcan', 'loaihinh', 'phanloai', 'caothap', 'tang');
    const colNguon   = findCol('nguon', 'loainguon', 'loaigd', 'noibo', 'doitac', 'phanloaigd', 'loaihinhtd');
    const colChiNhanh = findCol('chinhanh', 'vuongkd', 'khuvuc', 'region', 'mien', 'vung');
    const colPhongKD = findCol('phongkd', 'phongban', 'khoikd', 'nhomkd', 'team');
    const colSale = findCol('salephutrach', 'sale', 'nhanvien', 'nguoiphutrach', 'tuvan', 'chamsoc');
    const colDuAn    = findCol('duan', 'tenduan', 'tenduan', 'project');
    const colNgayCocStrict = h.find(c => normVi(c) === 'ngaycoc')
      || h.find(c => normVi(c).startsWith('ngaycoc'));
    const colNgaySigned = h.find(c => { const n = normVi(c); return n.includes('ngayttdc') || n.includes('ngayvbtt') || n.includes('ngayky'); })
      || h.find(c => { const n = normVi(c); return (n.includes('ngay') || n.includes('date')) && !n.includes('thang') && !n.includes('tuan') && !n.includes('coc'); })
      || null;

    console.log('[TongHop] Column mapping:', { colGiaTri, colLoaiHinh, colNguon, colChiNhanh, colPhongKD, colSale, colDuAn, colNgayCocStrict, colNgaySigned, dateSource });

    return rows
      .map(row => {
        const v = row.toObject();
        const gTri = colGiaTri ? num(v[colGiaTri]) : 0;
        if (!gTri || gTri <= 0) return null;

        const rawNgayCoc = colNgayCocStrict ? str(v[colNgayCocStrict]) : '';
        const rawNgayKy = colNgaySigned ? str(v[colNgaySigned]) : '';
        const rawNgayTinhDoanhSo = dateSource === 'deposit' ? rawNgayCoc : rawNgayKy;
        if (!rawNgayTinhDoanhSo) return null;

        // Date filter — parse as Vietnamese DD/MM/YYYY (handles D/M/YYYY with single digits too)
        if (fromDate || toDate) {
          let d: Date;
          if (rawNgayTinhDoanhSo.includes('/')) {
            const parts = rawNgayTinhDoanhSo.split('/');
            d = new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
          } else {
            d = new Date(rawNgayTinhDoanhSo);
          }
          if (isNaN(d.getTime())) return null;
          if (fromDate && d < fromDate) return null;
          if (toDate && d > toDate) return null;
        }

        return {
          du_an:      colDuAn     ? str(v[colDuAn])     : '',
          loai_hinh:  colLoaiHinh ? str(v[colLoaiHinh]) : '',
          loai_nguon: colNguon    ? str(v[colNguon])    : '',
          gia_tri:    gTri,
          chi_nhanh:  colChiNhanh ? str(v[colChiNhanh]) : '',
          phong_kd:   colPhongKD  ? str(v[colPhongKD])  : '',
          sale_phu_trach: colSale ? str(v[colSale]) : '',
          ngay_ky:    rawNgayTinhDoanhSo,
          ngay_coc:   rawNgayCoc,
        } as TongHopRow;
      })
      .filter((r): r is TongHopRow => r !== null);
  } catch (err) {
    console.error('[GSheets] getTongHopGiaoDich error:', err);
    return [];
  }
}

// ============================================================
// TÌNH TRẠNG GIAO DỊCH — cols E, F, G, AE from "Tổng hợp giao dịch chi tiết"
// ============================================================

export interface TinhTrangGiaoDichRow {
  du_an: string;
  ma_can: string;
  ngay_coc: string;
  ngay_ky_ttdc: string;
  ngay_ky_hdmb: string;
  lai_phat: number;           // % Lãi phạt — col AE, stored as decimal (0.0041 = 0.41%)
  lai_phat_phat_sinh: number; // Lãi phạt phát sinh — col AU, monetary amount
}

export async function getTinhTrangGiaoDich(): Promise<TinhTrangGiaoDichRow[]> {
  const sheetId = process.env.TONG_HOP_SHEET_ID;
  if (!sheetId) {
    console.warn('[GSheets] TONG_HOP_SHEET_ID not set — skipping getTinhTrangGiaoDich');
    return [];
  }
  try {
    const doc = new GoogleSpreadsheet(sheetId, getJWT());
    await doc.loadInfo();

    // Use sheetsByIndex + normVi to find sheet regardless of Unicode encoding (NFC vs NFD)
    // sheetsByTitle uses exact key match which can fail with Vietnamese diacritics
    const sheet = doc.sheetsByIndex.find(s => normVi(s.title).includes('giaodich')) ||
      doc.sheetsByTitle['Tổng hợp giao dịch chi tiết'] ||
      doc.sheetsByTitle['Tong hop giao dich chi tiet'] ||
      null;
    if (!sheet) {
      console.warn('[GSheets] "Tổng hợp giao dịch chi tiết" not found. Sheets:', doc.sheetsByIndex.map(s => `"${s.title}"`).join(', '));
      return [];
    }

    // Headers are at row 3 (rows 1–2 are decorative). Load row 3, fall back to row 1.
    try {
      await sheet.loadHeaderRow(3);
    } catch {
      await sheet.loadHeaderRow(1);
    }

    const rows = await sheet.getRows();
    const h = sheet.headerValues;
    console.log('[TinhTrangGD] sheet:', sheet.title, '— ALL headers:', h.join(' | '));

    const findCol = (...patterns: string[]): string | null => {
      for (const col of h) {
        const norm = normVi(col);
        if (patterns.some(p => norm.includes(p))) return col;
      }
      return null;
    };
    // Positional fallbacks based on actual sheet layout (A=STT, B=Tuần, C=Tháng, D=Năm, E=NgàyCọc, F=TTĐC, G=HĐMB, K=DựÁn)
    const colAtPos = (pos: number): string | null => h[pos] || null;

    const colDuAn       = findCol('duan', 'tenduan', 'project', 'tenda')  || colAtPos(10);
    const colMaCan      = findCol('macan', 'ma_can', 'maso')              || colAtPos(11);
    const colNgayCoc    = findCol('ngaycoc')                               || colAtPos(4);
    const colNgayTTDC   = findCol('ttdc', 'vbtt', 'kyttdc', 'kyvbtt')    || colAtPos(5);
    const colNgayHDMB   = findCol('hdmb', 'kyhd', 'hopdonmua')            || colAtPos(6);
    // AE = index 30 (% Lãi phạt), AU = index 46 (Lãi phạt phát sinh)
    const colLaiPhat    = findCol('laiphat', 'tienphat', 'laixuat')      || colAtPos(30);
    const colLaiPhatPS  = findCol('laiphatphatsinh', 'phatsinh')         || colAtPos(46);

    console.log('[TinhTrangGD] cols → duAn:', colDuAn, '| ngayCoc:', colNgayCoc, '| ttdc:', colNgayTTDC, '| hdmb:', colNgayHDMB, '| laiPhat:', colLaiPhat, '| laiPhatPS:', colLaiPhatPS);

    return rows.map(row => {
      const v = row.toObject();
      const duAn    = colDuAn    ? str(v[colDuAn])    : '';
      const maCan   = colMaCan   ? str(v[colMaCan])   : '';
      const ngayCoc = colNgayCoc ? str(v[colNgayCoc]) : '';
      // Skip rows with no meaningful identifier
      if (!duAn && !maCan && !ngayCoc) return null;
      return {
        du_an:               duAn,
        ma_can:              maCan,
        ngay_coc:            ngayCoc,
        ngay_ky_ttdc:        colNgayTTDC  ? str(v[colNgayTTDC])  : '',
        ngay_ky_hdmb:        colNgayHDMB  ? str(v[colNgayHDMB])  : '',
        lai_phat:            colLaiPhat   ? num(v[colLaiPhat])   : 0,
        lai_phat_phat_sinh:  colLaiPhatPS ? num(v[colLaiPhatPS]) : 0,
      } as TinhTrangGiaoDichRow;
    }).filter((r): r is TinhTrangGiaoDichRow => r !== null);
  } catch (err) {
    console.error('[GSheets] getTinhTrangGiaoDich error:', err);
    return [];
  }
}

// ============================================================
// TỒN CỌC — "Tồn cọc" sheet (header at row 2, row 1 = TỔNG TỒN)
// ============================================================

export interface TonCocRow {
  du_an: string;
  ma_can: string;
  ngay_coc: string;
  so_tien: number;
  ngay_ky_thu_tuc: string;
  phuong_an_tt: string;
  tinh_trang: string;
  ghi_chu: string;
}

export async function getTonCoc(): Promise<TonCocRow[]> {
  const sheetId = process.env.TONG_HOP_SHEET_ID;
  if (!sheetId) {
    console.warn('[GSheets] TONG_HOP_SHEET_ID not set — skipping getTonCoc');
    return [];
  }
  try {
    const doc = new GoogleSpreadsheet(sheetId, getJWT());
    await doc.loadInfo();

    // Use sheetsByIndex + normVi to handle Unicode encoding differences (NFC vs NFD)
    const sheet = doc.sheetsByIndex.find(s => normVi(s.title) === 'toncoc') ||
      doc.sheetsByIndex.find(s => normVi(s.title).includes('toncoc')) ||
      doc.sheetsByTitle['Tồn cọc'] ||
      doc.sheetsByTitle['Ton coc'] ||
      null;
    if (!sheet) {
      console.warn('[GSheets] "Tồn cọc" sheet not found. Sheets:', doc.sheetsByIndex.map(s => `"${s.title}"`).join(', '));
      return [];
    }

    // Row 1 is a TỔNG TỒN summary row; actual column headers are at row 2
    try {
      await sheet.loadHeaderRow(2);
    } catch {
      await sheet.loadHeaderRow();
    }
    const rows = await sheet.getRows();
    const h = sheet.headerValues;

    const findCol = (...patterns: string[]): string | null => {
      for (const col of h) {
        const norm = normVi(col);
        if (patterns.some(p => norm.includes(p))) return col;
      }
      return null;
    };
    const colAtPos = (pos: number): string | null => h[pos] || null;

    const colMaCan       = findCol('macan', 'ma_can', 'maso')           || colAtPos(1);
    const colDuAn        = findCol('duan', 'tenduan', 'project')         || colAtPos(2);
    const colNgayCoc     = findCol('ngaycoc')                             || colAtPos(3);
    const colSoTien      = findCol('sotien', 'tiencoc', 'sotiencoc')     || colAtPos(4);
    const colNgayKyTT    = findCol('ngaykythutuc', 'kythutuc', 'thutu')  || colAtPos(5);
    const colPhuongAnTT  = findCol('phuongan', 'phuongthuc', 'hinhthuc') || colAtPos(6);
    const colTinhTrang   = findCol('tinhtrang', 'trangthai')              || colAtPos(7);
    const colGhiChu      = findCol('ghichu')                              || colAtPos(8);

    return rows.map(row => {
      const v = row.toObject();
      const maCan  = colMaCan ? str(v[colMaCan]) : '';
      const duAn   = colDuAn  ? str(v[colDuAn])  : '';
      const soTien = colSoTien ? num(v[colSoTien]) : 0;
      if (!maCan && !duAn) return null;
      return {
        du_an:           duAn,
        ma_can:          maCan,
        ngay_coc:        colNgayCoc    ? str(v[colNgayCoc])    : '',
        so_tien:         soTien,
        ngay_ky_thu_tuc: colNgayKyTT  ? str(v[colNgayKyTT])  : '',
        phuong_an_tt:    colPhuongAnTT ? str(v[colPhuongAnTT]) : '',
        tinh_trang:      colTinhTrang  ? str(v[colTinhTrang])  : '',
        ghi_chu:         colGhiChu     ? str(v[colGhiChu])     : '',
      } as TonCocRow;
    }).filter((r): r is TonCocRow => r !== null);
  } catch (err) {
    console.error('[GSheets] getTonCoc error:', err);
    return [];
  }
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
    ...(hKH.includes('du_an') ? { du_an: kh.du_an || '' } : {}),
    ...(hKH.includes('sale_lan_1') ? { sale_lan_1: kh.sale_lan_1 || '' } : {}),
    ...(hKH.includes('ghi_chu_lan_1') ? { ghi_chu_lan_1: kh.ghi_chu_lan_1 || '' } : {}),
    ...(hKH.includes('sale_lan_2') ? { sale_lan_2: kh.sale_lan_2 || '' } : {}),
    ...(hKH.includes('ghi_chu_lan_2') ? { ghi_chu_lan_2: kh.ghi_chu_lan_2 || '' } : {}),
    ...(hKH.includes('sale_lan_3') ? { sale_lan_3: kh.sale_lan_3 || '' } : {}),
    ...(hKH.includes('ghi_chu_lan_3') ? { ghi_chu_lan_3: kh.ghi_chu_lan_3 || '' } : {}),
    ...(hKH.includes('telesale_phu_trach') ? { telesale_phu_trach: kh.telesale_phu_trach || '' } : {}),
    ...(hKH.includes('sale_nhan_khach') ? { sale_nhan_khach: kh.sale_nhan_khach || '' } : {}),
    ...(hKH.includes('trang_thai_cham_soc') ? { trang_thai_cham_soc: kh.trang_thai_cham_soc || 'Chưa gọi' } : {}),
    ...(hKH.includes('muc_do_quan_tam') ? { muc_do_quan_tam: kh.muc_do_quan_tam || 'Chưa xác định' } : {}),
    ...(hKH.includes('ngay_lien_he_cuoi') ? { ngay_lien_he_cuoi: kh.ngay_lien_he_cuoi || '' } : {}),
    ...(hKH.includes('ngay_lien_he_tiep') ? { ngay_lien_he_tiep: kh.ngay_lien_he_tiep || '' } : {}),
    ...(hKH.includes('so_lan_lien_he') ? { so_lan_lien_he: kh.so_lan_lien_he || 0 } : {}),
    ...(hKH.includes('lich_su_cham_soc') ? { lich_su_cham_soc: kh.lich_su_cham_soc || '[]' } : {}),
    ...(hKH.includes('trang_thai_ban_giao') ? { trang_thai_ban_giao: kh.trang_thai_ban_giao || 'Chưa bàn giao' } : {}),
    ...(hKH.includes('ban_giao_luc') ? { ban_giao_luc: kh.ban_giao_luc || '' } : {}),
    ...(hKH.includes('sale_xac_nhan_luc') ? { sale_xac_nhan_luc: kh.sale_xac_nhan_luc || '' } : {}),
    ...(hKH.includes('lich_su_ban_giao') ? { lich_su_ban_giao: kh.lich_su_ban_giao || '[]' } : {}),
  });

  // 2. AUTO tạo pipeline — ghi theo TÊN CỘT để không bị lệch khi sheet có thêm cột
  const sheetPL = await getSheet(doc, SHEETS.PIPELINE);

  const id_pipeline = `PL_${Date.now()}`;
  const plNow = new Date().toISOString();

  await sheetPL.addRow({
    id_pipeline,
    id_khach_hang:   kh.id_khach_hang,
    giai_doan:       'Mới',
    gia_tri_thuc_te: 0,
    hoa_hong:        0,
    tien_hoa_hong:   0,
    sale_phu_trach:  kh.sale_phu_trach,
    id_du_an:        '',
    ten_du_an:       '',
    ngay_cap_nhat:   plNow,
    thang:           toMonthKey(plNow),
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

// Batch-insert nhiều KH cùng lúc: 3 addRows thay vì 3×N addRow riêng lẻ.
// Dùng cho import/sync hàng loạt để tránh timeout Vercel.
export async function addKhachHangBatch(khs: KhachHang[]): Promise<void> {
  if (khs.length === 0) return;

  const doc = await getDoc();
  const [sheetKH, sheetPL, sheetCV] = await Promise.all([
    getSheet(doc, SHEETS.KHACH_HANG),
    getSheet(doc, SHEETS.PIPELINE),
    getSheet(doc, SHEETS.CONG_VIEC),
  ]);

  const hKH = sheetKH.headerValues;
  const hCV = sheetCV.headerValues;

  const now     = new Date().toISOString();
  const ngayHen = new Date();
  ngayHen.setDate(ngayHen.getDate() + 1);
  const ngayHenISO = ngayHen.toISOString();
  const thangKey   = toMonthKey(now);

  // Tạo pipeline ID trước để CONG_VIEC có thể tham chiếu đúng
  const pipelineIds = khs.map((_, i) => `PL_${Date.now()}_${i}`);

  const hasDuAn = hKH.includes('du_an');
  const khRows = khs.map(kh => ({
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
    ...(hasDuAn ? { du_an: kh.du_an || '' } : {}),
    ...(hKH.includes('sale_lan_1') ? { sale_lan_1: kh.sale_lan_1 || '' } : {}),
    ...(hKH.includes('ghi_chu_lan_1') ? { ghi_chu_lan_1: kh.ghi_chu_lan_1 || '' } : {}),
    ...(hKH.includes('sale_lan_2') ? { sale_lan_2: kh.sale_lan_2 || '' } : {}),
    ...(hKH.includes('ghi_chu_lan_2') ? { ghi_chu_lan_2: kh.ghi_chu_lan_2 || '' } : {}),
    ...(hKH.includes('sale_lan_3') ? { sale_lan_3: kh.sale_lan_3 || '' } : {}),
    ...(hKH.includes('ghi_chu_lan_3') ? { ghi_chu_lan_3: kh.ghi_chu_lan_3 || '' } : {}),
    ...(hKH.includes('telesale_phu_trach') ? { telesale_phu_trach: kh.telesale_phu_trach || '' } : {}),
    ...(hKH.includes('sale_nhan_khach') ? { sale_nhan_khach: kh.sale_nhan_khach || '' } : {}),
    ...(hKH.includes('trang_thai_cham_soc') ? { trang_thai_cham_soc: kh.trang_thai_cham_soc || 'Chưa gọi' } : {}),
    ...(hKH.includes('muc_do_quan_tam') ? { muc_do_quan_tam: kh.muc_do_quan_tam || 'Chưa xác định' } : {}),
    ...(hKH.includes('ngay_lien_he_cuoi') ? { ngay_lien_he_cuoi: kh.ngay_lien_he_cuoi || '' } : {}),
    ...(hKH.includes('ngay_lien_he_tiep') ? { ngay_lien_he_tiep: kh.ngay_lien_he_tiep || '' } : {}),
    ...(hKH.includes('so_lan_lien_he') ? { so_lan_lien_he: kh.so_lan_lien_he || 0 } : {}),
    ...(hKH.includes('lich_su_cham_soc') ? { lich_su_cham_soc: kh.lich_su_cham_soc || '[]' } : {}),
    ...(hKH.includes('trang_thai_ban_giao') ? { trang_thai_ban_giao: kh.trang_thai_ban_giao || 'Chưa bàn giao' } : {}),
    ...(hKH.includes('ban_giao_luc') ? { ban_giao_luc: kh.ban_giao_luc || '' } : {}),
    ...(hKH.includes('sale_xac_nhan_luc') ? { sale_xac_nhan_luc: kh.sale_xac_nhan_luc || '' } : {}),
    ...(hKH.includes('lich_su_ban_giao') ? { lich_su_ban_giao: kh.lich_su_ban_giao || '[]' } : {}),
  }));

  // Ghi theo TÊN CỘT để không bị lệch khi sheet có thêm cột mới
  const plRows = khs.map((kh, i) => ({
    id_pipeline:     pipelineIds[i],
    id_khach_hang:   kh.id_khach_hang,
    giai_doan:       'Mới',
    gia_tri_thuc_te: 0,
    hoa_hong:        0,
    tien_hoa_hong:   0,
    sale_phu_trach:  kh.sale_phu_trach,
    id_du_an:        '',
    ten_du_an:       '',
    ngay_cap_nhat:   now,
    thang:           thangKey,
  }));

  const cvRows = khs.map((kh, i) => ({
    [hCV[0]]: `CV_${Date.now()}_${i}`,
    [hCV[1]]: now,
    [hCV[2]]: 'Gọi khách lần đầu',
    [hCV[3]]: pipelineIds[i],
    [hCV[4]]: 'Chưa xử lý',
    [hCV[5]]: ngayHenISO,
    [hCV[6]]: kh.sale_phu_trach,
    [hCV[7]]: '',
  }));

  await sheetKH.addRows(khRows);
  await sheetPL.addRows(plRows);
  await sheetCV.addRows(cvRows);
}

export async function updateKhachHang(kh: KhachHang): Promise<boolean> {
  const doc = await getDoc();
  const sheet = await getSheet(doc, SHEETS.KHACH_HANG);
  const rows = await sheet.getRows();
  const h = sheet.headerValues;

  const row = rows.find(r => str(r.toObject()[h[0]]) === kh.id_khach_hang);
  if (!row) return false;

  const oldSale = str(row.toObject()[h[8]]);

  row.set(h[2], kh.ten_KH); row.set(h[3], kh.so_dien_thoai);
  row.set(h[4], kh.email); row.set(h[5], kh.nguon);
  row.set(h[6], kh.nhu_cau); row.set(h[7], kh.ghi_chu);
  row.set(h[8], kh.sale_phu_trach);
  row.set(h[9], `${kh.ten_KH} - ${kh.so_dien_thoai}`);
  if (h.includes('du_an')) row.set('du_an', kh.du_an || '');
  if (h.includes('sale_lan_1')) row.set('sale_lan_1', kh.sale_lan_1 || '');
  if (h.includes('ghi_chu_lan_1')) row.set('ghi_chu_lan_1', kh.ghi_chu_lan_1 || '');
  if (h.includes('sale_lan_2')) row.set('sale_lan_2', kh.sale_lan_2 || '');
  if (h.includes('ghi_chu_lan_2')) row.set('ghi_chu_lan_2', kh.ghi_chu_lan_2 || '');
  if (h.includes('sale_lan_3')) row.set('sale_lan_3', kh.sale_lan_3 || '');
  if (h.includes('ghi_chu_lan_3')) row.set('ghi_chu_lan_3', kh.ghi_chu_lan_3 || '');
  if (h.includes('telesale_phu_trach')) row.set('telesale_phu_trach', kh.telesale_phu_trach || '');
  if (h.includes('sale_nhan_khach')) row.set('sale_nhan_khach', kh.sale_nhan_khach || '');
  if (h.includes('trang_thai_cham_soc')) row.set('trang_thai_cham_soc', kh.trang_thai_cham_soc || 'Chưa gọi');
  if (h.includes('muc_do_quan_tam')) row.set('muc_do_quan_tam', kh.muc_do_quan_tam || 'Chưa xác định');
  if (h.includes('ngay_lien_he_cuoi')) row.set('ngay_lien_he_cuoi', kh.ngay_lien_he_cuoi || '');
  if (h.includes('ngay_lien_he_tiep')) row.set('ngay_lien_he_tiep', kh.ngay_lien_he_tiep || '');
  if (h.includes('so_lan_lien_he')) row.set('so_lan_lien_he', kh.so_lan_lien_he || 0);
  if (h.includes('lich_su_cham_soc')) row.set('lich_su_cham_soc', kh.lich_su_cham_soc || '[]');
  if (h.includes('trang_thai_ban_giao')) row.set('trang_thai_ban_giao', kh.trang_thai_ban_giao || 'Chưa bàn giao');
  if (h.includes('ban_giao_luc')) row.set('ban_giao_luc', kh.ban_giao_luc || '');
  if (h.includes('sale_xac_nhan_luc')) row.set('sale_xac_nhan_luc', kh.sale_xac_nhan_luc || '');
  if (h.includes('lich_su_ban_giao')) row.set('lich_su_ban_giao', kh.lich_su_ban_giao || '[]');
  await row.save();

  // Cascade sale_phu_trach to Pipeline and Công việc when it changes
  if (kh.sale_phu_trach && oldSale !== kh.sale_phu_trach) {
    const [sheetPL, sheetCV] = await Promise.all([
      getSheet(doc, SHEETS.PIPELINE),
      getSheet(doc, SHEETS.CONG_VIEC),
    ]);
    const [rowsPL, rowsCV] = await Promise.all([
      sheetPL.getRows(),
      sheetCV.getRows(),
    ]);

    const plRows = rowsPL.filter(r => str(r.toObject()['id_khach_hang']) === kh.id_khach_hang);
    const plIds = new Set(plRows.map(r => str(r.toObject()['id_pipeline'])));
    const cvRows = rowsCV.filter(r => plIds.has(str(r.toObject()['id_pipeline'])));

    plRows.forEach(r => r.set('sale_phu_trach', kh.sale_phu_trach));
    cvRows.forEach(r => r.set('sale_phu_trach', kh.sale_phu_trach));

    // Also fill id_du_an/ten_du_an on pipeline rows that have no project yet
    if (kh.du_an) {
      const rowsNeedingProject = plRows.filter(r => !str(r.toObject()['id_du_an']));
      if (rowsNeedingProject.length > 0) {
        const duAnList = await getDuAn();
        const proj = duAnList.find(p => p.ten_du_an === kh.du_an);
        if (proj) {
          rowsNeedingProject.forEach(r => {
            r.set('id_du_an', proj.id_du_an);
            r.set('ten_du_an', proj.ten_du_an);
          });
        }
      }
    }

    await Promise.all([...plRows.map(r => r.save()), ...cvRows.map(r => r.save())]);
  }

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

  // Chuẩn bị dòng ghi động theo tên cột chữ (hoặc fallback nếu cột chưa có)
  const rowData: Record<string, any> = {};
  const schema = {
    id_pipeline: pl.id_pipeline,
    id_khach_hang: pl.id_khach_hang,
    giai_doan: pl.giai_doan,
    id_du_an: pl.id_du_an,
    ten_du_an: pl.ten_du_an,
    ma_can: pl.ma_can || '',
    loai_can: pl.loai_can || '',
    gia_tri_thuc_te: pl.gia_tri_thuc_te,
    hoa_hong: pl.hoa_hong,
    tien_hoa_hong: pl.tien_hoa_hong || (pl.gia_tri_thuc_te * pl.hoa_hong),
    sale_phu_trach: pl.sale_phu_trach,
    gdda: pl.gdda || '',
    gdkd: pl.gdkd || '',
    phong_kd: pl.phong_kd || '',
    ty_le_tra_sale: pl.ty_le_tra_sale || 0,
    ty_le_kh: pl.ty_le_kh || 0,
    ty_le_gdda: pl.ty_le_gdda || 0,
    ty_le_gdkd: pl.ty_le_gdkd || 0,
    ty_le_mkt: pl.ty_le_mkt || 0,
    phi_tra_sale: pl.phi_tra_sale || 0,
    phi_tra_kh: pl.phi_tra_kh || 0,
    phi_tra_gdda: pl.phi_tra_gdda || 0,
    phi_tra_gdkd: pl.phi_tra_gdkd || 0,
    phi_tra_mkt: pl.phi_tra_mkt || 0,
    phi_admin: pl.phi_admin || 0,
    loi_nhuan: pl.loi_nhuan || 0,
    thuong_nong: pl.thuong_nong || 0,
    tkkd: pl.tkkd || '',
    phi_tkkd: pl.phi_tkkd || 0,
    ngay_cap_nhat: pl.ngay_cap_nhat,
    thang: thang,
  };

  // Build rowData bằng cách mapping qua header thực tế để an toàn tuyệt đối
  for (const colName of Object.keys(schema)) {
    if (h.includes(colName)) {
      rowData[colName] = (schema as any)[colName];
    } else if (colName === 'thuong_nong') {
      if (h.includes('Thưởng nóng (Gồm VAT)')) rowData['Thưởng nóng (Gồm VAT)'] = pl.thuong_nong || 0;
      else if (h.includes('Thưởng nóng')) rowData['Thưởng nóng'] = pl.thuong_nong || 0;
    } else if (colName === 'tkkd') {
      const actualKey = h.find(k => k.toLowerCase() === 'tkkd' || k.includes('Thư ký kinh doanh'));
      if (actualKey) rowData[actualKey] = pl.tkkd || '';
    } else if (colName === 'phi_tkkd') {
      const actualKey = h.find(k => k.toLowerCase() === 'phi_tkkd' || k.toLowerCase() === 'phitkkd' || k.includes('Phí TKKD'));
      if (actualKey) rowData[actualKey] = pl.phi_tkkd || 0;
    } else {
      // Fallback theo vị trí cũ của 11 cột nguyên bản
      const oldIdx = [
        'id_pipeline', 'id_khach_hang', 'giai_doan', 'gia_tri_thuc_te',
        'sale_phu_trach', 'id_du_an', 'ten_du_an', 'hoa_hong', 'tien_hoa_hong',
        'ngay_cap_nhat', 'thang'
      ].indexOf(colName);
      if (oldIdx !== -1 && h[oldIdx]) {
        rowData[h[oldIdx]] = (schema as any)[colName];
      }
    }
  }

  await sheet.addRow(rowData);
  await addLog(doc, 'CREATE_PIPELINE', pl.id_pipeline, pl.id_khach_hang, '');
}

export async function updatePipeline(pl: Pipeline): Promise<{ updated: boolean; oldGiaiDoan: string }> {
  const doc = await getDoc();
  const sheet = await getSheet(doc, SHEETS.PIPELINE);
  const rows = await sheet.getRows();
  const h = sheet.headerValues;

  // Xác định cột ID
  const idCol = h.includes('id_pipeline') ? 'id_pipeline' : h[0];
  const row = rows.find(r => str(r.toObject()[idCol]) === pl.id_pipeline);
  if (!row) return { updated: false, oldGiaiDoan: '' };

  // Đọc giai_doan cũ trước khi ghi đè (dùng để trigger auto-task)
  const oldGiaiDoan = str(row.toObject()[h.includes('giai_doan') ? 'giai_doan' : h[2]]);

  const now = new Date().toISOString();
  const schema = {
    id_khach_hang: pl.id_khach_hang,
    giai_doan: pl.giai_doan,
    id_du_an: pl.id_du_an,
    ten_du_an: pl.ten_du_an,
    ma_can: pl.ma_can || '',
    loai_can: pl.loai_can || '',
    gia_tri_thuc_te: pl.gia_tri_thuc_te,
    hoa_hong: pl.hoa_hong,
    tien_hoa_hong: pl.tien_hoa_hong || (pl.gia_tri_thuc_te * pl.hoa_hong),
    sale_phu_trach: pl.sale_phu_trach,
    gdda: pl.gdda || '',
    gdkd: pl.gdkd || '',
    phong_kd: pl.phong_kd || '',
    ty_le_tra_sale: pl.ty_le_tra_sale || 0,
    ty_le_kh: pl.ty_le_kh || 0,
    ty_le_gdda: pl.ty_le_gdda || 0,
    ty_le_gdkd: pl.ty_le_gdkd || 0,
    ty_le_mkt: pl.ty_le_mkt || 0,
    phi_tra_sale: pl.phi_tra_sale || 0,
    phi_tra_kh: pl.phi_tra_kh || 0,
    phi_tra_gdda: pl.phi_tra_gdda || 0,
    phi_tra_gdkd: pl.phi_tra_gdkd || 0,
    phi_tra_mkt: pl.phi_tra_mkt || 0,
    phi_admin: pl.phi_admin || 0,
    loi_nhuan: pl.loi_nhuan || 0,
    thuong_nong: pl.thuong_nong || 0,
    tkkd: pl.tkkd || '',
    phi_tkkd: pl.phi_tkkd || 0,
    ngay_cap_nhat: now,
    // Giữ nguyên thang gốc (tháng deal chốt).
    // Chỉ tự động set khi thang đang rỗng — tránh ghi đè mỗi lần update field khác.
    thang: pl.thang || toMonthKey(now),
  };

  // Cập nhật giá trị an toàn theo tên cột
  for (const colName of Object.keys(schema)) {
    if (h.includes(colName)) {
      row.set(colName, (schema as any)[colName]);
    } else if (colName === 'thuong_nong') {
      if (h.includes('Thưởng nóng (Gồm VAT)')) row.set('Thưởng nóng (Gồm VAT)', pl.thuong_nong || 0);
      else if (h.includes('Thưởng nóng')) row.set('Thưởng nóng', pl.thuong_nong || 0);
    } else if (colName === 'tkkd') {
      const actualKey = h.find(k => k.toLowerCase() === 'tkkd' || k.includes('Thư ký kinh doanh'));
      if (actualKey) row.set(actualKey, pl.tkkd || '');
    } else if (colName === 'phi_tkkd') {
      const actualKey = h.find(k => k.toLowerCase() === 'phi_tkkd' || k.toLowerCase() === 'phitkkd' || k.includes('Phí TKKD'));
      if (actualKey) row.set(actualKey, pl.phi_tkkd || 0);
    } else {
      // Fallback theo vị trí cũ của 11 cột nguyên bản
      const oldIdx = [
        'id_pipeline', 'id_khach_hang', 'giai_doan', 'gia_tri_thuc_te',
        'sale_phu_trach', 'id_du_an', 'ten_du_an', 'hoa_hong', 'tien_hoa_hong',
        'ngay_cap_nhat', 'thang'
      ].indexOf(colName);
      if (oldIdx !== -1 && h[oldIdx]) {
        row.set(h[oldIdx], (schema as any)[colName]);
      }
    }
  }

  await row.save();
  await addLog(doc, 'UPDATE_PIPELINE', pl.id_pipeline, '', '');
  return { updated: true, oldGiaiDoan };
}

export async function deletePipeline(id: string): Promise<boolean> {
  const doc = await getDoc();
  const sheet = await getSheet(doc, SHEETS.PIPELINE);
  const rows = await sheet.getRows();
  const h = sheet.headerValues;

  const idCol = h.includes('id_pipeline') ? 'id_pipeline' : h[0];
  const row = rows.find(r => str(r.toObject()[idCol]) === id);
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
    [h[5]]: da.link_tai_lieu || '',
    [h[6]]: da.chu_dau_tu || '',
    [h[7]]: da.link_du_an || '',
    'stacking_config': da.stacking_config || '',
    'truong_nhom': da.truong_nhom || '',
    'ds_sale': da.ds_sale || '',
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
  row.set(h[5], da.link_tai_lieu || '');
  row.set(h[6], da.chu_dau_tu || '');
  row.set(h[7], da.link_du_an || '');
  row.set('stacking_config', da.stacking_config || '');
  if (h.includes('truong_nhom')) row.set('truong_nhom', da.truong_nhom || '');
  if (h.includes('ds_sale')) row.set('ds_sale', da.ds_sale || '');
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
  // Ghi theo TÊN CỘT (không theo vị trí index) để tránh lệch cột khi sheet có cột thêm
  await sheet.addRow({
    'id_nhan_vien':             nv.id_nhan_vien,
    'ho_ten':                   nv.ho_ten,
    'so_dien_thoai':            nv.so_dien_thoai,
    'email':                    nv.email,
    'employee_type':            nv.employee_type || '',
    'trang_thai':               nv.trang_thai,
    'so_cccd':                  nv.so_cccd || '',
    'ngay_cap':                 nv.ngay_cap || '',
    'noi_cap':                  nv.noi_cap || '',
    'HKTT':                     nv.HKTT || '',
    'ngay_sinh':                nv.ngay_sinh || '',
    'gioi_tinh':                nv.gioi_tinh || '',
    'ma_so_thue':               nv.ma_so_thue || '',
    'so_tk_ngan_hang':          nv.so_tk_ngan_hang || '',
    'ten_ngan_hang_thu_huong':  nv.ten_ngan_hang_thu_huong || '',
    'ngay_tao':                 nv.ngay_tao || '',
    'avatar_url':               nv.avatar_url || '',
    'vai_tro':                  nv.vai_tro || 'Sale',
    'khu_vuc':                  nv.khu_vuc || '',
    'phong_KD':                 nv.phong_KD || '',
    'so_nguoi_phu_thuoc':       nv.so_nguoi_phu_thuoc || 0,
    'mat_khau':                 nv.mat_khau || '',
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

  // Ghi theo TÊN CỘT (không theo vị trí index) để tránh lệch cột
  const setIfExists = (col: string, val: any) => { if (h.includes(col)) row.set(col, val); };
  setIfExists('ho_ten',                  nv.ho_ten);
  setIfExists('so_dien_thoai',           nv.so_dien_thoai);
  setIfExists('email',                   nv.email);
  setIfExists('employee_type',           nv.employee_type || '');
  setIfExists('trang_thai',              nv.trang_thai);
  setIfExists('so_cccd',                 nv.so_cccd || '');
  setIfExists('ngay_cap',                nv.ngay_cap || '');
  setIfExists('noi_cap',                 nv.noi_cap || '');
  setIfExists('HKTT',                    nv.HKTT || '');
  setIfExists('ngay_sinh',               nv.ngay_sinh || '');
  setIfExists('gioi_tinh',               nv.gioi_tinh || '');
  setIfExists('ma_so_thue',              nv.ma_so_thue || '');
  setIfExists('so_tk_ngan_hang',         nv.so_tk_ngan_hang || '');
  setIfExists('ten_ngan_hang_thu_huong', nv.ten_ngan_hang_thu_huong || '');
  setIfExists('ngay_tao',                nv.ngay_tao || '');
  setIfExists('avatar_url',              nv.avatar_url || '');
  setIfExists('vai_tro',                 nv.vai_tro || 'Sale');
  setIfExists('khu_vuc',                 nv.khu_vuc || '');
  setIfExists('phong_KD',               nv.phong_KD || '');
  setIfExists('so_nguoi_phu_thuoc',      nv.so_nguoi_phu_thuoc || 0);
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

const HOP_DONG_HEADERS = ['id', 'id_nhan_vien', 'ten_nhan_vien', 'so_hop_dong', 'phong_KD', 'employee_type', 'department', 'contract_type', 'template_file', 'ngay_bat_dau', 'ngay_ket_thuc', 'luong_co_ban', 'ghi_chu', 'created_at'];

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
        id_nhan_vien: padEmployeeId(str(v['id_nhan_vien'])),
        ten_nhan_vien: str(v['ten_nhan_vien']),
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
  rowData['ten_nhan_vien'] = hd.ten_nhan_vien || '';
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
    ten_nhan_vien: hd.ten_nhan_vien || '',
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
        id_nhan_vien: padEmployeeId(str(v['id_nhan_vien'])),
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
        trang_thai:    (str(v['trang_thai']) || 'draft') as any,
        isProbation:   str(v['isProbation']) === 'TRUE' || str(v['isProbation']) === 'true',
        isCollaborator: str(v['isCollaborator']) === 'TRUE' || str(v['isCollaborator']) === 'true',
        isIntern:      str(v['isIntern']) === 'TRUE' || str(v['isIntern']) === 'true',
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
    isProbation:   bl.isProbation ? 'TRUE' : 'FALSE',
    isCollaborator: bl.isCollaborator ? 'TRUE' : 'FALSE',
    isIntern:      bl.isIntern ? 'TRUE' : 'FALSE',
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
        id_nhan_vien: padEmployeeId(str(v.id_nhan_vien)),
        thang: num(v.thang),
        nam: num(v.nam),
        gross: num(v.gross),
        total_deduction: num(v.total_deduction),
        net: num(v.net),
        luong_dong_bh: num(v.luong_dong_bh),
        thu_nhap_chiu_thue: num(v.thu_nhap_chiu_thue),
        tong_chi_phi: num(v.tong_chi_phi),
        trang_thai: (str(v.trang_thai) || 'draft') as any,
        isProbation: str(v.isProbation) === 'TRUE' || str(v.isProbation) === 'true',
        isCollaborator: str(v.isCollaborator) === 'TRUE' || str(v.isCollaborator) === 'true',
        isIntern: str(v.isIntern) === 'TRUE' || str(v.isIntern) === 'true',
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
      isProbation: (payroll as any).isProbation ? 'TRUE' : 'FALSE',
      isCollaborator: (payroll as any).isCollaborator ? 'TRUE' : 'FALSE',
      isIntern: (payroll as any).isIntern ? 'TRUE' : 'FALSE',
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

// Reads ALL rows from PAYROLL sheet — used by sync scripts only.
export async function getAllPayrollRecords(): Promise<PayrollRecord[]> {
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
        id_nhan_vien: padEmployeeId(str(v.id_nhan_vien)),
        thang: num(v.thang),
        nam: num(v.nam),
        gross: num(v.gross),
        total_deduction: num(v.total_deduction),
        net: num(v.net),
        luong_dong_bh: num(v.luong_dong_bh),
        thu_nhap_chiu_thue: num(v.thu_nhap_chiu_thue),
        tong_chi_phi: num(v.tong_chi_phi),
        trang_thai: (str(v.trang_thai) || 'draft') as any,
        isProbation: str(v.isProbation) === 'TRUE' || str(v.isProbation) === 'true',
        isCollaborator: str(v.isCollaborator) === 'TRUE' || str(v.isCollaborator) === 'true',
        isIntern: str(v.isIntern) === 'TRUE' || str(v.isIntern) === 'true',
        locked_at: str(v.locked_at) || undefined,
        created_at: str(v.created_at),
      };
    })
    .filter(p => !!p.id);
}

// Reads ALL rows from PAYROLL_ADJUSTMENTS — used by sync scripts only.
export async function getAllPayrollAdjustments(): Promise<PayrollAdjustment[]> {
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
    .filter(adj => !!adj.id);
}

// Reads ALL rows from PAYROLL_ITEMS — used by sync scripts only.
export async function getAllPayrollItems(): Promise<PayrollItemRecord[]> {
  const doc = await getDoc();
  let sheet: GoogleSpreadsheetWorksheet;
  try {
    sheet = await getSheet(doc, SHEETS.PAYROLL_ITEMS);
  } catch {
    return [];
  }
  const rows = await sheet.getRows();
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
    .filter(item => !!item.id && !!item.payroll_id);
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

// ============================================================
// STACKING BOARD
// ============================================================

// --- Per-sheetId doc cache (supports multiple stacking files) ---
const stackingDocCache = new Map<string, { doc: GoogleSpreadsheet; time: number }>();

async function getDocBySheetId(sheetId: string): Promise<GoogleSpreadsheet> {
  const cached = stackingDocCache.get(sheetId);
  if (cached && Date.now() - cached.time < CACHE_DURATION) return cached.doc;
  const doc = new GoogleSpreadsheet(sheetId, getJWT());
  await doc.loadInfo();
  stackingDocCache.set(sheetId, { doc, time: Date.now() });
  return doc;
}

// Extract Sheet ID from either raw ID or full Google Sheets URL
function extractSheetId(input: string): string {
  const m = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : input.trim();
}

// --- STACKING_CONFIG: stored as a tab in the main CRM spreadsheet ---

const STACKING_CONFIG_HEADERS = ['id', 'ten_hien_thi', 'sheet_id', 'project_code', 'trang_thai', 'ngay_tao', 'loai', 'sheet_tab', 'visible_columns'];

async function getOrCreateStackingConfigSheet(doc: GoogleSpreadsheet): Promise<GoogleSpreadsheetWorksheet> {
  let sheet = doc.sheetsByTitle['STACKING_CONFIG'];
  if (!sheet) {
    sheet = await doc.addSheet({ title: 'STACKING_CONFIG', headerValues: STACKING_CONFIG_HEADERS });
  } else {
    await sheet.loadHeaderRow();
    // Sheet đã tồn tại từ trước milestone "Danh sách" (biệt thự/liền kề) —
    // thêm cột mới nếu thiếu, KHÔNG đụng dữ liệu/cột cũ (mirror pattern
    // missingKHCols của getKhachHang()).
    const h = sheet.headerValues;
    const missingCols = ['loai', 'sheet_tab', 'visible_columns'].filter(c => !h.includes(c));
    if (missingCols.length > 0) await sheet.setHeaderRow([...h, ...missingCols]);
  }
  return sheet;
}

// visible_columns lưu dạng JSON array trong 1 cell (VD '["STT","Dãy","Mã căn"]')
// — parse phòng thủ, rỗng/lỗi -> [] (nghĩa là "hiện tất cả cột", xem StackingConfig.visible_columns).
function parseVisibleColumns(raw: unknown): string[] {
  const s = str(raw);
  if (!s) return [];
  try {
    const parsed = JSON.parse(s);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export async function getStackingConfigs(): Promise<import('./types').StackingConfig[]> {
  const doc = await getDoc();
  const sheet = await getOrCreateStackingConfigSheet(doc);
  const rows = await sheet.getRows();
  return rows
    .map(r => {
      const v = r.toObject();
      return {
        id:            str(v['id']),
        ten_hien_thi:  str(v['ten_hien_thi']),
        sheet_id:      str(v['sheet_id']),
        project_code:  str(v['project_code']),
        trang_thai:    (str(v['trang_thai']) || 'active') as 'active' | 'inactive',
        ngay_tao:      str(v['ngay_tao']),
        // Config cũ (tạo trước milestone "Danh sách") không có cột này —
        // mặc định 'grid' để giữ NGUYÊN hành vi lưới tầng hiện tại.
        loai:          (str(v['loai']) || 'grid') as 'grid' | 'list',
        sheet_tab:     str(v['sheet_tab']),
        visible_columns: parseVisibleColumns(v['visible_columns']),
      };
    })
    .filter(c => c.id && c.sheet_id);
}

export async function addStackingConfig(
  payload: {
    ten_hien_thi: string; sheet_id: string; project_code?: string;
    loai?: 'grid' | 'list'; sheet_tab?: string; visible_columns?: string[];
  }
): Promise<import('./types').StackingConfig> {
  const doc = await getDoc();
  const sheet = await getOrCreateStackingConfigSheet(doc);
  const id = 'SC_' + Date.now();
  const newRow = {
    id,
    ten_hien_thi:  payload.ten_hien_thi,
    sheet_id:      extractSheetId(payload.sheet_id),
    project_code:  payload.project_code?.trim().toUpperCase() || '',
    trang_thai:    'active',
    ngay_tao:      new Date().toISOString(),
    loai:          (payload.loai === 'list' ? 'list' : 'grid') as 'grid' | 'list',
    sheet_tab:     payload.sheet_tab?.trim() || '',
    visible_columns: payload.visible_columns && payload.visible_columns.length > 0 ? JSON.stringify(payload.visible_columns) : '',
  };
  await sheet.addRow(newRow);
  return { ...newRow, trang_thai: 'active', visible_columns: payload.visible_columns ?? [] };
}

export async function updateStackingConfig(
  id: string,
  updates: { project_code?: string; ten_hien_thi?: string; sheet_tab?: string; visible_columns?: string[] }
): Promise<boolean> {
  const doc = await getDoc();
  const sheet = await getOrCreateStackingConfigSheet(doc);
  const rows = await sheet.getRows();
  const row = rows.find(r => str(r.toObject()['id']) === id);
  if (!row) return false;
  if (updates.project_code !== undefined) row.set('project_code', updates.project_code.trim().toUpperCase());
  if (updates.ten_hien_thi !== undefined && updates.ten_hien_thi.trim()) row.set('ten_hien_thi', updates.ten_hien_thi.trim());
  if (updates.sheet_tab !== undefined && updates.sheet_tab.trim()) row.set('sheet_tab', updates.sheet_tab.trim());
  if (updates.visible_columns !== undefined) row.set('visible_columns', updates.visible_columns.length > 0 ? JSON.stringify(updates.visible_columns) : '');
  await row.save();
  return true;
}

export async function deleteStackingConfig(id: string): Promise<boolean> {
  const doc = await getDoc();
  const sheet = await getOrCreateStackingConfigSheet(doc);
  const rows = await sheet.getRows();
  const row = rows.find(r => str(r.toObject()['id']) === id);
  if (!row) return false;
  await row.delete();
  return true;
}

// --- Tower / unit access (sheetId-parameterised) ---

// Tower tab pattern: "{PROJECT_CODE} {tower}" — project_code is dynamic from config
function towerPattern(projectCode: string) {
  const escaped = projectCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped}\\s+(.+)$`);
}

// Fallback broad pattern if no project_code provided
const FALLBACK_PATTERN = /^([A-Z0-9]+)\s+(.+)$/;

export async function getStackingSheetList(sheetId: string, projectCode?: string): Promise<StackingSheetMeta[]> {
  const doc = await getDocBySheetId(sheetId);
  const results: StackingSheetMeta[] = [];

  for (const s of doc.sheetsByIndex) {
    if (projectCode) {
      const m = s.title.match(towerPattern(projectCode));
      if (m) results.push({ project: projectCode, tower: m[1], sheetName: s.title });
    } else {
      const m = s.title.match(FALLBACK_PATTERN);
      if (m) results.push({ project: m[1], tower: m[2], sheetName: s.title });
    }
  }

  return results.sort((a, b) => a.project.localeCompare(b.project) || a.tower.localeCompare(b.tower));
}

// Probe a sheet ID: auto-detect project codes and towers
export async function probeStackingSheet(
  rawInput: string
): Promise<{ ok: true; sheets: StackingSheetMeta[]; allTabs: string[] } | { ok: false; error: string }> {
  try {
    const sheetId = extractSheetId(rawInput);
    if (!sheetId) return { ok: false, error: 'Sheet ID không hợp lệ' };
    const doc = await getDocBySheetId(sheetId);
    const allTabs = doc.sheetsByIndex.map(s => s.title);
    const sheets  = await getStackingSheetList(sheetId);
    return { ok: true, sheets, allTabs };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

const MAX_STACKING_ROWS = 500;   // grid tabs (visual stacking) — compact, ~40 rows/tower
const MAX_LIST_ROWS     = 3000;  // list tabs (bảng hàng flat) — 1 row/unit, cần đủ lớn
const MAX_STACKING_COLS = 60;

// Convert 1-based column index to spreadsheet letter(s): 1→A, 26→Z, 27→AA, 28→AB...
function colLetter(n: number): string {
  let s = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

// Whether a cell value looks like a floor identifier (e.g. "35", "B1", "TB", "TM")
function isFloorLabel(v: string): boolean {
  if (!v) return false;
  const s = v.trim().toUpperCase();
  if (/^\d+$/.test(s)) return true;           // "1", "35"
  if (/^\d+[A-Z]$/.test(s)) return true;      // "35A", "22B"
  if (/^B\d*G?$/.test(s)) return true;        // "B1", "B2", "BG", "B"
  if (/^T[BMLKR]$/.test(s)) return true;      // "TB", "TM", "TL", "TK", "TR"
  if (/^L\d+$/.test(s)) return true;          // "L1", "L2" (lobby)
  if (/^P\d+$/.test(s)) return true;          // "P1" (podium)
  return false;
}

// Scale raw price value → đồng (VND).
// File bảng hàng TGC lưu giá theo đơn vị TỶ (e.g. 14.372 hoặc hiển thị "14,372" với dấu phẩy thập phân kiểu VN).
//   v < 1 000           → đơn vị tỷ  → × 1 000 000 000
//   1 000 ≤ v < 100 000 → đơn vị triệu → × 1 000 000
//   v ≥ 100 000         → đã là đồng
function scalePrice(raw: unknown): number {
  const v = num(raw);
  if (v <= 0) return 0;
  if (v < 1_000)    return Math.round(v * 1_000_000_000); // tỷ → đồng
  if (v < 100_000)  return Math.round(v * 1_000_000);     // triệu → đồng
  return Math.round(v);
}

// ─── MULTI-SECTION GRID PARSER ─────────────────────────────────────────────────
// Handles Vietnamese stacking board layout with repeating section headers.
// Cột A xác định loại hàng:
//   "TẦNG/CĂN"  → header căn số, bắt đầu section mới
//   "LOẠI CĂN"  → loại căn (2BR, 3BR, DULEX...)
//   "DTTT"       → diện tích thông thuỷ (m²)
//   "HƯỚNG"      → hướng (ĐB, TN, TB, ĐN...)
//   "VIEW"        → tầm nhìn
//   số tầng      → hàng dữ liệu giá (03A, 05, 06...)
//
// Sheet có thể có nhiều section lặp lại (tầng đặc biệt, tầng thường, tầng cao DULEX)

type RowKind = 'tang_can' | 'loai_can' | 'dt_tim' | 'dttt' | 'huong' | 'view' | 'mau_o' | 'floor' | 'skip';

function classifyColA(raw: unknown): RowKind {
  const s = str(raw).trim();
  const u = s.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); // bỏ dấu để so sánh
  if (!s) return 'skip';
  // TẦNG/CĂN — nhận cả có và không dấu
  if ((u.includes('TANG') || u.includes('TẦNG')) && u.includes('/') && (u.includes('CAN') || u.includes('CĂN'))) return 'tang_can';
  // LOẠI CĂN
  if (u.startsWith('LOAI') || u.startsWith('LOẠI')) return 'loai_can';
  // DT TIM TƯỜNG — phải kiểm tra TRƯỚC DTTT để không nhầm
  if (u.includes('TIM') && (u.includes('DT') || u.includes('DIEN TICH'))) return 'dt_tim';
  // DTTT (DT Thông thủy)
  if (u === 'DTTT' || u === 'DT TT' || u.includes('THONG THUY') || u.includes('THÔNG THỦY')) return 'dttt';
  // HƯỚNG
  if (u === 'HƯỚNG' || u === 'HUONG' || u === 'HƯỚNG') return 'huong';
  // VIEW
  if (u === 'VIEW') return 'view';
  // MÀU — hàng đánh dấu loại đặc biệt: "ĐQ" = độc quyền, "CA" = check admin
  // Nhận cả dạng có dấu và không dấu
  if (u === 'MÀU' || u === 'MAU' || u === 'MÀUO' || u === 'MAUO') return 'mau_o';
  // Số tầng
  if (isFloorLabel(s)) return 'floor';
  return 'skip';
}

/** Giá trị cell có phải là nhãn section header không (để lọc khỏi canSo) */
function isSectionLabel(raw: unknown): boolean {
  const k = classifyColA(raw);
  return k !== 'floor' && k !== 'skip';
}

/**
 * Fetch cell background colors by calling the Google Sheets REST API directly
 * with an explicit `fields` parameter.  This is more reliable than reading
 * `_rawData` from the google-spreadsheet library because:
 *   - The explicit `fields` forces the API to return effectiveFormat even when
 *     it normally omits "unchanged" values from the response.
 *   - effectiveFormat is the fully-resolved colour including conditional formats
 *     and theme-palette fills that don't appear in userEnteredFormat.
 *
 * Returns a Map keyed by "{rowIndex}_{colIndex}" → 'xanh' | 'vang'.
 *
 * #00ff00 → xanh (HÀNG ĐỘC QUYỀN)   r≈0, g≈1, b≈0
 * #ffff00 → vang (CHECK ADMIN)       r≈1, g≈1, b≈0
 */
async function fetchSheetColors(
  spreadsheetId: string,
  sheetName: string,
  rowLimit: number,
  colLimit: number,
): Promise<Map<string, 'xanh' | 'vang'>> {
  const colorMap = new Map<string, 'xanh' | 'vang'>();
  try {
    const jwt = getJWT();
    const tokenResp = await jwt.getAccessToken();
    const token = tokenResp?.token;
    if (!token) { console.error('[fetchSheetColors] No access token'); return colorMap; }

    const cleanId  = extractSheetId(spreadsheetId);
    const rangeStr = `${sheetName}!A1:${colLetter(colLimit)}${rowLimit}`;
    const url      = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${cleanId}`);
    url.searchParams.set('ranges', rangeStr);
    url.searchParams.set('includeGridData', 'true');
    // NOTE: 'fields' causes includeGridData to be ignored by the API.
    // We must include properties(title) so we can find the correct sheet tab
    // from the response (API returns ALL sheets; sheets[0] may not be our tab).
    url.searchParams.set(
      'fields',
      'sheets(properties(title),data(rowData(values(effectiveFormat(backgroundColor,backgroundColorStyle)))))',
    );

    const resp = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!resp.ok) {
      console.error(`[fetchSheetColors] HTTP ${resp.status}`, await resp.text());
      return colorMap;
    }

    type RGBColor = { red?: number; green?: number; blue?: number };
    type CellEF   = {
      backgroundColor?:      RGBColor;
      backgroundColorStyle?: { rgbColor?: RGBColor; themeColor?: string };
    };
    const data = await resp.json() as {
      sheets?: Array<{
        properties?: { title?: string };
        data?: Array<{
          rowData?: Array<{ values?: Array<{ effectiveFormat?: CellEF }> }>;
        }>;
      }>;
    };

    // The API response contains ALL sheets in the spreadsheet; we must find
    // the one matching our tab name rather than blindly taking sheets[0].
    const targetSheet = data.sheets?.find(s => s.properties?.title === sheetName);
    const rowData = targetSheet?.data?.[0]?.rowData;
    if (!rowData) return colorMap;

    rowData.forEach((row, rowIdx) => {
      row.values?.forEach((cell, colIdx) => {
        const ef = cell.effectiveFormat;
        if (!ef) return;

        // backgroundColorStyle.rgbColor is the v4 preferred field;
        // backgroundColor is the deprecated fallback.
        const bg = ef.backgroundColorStyle?.rgbColor ?? ef.backgroundColor;
        if (!bg) return;

        const r = bg.red ?? 1, g = bg.green ?? 1, b = bg.blue ?? 1;

        if (r >= 0.9 && g >= 0.9 && b >= 0.9) return; // white/near-white → ignore

        if (r > 0.85 && g > 0.85 && b < 0.25) {
          colorMap.set(`${rowIdx}_${colIdx}`, 'vang');  // #ffff00
        } else if (r < 0.25 && g > 0.7 && b < 0.25) {
          colorMap.set(`${rowIdx}_${colIdx}`, 'xanh');  // #00ff00
        }
      });
    });

    if (colorMap.size > 0) {
      console.log(`[fetchSheetColors] "${sheetName}": ${colorMap.size} color(s) from API`);
    }
  } catch (err) {
    console.error('[fetchSheetColors] Error:', err);
  }
  return colorMap;
}

function parseGridTab(
  sheet: import('google-spreadsheet').GoogleSpreadsheetWorksheet,
  tower: string,
  rowLimit: number,
  colLimit: number,
  colorMap: Map<string, 'xanh' | 'vang'> = new Map(),
): StackingUnit[] {
  // Mảng section hiện tại — index = col position
  const canSoArr   = new Array<string | null>(colLimit).fill(null);
  const loaiCanArr = new Array<string>(colLimit).fill('');
  const dtTimArr   = new Array<number>(colLimit).fill(0);  // DT Tim tường (nếu grid có hàng riêng)
  const dtttArr    = new Array<number>(colLimit).fill(0);  // DT Thông thủy
  const huongArr   = new Array<string>(colLimit).fill('');
  const viewArr    = new Array<string>(colLimit).fill('');
  // mauOArr: đọc từ hàng "MÀU" trong sheet
  //   'xanh' = "ĐQ" / "DQ"  → Hàng Độc Quyền  (màu xanh #00ff00)
  //   'vang'  = "CA"          → Check Admin      (màu vàng #ffff00)
  //   null   = không đánh dấu
  const mauOArr = new Array<'xanh' | 'vang' | null>(colLimit).fill(null);
  let hasSect      = false;

  const units: StackingUnit[] = [];
  const seen       = new Set<string>(); // dedupe maCan

  for (let row = 0; row < rowLimit; row++) {
    const kind = classifyColA(sheet.getCell(row, 0).value);

    if (kind === 'tang_can') {
      // Bắt đầu section mới → reset metadata, đọc canSo từ hàng này
      hasSect = true;
      canSoArr.fill(null);
      loaiCanArr.fill('');
      dtTimArr.fill(0);
      dtttArr.fill(0);
      huongArr.fill('');
      viewArr.fill('');
      mauOArr.fill(null);
      for (let col = 1; col < colLimit; col++) {
        const v = str(sheet.getCell(row, col).value).trim();
        // Bỏ qua ô cuối lặp lại nhãn (TẦNG/CĂN, LOẠI CĂN...)
        canSoArr[col] = (v && !isSectionLabel(v)) ? v : null;
      }
    } else if (kind === 'loai_can' && hasSect) {
      for (let col = 1; col < colLimit; col++)
        loaiCanArr[col] = str(sheet.getCell(row, col).value).trim();
    } else if (kind === 'dt_tim' && hasSect) {
      for (let col = 1; col < colLimit; col++)
        dtTimArr[col] = num(sheet.getCell(row, col).value);
    } else if (kind === 'dttt' && hasSect) {
      for (let col = 1; col < colLimit; col++)
        dtttArr[col] = num(sheet.getCell(row, col).value);
    } else if (kind === 'huong' && hasSect) {
      // Forward-fill để xử lý merged cells: cell đầu của vùng merge có giá trị,
      // các cell còn lại trả về null → kéo giá trị sang phải cho đến khi gặp giá trị mới
      let lastHuong = '';
      for (let col = 1; col < colLimit; col++) {
        const v = str(sheet.getCell(row, col).value).trim();
        if (v) lastHuong = v;
        huongArr[col] = lastHuong;
      }
    } else if (kind === 'view' && hasSect) {
      // Forward-fill: dòng VIEW thường dùng merged cells ("Sông", "Nội khu", "Nhạc nước"...)
      // Chỉ cell đầu vùng merge có giá trị; forward-fill để lan sang các cột bên phải
      let lastView = '';
      for (let col = 1; col < colLimit; col++) {
        const v = str(sheet.getCell(row, col).value).trim();
        if (v) lastView = v;
        viewArr[col] = lastView;
      }
    } else if (kind === 'mau_o' && hasSect) {
      // Hàng "MÀU": mỗi cột ghi "ĐQ" (độc quyền) hoặc "CA" (check admin)
      for (let col = 1; col < colLimit; col++) {
        const v = str(sheet.getCell(row, col).value).trim().toUpperCase()
          .normalize('NFD').replace(/[̀-ͯ]/g, ''); // bỏ dấu để so sánh
        mauOArr[col] = (v === 'DQ' || v === 'DOC QUYEN') ? 'xanh'
                     : (v === 'CA' || v === 'CHECK ADMIN') ? 'vang'
                     : null;
      }
    } else if (kind === 'floor' && hasSect) {
      const tang = str(sheet.getCell(row, 0).value).trim();

      for (let col = 1; col < colLimit; col++) {
        const cs = canSoArr[col];
        if (!cs) continue;

        const raw = sheet.getCell(row, col).value;
        if (raw === null || raw === undefined || raw === '') continue;

        // Chỉ nhận số — bỏ ô chứa text (ví dụ nhãn)
        const n = typeof raw === 'number'
          ? raw
          : parseFloat(str(raw).replace(/[^\d.]/g, ''));
        if (!n || n <= 0) continue;

        const maCan = `${tower}-${tang}-${cs}`;
        if (seen.has(maCan)) continue;
        seen.add(maCan);

        // Ưu tiên hàng "MÀU" trong sheet; fallback sang colorMap từ API (nếu có)
        const mauO: 'xanh' | 'vang' | null = mauOArr[col] ?? colorMap.get(`${row}_${col}`) ?? null;

        units.push({
          maCan, tower, tang, canSo: cs,
          loaiCan:     loaiCanArr[col],
          dtTim:       dtTimArr[col] || dtttArr[col],  // dùng hàng DT TIM nếu có, fallback DTTT
          dtThongThuy: dtttArr[col],
          huong:       huongArr[col],
          view:        viewArr[col],
          giaKS:       scalePrice(n),
          trangThai:   'con_hang',
          mauO,
        });
      }
    }
  }

  return units;
}

// ─── LIST PARSER (fallback for master tabs with flat-list layout) ───────────────
// Each row = one unit; maCan in col B; loaiCan/dtTim/etc. in further columns.
const LIST_COL_MA_CAN        = 1;
const LIST_COL_LOAI_CAN      = 5;
const LIST_COL_DT_TIM        = 6;
const LIST_COL_DT_THONG_THUY = 7;
const LIST_COL_HUONG         = 8;
const LIST_COL_VIEW          = 9;
const LIST_COL_GIA_KS        = 10;
const LIST_COL_TTS           = 11;  // TTS Tạm tính
const LIST_COL_TT_CHUAN      = 12;  // TT CHUẨN Tạm tính
const LIST_COL_VAY_NH        = 13;  // Vay NH Tạm tính
const LIST_COL_LINK_PTG      = 14;  // Link Phiếu tính giá

function parseListTab(
  sheet: import('google-spreadsheet').GoogleSpreadsheetWorksheet,
  tower: string,
  rowLimit: number,
): StackingUnit[] {
  const prefix = tower + '-';
  const units: StackingUnit[] = [];

  for (let rowIdx = 1; rowIdx < rowLimit; rowIdx++) {
    const maCan = str(sheet.getCell(rowIdx, LIST_COL_MA_CAN).value);
    if (!maCan || !maCan.startsWith(prefix)) continue;

    const rest     = maCan.substring(prefix.length);
    const dashIdx  = rest.indexOf('-');
    const tang     = dashIdx >= 0 ? rest.substring(0, dashIdx) : rest;
    const canSo    = dashIdx >= 0 ? rest.substring(dashIdx + 1) : '';

    units.push({
      maCan, tower, tang, canSo,
      loaiCan:          str(sheet.getCell(rowIdx, LIST_COL_LOAI_CAN).value),
      dtTim:            num(sheet.getCell(rowIdx, LIST_COL_DT_TIM).value),
      dtThongThuy:      num(sheet.getCell(rowIdx, LIST_COL_DT_THONG_THUY).value),
      huong:            str(sheet.getCell(rowIdx, LIST_COL_HUONG).value),
      view:             str(sheet.getCell(rowIdx, LIST_COL_VIEW).value),
      giaKS:            scalePrice(sheet.getCell(rowIdx, LIST_COL_GIA_KS).value),
      ttsTamTinh:       scalePrice(sheet.getCell(rowIdx, LIST_COL_TTS).value),
      ttChuanTamTinh:   scalePrice(sheet.getCell(rowIdx, LIST_COL_TT_CHUAN).value),
      vayNhTamTinh:     scalePrice(sheet.getCell(rowIdx, LIST_COL_VAY_NH).value),
      linkPTG:          str(sheet.getCell(rowIdx, LIST_COL_LINK_PTG).value),
      trangThai:        'con_hang',
    });
  }
  return units;
}

/** Đọc bảng giá chi tiết từ master tab (list format), keyed by maCan.
 *  Dùng để augment grid-tab units với dtTim, huong, view, TTS / TT Chuẩn / Vay NH / Link PTG.
 *  Grid tab chỉ có DTTT, không có DT Tim tường riêng — master tab có cả hai. */
type PriceExtra = {
  dtTim?: number;
  huong?: string;
  view?: string;
  ttsTamTinh?: number;
  ttChuanTamTinh?: number;
  vayNhTamTinh?: number;
  linkPTG?: string;
};

/** Số cột tối đa quét header để auto-detect layout */
const LIST_SCAN_COLS = 30;

/** Chuẩn hoá chuỗi header: uppercase, bỏ dấu, bỏ khoảng trắng thừa */
function normHeader(raw: unknown): string {
  return str(raw).toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

/**
 * Tự động detect vị trí các cột quan trọng từ header row của master sheet.
 * Trả về map tên trường → column index (0-based).
 * Fallback về DEFAULT_LIST_COLS nếu không tìm thấy header.
 */
const DEFAULT_LIST_COLS = {
  maCan:   LIST_COL_MA_CAN,        // 1  (B)
  dtTim:   LIST_COL_DT_TIM,        // 6  (G)
  dttt:    LIST_COL_DT_THONG_THUY, // 7  (H)
  huong:   LIST_COL_HUONG,         // 8  (I)
  view:    LIST_COL_VIEW,           // 9  (J)
  giaKS:   LIST_COL_GIA_KS,        // 10 (K)
  tts:     LIST_COL_TTS,           // 11 (L)
  ttChuan: LIST_COL_TT_CHUAN,      // 12 (M)
  vayNh:   LIST_COL_VAY_NH,        // 13 (N)
  linkPTG: LIST_COL_LINK_PTG,      // 14 (O)
};

function detectListCols(
  sheet: import('google-spreadsheet').GoogleSpreadsheetWorksheet,
): typeof DEFAULT_LIST_COLS {
  const cols = { ...DEFAULT_LIST_COLS };
  const maxC = Math.min(sheet.columnCount, LIST_SCAN_COLS);
  let found = 0;

  for (let c = 0; c < maxC; c++) {
    const h = normHeader(sheet.getCell(0, c).value);
    if (!h) continue;

    if (h.includes('MA CAN') || h === 'MACAN' || h === 'MA_CAN') {
      cols.maCan = c; found++;
    } else if ((h.includes('TIM') || h.includes('TUONG')) && (h.includes('DT') || h.includes('DIEN TICH'))) {
      cols.dtTim = c; found++;
    } else if (h === 'DTTT' || h === 'DT TT' || h.includes('THONG THUY')) {
      cols.dttt = c; found++;
    } else if (h === 'HUONG' || h.startsWith('HUONG')) {
      cols.huong = c; found++;
    } else if (h === 'VIEW') {
      cols.view = c; found++;
    } else if ((h.includes('GIA') && h.includes('KS')) || h.includes('GIA KHAO SAT')) {
      cols.giaKS = c; found++;
    } else if (h.includes('TTS') && !h.includes('CHUAN') && !h.includes('VAY')) {
      cols.tts = c; found++;
    } else if ((h.includes('TT') && h.includes('CHUAN')) || (h.includes('CHUAN') && h.includes('TAM TINH'))) {
      cols.ttChuan = c; found++;
    } else if (h.includes('VAY') && (h.includes('NH') || h.includes('NGAN HANG'))) {
      cols.vayNh = c; found++;
    } else if (h.includes('PTG') || (h.includes('PHIEU') && h.includes('TINH')) || h === 'LINK PTG') {
      cols.linkPTG = c; found++;
    }

    if (found >= 8) break; // đủ rồi — không cần quét tiếp
  }

  return cols;
}

function buildPriceMap(
  sheet: import('google-spreadsheet').GoogleSpreadsheetWorksheet,
  rowLimit: number,
): Map<string, PriceExtra> {
  const c   = detectListCols(sheet);
  const map = new Map<string, PriceExtra>();

  for (let rowIdx = 1; rowIdx < rowLimit; rowIdx++) {
    const maCan = str(sheet.getCell(rowIdx, c.maCan).value);
    if (!maCan) continue;

    const dtTim   = num(sheet.getCell(rowIdx, c.dtTim).value);
    const huong   = str(sheet.getCell(rowIdx, c.huong).value);
    const view    = str(sheet.getCell(rowIdx, c.view).value);
    const tts     = scalePrice(sheet.getCell(rowIdx, c.tts).value);
    const ttChuan = scalePrice(sheet.getCell(rowIdx, c.ttChuan).value);
    const vayNh   = scalePrice(sheet.getCell(rowIdx, c.vayNh).value);
    const linkPTG = str(sheet.getCell(rowIdx, c.linkPTG).value);

    const entry: PriceExtra = {};
    if (dtTim)   entry.dtTim           = dtTim;
    if (huong)   entry.huong           = huong;
    if (view)    entry.view            = view;
    if (tts)     entry.ttsTamTinh      = tts;
    if (ttChuan) entry.ttChuanTamTinh  = ttChuan;
    if (vayNh)   entry.vayNhTamTinh    = vayNh;
    if (linkPTG) entry.linkPTG         = linkPTG;
    map.set(maCan, entry);
  }
  return map;
}

/**
 * Đọc màu ô từ tab "MÀU_DATA" do GAS script xuất ra.
 * GAS script (chạy trong Google Sheet) đọc màu nền mỗi cell và ghi vào:
 *   sheet | row | col | mau   (row/col là 0-based index)
 *
 * Trả về Map keyed "{row}_{col}" → 'xanh' | 'vang'
 * cho đúng sheet tab đang cần.
 *
 * Nếu tab MÀU_DATA chưa tồn tại → trả về Map rỗng (không lỗi).
 */
async function getMauDataColors(
  doc: GoogleSpreadsheet,
  sheetName: string,
): Promise<Map<string, 'xanh' | 'vang'>> {
  const colorMap = new Map<string, 'xanh' | 'vang'>();
  try {
    const mauSheet = doc.sheetsByTitle['MÀU_DATA'];
    if (!mauSheet) return colorMap;

    await mauSheet.loadHeaderRow();
    const rows = await mauSheet.getRows<Record<string, string>>();

    for (const row of rows) {
      if (row.get('sheet') !== sheetName) continue;
      const r = parseInt(row.get('row') ?? '');
      const c = parseInt(row.get('col') ?? '');
      const m = row.get('mau');
      if (isNaN(r) || isNaN(c)) continue;
      if (m === 'xanh' || m === 'vang') {
        colorMap.set(`${r}_${c}`, m);
      }
    }

    if (colorMap.size > 0) {
      console.log(`[getMauDataColors] "${sheetName}": ${colorMap.size} colored cell(s)`);
    }
  } catch {
    // Tab MÀU_DATA chưa được tạo hoặc có lỗi → tiếp tục không có màu
  }
  return colorMap;
}

// ─── STACKING "DANH SÁCH" (biệt thự/liền kề) ───────────────────────────────
// Khác hẳn parseListTab/StackingUnit ở trên (schema cố định, mã căn dạng
// "{tower}-{tầng}-{căn}") — nhà liền kề/biệt thự không có khái niệm tầng, và
// mỗi dự án có bộ cột tài chính khác nhau (VD file VHSGP có 34 cột). Đọc HOÀN
// TOÀN ĐỘNG theo header row thật của Sheet, không ép về field cứng nào.
//
// Header row KHÔNG cố định ở dòng 1 (file mẫu VHSGP có header ở dòng 3, sau 2
// dòng tiêu đề/chú thích màu) — tự dò bằng cách tìm dòng có 1 cell chuẩn hoá
// khớp "Mã căn" (dùng lại normHeader() đã có, cùng logic detectListCols()).
const HEADER_SCAN_ROWS = 10;

async function loadListTabAndFindHeader(sheetId: string, tabName: string) {
  const doc = await getDocBySheetId(sheetId);
  const sheet = doc.sheetsByTitle[tabName];
  if (!sheet) {
    throw new Error(
      `[Stacking] Tab "${tabName}" không tồn tại trong file (sheetId: ${sheetId}). ` +
      `Tab có thể đã bị đổi tên — vào "Quản lý Sheet" chọn lại đúng tab cho nguồn này.`
    );
  }

  const rowLimit = Math.min(sheet.rowCount, MAX_LIST_ROWS);
  const colLimit = Math.min(sheet.columnCount, MAX_STACKING_COLS);
  await sheet.loadCells(`A1:${colLetter(colLimit)}${rowLimit}`);

  const scanRows = Math.min(HEADER_SCAN_ROWS, rowLimit);
  let headerRowIdx = -1;
  let maCanColIdx = -1;
  for (let r = 0; r < scanRows && headerRowIdx < 0; r++) {
    for (let c = 0; c < colLimit; c++) {
      const h = normHeader(sheet.getCell(r, c).value);
      if (h.includes('MA CAN') || h === 'MACAN' || h === 'MA_CAN') {
        headerRowIdx = r;
        maCanColIdx = c;
        break;
      }
    }
  }
  if (headerRowIdx < 0) {
    throw new Error(
      `[Stacking] Không tìm thấy cột "Mã căn" trong ${scanRows} dòng đầu của tab "${tabName}". ` +
      `Kiểm tra lại đây có đúng là tab bảng hàng không (mỗi dòng 1 căn, có cột "Mã căn").`
    );
  }

  return { sheet, rowLimit, colLimit, headerRowIdx, maCanColIdx };
}

/** Chỉ đọc header row (không đọc dữ liệu) — dùng cho bước "chọn cột hiển thị"
 * lúc Admin thêm/sửa nguồn Danh sách, tách riêng khỏi getStackingListRows để
 * không phải quét hết mọi dòng dữ liệu chỉ để lấy tên cột. */
export async function getStackingListColumns(sheetId: string, tabName: string): Promise<string[]> {
  const { sheet, colLimit, headerRowIdx } = await loadListTabAndFindHeader(sheetId, tabName);
  const columns: string[] = [];
  for (let c = 0; c < colLimit; c++) {
    const header = str(sheet.getCell(headerRowIdx, c).value).trim();
    if (header) columns.push(header);
  }
  return columns;
}

// Đỏ thuần = quy ước "Đã bán" của Sale trong Sheet gốc (xem chú thích ở nơi
// dùng, getStackingListRows) — căn này bị loại HẲN khỏi Bảng hàng, không chỉ
// tô màu tham khảo như các màu đánh dấu khác (VD "Check admin" vàng).
const SOLD_ROW_COLOR = '#ff0000';

// Sheets API trả màu 0..1 (float) — quy đổi sang hex "#rrggbb". Trắng/không có
// format -> null (không phải màu đánh dấu, không tô gì trên UI).
function backgroundColorToHex(bg: { red?: number; green?: number; blue?: number } | undefined): string | null {
  if (!bg) return null;
  const r = Math.round((bg.red ?? 0) * 255);
  const g = Math.round((bg.green ?? 0) * 255);
  const b = Math.round((bg.blue ?? 0) * 255);
  if (r === 255 && g === 255 && b === 255) return null; // trắng = không đánh dấu
  const hex = (n: number) => n.toString(16).padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

export async function getStackingListRows(
  sheetId: string,
  tabName: string,
  visibleColumns?: readonly string[],
): Promise<{ columns: string[]; rows: import('./types').StackingListRow[] }> {
  const { sheet, rowLimit, colLimit, headerRowIdx, maCanColIdx } = await loadListTabAndFindHeader(sheetId, tabName);

  // Mọi cột có tiêu đề không rỗng trên header row → giữ NGUYÊN text gốc làm
  // cả key lẫn label hiển thị (không ánh xạ sang field cứng nào). Nếu Admin
  // đã chọn visibleColumns, chỉ giữ đúng các cột đó, ĐÚNG thứ tự đã chọn —
  // cột nào không còn tồn tại trong Sheet (VD đổi tên header) bị bỏ qua âm
  // thầm thay vì lỗi, để 1 header đổi tên không sập cả bảng.
  const allColumnDefs: { colIdx: number; header: string }[] = [];
  for (let c = 0; c < colLimit; c++) {
    const header = str(sheet.getCell(headerRowIdx, c).value).trim();
    if (header) allColumnDefs.push({ colIdx: c, header });
  }
  const columnDefs = visibleColumns && visibleColumns.length > 0
    ? visibleColumns
        .map(name => allColumnDefs.find(c => c.header === name))
        .filter((c): c is { colIdx: number; header: string } => Boolean(c))
    : allColumnDefs;
  // Cột "Căn" (loại căn viết tắt: LK, SL, SLHT...) rỗng -> dòng chưa hoàn
  // chỉnh/không phải hàng thật, ẨN khỏi Bảng hàng — kiểm tra độc lập với
  // visibleColumns (dù Admin có chọn hiện cột này hay không, quy tắc lọc vẫn
  // áp dụng như nhau). Không tồn tại cột "Căn" trong Sheet -> bỏ qua bộ lọc này.
  const canColDef = allColumnDefs.find(c => c.header === 'Căn');

  const rows: import('./types').StackingListRow[] = [];
  for (let r = headerRowIdx + 1; r < rowLimit; r++) {
    const maCan = str(sheet.getCell(r, maCanColIdx).value).trim();
    if (!maCan) continue; // dòng trống hoặc dòng section-note khác — bỏ qua, không suy diễn

    if (canColDef && !str(sheet.getCell(r, canColDef.colIdx).value).trim()) continue;

    // Màu dòng lấy đại diện từ cell "Mã căn" (luôn có dữ liệu thật, khác các ô
    // trống có thể giữ nguyên nền mặc định). Đỏ thuần (#ff0000) đúng theo chú
    // thích "Đã bán" mà Sale tự đánh dấu ngay trong Sheet (VD legend D2/E2 của
    // file VHSGP) — căn đã bán KHÔNG hiện trên Bảng hàng nữa, loại bỏ HẲN khỏi
    // kết quả (không phải chỉ tô màu để tham khảo như các màu khác).
    const rowColor = backgroundColorToHex(sheet.getCell(r, maCanColIdx).effectiveFormat?.backgroundColor) ?? undefined;
    if (rowColor === SOLD_ROW_COLOR) continue;

    const values: Record<string, string | number | null> = {};
    let hyperlinks: Record<string, string> | undefined;
    for (const { colIdx, header } of columnDefs) {
      const cell = sheet.getCell(r, colIdx);
      const raw = cell.value;
      values[header] = raw === null || raw === undefined || raw === ''
        ? null
        : (typeof raw === 'number' ? raw : str(raw));
      // Hyperlink thật gắn trên cell (Insert > Link trong Sheets, VD cột LINK
      // PTG trỏ Drive) — CHỈ set khi cell đó thật sự có, không suy đoán từ text.
      if (cell.hyperlink) (hyperlinks ??= {})[header] = cell.hyperlink;
    }

    rows.push({ maCan, values, hyperlinks, rowColor, trangThai: 'con_hang' });
  }

  return { columns: columnDefs.map(c => c.header), rows };
}

export async function getStackingUnits(sheetId: string, project: string, tower: string): Promise<StackingUnit[]> {
  const doc = await getDocBySheetId(sheetId);

  // Prefer individual tower tab ("MPP A1"), fall back to master tab ("MPP")
  const towerTabName = `${project} ${tower}`;
  const towerSheet   = doc.sheetsByTitle[towerTabName];
  const masterSheet  = towerSheet ? null : doc.sheetsByTitle[project];

  const sheet = towerSheet ?? masterSheet;
  if (!sheet) {
    throw new Error(
      `[Stacking] Tab "${towerTabName}" không tồn tại trong file. ` +
      `Cũng không tìm thấy tab master "${project}". (sheetId: ${sheetId})`
    );
  }

  // Grid tab dùng MAX_STACKING_ROWS (compact); list tab dùng MAX_LIST_ROWS (nhiều row hơn)
  // Bỏ phần alias trong ngoặc để dùng làm mã căn: "HH-A (L1)" → "HH-A"
  const towerCode = tower.replace(/\s*\(.*\)\s*$/, '').trim() || tower;

  const rowLimit  = Math.min(sheet.rowCount, towerSheet ? MAX_STACKING_ROWS : MAX_LIST_ROWS);
  const colLimit  = Math.min(sheet.columnCount, MAX_STACKING_COLS);
  const rangeA1   = `A1:${colLetter(colLimit)}${rowLimit}`;
  const sheetName = towerSheet ? towerTabName : project;

  // Load cells + đọc MÀU_DATA tab (do GAS script xuất ra) song song.
  // MÀU_DATA chứa: sheet | row | col | mau — per-cell color mapping.
  const [, colorMap] = await Promise.all([
    sheet.loadCells(rangeA1),
    getMauDataColors(doc, sheetName),
  ]);

  if (towerSheet) {
    // Tower tab → try visual grid first, fall back to list
    const gridUnits = parseGridTab(sheet, towerCode, rowLimit, colLimit, colorMap);
    if (gridUnits.length > 0) {
      // Cross-reference master tab để lấy TTS / TT Chuẩn / Vay NH / Link PTG
      try {
        const masterSheet = doc.sheetsByTitle[project];
        if (masterSheet) {
          const mr = Math.min(masterSheet.rowCount, MAX_LIST_ROWS);
          const mc = Math.min(masterSheet.columnCount, LIST_SCAN_COLS);
          await masterSheet.loadCells(`A1:${colLetter(mc)}${mr}`);
          const priceMap = buildPriceMap(masterSheet, mr);
          if (priceMap.size > 0) {
            return gridUnits.map(u => {
              const extra = priceMap.get(u.maCan);
              return extra ? { ...u, ...extra } : u;
            });
          }
        }
      } catch {
        // Master tab không tồn tại hoặc lỗi → trả grid units bình thường
      }
      return gridUnits;
    }
  }

  // Master tab (or tower tab that looks like a list)
  return parseListTab(sheet, tower, rowLimit);
}

// ============================================================
// PHÂN KHÁCH CONFIG
// ============================================================

const PHAN_KHACH_CONFIG_HEADERS = ['id', 'ten_hien_thi', 'sheet_id', 'trang_thai', 'ngay_tao'];

async function getOrCreatePhanKhachConfigSheet(doc: GoogleSpreadsheet): Promise<GoogleSpreadsheetWorksheet> {
  let sheet = doc.sheetsByTitle['PHAN_KHACH_CONFIG'];
  if (!sheet) {
    sheet = await doc.addSheet({ title: 'PHAN_KHACH_CONFIG', headerValues: PHAN_KHACH_CONFIG_HEADERS });
  } else {
    await sheet.loadHeaderRow();
  }
  return sheet;
}

export async function getPhanKhachConfigs(): Promise<PhanKhachConfig[]> {
  const doc = await getDoc();
  const sheet = await getOrCreatePhanKhachConfigSheet(doc);
  const rows = await sheet.getRows();
  return rows
    .map(r => {
      const v = r.toObject();
      return {
        id:           str(v['id']),
        ten_hien_thi: str(v['ten_hien_thi']),
        sheet_id:     str(v['sheet_id']),
        trang_thai:   (str(v['trang_thai']) || 'active') as 'active' | 'inactive',
        ngay_tao:     str(v['ngay_tao']),
      };
    })
    .filter(c => c.id && c.sheet_id);
}

export async function addPhanKhachConfig(
  payload: { ten_hien_thi: string; sheet_id: string }
): Promise<PhanKhachConfig> {
  const doc = await getDoc();
  const sheet = await getOrCreatePhanKhachConfigSheet(doc);
  const id = 'PKC_' + Date.now();
  const newRow = {
    id,
    ten_hien_thi: payload.ten_hien_thi,
    sheet_id:     extractSheetId(payload.sheet_id),
    trang_thai:   'active',
    ngay_tao:     new Date().toISOString(),
  };
  await sheet.addRow(newRow);
  return { ...newRow, trang_thai: 'active' };
}

export async function deletePhanKhachConfig(id: string): Promise<boolean> {
  const doc = await getDoc();
  const sheet = await getOrCreatePhanKhachConfigSheet(doc);
  const rows = await sheet.getRows();
  const row = rows.find(r => str(r.toObject()['id']) === id);
  if (!row) return false;
  await row.delete();
  return true;
}

// Detect which spreadsheet column header maps to each KhachHang field
function detectPhanKhachColumns(headers: string[]): Record<string, string> {
  // Normalize to NFC + lowercase to handle Google Sheets' NFD encoding
  const norm = (s: string) => s.normalize('NFC').toLowerCase().trim();
  const lower = headers.map(norm);
  const find = (patterns: string[]): string => {
    const normPatterns = patterns.map(norm);
    for (let i = 0; i < lower.length; i++) {
      for (const p of normPatterns) {
        if (lower[i].includes(p)) return headers[i];
      }
    }
    return '';
  };
  return {
    ten_KH:        find(['họ tên', 'ho ten', 'tên kh', 'ten_kh', 'ten kh', 'fullname', 'full name', 'họ và tên', 'tên khách', 'name']),
    so_dien_thoai: find(['số điện thoại', 'so dien thoai', 'sđt', 'sdt', 'phone', 'mobile', 'điện thoại', 'so_dt', 'so dt']),
    email:         find(['email', 'gmail', 'e-mail']),
    nguon:         find(['nguồn', 'nguon', 'source', 'kênh', 'kenh']),
    nhu_cau:       find(['nhu cầu', 'nhu_cau', 'yêu cầu', 'sản phẩm', 'san pham', 'quan tâm', 'mục đích', 'muc dich']),
    sale_lan_1:    find(['người chăm 1', 'nguoi cham 1', 'sale lần 1', 'sale_lan_1', 'sale 1', 'chăm sóc 1']),
    ghi_chu_lan_1: find(['ghi chú 1', 'ghi chu 1', 'ghi_chu_lan_1', 'note 1', 'ghi chú lần 1']),
    sale_lan_2:    find(['người chăm 2', 'nguoi cham 2', 'sale lần 2', 'sale_lan_2', 'sale 2', 'chăm sóc 2']),
    ghi_chu_lan_2: find(['ghi chú 2', 'ghi chu 2', 'ghi_chu_lan_2', 'note 2', 'ghi chú lần 2']),
    sale_lan_3:    find(['người chăm 3', 'nguoi cham 3', 'sale lần 3', 'sale_lan_3', 'sale 3', 'chăm sóc 3']),
    ghi_chu_lan_3: find(['ghi chú 3', 'ghi chu 3', 'ghi_chu_lan_3', 'note 3', 'ghi chú lần 3']),
  };
}

// Read header row from a sheet using loadCells — tolerates duplicate header names
// by appending _2, _3 etc. Never calls loadHeaderRow() which throws on duplicates.
async function readSheetHeaders(sheet: GoogleSpreadsheetWorksheet): Promise<string[]> {
  const colCount = Math.min(sheet.columnCount || 30, 30);
  await sheet.loadCells({ startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: colCount });
  const headers: string[] = [];
  const seen = new Set<string>();
  for (let col = 0; col < colCount; col++) {
    const raw = String(sheet.getCell(0, col).value ?? '').normalize('NFC').trim();
    if (!raw) { if (headers.length > 0) break; continue; }
    let name = raw;
    let n = 2;
    while (seen.has(name)) name = `${raw}_${n++}`;
    seen.add(name);
    headers.push(name);
  }
  return headers;
}

export async function probePhanKhachSheet(sheetId: string): Promise<{
  ok: boolean;
  msg: string;
  tabs?: string[];
  columns?: Record<string, string>;
  preview?: Record<string, string>[];
}> {
  try {
    const rawId = extractSheetId(sheetId);
    const doc = await getDocBySheetId(rawId);
    const allTabs = Object.values(doc.sheetsByIndex).map((s: GoogleSpreadsheetWorksheet) => s.title);

    const firstSheet = doc.sheetsByIndex[0];
    const headers = await readSheetHeaders(firstSheet);
    const columns = detectPhanKhachColumns(headers);

    // Load 4 preview rows using cells (safe for any header structure)
    const previewRowCount = Math.min((firstSheet.rowCount || 2), 5);
    await firstSheet.loadCells({
      startRowIndex: 1,
      endRowIndex: previewRowCount,
      startColumnIndex: 0,
      endColumnIndex: headers.length,
    });
    const preview: Record<string, string>[] = [];
    for (let row = 1; row < previewRowCount; row++) {
      const rowData: Record<string, string> = {};
      let hasData = false;
      for (let col = 0; col < headers.length; col++) {
        const val = String(firstSheet.getCell(row, col).value ?? '').trim();
        if (val) hasData = true;
        rowData[headers[col]] = val;
      }
      if (hasData) preview.push(rowData);
    }

    const detectedCount = Object.values(columns).filter(Boolean).length;
    return {
      ok: true,
      msg: `Kết nối thành công. ${allTabs.length} tab, ${headers.length} cột, nhận diện được ${detectedCount}/5 trường.`,
      tabs: allTabs,
      columns,
      preview,
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, msg: `Lỗi kết nối: ${msg}` };
  }
}

type KhachHangFieldUpdate = Partial<Pick<KhachHang,
  'du_an' | 'sale_phu_trach' | 'telesale_phu_trach' |
  'sale_lan_1' | 'ghi_chu_lan_1' |
  'sale_lan_2' | 'ghi_chu_lan_2' |
  'sale_lan_3' | 'ghi_chu_lan_3'
>>;

// Batch-update multiple fields for customers matched by phone key
async function batchUpdateKhachHangFields(
  updates: Map<string, KhachHangFieldUpdate>
): Promise<number> {
  if (updates.size === 0) return 0;
  const doc = await getDoc();
  const sheet = doc.sheetsByTitle[SHEETS.KHACH_HANG];
  if (!sheet) return 0;

  await sheet.loadHeaderRow();
  const h = sheet.headerValues;
  const sdtIdx = h.indexOf('so_dien_thoai');
  if (sdtIdx < 0) return 0;

  const updateFields: (keyof KhachHangFieldUpdate)[] = [
    'du_an', 'sale_phu_trach', 'telesale_phu_trach',
    'sale_lan_1', 'ghi_chu_lan_1',
    'sale_lan_2', 'ghi_chu_lan_2',
    'sale_lan_3', 'ghi_chu_lan_3',
  ];
  const fieldCols: Partial<Record<keyof KhachHangFieldUpdate, number>> = {};
  for (const f of updateFields) {
    const idx = h.indexOf(f);
    if (idx >= 0) fieldCols[f] = idx;
  }

  const allCols = [sdtIdx, ...Object.values(fieldCols) as number[]];
  const minCol = Math.min(...allCols);
  const maxCol = Math.max(...allCols);
  const totalRows = sheet.rowCount || 1;

  await sheet.loadCells({ startRowIndex: 1, endRowIndex: totalRows, startColumnIndex: minCol, endColumnIndex: maxCol + 1 });

  function phoneKey(p: string) { return String(p).replace(/\D/g, '').slice(-9); }

  let updated = 0;
  for (let row = 1; row < totalRows; row++) {
    const key = phoneKey(String(sheet.getCell(row, sdtIdx).value ?? ''));
    if (!key || !updates.has(key)) continue;
    const upd = updates.get(key)!;
    let changed = false;
    for (const [field, colIdx] of Object.entries(fieldCols) as [keyof KhachHangFieldUpdate, number][]) {
      const val = upd[field];
      if (val) {
        const cell = sheet.getCell(row, colIdx);
        if (String(cell.value ?? '').trim() !== val) { cell.value = val; changed = true; }
      }
    }
    if (changed) updated++;
  }

  if (updated > 0) await sheet.saveUpdatedCells();
  return updated;
}

export async function importFromPhanKhachConfig(
  sheetId: string,
  duAn: string,
): Promise<{ imported: number; duplicates: number; updated: number }> {
  const rawId = extractSheetId(sheetId);
  const doc = await getDocBySheetId(rawId);
  const firstSheet = doc.sheetsByIndex[0];

  const headers = await readSheetHeaders(firstSheet);
  const colMap = detectPhanKhachColumns(headers);

  const colIdx: Record<string, number> = {};
  for (const [field, headerName] of Object.entries(colMap)) {
    if (headerName) {
      const idx = headers.indexOf(headerName);
      if (idx >= 0) colIdx[field] = idx;
    }
  }

  const totalRows = firstSheet.rowCount || 1;
  const BATCH = 500;

  const existing = await getKhachHang();
  function phoneKey(p: string) { return String(p).replace(/\D/g, '').slice(-9); }

  const existingPhoneMap = new Map(existing.map(kh => [phoneKey(kh.so_dien_thoai), kh.du_an ?? '']));
  const seenPhones = new Set(existingPhoneMap.keys());

  const toImport: KhachHang[] = [];
  const fieldUpdates = new Map<string, KhachHangFieldUpdate>();
  let duplicates = 0;

  const cellVal = (row: number, field: string): string => {
    const idx = colIdx[field];
    if (idx === undefined) return '';
    return String(firstSheet.getCell(row, idx).value ?? '').trim();
  };

  for (let startRow = 1; startRow < totalRows; startRow += BATCH) {
    const endRow = Math.min(startRow + BATCH, totalRows);
    await firstSheet.loadCells({
      startRowIndex: startRow,
      endRowIndex: endRow,
      startColumnIndex: 0,
      endColumnIndex: headers.length,
    });

    for (let row = startRow; row < endRow; row++) {
      const rawTen = cellVal(row, 'ten_KH');
      const rawSdt = cellVal(row, 'so_dien_thoai');
      if (!rawTen || !rawSdt) continue;

      let sdt = rawSdt.replace(/\D/g, '');
      if (sdt.startsWith('84') && sdt.length === 11) sdt = '0' + sdt.slice(2);
      if (sdt.length === 9) sdt = '0' + sdt;
      if (sdt.length > 0 && !sdt.startsWith('0')) sdt = '0' + sdt;

      const s1 = cellVal(row, 'sale_lan_1');
      const n1 = cellVal(row, 'ghi_chu_lan_1');
      const s2 = cellVal(row, 'sale_lan_2');
      const n2 = cellVal(row, 'ghi_chu_lan_2');
      const s3 = cellVal(row, 'sale_lan_3');
      const n3 = cellVal(row, 'ghi_chu_lan_3');
      const latestSale = s3 || s2 || s1;

      const key = phoneKey(sdt);
      if (seenPhones.has(key)) {
        duplicates++;
        // Build field update for existing customer
        const upd: KhachHangFieldUpdate = {};
        if (duAn && (existingPhoneMap.get(key) ?? '') === '') upd.du_an = duAn;
        if (s1) upd.sale_lan_1 = s1;
        if (n1) upd.ghi_chu_lan_1 = n1;
        if (s2) upd.sale_lan_2 = s2;
        if (n2) upd.ghi_chu_lan_2 = n2;
        if (s3) upd.sale_lan_3 = s3;
        if (n3) upd.ghi_chu_lan_3 = n3;
        if (latestSale) upd.telesale_phu_trach = latestSale;
        if (Object.keys(upd).length > 0) fieldUpdates.set(key, upd);
        continue;
      }
      seenPhones.add(key);

      toImport.push({
        id_khach_hang:  `KH_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
        ngay_tao:       new Date().toISOString(),
        ten_KH:         rawTen,
        so_dien_thoai:  sdt,
        email:          cellVal(row, 'email'),
        nguon:          cellVal(row, 'nguon'),
        nhu_cau:        cellVal(row, 'nhu_cau'),
        ghi_chu:        '',
        sale_phu_trach: '',
        telesale_phu_trach: latestSale,
        trang_thai_cham_soc: 'Chưa gọi',
        muc_do_quan_tam: 'Chưa xác định',
        so_lan_lien_he: 0,
        lich_su_cham_soc: '[]',
        trang_thai_ban_giao: 'Chưa bàn giao',
        lich_su_ban_giao: '[]',
        sale_lan_1:     s1,
        ghi_chu_lan_1:  n1,
        sale_lan_2:     s2,
        ghi_chu_lan_2:  n2,
        sale_lan_3:     s3,
        ghi_chu_lan_3:  n3,
        label_khach:    `${rawTen} - ${sdt}`,
        du_an:          duAn,
      });
    }
  }

  const [, updated] = await Promise.all([
    toImport.length > 0 ? addKhachHangBatch(toImport) : Promise.resolve(),
    batchUpdateKhachHangFields(fieldUpdates),
  ]);

  return { imported: toImport.length, duplicates, updated };
}

// ─── Tài chính history ────────────────────────────────────────────────────────

const TC_HISTORY_HEADERS = [
  'id', 'ngay_upload', 'ky_bao_cao', 'ten_file', 'so_can',
  'doanh_so_ty', 'dt_mg_ty', 'hh_sales_pct', 'ln_ty', 'ln_pct',
  'data_json',
] as const;

export interface TaiChinhHistoryRow {
  id: string;
  ngay_upload: string;
  ky_bao_cao: string;
  ten_file: string;
  so_can: number;
  doanh_so_ty: number;
  dt_mg_ty: number;
  hh_sales_pct: number;
  ln_ty: number;
  ln_pct: number;
  data_json: string;
}

async function getOrCreateTaiChinhHistorySheet(doc: GoogleSpreadsheet): Promise<GoogleSpreadsheetWorksheet> {
  let sheet = doc.sheetsByTitle[SHEETS.TAI_CHINH_HISTORY];
  if (!sheet) {
    sheet = await doc.addSheet({
      title: SHEETS.TAI_CHINH_HISTORY,
      headerValues: [...TC_HISTORY_HEADERS],
    });
  } else {
    try {
      await sheet.loadHeaderRow();
    } catch {
      await sheet.setHeaderRow([...TC_HISTORY_HEADERS]);
    }
  }
  return sheet;
}

export async function getTaiChinhHistory(): Promise<TaiChinhHistoryRow[]> {
  const doc = await getDoc();
  const sheet = await getOrCreateTaiChinhHistorySheet(doc);
  const rows = await sheet.getRows();
  return rows
    .map(r => ({
      id:           String(r.get('id') ?? ''),
      ngay_upload:  String(r.get('ngay_upload') ?? ''),
      ky_bao_cao:   String(r.get('ky_bao_cao') ?? ''),
      ten_file:     String(r.get('ten_file') ?? ''),
      so_can:       Number(r.get('so_can') ?? 0),
      doanh_so_ty:  Number(r.get('doanh_so_ty') ?? 0),
      dt_mg_ty:     Number(r.get('dt_mg_ty') ?? 0),
      hh_sales_pct: Number(r.get('hh_sales_pct') ?? 0),
      ln_ty:        Number(r.get('ln_ty') ?? 0),
      ln_pct:       Number(r.get('ln_pct') ?? 0),
      data_json:    String(r.get('data_json') ?? ''),
    }))
    .filter(r => r.id)
    .sort((a, b) => b.ngay_upload.localeCompare(a.ngay_upload));
}

export async function saveTaiChinhHistory(row: TaiChinhHistoryRow): Promise<void> {
  const doc = await getDoc();
  const sheet = await getOrCreateTaiChinhHistorySheet(doc);
  await sheet.addRow({
    id:           row.id,
    ngay_upload:  row.ngay_upload,
    ky_bao_cao:   row.ky_bao_cao,
    ten_file:     row.ten_file,
    so_can:       row.so_can,
    doanh_so_ty:  row.doanh_so_ty,
    dt_mg_ty:     row.dt_mg_ty,
    hh_sales_pct: row.hh_sales_pct,
    ln_ty:        row.ln_ty,
    ln_pct:       row.ln_pct,
    data_json:    row.data_json,
  });
}

// ============================================================
// CHẤM CÔNG NGOÀI
// ============================================================

const CCN_HEADERS = [
  'id', 'id_nhan_vien', 'ho_ten', 'ngay', 'gio_bat_dau', 'gio_ket_thuc',
  'du_an_khach_hang', 'dia_diem', 'ghi_chu', 'hinh_anh', 'ql_truc_tiep',
  'trang_thai', 'nguoi_duyet', 'ghi_chu_duyet', 'created_at',
] as const;

function chamCongNgoaiToSheetRow(row: ChamCongNgoai): Record<(typeof CCN_HEADERS)[number], string> {
  return {
    id:               row.id,
    id_nhan_vien:     row.id_nhan_vien,
    ho_ten:           row.ho_ten || '',
    ngay:             row.ngay,
    gio_bat_dau:      row.gio_bat_dau,
    gio_ket_thuc:     row.gio_ket_thuc,
    du_an_khach_hang: row.du_an_khach_hang,
    dia_diem:         row.dia_diem || '',
    ghi_chu:          row.ghi_chu || '',
    // Ảnh gốc (base64) chỉ lưu ở PostgreSQL để app hiển thị. Sheet là bản
    // mirror cho người xem nên chỉ ghi dấu, tránh phình cột base64 rất dài.
    hinh_anh:         row.hinh_anh ? 'Có ảnh' : '',
    ql_truc_tiep:     row.ql_truc_tiep || '',
    trang_thai:       row.trang_thai,
    nguoi_duyet:      row.nguoi_duyet || '',
    ghi_chu_duyet:    row.ghi_chu_duyet || '',
    created_at:       row.created_at,
  };
}

async function getOrCreateChamCongNgoaiSheet(doc: GoogleSpreadsheet): Promise<GoogleSpreadsheetWorksheet> {
  let sheet = doc.sheetsByTitle[SHEETS.CHAM_CONG_NGOAI];
  if (!sheet) {
    sheet = await doc.addSheet({ title: SHEETS.CHAM_CONG_NGOAI, headerValues: [...CCN_HEADERS] });
  } else {
    try {
      await sheet.loadHeaderRow();
    } catch {
      await sheet.setHeaderRow([...CCN_HEADERS]);
    }
    // Safe migration: add missing columns
    const existing = new Set(sheet.headerValues || []);
    const missing = [...CCN_HEADERS].filter(h => !existing.has(h));
    if (missing.length > 0) {
      await sheet.setHeaderRow([...(sheet.headerValues || []), ...missing]);
      await sheet.loadHeaderRow();
    }
  }
  return sheet;
}

export async function getChamCongNgoai(
  idNhanVien?: string,
  qlTrucTiep?: string,
): Promise<ChamCongNgoai[]> {
  const doc = await getDoc();
  const sheet = await getOrCreateChamCongNgoaiSheet(doc);
  const rows = await sheet.getRows();
  return rows
    .map(r => {
      const v = r.toObject();
      return {
        id:               str(v.id),
        id_nhan_vien:     str(v.id_nhan_vien),
        ho_ten:           str(v.ho_ten),
        ngay:             str(v.ngay),
        gio_bat_dau:      str(v.gio_bat_dau),
        gio_ket_thuc:     str(v.gio_ket_thuc),
        du_an_khach_hang: str(v.du_an_khach_hang),
        dia_diem:         str(v.dia_diem),
        ghi_chu:          str(v.ghi_chu),
        hinh_anh:         str(v.hinh_anh) || undefined,
        vi_tri_gps:       str(v.vi_tri_gps) || undefined,
        ql_truc_tiep:     str(v.ql_truc_tiep) || undefined,
        trang_thai:       (str(v.trang_thai) || 'cho_duyet') as ChamCongNgoai['trang_thai'],
        nguoi_duyet:      str(v.nguoi_duyet) || undefined,
        ghi_chu_duyet:    str(v.ghi_chu_duyet) || undefined,
        created_at:       str(v.created_at),
      };
    })
    .filter(r =>
      r.id &&
      (!idNhanVien || r.id_nhan_vien === idNhanVien) &&
      (!qlTrucTiep || r.ql_truc_tiep === qlTrucTiep),
    )
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function addChamCongNgoai(payload: Omit<ChamCongNgoai, 'id' | 'created_at' | 'trang_thai' | 'nguoi_duyet' | 'ghi_chu_duyet'>): Promise<ChamCongNgoai> {
  const doc = await getDoc();
  const sheet = await getOrCreateChamCongNgoaiSheet(doc);
  const id = `CCN_${Date.now()}`;
  const created_at = new Date().toISOString();
  await sheet.addRow(chamCongNgoaiToSheetRow({ ...payload, id, trang_thai: 'cho_duyet', created_at }));
  await addLog(doc, 'CREATE_CHAM_CONG_NGOAI', id, payload.id_nhan_vien, payload.ho_ten || '');
  return { ...payload, id, trang_thai: 'cho_duyet', created_at };
}

export async function upsertChamCongNgoai(row: ChamCongNgoai): Promise<void> {
  const doc = await getDoc();
  const sheet = await getOrCreateChamCongNgoaiSheet(doc);
  const rows = await sheet.getRows();
  const existing = rows.find(r => str(r.toObject()['id']) === row.id);
  const data = chamCongNgoaiToSheetRow(row);

  if (!existing) {
    await sheet.addRow(data);
    return;
  }

  for (const header of CCN_HEADERS) {
    existing.set(header, data[header]);
  }
  await existing.save();
}

export async function updateChamCongNgoaiStatus(
  id: string,
  trang_thai: 'da_duyet' | 'tu_choi',
  nguoi_duyet: string,
  ghi_chu_duyet?: string,
  // Nếu truyền vào: chỉ cho phép duyệt nếu ql_truc_tiep của đơn khớp với tên này
  requiredQL?: string,
): Promise<boolean | 'forbidden'> {
  const doc = await getDoc();
  const sheet = await getOrCreateChamCongNgoaiSheet(doc);
  const rows = await sheet.getRows();
  const row = rows.find(r => str(r.toObject()['id']) === id);
  if (!row) return false;
  // Kiểm tra quyền QL: nếu requiredQL được truyền, ql_truc_tiep phải khớp
  if (requiredQL) {
    const v = row.toObject();
    if (str(v['ql_truc_tiep']) !== requiredQL) return 'forbidden';
  }
  row.set('trang_thai', trang_thai);
  row.set('nguoi_duyet', nguoi_duyet);
  row.set('ghi_chu_duyet', ghi_chu_duyet || '');
  await row.save();
  await addLog(doc, `APPROVE_CCN_${trang_thai.toUpperCase()}`, id, '', nguoi_duyet);
  return true;
}

export async function deleteChamCongNgoai(id: string, idNhanVien: string): Promise<boolean> {
  const doc = await getDoc();
  const sheet = await getOrCreateChamCongNgoaiSheet(doc);
  const rows = await sheet.getRows();
  const row = rows.find(r => str(r.toObject()['id']) === id);
  if (!row) return false;
  const v = row.toObject();
  if (str(v['id_nhan_vien']) !== idNhanVien) return false; // chỉ người tạo mới được xóa
  if (str(v['trang_thai']) !== 'cho_duyet') throw new Error('Chỉ xóa được đơn đang chờ duyệt');
  await row.delete();
  await addLog(doc, 'DELETE_CHAM_CONG_NGOAI', id, idNhanVien, '');
  return true;
}

export async function deleteChamCongNgoaiById(id: string): Promise<boolean> {
  const doc = await getDoc();
  const sheet = await getOrCreateChamCongNgoaiSheet(doc);
  const rows = await sheet.getRows();
  const row = rows.find(r => str(r.toObject()['id']) === id);
  if (!row) return false;
  await row.delete();
  await addLog(doc, 'DELETE_CHAM_CONG_NGOAI_BY_ID', id, '', '');
  return true;
}

// ============================================================
// SYNC QUẢN LÝ TRỰC TIẾP từ file HR ngoài → NHAN_VIEN.ql_truc_tiep
// ============================================================

export async function syncManagerFromHrFile(): Promise<{
  updated: number;
  skipped: number;
  errors: string[];
}> {
  const hrSheetId = process.env.NHAN_SU_SHEET_ID;
  if (!hrSheetId) {
    throw new Error(
      'Biến môi trường NHAN_SU_SHEET_ID chưa được cấu hình. ' +
      'Thêm vào Vercel → Settings → Environment Variables: ' +
      'NHAN_SU_SHEET_ID = 1jbrf9uC6K_k-VRQyFwMzFk8qiU845wsqSszNXdnyJZw'
    );
  }

  const HR_SHEET_NAME = 'DATA NHÂN SỰ';
  const HEADER_ROW_IDX = 3; // hàng 4 (0-based = 3) là header trong file nhân sự

  // 1. Mở file HR ngoài
  const hrDoc = await getDocBySheetId(hrSheetId);
  const hrSheet = hrDoc.sheetsByTitle[HR_SHEET_NAME];
  if (!hrSheet) {
    throw new Error(
      `Không tìm thấy sheet "${HR_SHEET_NAME}" trong file nhân sự. ` +
      `Đảm bảo file đã chia sẻ với: ${process.env.GOOGLE_CLIENT_EMAIL}`
    );
  }

  const hrRowCount = Math.min(hrSheet.rowCount, 1000);
  const hrColCount = Math.min(hrSheet.columnCount, 30);

  await hrSheet.loadCells({
    startRowIndex: HEADER_ROW_IDX,
    endRowIndex: hrRowCount,
    startColumnIndex: 0,
    endColumnIndex: hrColCount,
  });

  // 2. Đọc header hàng 4 để auto-detect cột
  // Chuẩn hóa header (bỏ dấu, chữ thường, bỏ khoảng trắng)
  const normH = (s: string) =>
    s.toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .trim()
      .replace(/\s+/g, '');

  // Chuẩn hóa tên người (giữ khoảng trắng đơn để so sánh)
  const normName = (s: string) =>
    s.toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .trim()
      .replace(/\s+/g, ' ');

  const headers: string[] = [];
  for (let c = 0; c < hrColCount; c++) {
    headers.push(str(hrSheet.getCell(HEADER_ROW_IDX, c).value));
  }

  // Auto-detect cột MNV (Mã nhân viên) — thường là cột B (index 1)
  const colMNV = (() => {
    const idx = headers.findIndex(h => {
      const n = normH(h);
      return n === 'mnv' || n === 'manv' || n === 'manhânvien' || n === 'manhânviên'
          || n === 'mãnv' || n === 'mãnhânvien' || n === 'mãnhânviên';
    });
    return idx !== -1 ? idx : 1; // fallback cột B
  })();

  // Auto-detect cột Họ và tên — thường là cột C (index 2)
  const colHoTen = (() => {
    const idx = headers.findIndex(h => {
      const n = normH(h);
      return n === 'hoten' || n === 'hovaten' || n === 'hotenvaten'
          || n.includes('hotennhanvien') || n.includes('hovaten');
    });
    return idx !== -1 ? idx : 2; // fallback cột C
  })();

  // Auto-detect cột Quản lý trực tiếp — thường là cột K (index 10)
  const colQL = (() => {
    const idx = headers.findIndex(h => {
      const n = normH(h);
      return n.includes('quantructiep') || n.includes('quanlytructiep')
          || (n.includes('quanly') && n.includes('truc'));
    });
    return idx !== -1 ? idx : 10; // fallback cột K
  })();

  console.log(`[syncManager] File: ${hrSheetId}, Sheet: "${HR_SHEET_NAME}"`);
  console.log(`[syncManager] Cols — MNV:${colMNV}(${headers[colMNV]}), HoTen:${colHoTen}(${headers[colHoTen]}), QL:${colQL}(${headers[colQL]})`);

  // 3. Đọc tất cả dữ liệu từ file HR (từ hàng 5, index 4)
  // Xây dựng 2 map: theo ID và theo tên (fallback cho nhân viên bị lệch ID)
  const hrByIdMap   = new Map<string, string>(); // padded_mnv → ql_truc_tiep
  const hrByNameMap = new Map<string, string>(); // normalized_ho_ten → ql_truc_tiep

  for (let rowIdx = HEADER_ROW_IDX + 1; rowIdx < hrRowCount; rowIdx++) {
    const mnvRaw  = str(hrSheet.getCell(rowIdx, colMNV).value);
    const nameRaw = str(hrSheet.getCell(rowIdx, colHoTen).value);
    const qlRaw   = str(hrSheet.getCell(rowIdx, colQL).value);

    if (!mnvRaw && !nameRaw) continue; // dòng trống hoàn toàn

    if (mnvRaw) {
      const mnv = padEmployeeId(mnvRaw);
      if (mnv) hrByIdMap.set(mnv, qlRaw);
    }
    if (nameRaw) {
      const name = normName(nameRaw);
      if (name) hrByNameMap.set(name, qlRaw);
    }
  }

  console.log(`[syncManager] HR file: ${hrByIdMap.size} by-ID, ${hrByNameMap.size} by-name`);

  // 4. Cập nhật NHAN_VIEN sheet
  const crmDoc = await getDoc();
  const nvSheet = await getSheet(crmDoc, SHEETS.NHAN_VIEN);
  const nvRows = await nvSheet.getRows();

  let updated = 0, skipped = 0;
  const errors: string[] = [];
  // Gom thay đổi rồi ghi 1 lượt ở cuối, thay vì save() từng dòng
  const pending: { rowNumber: number; value: string; label: string }[] = [];

  for (const row of nvRows) {
    const v = row.toObject();
    const id    = padEmployeeId(str(v['id_nhan_vien']));
    const hoTen = str(v['ho_ten']);

    if (!id && !hoTen) { skipped++; continue; }

    // Ưu tiên khớp theo ID, fallback khớp theo tên
    let qlFromHr: string | undefined;
    let matchBy = '';

    if (id) {
      const byId = hrByIdMap.get(id);
      if (byId !== undefined) { qlFromHr = byId; matchBy = 'id'; }
    }

    if (qlFromHr === undefined && hoTen) {
      const byName = hrByNameMap.get(normName(hoTen));
      if (byName !== undefined) { qlFromHr = byName; matchBy = 'name'; }
    }

    if (qlFromHr === undefined) { skipped++; continue; } // không tìm thấy trong file HR

    const currentQL = str(v['ql_truc_tiep']);
    if (currentQL === qlFromHr) { skipped++; continue; } // đã đúng rồi

    pending.push({ rowNumber: row.rowNumber, value: qlFromHr, label: `[by-${matchBy}] ${id} "${hoTen}"` });
  }

  // Ghi theo LÔ: loadCells 1 vùng → saveUpdatedCells 1 lần.
  // Trước đây gọi row.save() cho từng dòng, lần chạy đầu là ~88 request ghi →
  // vượt quota 60 request/phút của Sheets (lỗi 429).
  if (pending.length > 0) {
    const colIdx = nvSheet.headerValues.indexOf('ql_truc_tiep');
    if (colIdx === -1) {
      errors.push('Sheet NHAN_VIEN không có cột "ql_truc_tiep"');
    } else {
      const minRow = Math.min(...pending.map(p => p.rowNumber)) - 1; // rowNumber 1-based → cell 0-based
      const maxRow = Math.max(...pending.map(p => p.rowNumber)) - 1;
      try {
        await nvSheet.loadCells({
          startRowIndex: minRow,
          endRowIndex: maxRow + 1,
          startColumnIndex: colIdx,
          endColumnIndex: colIdx + 1,
        });
        for (const p of pending) {
          nvSheet.getCell(p.rowNumber - 1, colIdx).value = p.value;
          console.log(`[syncManager] ${p.label} → "${p.value}"`);
        }
        await nvSheet.saveUpdatedCells();
        updated = pending.length;
      } catch (e: any) {
        errors.push(`Ghi cột ql_truc_tiep thất bại: ${e?.message || String(e)}`);
      }
    }
  }

  console.log(`[syncManager] Done — updated: ${updated}, skipped: ${skipped}, errors: ${errors.length}`);
  return { updated, skipped, errors };
}

// ============================================================
// TRA QUẢN LÝ TRỰC TIẾP từ HR file — dùng khi nhân viên gửi đơn
// Cache 5 phút để tránh đọc Sheets mỗi request
// ============================================================

let _hrManagerCache: {
  byId:      Map<string, string>; // padded MNV → ql_truc_tiep
  byName:    Map<string, string>; // normalized name → ql_truc_tiep
  expiresAt: number;
} | null = null;

export async function getManagerForEmployee(
  id_nhan_vien: string,
  ho_ten:        string,
): Promise<string> {
  const hrSheetId = process.env.NHAN_SU_SHEET_ID;
  if (!hrSheetId) return '';

  const now = Date.now();

  if (!_hrManagerCache || now >= _hrManagerCache.expiresAt) {
    try {
      const HR_SHEET_NAME  = 'DATA NHÂN SỰ';
      const HEADER_ROW_IDX = 3;

      const hrDoc   = await getDocBySheetId(hrSheetId);
      const hrSheet = hrDoc.sheetsByTitle[HR_SHEET_NAME];
      if (!hrSheet) throw new Error(`Sheet "${HR_SHEET_NAME}" not found`);

      const rowCount = Math.min(hrSheet.rowCount, 1000);
      const colCount = Math.min(hrSheet.columnCount, 30);
      await hrSheet.loadCells({
        startRowIndex: HEADER_ROW_IDX, endRowIndex: rowCount,
        startColumnIndex: 0, endColumnIndex: colCount,
      });

      const normH = (s: string) =>
        s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim().replace(/\s+/g, '');
      const normN = (s: string) =>
        s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim().replace(/\s+/g, ' ');

      const headers: string[] = [];
      for (let c = 0; c < colCount; c++) headers.push(str(hrSheet.getCell(HEADER_ROW_IDX, c).value));

      const findCol = (test: (n: string) => boolean, fallback: number) => {
        const idx = headers.findIndex(h => test(normH(h)));
        return idx !== -1 ? idx : fallback;
      };
      const colMNV   = findCol(n => n === 'mnv' || n === 'manv' || n.includes('manhânvien') || n.includes('mãnhânvien'), 1);
      const colHoTen = findCol(n => n === 'hoten' || n.includes('hovaten') || n.includes('hotennhanvien'), 2);
      const colQL    = findCol(n => n.includes('quantructiep') || n.includes('quanlytructiep') || (n.includes('quanly') && n.includes('truc')), 10);

      const byId   = new Map<string, string>();
      const byName = new Map<string, string>();

      for (let r = HEADER_ROW_IDX + 1; r < rowCount; r++) {
        const mnvRaw  = str(hrSheet.getCell(r, colMNV).value);
        const nameRaw = str(hrSheet.getCell(r, colHoTen).value);
        const qlRaw   = str(hrSheet.getCell(r, colQL).value);
        if (!mnvRaw && !nameRaw) continue;
        if (mnvRaw) { const k = padEmployeeId(mnvRaw); if (k) byId.set(k, qlRaw); }
        if (nameRaw) { const k = normN(nameRaw); if (k) byName.set(k, qlRaw); }
      }

      _hrManagerCache = { byId, byName, expiresAt: now + 5 * 60 * 1000 };
      console.log(`[getManagerForEmployee] cache built — ${byId.size} by-id, ${byName.size} by-name`);
    } catch (e) {
      console.error('[getManagerForEmployee] cache build error:', e);
      return '';
    }
  }

  const { byId, byName } = _hrManagerCache;
  const normN = (s: string) =>
    s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim().replace(/\s+/g, ' ');

  const padded = padEmployeeId(id_nhan_vien);
  if (padded && byId.has(padded)) return byId.get(padded)!;

  const name = normN(ho_ten);
  if (name && byName.has(name)) return byName.get(name)!;

  return '';
}

// ============================================================
// SYNC NHÂN VIÊN từ file HR ngoài → NHAN_VIEN (bypass GAS web app)
// ============================================================

export async function syncEmployeesFromHrFile(): Promise<{
  inserted: number;
  updated: number;
  skipped: number;
}> {
  const hrSheetId = process.env.NHAN_SU_SHEET_ID;
  if (!hrSheetId) {
    throw new Error(
      'Biến môi trường NHAN_SU_SHEET_ID chưa được cấu hình. ' +
      'Thêm vào Vercel → Settings → Environment Variables: ' +
      'NHAN_SU_SHEET_ID = 1jbrf9uC6K_k-VRQyFwMzFk8qiU845wsqSszNXdnyJZw'
    );
  }

  const HR_SHEET_NAME  = 'DATA NHÂN SỰ';
  const HEADER_ROW_IDX = 3; // hàng 4 (0-based = 3) — 3 dòng đầu là logo/tiêu đề/trống

  // Helper chuẩn hóa chuỗi (bỏ dấu, chữ thường, bỏ khoảng trắng)
  const normH = (s: string) =>
    s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/đ/g, 'd').trim().replace(/\s+/g, '');

  // 1. Mở file HR
  // Google trả 403 khi file chưa được chia sẻ với service account — thông báo thô
  // ("The caller does not have permission") không nói được phải làm gì, nên dịch lại.
  let hrDoc;
  try {
    hrDoc = await getDocBySheetId(hrSheetId);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('403') || msg.toLowerCase().includes('permission')) {
      throw new Error(
        'Chưa có quyền đọc file nhân sự. Mở file VIC_DATA NHÂN SỰ trên Google Sheets → ' +
        `Chia sẻ → thêm ${process.env.GOOGLE_CLIENT_EMAIL} với quyền "Người xem" (Viewer). ` +
        `(File ID: ${hrSheetId})`,
      );
    }
    if (msg.includes('404')) {
      throw new Error(
        `Không tìm thấy file nhân sự với ID "${hrSheetId}". Kiểm tra lại biến NHAN_SU_SHEET_ID.`,
      );
    }
    throw err;
  }

  const hrSheet = hrDoc.sheetsByTitle[HR_SHEET_NAME];
  if (!hrSheet) {
    throw new Error(
      `Không tìm thấy sheet "${HR_SHEET_NAME}" trong file nhân sự. ` +
      `Đảm bảo file đã chia sẻ với: ${process.env.GOOGLE_CLIENT_EMAIL}`
    );
  }

  const hrRowCount = Math.min(hrSheet.rowCount, 1500);
  const hrColCount = Math.min(hrSheet.columnCount, 50);

  await hrSheet.loadCells({
    startRowIndex: HEADER_ROW_IDX,
    endRowIndex:   hrRowCount,
    startColumnIndex: 0,
    endColumnIndex:   hrColCount,
  });

  // 2. Đọc headers từ hàng 4 (index 3)
  const srcHeaders: string[] = [];
  for (let c = 0; c < hrColCount; c++) {
    srcHeaders.push(str(hrSheet.getCell(HEADER_ROW_IDX, c).value));
  }

  // Bảng alias: key = cột CRM, value = danh sách alias từ file nguồn
  const ALIASES: Record<string, string[]> = {
    id_nhan_vien: ['mnv','manv','manhansự','manhânvien','manhânviên','mãnv','mãnhânvien','mãnhânviên','idnhânviên'],
    ho_ten:       ['hoten','hovaten','hotenvaten','hovaten','tennhanvien','tennhânvien'],
    so_dien_thoai:['diendong','didong','sodienthoai','sdt','sđt','phone','dtdd','dtdi','sodienthoại'],
    email:        ['email','mail','thudientu','emailcanhan'],
    employee_type:['chucdanh','chucdanh','vitrị','vitri','loainhânvien','chucvu'],
    trang_thai:   ['trangthai','tinhtrang'],
    so_cccd:      ['socmtnd','cmtnd','socmnd','cmnd','socccd','cccd','cmnd/cccd'],
    ngay_cap:     ['ngaycap','ngaycapcmt','ngaycapcccd'],
    noi_cap:      ['noicap','noicapcmt','noicapcccd'],
    HKTT:         ['hktt','hokhauthruongtru','diachihuongtru','thuongtru','diachihktt','hokhauthườngtrú'],
    ngay_sinh:    ['ngaysinh','sinhnhat','ngaythangnamsinh'],
    gioi_tinh:    ['gioitinh','giơitinh','nam/nu','phai'],
    ma_so_thue:   ['masothue','mst','taxcode'],
    so_tk_ngan_hang:    ['sotaikhoan','stk','sotk'],
    ten_ngan_hang_thu_huong: ['nganhang','tennganghang','tennganhang'],
    phong_KD:     ['phongkd','phongban','bophan','nhom','team','phong/donvi'],
    khu_vuc:      ['khuvuc','chinanh','vung'],
    so_nguoi_phu_thuoc: ['songuoiphuthuoc','sonpt','npt'],
  };

  // Tìm index cột nguồn theo alias
  function findSrcCol(fieldName: string): number {
    const aliasList = (ALIASES[fieldName] || [fieldName]).map(a => normH(a));
    // exact match
    for (let ci = 0; ci < srcHeaders.length; ci++) {
      const cleanH = normH(srcHeaders[ci]);
      if (aliasList.some(a => cleanH === a)) {
        if (fieldName === 'so_cccd' && ci > 25) continue;
        return ci;
      }
    }
    // includes (chỉ alias >= 4 ký tự)
    for (let ci = 0; ci < srcHeaders.length; ci++) {
      const cleanH = normH(srcHeaders[ci]);
      if (aliasList.some(a => a.length >= 4 && cleanH.includes(a))) {
        if (fieldName === 'so_cccd' && ci > 25) continue;
        return ci;
      }
    }
    return -1;
  }

  // 3. Mở CRM NHAN_VIEN sheet
  const crmDoc = await getDoc();
  const nvSheet = await getSheet(crmDoc, 'NHAN_VIEN');
  const crmHeaders = nvSheet.headerValues as string[];
  const crmRows = await nvSheet.getRows();

  // Load cells để batch update (loadCells dùng 0-based index; header = row 0)
  const loadEndRow = crmRows.length + 2; // header + data + buffer
  await nvSheet.loadCells({
    startRowIndex:    0,
    endRowIndex:      loadEndRow,
    startColumnIndex: 0,
    endColumnIndex:   crmHeaders.length,
  });

  // Lookup map: id_nhan_vien → index trong crmRows
  const targetMap = new Map<string, number>();
  crmRows.forEach((row, idx) => {
    const id = padEmployeeId(str(row.get('id_nhan_vien')));
    if (id) targetMap.set(id, idx);
  });

  // Column mapping CRM → src index
  const colMap: Record<string, number> = {};
  crmHeaders.forEach(h => { colMap[h] = findSrcCol(h); });

  console.log('[syncEmployees] HR headers:', srcHeaders.slice(0, 15).join(' | '));

  // Helper đọc giá trị ô HR
  function getHrCell(rowIdx: number, colIdx: number): string {
    if (colIdx < 0 || colIdx >= hrColCount) return '';
    const cell = hrSheet.getCell(rowIdx, colIdx);
    return str(cell.formattedValue ?? cell.value ?? '');
  }

  // Helper parse ngày DD/MM/YYYY → YYYY-MM-DD
  function parseDate(s: string): string {
    const p = s.split('/');
    if (p.length === 3) {
      const d = parseInt(p[0], 10);
      const m = parseInt(p[1], 10) - 1;
      const y = parseInt(p[2].split(' ')[0], 10);
      if (!isNaN(d) && !isNaN(m) && !isNaN(y)) {
        const dt = new Date(y, m, d);
        if (!isNaN(dt.getTime())) return dt.toISOString().split('T')[0];
      }
    }
    return s;
  }

  const now = new Date();
  const nowStr = now.toISOString().replace('T', ' ').substring(0, 19);
  let updated = 0, skipped = 0;
  const rowsToInsert: Record<string, string>[] = [];
  let hasUpdates = false;

  // 4. Duyệt từng dòng nguồn (từ HEADER_ROW_IDX + 1)
  for (let rowIdx = HEADER_ROW_IDX + 1; rowIdx < hrRowCount; rowIdx++) {
    const idSrcIdx = colMap['id_nhan_vien'];
    const maNV = padEmployeeId(idSrcIdx >= 0 ? getHrCell(rowIdx, idSrcIdx) : '');
    if (!maNV || maNV === '0000') { skipped++; continue; }

    const tenSrcIdx = colMap['ho_ten'];
    const hoTen = tenSrcIdx >= 0 ? getHrCell(rowIdx, tenSrcIdx) : '';
    if (!hoTen) { skipped++; continue; }

    // Build object giá trị cho dòng này
    const obj: Record<string, string> = {
      id_nhan_vien: maNV,
      ho_ten:       hoTen,
      ngay_tao:     nowStr,
      trang_thai:   'Đang làm',
      vai_tro:      'Sale',
      mat_khau:     '123456',
    };

    crmHeaders.forEach(th => {
      if (th === 'id_nhan_vien' || th === 'ho_ten') return;
      const ci = colMap[th];
      if (ci < 0) return;
      const raw = getHrCell(rowIdx, ci);
      if (th === 'ngay_sinh' || th === 'ngay_cap') {
        obj[th] = raw ? parseDate(raw) : '';
      } else if (th === 'so_nguoi_phu_thuoc') {
        obj[th] = String(parseInt(raw.replace(/[^0-9]/g, ''), 10) || 0);
      } else {
        obj[th] = raw;
      }
    });

    const existingIdx = targetMap.get(maNV);
    if (existingIdx !== undefined) {
      // Update qua cell trực tiếp (sẽ batch bằng saveUpdatedCells)
      const existRow = crmRows[existingIdx];
      const curPass = str(existRow.get('mat_khau'));
      const curRole = str(existRow.get('vai_tro'));
      // rowNumber là 1-based trong sheet; loadCells dùng 0-based → getCell(rowNumber - 1, colIdx)
      const sheetRowIdx = existRow.rowNumber - 1;

      crmHeaders.forEach((h, colIdx) => {
        if (h === 'mat_khau' && curPass && curPass !== '123456') return;
        if (h === 'vai_tro' && curRole) return;
        const val = obj[h];
        if (val === undefined) return;
        if (sheetRowIdx < loadEndRow) {
          nvSheet.getCell(sheetRowIdx, colIdx).value = val;
          hasUpdates = true;
        }
      });
      updated++;
    } else {
      // Gom lại để batch insert
      const newRowData: Record<string, string> = {};
      crmHeaders.forEach(h => { newRowData[h] = obj[h] ?? ''; });
      rowsToInsert.push(newRowData);
    }
  }

  // Một lần batchUpdate cho tất cả updates
  if (hasUpdates) {
    await nvSheet.saveUpdatedCells();
  }

  // Một lần append cho tất cả inserts
  if (rowsToInsert.length > 0) {
    await nvSheet.addRows(rowsToInsert);
  }

  console.log(`[syncEmployees] Done — inserted:${rowsToInsert.length}, updated:${updated}, skipped:${skipped}`);
  return { inserted: rowsToInsert.length, updated, skipped };
}

// ============================================================
// BÁO CÁO BIẾN ĐỘNG NHÂN SỰ — đọc DATA NHÂN SỰ từ file HR ngoài
// ============================================================

export interface HrEmployeeRecord {
  mnv: string;
  ho_ten: string;
  ngay_vao_lam: Date | null;       // Ngày vào làm việc
  ngay_ket_thuc_thu_viec: Date | null; // Ngày kết thúc thử việc
  trang_thai: string;              // Trạng thái NV
}

export async function getDataNhanSuForReport(): Promise<HrEmployeeRecord[]> {
  const hrSheetId = process.env.NHAN_SU_SHEET_ID;
  if (!hrSheetId) return [];

  const HR_SHEET_NAME  = 'DATA NHÂN SỰ';
  const HEADER_ROW_IDX = 3; // hàng 4 (0-based = 3)

  const hrDoc   = await getDocBySheetId(hrSheetId);
  const hrSheet = hrDoc.sheetsByTitle[HR_SHEET_NAME];
  if (!hrSheet) return [];

  const rowCount = Math.min(hrSheet.rowCount, 2000);
  const colCount = Math.min(hrSheet.columnCount, 60);

  await hrSheet.loadCells({
    startRowIndex:    HEADER_ROW_IDX,
    endRowIndex:      rowCount,
    startColumnIndex: 0,
    endColumnIndex:   colCount,
  });

  const normH = (s: string) =>
    s.toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/đ/g, 'd')
      .trim()
      .replace(/\s+/g, '');

  const headers: string[] = [];
  for (let c = 0; c < colCount; c++) {
    headers.push(str(hrSheet.getCell(HEADER_ROW_IDX, c).value));
  }

  const findCol = (aliases: string[], fallback = -1): number => {
    const norm = aliases.map(normH);
    for (let c = 0; c < headers.length; c++) {
      const h = normH(headers[c]);
      if (norm.includes(h)) return c;
    }
    for (let c = 0; c < headers.length; c++) {
      const h = normH(headers[c]);
      if (norm.some(a => a.length >= 6 && h.includes(a))) return c;
    }
    return fallback;
  };

  const colMNV      = findCol(['mnv', 'manv', 'manhânvien', 'mãnv'], 1);
  const colHoTen    = findCol(['hoten', 'hovaten', 'hotennhanvien'], 2);
  const colVaoLam   = findCol(['ngayvaolamviec', 'ngayvaolam', 'vaolamviec', 'ngaybatdaulamviec', 'ngaytuyendung']);
  const colKTTV     = findCol(['ngayketthucthuviec', 'ngaykttv', 'kttv', 'ketthucthuviec', 'ngayhetthuviec']);
  const colTrangThai = findCol(['trangthainv', 'trangthai', 'tinhtrangnv', 'tinhtrang']);

  const parseDate = (raw: string): Date | null => {
    if (!raw) return null;
    const s = raw.trim();
    if (!s) return null;
    // DD/MM/YYYY
    const m1 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m1) {
      const d = new Date(+m1[3], +m1[2] - 1, +m1[1]);
      return isNaN(d.getTime()) ? null : d;
    }
    // DD-MM-YYYY or DD.MM.YYYY
    const m2 = s.match(/^(\d{1,2})[-.](\d{1,2})[-.](\d{4})/);
    if (m2) {
      const d = new Date(+m2[3], +m2[2] - 1, +m2[1]);
      return isNaN(d.getTime()) ? null : d;
    }
    // ISO or native parse (YYYY-MM-DD, etc.)
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  };

  const results: HrEmployeeRecord[] = [];

  for (let r = HEADER_ROW_IDX + 1; r < rowCount; r++) {
    const mnvRaw   = str(hrSheet.getCell(r, colMNV).value);
    const hoTenRaw = str(hrSheet.getCell(r, colHoTen).value);
    if (!mnvRaw && !hoTenRaw) continue;

    results.push({
      mnv:    mnvRaw,
      ho_ten: hoTenRaw,
      ngay_vao_lam:           colVaoLam    >= 0 ? parseDate(str(hrSheet.getCell(r, colVaoLam).value))   : null,
      ngay_ket_thuc_thu_viec: colKTTV      >= 0 ? parseDate(str(hrSheet.getCell(r, colKTTV).value))     : null,
      trang_thai:             colTrangThai >= 0 ? str(hrSheet.getCell(r, colTrangThai).value) : '',
    });
  }

  console.log(
    `[getDataNhanSuForReport] ${results.length} records — ` +
    `VaoLam:${colVaoLam}(${headers[colVaoLam] ?? '?'}), ` +
    `KTTV:${colKTTV}(${headers[colKTTV] ?? '?'}), ` +
    `TrangThai:${colTrangThai}(${headers[colTrangThai] ?? '?'})`
  );

  return results;
}
