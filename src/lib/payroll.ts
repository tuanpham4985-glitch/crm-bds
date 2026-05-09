// ============================================================
// BANG_LUONG — Payroll Engine
// Tách biệt: getData → calculate → save
// Không hard-code, có thể mở rộng config hoa hồng theo DU_AN
// ============================================================

import {
  getNhanVien,
  getPipeline,
  getHopDong,
  getBangLuong,
  getPayrollRecords,
  savePayrollBatch,
  getWorkCalendar,
  getAttendanceRaw,
  getShifts,
  getPayrollAdjustments
} from '@/lib/google-sheets';
import type { NhanVien, HopDong, Pipeline, BangLuong, WorkCalendar, AttendanceRaw, Shift, PayrollAdjustment, PayrollRecord, PayrollItemRecord, SavePayrollResult } from '@/lib/types';
import { calculateTaxMonthly, TAX_CONFIG } from '@/lib/tax';
import { CalendarEngine } from './engines/calendarEngine';
import { AttendanceEngine } from './engines/attendanceEngine';
import { PayrollEngine } from './engines/payrollEngine';

// ============================================================
// CONFIG — Có thể mở rộng theo DU_AN hoặc loại hợp đồng
// ============================================================

export interface PayrollConfig {
  /** Tỷ lệ BHXH/BHYT/BHTN nhân viên đóng (mặc định 10.5%) */
  tileBAO_HIEM: number;
  /** Mức giảm trừ gia cảnh bản thân (triệu đồng, mặc định 11tr) */
  giam_tru_ca_nhan: number;
  /** Thuế suất thu nhập cá nhân (mặc định 10%) */
  thue_suat: number;
  /**
   * Override tỷ lệ hoa hồng theo DU_AN (id_du_an → tỉ lệ %)
   * Nếu không có entry → dùng tien_hoa_hong trực tiếp từ PIPELINE
   */
  hoa_hong_theo_du_an?: Record<string, number>;
}

export const DEFAULT_PAYROLL_CONFIG: PayrollConfig = {
  tileBAO_HIEM: 0.105,      // 10.5% = BHXH 8% + BHYT 1.5% + BHTN 1%
  giam_tru_ca_nhan: 11_000_000,
  thue_suat: 0.1,
  hoa_hong_theo_du_an: {},  // Trống → dùng tien_hoa_hong từ Pipeline
};

// ============================================================
// TYPES
// ============================================================

export interface PayrollEntry extends Omit<BangLuong, 'id' | 'created_at'> {
  /** Gross trước khi trừ bảo hiểm và thuế */
  gross: number;
  /** Tổng khấu trừ */
  total_deduction?: number;
  /** BHXH/BHYT/BHTN nhân viên đóng */
  bao_hiem: number;
  /** Thuế TNCN */
  thue: number;
  /** Tên nhân viên (để hiển thị) */
  ho_ten?: string;
  /** Số người phụ thuộc */
  so_nguoi_phu_thuoc?: number;
  /** Thử việc hay chính thức (để tính BHXH) */
  isProbation?: boolean;
  /** Danh sách các khoản lương động */
  items?: Omit<PayrollItemRecord, 'id' | 'payroll_id'>[];
}



interface PayrollRawData {
  activeEmployees: NhanVien[];
  contractMap: Map<string, HopDong>;   // id_nhan_vien → HopDong (active nhất)
  closedPipelinesForMonth: Pipeline[]; // Đã lọc: giai_doan=chốt + đúng tháng
  existingLegacyKeys: Set<string>;
  existingDynamicKeys: Set<string>;
  calendar: WorkCalendar[];
  attendance: AttendanceRaw[];
  shifts: Shift[];
  adjustments: PayrollAdjustment[];
}

/**
 * Fetch và pre-process tất cả data cần thiết.
 * Gọi 1 lần, dùng cho cả generate và save.
 */
export async function fetchPayrollData(
  thang: number,
  nam: number
): Promise<PayrollRawData> {
  // Batch: parallel fetch tất cả sheets cùng lúc
  const [employees, pipelines, contracts, savedLegacy, savedDynamic, calendar, attendance, shifts, adjustments] = await Promise.all([
    getNhanVien(),
    getPipeline(),
    getHopDong(),
    getBangLuong(),
    getPayrollRecords(thang, nam),
    getWorkCalendar(),
    getAttendanceRaw(thang, nam),
    getShifts(),
    getPayrollAdjustments(thang, nam),
  ]);

  // 1. Nhân viên active (không bao gồm "Nghỉ việc")
  const activeEmployees = employees.filter(
    (nv) => nv.trang_thai?.toLowerCase() !== 'nghỉ việc'
  );

  // 2. Map hợp đồng đang có hiệu lực → mỗi NV lấy 1 hợp đồng active nhất
  const targetMonthStart = new Date(nam, thang - 1, 1);
  const targetMonthEnd = new Date(nam, thang, 0); // last day of month

  const contractMap = new Map<string, HopDong>();
  for (const hd of contracts) {
    if (!hd.id_nhan_vien || !hd.ngay_bat_dau) continue;

    const start = new Date(hd.ngay_bat_dau);
    start.setHours(0, 0, 0, 0);
    if (isNaN(start.getTime()) || start > targetMonthEnd) continue;

    // Kiểm tra hợp đồng chưa hết hạn trước khi tháng này bắt đầu
    if (hd.ngay_ket_thuc?.trim()) {
      const end = new Date(hd.ngay_ket_thuc);
      end.setHours(23, 59, 59, 999);
      if (!isNaN(end.getTime()) && end < targetMonthStart) continue;
    }

    // Nếu đã có entry → giữ hợp đồng mới hơn (ngay_bat_dau lớn hơn)
    const existing = contractMap.get(hd.id_nhan_vien);
    if (existing) {
      const existingStart = new Date(existing.ngay_bat_dau);
      if (start > existingStart) {
        contractMap.set(hd.id_nhan_vien, hd);
      }
    } else {
      contractMap.set(hd.id_nhan_vien, hd);
    }
  }

  // 3. Pipeline đã chốt trong tháng/năm chỉ định
  // Format cột "thang" trong sheet: "MM-YYYY"
  const monthKey = `${String(thang).padStart(2, '0')}-${nam}`;

  const closedPipelinesForMonth = pipelines.filter((pl) => {
    const giaiDoanNorm = (pl.giai_doan || '').trim().toLowerCase();
    return pl.thang === monthKey && giaiDoanNorm === 'chốt';
  });

  // 4. Tập hợp các payroll đã lưu → tránh trùng
  const existingLegacyKeys = new Set<string>();
  savedLegacy.forEach(bl => {
    if (bl.thang === thang && bl.nam === nam) {
      existingLegacyKeys.add(`${bl.id_nhan_vien}|${bl.thang}|${bl.nam}`);
    }
  });
  const existingDynamicKeys = new Set<string>();
  savedDynamic.forEach(p => {
    existingDynamicKeys.add(`${p.id_nhan_vien}|${p.thang}|${p.nam}`);
  });

  return {
    activeEmployees,
    contractMap,
    closedPipelinesForMonth,
    existingLegacyKeys,
    existingDynamicKeys,
    calendar,
    attendance,
    shifts,
    adjustments,
  };
}

// ============================================================
// HELPERS
// ============================================================

/**
 * Tính số công chuẩn trong tháng (T2-T6=1, T7=0.5, CN=0)
 */
export function getWorkingDaysInMonth(month: number, year: number): number {
  const lastDay = new Date(year, month, 0).getDate();
  let totalWorkDays = 0;

  for (let day = 1; day <= lastDay; day++) {
    const date = new Date(year, month - 1, day);
    const dayOfWeek = date.getDay(); // 0: CN, 1: T2, ..., 6: T7

    if (dayOfWeek >= 1 && dayOfWeek <= 5) {
      totalWorkDays += 1;
    } else if (dayOfWeek === 6) {
      totalWorkDays += 0.5;
    }
  }

  return totalWorkDays;
}

/**
 * Tính toán công thực tế
 */
export function calculateAttendance(so_ngay_cong_chuan: number, so_ngay_nghi_khong_luong: number) {
  return Math.max(0, so_ngay_cong_chuan - so_ngay_nghi_khong_luong);
}

/**
 * Tính toán tiền lương và OT
 */
export function calculateSalary(luong_co_ban: number, so_ngay_cong_chuan: number, so_ngay_lam_viec_thuc_te: number, so_gio_ot: number) {
  const salary_by_day = so_ngay_cong_chuan > 0 
    ? (luong_co_ban / so_ngay_cong_chuan) * so_ngay_lam_viec_thuc_te 
    : 0;

  const hourly_rate = so_ngay_cong_chuan > 0 ? (luong_co_ban / so_ngay_cong_chuan / 8) : 0;
  const ot_pay = so_gio_ot * hourly_rate * 1.5;

  return { salary_by_day, ot_pay, hourly_rate };
}

// ============================================================
// LAYER 2: CALCULATE
// Pure function — không gọi I/O, chỉ tính toán
// ============================================================

/**
 * Tính lương một nhân viên từ raw data đã fetch.
 */
export function calculateEmployeePayroll(
  nv: NhanVien,
  thang: number,
  nam: number,
  contractMap: Map<string, HopDong>,
  pipelinesForEmployee: Pipeline[],
  config: PayrollConfig = DEFAULT_PAYROLL_CONFIG
): PayrollEntry {
  // A. Lương cơ bản từ HOP_DONG
  const hopDong = contractMap.get(nv.id_nhan_vien);
  const luong_co_ban = hopDong ? Number(hopDong.luong_co_ban) || 0 : 0;

  // B. Doanh thu + Hoa hồng từ PIPELINE đã chốt
  let doanh_thu = 0;
  let hoa_hong = 0;

  for (const pl of pipelinesForEmployee) {
    doanh_thu += Number(pl.gia_tri_thuc_te) || 0;

    // Override hoa hồng nếu có config theo DU_AN
    const overrideRate = config.hoa_hong_theo_du_an?.[pl.id_du_an];
    if (overrideRate !== undefined) {
      hoa_hong += (Number(pl.gia_tri_thuc_te) || 0) * overrideRate;
    } else {
      // Dùng tien_hoa_hong trực tiếp từ Pipeline
      hoa_hong += Number(pl.tien_hoa_hong) || 0;
    }
  }

  // C. Thưởng / Phạt (mặc định 0, có thể điều chỉnh trên UI)
  const thuong = 0;
  const phat = 0;

  // D. Gross & Chi tiết công
  const so_ngay_cong_chuan = getWorkingDaysInMonth(thang, nam);
  const so_ngay_nghi_khong_luong = 0; // Mặc định 0
  const so_ngay_lam_viec_thuc_te = calculateAttendance(so_ngay_cong_chuan, so_ngay_nghi_khong_luong);
  const so_gio_ot = 0;

  const { salary_by_day, ot_pay } = calculateSalary(luong_co_ban, so_ngay_cong_chuan, so_ngay_lam_viec_thuc_te, so_gio_ot);

  const gross = salary_by_day + hoa_hong + thuong + ot_pay - phat;

  // E. Bảo hiểm
  // Nếu thử việc (contract_type contains 'thử việc') -> 0
  const isProbation = (hopDong?.contract_type || '').toLowerCase().includes('thử việc');
  
  let bao_hiem = 0; // bh_employee
  let bh_company = 0;

  if (!isProbation && luong_co_ban > 0) {
    bao_hiem = luong_co_ban * config.tileBAO_HIEM;
    bh_company = luong_co_ban * 0.215; // BHXH doanh nghiệp đóng 21.5%
  }

  // F. Thuế TNCN
  const so_nguoi_phu_thuoc = nv.so_nguoi_phu_thuoc || 0;
  const giam_tru = TAX_CONFIG.giam_tru_ban_than + (TAX_CONFIG.giam_tru_phu_thuoc * so_nguoi_phu_thuoc);
  const thu_nhap_tinh_thue = gross - bao_hiem - giam_tru;
  
  const thue = calculateTaxMonthly(thu_nhap_tinh_thue);

  // G. NET
  const tong_luong = gross - bao_hiem - thue;

  return {
    id_nhan_vien: nv.id_nhan_vien,
    ho_ten: nv.ho_ten,
    thang,
    nam,
    luong_co_ban,
    doanh_thu,
    hoa_hong,
    thuong,
    phat,
    so_ngay_cong_chuan,
    so_ngay_lam_viec_thuc_te,
    so_ngay_nghi_khong_luong,
    so_gio_ot,
    salary_by_day,
    ot_pay,
    gross,
    bao_hiem, // bh_employee
    bh_company,
    thue,
    tong_luong,
    trang_thai: 'draft',
    so_nguoi_phu_thuoc: nv.so_nguoi_phu_thuoc,
    isProbation,
  };
}

// ============================================================
// PUBLIC API: generatePayroll(thang, nam)
// ============================================================

/**
 * Tính bảng lương tháng/năm cho tất cả nhân viên active.
 * KHÔNG lưu vào Sheets — chỉ trả về kết quả để preview.
 */
export async function generatePayroll(
  thang: number,
  nam: number,
  config: PayrollConfig = DEFAULT_PAYROLL_CONFIG
): Promise<PayrollEntry[]> {
  const rawData = await fetchPayrollData(thang, nam);
  const { activeEmployees, contractMap, closedPipelinesForMonth } = rawData;

  // Khởi tạo Engines
  const calEngine = new CalendarEngine(rawData.calendar);
  const attEngine = new AttendanceEngine(rawData.attendance, rawData.shifts, rawData.calendar);
  const payEngine = new PayrollEngine(calEngine, attEngine, rawData.adjustments);

  // Group pipelines theo id_nhan_vien
  const pipelinesByEmployee = new Map<string, Pipeline[]>();
  for (const pl of rawData.closedPipelinesForMonth) {
    const saleIdOrName = (pl.sale_phu_trach || '').trim().toLowerCase();
    
    // Tìm nhân viên tương ứng (trùng ID, hoặc ID nằm trong tên, hoặc tên trùng)
    const emp = rawData.activeEmployees.find(e => {
      const id = (e.id_nhan_vien || '').toLowerCase();
      const ho_ten = (e.ho_ten || '').toLowerCase();
      return id === saleIdOrName || 
             ho_ten === saleIdOrName || 
             saleIdOrName.includes(id) || 
             saleIdOrName.includes(ho_ten);
    });

    if (emp) {
      const list = pipelinesByEmployee.get(emp.id_nhan_vien) || [];
      list.push(pl);
      pipelinesByEmployee.set(emp.id_nhan_vien, list);
    }
  }

  const results: PayrollEntry[] = activeEmployees.map((nv) => {
    const empPipelines = pipelinesByEmployee.get(nv.id_nhan_vien) || [];
    const hopDong = contractMap.get(nv.id_nhan_vien);
    
    if (!hopDong) {
      // Nếu không có hợp đồng, dùng logic cũ hoặc bỏ qua
      return calculateEmployeePayroll(nv, thang, nam, contractMap, empPipelines, config);
    }

    // Dùng Payroll Engine mới để tính toán
    const calc = payEngine.calculate(nv, hopDong, thang, nam);

    // Bổ sung hoa hồng từ Pipeline (vì PayrollEngine mặc định chưa tính hoa hồng BĐS)
    let hoa_hong = 0;
    let doanh_thu = 0;
    for (const pl of empPipelines) {
      doanh_thu += Number(pl.gia_tri_thuc_te) || 0;
      const overrideRate = config.hoa_hong_theo_du_an?.[pl.id_du_an];
      hoa_hong += overrideRate !== undefined 
        ? (Number(pl.gia_tri_thuc_te) || 0) * overrideRate 
        : (Number(pl.tien_hoa_hong) || 0);
    }

    const entry: PayrollEntry = { ...calc };
    if (hoa_hong > 0) {
      entry.hoa_hong = Math.round(hoa_hong);
      entry.doanh_thu = doanh_thu;
      entry.items = [...(entry.items || []), { loai_khoan: 'Hoa hồng BĐS', nhom: 'thu_nhap', so_tien: Math.round(hoa_hong), ghi_chu: '', tinh_bhxh: false, tinh_thue: true }];
      
      entry.gross = (entry.items || []).filter(i => i.nhom === 'thu_nhap').reduce((s, i) => s + i.so_tien, 0);
      entry.total_deduction = (entry.items || []).filter(i => i.nhom === 'khau_tru').reduce((s, i) => s + i.so_tien, 0);
      entry.tong_luong = entry.gross - (entry.total_deduction || 0);
    }
    return entry;
  });

  return results;
}

/**
 * Lưu bảng lương vào PAYROLL + PAYROLL_ITEMS.
 * - Không tạo trùng (check id_nhan_vien + thang + nam qua getPayrollRecords)
 * - Batch: ghi tất cả 1 lần duy nhất qua savePayrollBatch()
 *   để tránh vượt quota Google Sheets API (60 reads/min)
 */
export async function savePayroll(
  thang: number,
  nam: number,
  entries: PayrollEntry[],
  forceOverwrite = false
): Promise<SavePayrollResult> {
  // Chỉ fetch dữ liệu cần thiết để check duplicate (1 API call)
  let existingDynamicKeys = new Set<string>();
  try {
    const savedDynamic = await getPayrollRecords(thang, nam);
    savedDynamic.forEach(p => {
      existingDynamicKeys.add(`${p.id_nhan_vien}|${p.thang}|${p.nam}`);
    });
  } catch (err) {
    console.warn('[savePayroll] Could not fetch existing records, proceeding without duplicate check:', err);
  }

  console.log(`[savePayroll] Month: ${thang}/${nam}, Entries: ${entries.length}, Existing Dynamic Keys: ${existingDynamicKeys.size}`);

  let skipped = 0;
  const errors: string[] = [];

  // 1. Lọc ra các entries hợp lệ (không trùng, có id)
  const validEntries: Array<{
    payroll: Omit<import('@/lib/types').PayrollRecord, 'id' | 'created_at'>;
    items: Omit<import('@/lib/types').PayrollItemRecord, 'id' | 'payroll_id'>[];
  }> = [];

  for (const entry of entries) {
    if (!entry.id_nhan_vien) continue;

    const key = `${entry.id_nhan_vien}|${entry.thang}|${entry.nam}`;

    if (!forceOverwrite && existingDynamicKeys.has(key)) {
      console.log(`[savePayroll] Skipping duplicate for: ${entry.id_nhan_vien}`);
      skipped++;
      continue;
    }

    validEntries.push({
      payroll: {
        id_nhan_vien: entry.id_nhan_vien,
        thang: entry.thang,
        nam: entry.nam,
        gross: entry.gross || 0,
        total_deduction: entry.total_deduction || (entry.bao_hiem + entry.thue + (entry.phat || 0)),
        net: entry.tong_luong,
        luong_dong_bh: entry.luong_dong_bh || entry.luong_co_ban,
        thu_nhap_chiu_thue: entry.thu_nhap_chiu_thue || 0,
        tong_chi_phi: entry.tong_chi_phi || entry.gross,
        trang_thai: entry.trang_thai || 'draft',
      },
      items: entry.items || [],
    });
  }

  // 2. Ghi hàng loạt 1 lần duy nhất
  if (validEntries.length === 0) {
    console.log(`[savePayroll] No valid entries to save (all skipped or empty).`);
    return { success: true, saved: 0, skipped, errors };
  }

  console.log(`[savePayroll] Batch saving ${validEntries.length} entries...`);
  const result = await savePayrollBatch(validEntries);

  if (result.errors.length > 0) {
    errors.push(...result.errors);
  }

  const saved = result.savedIds.length;
  console.log(`[savePayroll] Finished: Saved ${saved}, Skipped ${skipped}, Errors ${errors.length}`);
  return {
    success: errors.length === 0,
    saved,
    skipped,
    errors
  };
}
