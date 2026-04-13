// ============================================================
// CRM BĐS — Excel Service (Server-side only)
// ============================================================
import ExcelJS from 'exceljs';
import path from 'path';
import type {
  DuAn, NhanVien, KhachHang, Pipeline, CongViec, LogHeThong, DanhMuc
} from './types';

const EXCEL_PATH = path.join(process.cwd(), 'data', 'CRM_BDS.xlsx');

// Sheet name constants
const SHEETS = {
  DANH_MUC: 'DANH_MUC',
  DU_AN: 'DU_AN',
  DM_DU_AN: 'DM_DU_AN',
  NHAN_VIEN: 'NHAN_VIEN',
  KHACH_HANG: 'KHACH_HANG',
  PIPELINE: 'PIPELINE',
  CONG_VIEC: 'CONG_VIEC',
  DASHBOARD: 'DASHBOARD',
  LOG_HE_THONG: 'LOG_HE_THONG',
} as const;

// Helper to safely get cell value as string
function cellStr(row: ExcelJS.Row, col: number): string {
  const cell = row.getCell(col);
  if (cell.value === null || cell.value === undefined) return '';
  if (cell.value instanceof Date) {
    return isNaN(cell.value.getTime()) ? '' : cell.value.toISOString();
  }
  if (typeof cell.value === 'object' && 'result' in cell.value) {
    const result = (cell.value as { result: unknown }).result;
    if (result === null || result === undefined) return '';
    if (result instanceof Date) {
      return isNaN(result.getTime()) ? '' : result.toISOString();
    }
    const str = String(result);
    // Guard against [object Object] or Invalid Date strings
    if (str === '[object Object]' || str === 'Invalid Date') return '';
    return str;
  }
  const str = String(cell.value);
  if (str === '[object Object]' || str === 'Invalid Date') return '';
  return str;
}

// Helper to safely get cell value as number
function cellNum(row: ExcelJS.Row, col: number): number {
  const val = cellStr(row, col);
  const num = parseFloat(val);
  return isNaN(num) ? 0 : num;
}

// ============================================================
// READ OPERATIONS
// ============================================================

async function loadWorkbook(): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(EXCEL_PATH);
  return wb;
}

export async function getDanhMuc(): Promise<DanhMuc> {
  const wb = await loadWorkbook();
  const ws = wb.getWorksheet(SHEETS.DANH_MUC);
  if (!ws) throw new Error('Sheet DANH_MUC not found');

  const result: DanhMuc = {
    giai_doan_pipeline: [],
    trang_thai_kh: [],
    trang_thai_cong_viec: [],
    nguon: [],
  };

  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // skip header
    const col1 = cellStr(row, 1);
    const col2 = cellStr(row, 2);
    const col3 = cellStr(row, 3);
    const col4 = cellStr(row, 4);
    if (col1) result.giai_doan_pipeline.push(col1);
    if (col2) result.trang_thai_kh.push(col2);
    if (col3) result.trang_thai_cong_viec.push(col3);
    if (col4) result.nguon.push(col4);
  });

  return result;
}

export async function getDuAn(): Promise<DuAn[]> {
  const wb = await loadWorkbook();
  const ws = wb.getWorksheet(SHEETS.DU_AN);
  if (!ws) throw new Error('Sheet DU_AN not found');

  const items: DuAn[] = [];
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const id = cellStr(row, 1);
    if (!id) return;
    items.push({
      id_du_an: id,
      ma_du_an: cellStr(row, 2),
      ten_du_an: cellStr(row, 3),
      hien_thi: cellNum(row, 4),
      hoa_hong_mac_dinh: cellNum(row, 5),
      label: cellStr(row, 6) || `${cellStr(row, 2)} - ${cellStr(row, 3)}`,
    });
  });

  return items;
}

export async function getNhanVien(): Promise<NhanVien[]> {
  const wb = await loadWorkbook();
  const ws = wb.getWorksheet(SHEETS.NHAN_VIEN);
  if (!ws) throw new Error('Sheet NHAN_VIEN not found');

  const items: NhanVien[] = [];
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const id = cellStr(row, 1);
    if (!id) return;
    items.push({
      id_nhan_vien: id,
      ho_ten: cellStr(row, 2),
      so_dien_thoai: cellStr(row, 3),
      email: cellStr(row, 4),
      vai_tro: cellStr(row, 5),
      trang_thai: cellStr(row, 6),
      ngay_tao: cellStr(row, 7),
    });
  });

  return items;
}

export async function getKhachHang(): Promise<KhachHang[]> {
  const wb = await loadWorkbook();
  const ws = wb.getWorksheet(SHEETS.KHACH_HANG);
  if (!ws) throw new Error('Sheet KHACH_HANG not found');

  const items: KhachHang[] = [];
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const id = cellStr(row, 1);
    if (!id) return;
    items.push({
      id_khach_hang: id,
      ngay_tao: cellStr(row, 2),
      ten_KH: cellStr(row, 3),
      so_dien_thoai: cellStr(row, 4),
      email: cellStr(row, 5),
      nguon: cellStr(row, 6),
      nhu_cau: cellStr(row, 7),
      ghi_chu: cellStr(row, 8),
      sale_phu_trach: cellStr(row, 9),
      label_khach: cellStr(row, 10) || `${cellStr(row, 3)} - 0${cellStr(row, 4)}`,
    });
  });

  return items;
}

// Compute mm-yyyy from a date string
function toMonthKey(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${month}-${d.getFullYear()}`;
}

export async function getPipeline(): Promise<Pipeline[]> {
  const wb = await loadWorkbook();
  const ws = wb.getWorksheet(SHEETS.PIPELINE);
  if (!ws) throw new Error('Sheet PIPELINE not found');

  const items: Pipeline[] = [];
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const id = cellStr(row, 1);
    if (!id) return;
    const ngayCapNhat = cellStr(row, 10);
    let thang = cellStr(row, 11);
    // If thang is empty/invalid, compute from ngay_cap_nhat
    if (!thang || thang === 'Invalid Date' || thang === '[object Object]') {
      thang = toMonthKey(ngayCapNhat);
    }
    items.push({
      id_pipeline: id,
      id_khach_hang: cellStr(row, 2),
      giai_doan: cellStr(row, 3),
      gia_tri_thuc_te: cellNum(row, 4),
      sale_phu_trach: cellStr(row, 5),
      id_du_an: cellStr(row, 6),
      ten_du_an: cellStr(row, 7),
      hoa_hong: cellNum(row, 8),
      tien_hoa_hong: cellNum(row, 9),
      ngay_cap_nhat: ngayCapNhat,
      thang,
    });
  });

  return items;
}

export async function getCongViec(): Promise<CongViec[]> {
  const wb = await loadWorkbook();
  const ws = wb.getWorksheet(SHEETS.CONG_VIEC);
  if (!ws) throw new Error('Sheet CONG_VIEC not found');

  const items: CongViec[] = [];
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const id = cellStr(row, 1);
    if (!id) return;
    items.push({
      id_cong_viec: id,
      ngay_tao: cellStr(row, 2),
      ghi_chu: cellStr(row, 3),
      id_pipeline: cellStr(row, 4),
      trang_thai: cellStr(row, 5),
      ngay_hen: cellStr(row, 6),
      sale_phu_trach: cellStr(row, 7),
      ket_qua: cellStr(row, 8),
    });
  });

  return items;
}

// ============================================================
// WRITE OPERATIONS
// ============================================================

async function findNextEmptyRow(ws: ExcelJS.Worksheet): Promise<number> {
  let lastRow = 1;
  ws.eachRow((_, rowNumber) => {
    lastRow = rowNumber;
  });
  return lastRow + 1;
}

// --- KHÁCH HÀNG ---
export async function addKhachHang(kh: KhachHang): Promise<void> {
  const wb = await loadWorkbook();
  const ws = wb.getWorksheet(SHEETS.KHACH_HANG);
  if (!ws) throw new Error('Sheet KHACH_HANG not found');

  const nextRow = await findNextEmptyRow(ws);
  const row = ws.getRow(nextRow);
  row.getCell(1).value = kh.id_khach_hang;
  row.getCell(2).value = kh.ngay_tao;
  row.getCell(3).value = kh.ten_KH;
  row.getCell(4).value = kh.so_dien_thoai;
  row.getCell(5).value = kh.email;
  row.getCell(6).value = kh.nguon;
  row.getCell(7).value = kh.nhu_cau;
  row.getCell(8).value = kh.ghi_chu;
  row.getCell(9).value = kh.sale_phu_trach;
  row.getCell(10).value = `${kh.ten_KH} - 0${kh.so_dien_thoai}`;
  row.commit();

  await addLog(wb, 'CREATE_KH', kh.id_khach_hang, '', '');
  await wb.xlsx.writeFile(EXCEL_PATH);
}

export async function updateKhachHang(kh: KhachHang): Promise<boolean> {
  const wb = await loadWorkbook();
  const ws = wb.getWorksheet(SHEETS.KHACH_HANG);
  if (!ws) throw new Error('Sheet KHACH_HANG not found');

  let found = false;
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    if (cellStr(row, 1) === kh.id_khach_hang) {
      row.getCell(3).value = kh.ten_KH;
      row.getCell(4).value = kh.so_dien_thoai;
      row.getCell(5).value = kh.email;
      row.getCell(6).value = kh.nguon;
      row.getCell(7).value = kh.nhu_cau;
      row.getCell(8).value = kh.ghi_chu;
      row.getCell(9).value = kh.sale_phu_trach;
      row.getCell(10).value = `${kh.ten_KH} - 0${kh.so_dien_thoai}`;
      row.commit();
      found = true;
    }
  });

  if (found) {
    await addLog(wb, 'UPDATE_KH', kh.id_khach_hang, '', '');
    await wb.xlsx.writeFile(EXCEL_PATH);
  }
  return found;
}

export async function deleteKhachHang(id: string): Promise<boolean> {
  const wb = await loadWorkbook();
  const ws = wb.getWorksheet(SHEETS.KHACH_HANG);
  if (!ws) throw new Error('Sheet KHACH_HANG not found');

  let targetRow = -1;
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    if (cellStr(row, 1) === id) {
      targetRow = rowNumber;
    }
  });

  if (targetRow === -1) return false;

  // Clear the row values
  const row = ws.getRow(targetRow);
  for (let c = 1; c <= 10; c++) {
    row.getCell(c).value = null;
  }
  row.commit();

  await addLog(wb, 'DELETE_KH', id, '', '');
  await wb.xlsx.writeFile(EXCEL_PATH);
  return true;
}

// --- PIPELINE ---
export async function addPipeline(pl: Pipeline): Promise<void> {
  const wb = await loadWorkbook();
  const ws = wb.getWorksheet(SHEETS.PIPELINE);
  if (!ws) throw new Error('Sheet PIPELINE not found');

  const nextRow = await findNextEmptyRow(ws);
  const row = ws.getRow(nextRow);
  row.getCell(1).value = pl.id_pipeline;
  row.getCell(2).value = pl.id_khach_hang;
  row.getCell(3).value = pl.giai_doan;
  row.getCell(4).value = pl.gia_tri_thuc_te;
  row.getCell(5).value = pl.sale_phu_trach;
  row.getCell(6).value = pl.id_du_an;
  row.getCell(7).value = pl.ten_du_an;
  row.getCell(8).value = pl.hoa_hong;
  row.getCell(9).value = pl.gia_tri_thuc_te * pl.hoa_hong;
  row.getCell(10).value = pl.ngay_cap_nhat;
  // Write thang as plain string mm-yyyy, not formula
  row.getCell(11).value = pl.thang || toMonthKey(pl.ngay_cap_nhat);
  row.commit();

  await addLog(wb, 'CREATE_PIPELINE', pl.id_pipeline, pl.id_khach_hang, '');
  await wb.xlsx.writeFile(EXCEL_PATH);
}

export async function updatePipeline(pl: Pipeline): Promise<boolean> {
  const wb = await loadWorkbook();
  const ws = wb.getWorksheet(SHEETS.PIPELINE);
  if (!ws) throw new Error('Sheet PIPELINE not found');

  let found = false;
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    if (cellStr(row, 1) === pl.id_pipeline) {
      row.getCell(2).value = pl.id_khach_hang;
      row.getCell(3).value = pl.giai_doan;
      row.getCell(4).value = pl.gia_tri_thuc_te;
      row.getCell(5).value = pl.sale_phu_trach;
      row.getCell(6).value = pl.id_du_an;
      row.getCell(7).value = pl.ten_du_an;
      row.getCell(8).value = pl.hoa_hong;
      row.getCell(9).value = pl.gia_tri_thuc_te * pl.hoa_hong;
      const now = new Date().toISOString();
      row.getCell(10).value = now;
      // Write thang as plain string mm-yyyy
      row.getCell(11).value = toMonthKey(now);
      row.commit();
      found = true;
    }
  });

  if (found) {
    await addLog(wb, 'UPDATE_PIPELINE', pl.id_pipeline, '', '');
    await wb.xlsx.writeFile(EXCEL_PATH);
  }
  return found;
}

export async function deletePipeline(id: string): Promise<boolean> {
  const wb = await loadWorkbook();
  const ws = wb.getWorksheet(SHEETS.PIPELINE);
  if (!ws) throw new Error('Sheet PIPELINE not found');

  let targetRow = -1;
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    if (cellStr(row, 1) === id) {
      targetRow = rowNumber;
    }
  });

  if (targetRow === -1) return false;
  const row = ws.getRow(targetRow);
  for (let c = 1; c <= 11; c++) {
    row.getCell(c).value = null;
  }
  row.commit();

  await addLog(wb, 'DELETE_PIPELINE', id, '', '');
  await wb.xlsx.writeFile(EXCEL_PATH);
  return true;
}

// --- CÔNG VIỆC ---
export async function addCongViec(cv: CongViec): Promise<void> {
  const wb = await loadWorkbook();
  const ws = wb.getWorksheet(SHEETS.CONG_VIEC);
  if (!ws) throw new Error('Sheet CONG_VIEC not found');

  const nextRow = await findNextEmptyRow(ws);
  const row = ws.getRow(nextRow);
  row.getCell(1).value = cv.id_cong_viec;
  row.getCell(2).value = cv.ngay_tao;
  row.getCell(3).value = cv.ghi_chu;
  row.getCell(4).value = cv.id_pipeline;
  row.getCell(5).value = cv.trang_thai;
  row.getCell(6).value = cv.ngay_hen;
  row.getCell(7).value = cv.sale_phu_trach;
  row.getCell(8).value = cv.ket_qua;
  row.commit();

  await addLog(wb, 'CREATE_CV', cv.id_cong_viec, cv.id_pipeline, '');
  await wb.xlsx.writeFile(EXCEL_PATH);
}

export async function updateCongViec(cv: CongViec): Promise<boolean> {
  const wb = await loadWorkbook();
  const ws = wb.getWorksheet(SHEETS.CONG_VIEC);
  if (!ws) throw new Error('Sheet CONG_VIEC not found');

  let found = false;
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    if (cellStr(row, 1) === cv.id_cong_viec) {
      row.getCell(3).value = cv.ghi_chu;
      row.getCell(4).value = cv.id_pipeline;
      row.getCell(5).value = cv.trang_thai;
      row.getCell(6).value = cv.ngay_hen;
      row.getCell(7).value = cv.sale_phu_trach;
      row.getCell(8).value = cv.ket_qua;
      row.commit();
      found = true;
    }
  });

  if (found) {
    await addLog(wb, 'UPDATE_CV', cv.id_cong_viec, '', '');
    await wb.xlsx.writeFile(EXCEL_PATH);
  }
  return found;
}

export async function deleteCongViec(id: string): Promise<boolean> {
  const wb = await loadWorkbook();
  const ws = wb.getWorksheet(SHEETS.CONG_VIEC);
  if (!ws) throw new Error('Sheet CONG_VIEC not found');

  let targetRow = -1;
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    if (cellStr(row, 1) === id) targetRow = rowNumber;
  });

  if (targetRow === -1) return false;
  const row = ws.getRow(targetRow);
  for (let c = 1; c <= 8; c++) row.getCell(c).value = null;
  row.commit();

  await addLog(wb, 'DELETE_CV', id, '', '');
  await wb.xlsx.writeFile(EXCEL_PATH);
  return true;
}

// --- DỰ ÁN ---
export async function addDuAn(da: DuAn): Promise<void> {
  const wb = await loadWorkbook();
  const ws = wb.getWorksheet(SHEETS.DU_AN);
  if (!ws) throw new Error('Sheet DU_AN not found');

  const nextRow = await findNextEmptyRow(ws);
  const row = ws.getRow(nextRow);
  row.getCell(1).value = da.id_du_an;
  row.getCell(2).value = da.ma_du_an;
  row.getCell(3).value = da.ten_du_an;
  row.getCell(4).value = da.hien_thi;
  row.getCell(5).value = da.hoa_hong_mac_dinh;
  row.getCell(6).value = `${da.ma_du_an} - ${da.ten_du_an}`;
  row.commit();

  await addLog(wb, 'CREATE_DA', da.id_du_an, '', '');
  await wb.xlsx.writeFile(EXCEL_PATH);
}

export async function updateDuAn(da: DuAn): Promise<boolean> {
  const wb = await loadWorkbook();
  const ws = wb.getWorksheet(SHEETS.DU_AN);
  if (!ws) throw new Error('Sheet DU_AN not found');

  let found = false;
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    if (cellStr(row, 1) === da.id_du_an) {
      row.getCell(2).value = da.ma_du_an;
      row.getCell(3).value = da.ten_du_an;
      row.getCell(4).value = da.hien_thi;
      row.getCell(5).value = da.hoa_hong_mac_dinh;
      row.getCell(6).value = `${da.ma_du_an} - ${da.ten_du_an}`;
      row.commit();
      found = true;
    }
  });

  if (found) {
    await addLog(wb, 'UPDATE_DA', da.id_du_an, '', '');
    await wb.xlsx.writeFile(EXCEL_PATH);
  }
  return found;
}

export async function deleteDuAn(id: string): Promise<boolean> {
  const wb = await loadWorkbook();
  const ws = wb.getWorksheet(SHEETS.DU_AN);
  if (!ws) throw new Error('Sheet DU_AN not found');

  let targetRow = -1;
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    if (cellStr(row, 1) === id) targetRow = rowNumber;
  });

  if (targetRow === -1) return false;
  const row = ws.getRow(targetRow);
  for (let c = 1; c <= 6; c++) row.getCell(c).value = null;
  row.commit();

  await addLog(wb, 'DELETE_DA', id, '', '');
  await wb.xlsx.writeFile(EXCEL_PATH);
  return true;
}

// --- NHÂN VIÊN ---
export async function addNhanVien(nv: NhanVien): Promise<void> {
  const wb = await loadWorkbook();
  const ws = wb.getWorksheet(SHEETS.NHAN_VIEN);
  if (!ws) throw new Error('Sheet NHAN_VIEN not found');

  const nextRow = await findNextEmptyRow(ws);
  const row = ws.getRow(nextRow);
  row.getCell(1).value = nv.id_nhan_vien;
  row.getCell(2).value = nv.ho_ten;
  row.getCell(3).value = nv.so_dien_thoai;
  row.getCell(4).value = nv.email;
  row.getCell(5).value = nv.vai_tro;
  row.getCell(6).value = nv.trang_thai;
  row.getCell(7).value = nv.ngay_tao;
  row.commit();

  await addLog(wb, 'CREATE_NV', nv.id_nhan_vien, '', '');
  await wb.xlsx.writeFile(EXCEL_PATH);
}

export async function updateNhanVien(nv: NhanVien): Promise<boolean> {
  const wb = await loadWorkbook();
  const ws = wb.getWorksheet(SHEETS.NHAN_VIEN);
  if (!ws) throw new Error('Sheet NHAN_VIEN not found');

  let found = false;
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    if (cellStr(row, 1) === nv.id_nhan_vien) {
      row.getCell(2).value = nv.ho_ten;
      row.getCell(3).value = nv.so_dien_thoai;
      row.getCell(4).value = nv.email;
      row.getCell(5).value = nv.vai_tro;
      row.getCell(6).value = nv.trang_thai;
      row.commit();
      found = true;
    }
  });

  if (found) {
    await addLog(wb, 'UPDATE_NV', nv.id_nhan_vien, '', '');
    await wb.xlsx.writeFile(EXCEL_PATH);
  }
  return found;
}

export async function deleteNhanVien(id: string): Promise<boolean> {
  const wb = await loadWorkbook();
  const ws = wb.getWorksheet(SHEETS.NHAN_VIEN);
  if (!ws) throw new Error('Sheet NHAN_VIEN not found');

  let targetRow = -1;
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    if (cellStr(row, 1) === id) targetRow = rowNumber;
  });

  if (targetRow === -1) return false;
  const row = ws.getRow(targetRow);
  for (let c = 1; c <= 8; c++) row.getCell(c).value = null;
  row.commit();

  await addLog(wb, 'DELETE_NV', id, '', '');
  await wb.xlsx.writeFile(EXCEL_PATH);
  return true;
}

// --- LOG ---
async function addLog(
  wb: ExcelJS.Workbook,
  hanh_dong: string,
  doi_tuong: string,
  id_lien_quan: string,
  nguoi_thuc_hien: string
): Promise<void> {
  const ws = wb.getWorksheet(SHEETS.LOG_HE_THONG);
  if (!ws) return;

  const nextRow = await findNextEmptyRow(ws);
  const now = new Date().toISOString();
  const row = ws.getRow(nextRow);
  row.getCell(1).value = now;
  row.getCell(2).value = hanh_dong;
  row.getCell(3).value = doi_tuong;
  row.getCell(4).value = id_lien_quan;
  row.getCell(5).value = nguoi_thuc_hien;
  row.getCell(6).value = now;
  row.commit();
}

// --- AUTH helper ---
export async function findNhanVienByEmail(email: string): Promise<NhanVien | null> {
  const list = await getNhanVien();
  return list.find(nv => nv.email === email) || null;
}
