import { CalendarEngine } from './calendarEngine';
import { AttendanceEngine } from './attendanceEngine';
import { NhanVien, PayrollAdjustment, HopDong } from '../types';
import { calculateTaxMonthly, TAX_CONFIG } from '../tax';

// ================================================================
// Hằng số Luật Lao động Việt Nam (cập nhật 2024)
// ================================================================
const MIN_WAGE_REGION1 = 4_960_000;                   // Lương tối thiểu vùng 1 (NĐ 74/2024)
export const INSURANCE_SALARY_CAP = 20 * MIN_WAGE_REGION1; // Trần lương đóng BH: 99,200,000

// Tỷ lệ đóng BHXH / BHYT / BHTN — Nhân viên
export const BHXH_EMP_RATE = 0.08;    // 8%
export const BHYT_EMP_RATE = 0.015;   // 1.5%
export const BHTN_EMP_RATE = 0.01;    // 1%

// Tỷ lệ đóng BHXH / BHYT / BHTN — Công ty
export const BHXH_CTY_RATE = 0.175;   // 17.5%
export const BHYT_CTY_RATE = 0.03;    // 3%
export const BHTN_CTY_RATE = 0.01;    // 1%

// Giảm trừ gia cảnh (Luật TNCN sửa đổi)
export const GIAM_TRU_BAN_THAN = TAX_CONFIG.giam_tru_ban_than;   // 15.5 triệu/tháng (2026)
export const GIAM_TRU_PHU_THUOC = TAX_CONFIG.giam_tru_phu_thuoc; // 6.2 triệu/người/tháng (2026)

// ================================================================
// SalaryItem: Component lương có đánh dấu tính BH & thuế
// ================================================================
export interface SalaryItem {
  loai_khoan: string;
  nhom: 'thu_nhap' | 'khau_tru' | 'chi_phi_cty';
  so_tien: number;
  ghi_chu: string;
  tinh_bhxh: boolean;  // true → cộng vào lương đóng BHXH/BHYT/BHTN
  tinh_thue: boolean;  // true → cộng vào thu nhập chịu thuế TNCN
}

// ================================================================
export class PayrollEngine {
  constructor(
    private calendar: CalendarEngine,
    private attendance: AttendanceEngine,
    private adjustments: PayrollAdjustment[]
  ) {}

  calculate(nv: NhanVien, hd: HopDong, thang: number, nam: number, hoa_hong: number = 0, doanh_thu: number = 0, thuong_nong: number = 0) {
    const startDate = new Date(nam, thang - 1, 1);
    const endDate   = new Date(nam, thang, 0);

    // ── 1. Công chuẩn & thực tế ──────────────────────────────────
    const standardWorkdays = this.calendar.getStandardWorkdays(startDate, endDate);
    const attendanceResults = this.attendance.processEmployee(nv.id_nhan_vien, startDate, endDate);
    const actualWorkdays = standardWorkdays; // Mặc định đủ công; HR trừ thủ công

    const totalOT   = attendanceResults.reduce((s, r) => s + r.otHours, 0);

    // ── 2. Lương cơ bản theo ngày công ───────────────────────────
    const baseSalary  = hd.luong_co_ban || 0;
    const salaryByDay = standardWorkdays > 0
      ? Math.round((baseSalary / standardWorkdays) * actualWorkdays)
      : 0;

    // ── 3. OT ─────────────────────────────────────────────────────
    const hourlyRate = standardWorkdays > 0 ? (baseSalary / standardWorkdays / 8) : 0;
    const otPay      = Math.round(totalOT * hourlyRate * 1.5);

    // ── 4. Adjustments (thưởng / phạt) ───────────────────────────
    const empAdj     = this.adjustments.filter(a => a.id_nhan_vien === nv.id_nhan_vien);
    const totalBonus = empAdj.filter(a => a.type === 'bonus').reduce((s, a) => s + a.amount, 0) + thuong_nong;
    const totalFine  = empAdj.filter(a => a.type === 'fine').reduce((s, a) => s + a.amount, 0);

    // ── 5. Xây dựng danh sách income items ───────────────────────
    const items: SalaryItem[] = [];

    // Lương thực tế (tinh_bhxh = true — đây là nền BH mặc định)
    if (salaryByDay > 0) {
      items.push({
        loai_khoan: 'Lương thực tế',
        nhom: 'thu_nhap',
        so_tien: salaryByDay,
        ghi_chu: `${actualWorkdays}/${standardWorkdays} ngày`,
        tinh_bhxh: true,
        tinh_thue: true,
      });
    }
    // OT — không tính BH, nhưng tính thuế
    if (otPay > 0) {
      items.push({
        loai_khoan: 'Lương OT',
        nhom: 'thu_nhap',
        so_tien: otPay,
        ghi_chu: `${totalOT}h × 1.5`,
        tinh_bhxh: false,
        tinh_thue: true,
      });
    }
    // Thưởng — không tính BH, tính thuế (theo Luật TNCN)
    if (totalBonus > 0) {
      items.push({
        loai_khoan: 'Thưởng',
        nhom: 'thu_nhap',
        so_tien: totalBonus,
        ghi_chu: '',
        tinh_bhxh: false,
        tinh_thue: true,
      });
    }
    // Phạt — khấu trừ, không ảnh hưởng BH / thuế
    if (totalFine > 0) {
      items.push({
        loai_khoan: 'Phạt',
        nhom: 'khau_tru',
        so_tien: totalFine,
        ghi_chu: '',
        tinh_bhxh: false,
        tinh_thue: false,
      });
    }

    // Hoa hồng BĐS — không tính BH, nhưng tính thuế TNCN
    if (hoa_hong > 0) {
      items.push({
        loai_khoan: 'Hoa hồng BĐS',
        nhom: 'thu_nhap',
        so_tien: Math.round(hoa_hong),
        ghi_chu: `Doanh thu: ${doanh_thu.toLocaleString('vi-VN')} đ`,
        tinh_bhxh: false,
        tinh_thue: true,
      });
    }

    // ── 6. Gross ──────────────────────────────────────────────────
    const gross = items
      .filter(i => i.nhom === 'thu_nhap')
      .reduce((s, i) => s + i.so_tien, 0);

    // ── 7. Lương đóng BHXH / BHYT / BHTN ─────────────────────────
    // = tổng các khoản có tinh_bhxh: true, capped 20 × lương tối thiểu vùng
    const bh_base_raw = items
      .filter(i => i.tinh_bhxh && i.nhom === 'thu_nhap')
      .reduce((s, i) => s + i.so_tien, 0);
    const luong_dong_bh = Math.min(bh_base_raw, INSURANCE_SALARY_CAP);

    // ── 8. Phân loại nhân sự (Chính thức / Thử việc / CTV) ────────
    const lowerContractType = (hd.contract_type || '').toLowerCase();
    const lowerEmpType = (nv.employee_type || '').toLowerCase();
    const isProbation = lowerContractType.includes('thử việc') || lowerEmpType.includes('thử việc');
    const isCollaborator = lowerContractType.includes('ctv') || lowerEmpType.includes('ctv') || (nv.trang_thai || '').toUpperCase() === 'CTV';
    const isIntern = lowerContractType.includes('học viên') || lowerEmpType.includes('học viên') || lowerContractType.includes('tập nghề') || lowerEmpType.includes('tập nghề') || (nv.trang_thai || '').toUpperCase() === 'HỌC VIÊN';

    let bhxh_emp = 0, bhyt_emp = 0, bhtn_emp = 0;
    let bhxh_cty = 0, bhyt_cty = 0, bhtn_cty = 0;

    if (isProbation || isCollaborator || isIntern) {
      // Thử việc / CTV: Không bắt buộc đóng bảo hiểm
      bhxh_emp = 0; bhyt_emp = 0; bhtn_emp = 0;
      bhxh_cty = 0; bhyt_cty = 0; bhtn_cty = 0;
    } else {
      // Chính thức / Học viên có đóng BH
      bhxh_emp = Math.round(luong_dong_bh * BHXH_EMP_RATE);
      bhyt_emp = Math.round(luong_dong_bh * BHYT_EMP_RATE);
      bhtn_emp = Math.round(luong_dong_bh * BHTN_EMP_RATE);
      bhxh_cty = Math.round(luong_dong_bh * BHXH_CTY_RATE);
      bhyt_cty = Math.round(luong_dong_bh * BHYT_CTY_RATE);
      bhtn_cty = Math.round(luong_dong_bh * BHTN_CTY_RATE);
    }

    const total_bh_emp = bhxh_emp + bhyt_emp + bhtn_emp;
    const total_bh_cty = bhxh_cty + bhyt_cty + bhtn_cty;

    // ── 9. Thu nhập chịu thuế TNCN ───────────────────────────────
    const thu_nhap_truoc_thue = items
      .filter(i => i.tinh_thue && i.nhom === 'thu_nhap')
      .reduce((s, i) => s + i.so_tien, 0);
      
    const so_phu_thuoc = nv.so_nguoi_phu_thuoc || 0;
    let thu_nhap_chiu_thue = 0;
    let thue = 0;

    if (isProbation || isCollaborator || isIntern) {
      // Luật TNCN: NV không có HĐLĐ (CTV) hoặc HĐLĐ dưới 3 tháng (Thử việc)
      // Khấu trừ 10% tại nguồn nếu tổng thu nhập trả mỗi lần >= 2.000.000 VNĐ
      // Không áp dụng giảm trừ gia cảnh
      thu_nhap_chiu_thue = thu_nhap_truoc_thue;
      if (thu_nhap_chiu_thue >= 2_000_000) {
        thue = Math.round(thu_nhap_chiu_thue * 0.1);
      } else {
        thue = 0;
      }
    } else {
      // Hợp đồng chính thức: Tính theo biểu thuế lũy tiến từng phần
      // Được áp dụng giảm trừ bản thân, người phụ thuộc, và bảo hiểm
      const giam_tru = GIAM_TRU_BAN_THAN + GIAM_TRU_PHU_THUOC * so_phu_thuoc;
      thu_nhap_chiu_thue = Math.max(0, thu_nhap_truoc_thue - total_bh_emp - giam_tru);
      thue = Math.round(calculateTaxMonthly(thu_nhap_chiu_thue));
    }

    // ── 10. Bổ sung các khoản khấu trừ nhân viên ─────────────────
    if (bhxh_emp > 0) items.push({ loai_khoan: 'BHXH (8%)',  nhom: 'khau_tru', so_tien: bhxh_emp, ghi_chu: '8% lương đóng BH',   tinh_bhxh: false, tinh_thue: false });
    if (bhyt_emp > 0) items.push({ loai_khoan: 'BHYT (1.5%)',nhom: 'khau_tru', so_tien: bhyt_emp, ghi_chu: '1.5% lương đóng BH', tinh_bhxh: false, tinh_thue: false });
    if (bhtn_emp > 0) items.push({ loai_khoan: 'BHTN (1%)',  nhom: 'khau_tru', so_tien: bhtn_emp, ghi_chu: '1% lương đóng BH',   tinh_bhxh: false, tinh_thue: false });
    if (thue     > 0) items.push({ loai_khoan: 'Thuế TNCN',  nhom: 'khau_tru', so_tien: thue,     ghi_chu: '',                    tinh_bhxh: false, tinh_thue: false });

    // ── 11. Chi phí công ty (nhom = chi_phi_cty) ─────────────────
    // Không ảnh hưởng NET nhân viên, chỉ dùng cho báo cáo chi phí
    if (bhxh_cty > 0) items.push({ loai_khoan: 'BHXH Công ty (17.5%)', nhom: 'chi_phi_cty', so_tien: bhxh_cty, ghi_chu: '', tinh_bhxh: false, tinh_thue: false });
    if (bhyt_cty > 0) items.push({ loai_khoan: 'BHYT Công ty (3%)',    nhom: 'chi_phi_cty', so_tien: bhyt_cty, ghi_chu: '', tinh_bhxh: false, tinh_thue: false });
    if (bhtn_cty > 0) items.push({ loai_khoan: 'BHTN Công ty (1%)',    nhom: 'chi_phi_cty', so_tien: bhtn_cty, ghi_chu: '', tinh_bhxh: false, tinh_thue: false });

    // ── 12. Tổng hợp ──────────────────────────────────────────────
    const total_deduction = items
      .filter(i => i.nhom === 'khau_tru')
      .reduce((s, i) => s + i.so_tien, 0);

    const net          = Math.max(0, gross - total_deduction);
    const tong_chi_phi = gross + total_bh_cty;  // Chi phí thực tế công ty phải trả

    return {
      // Identity
      id_nhan_vien: nv.id_nhan_vien,
      ho_ten:       nv.ho_ten,
      thang,
      nam,
      // Lương
      luong_co_ban:         baseSalary,
      luong_dong_bh,        // Lương làm cơ sở đóng BH
      thu_nhap_chiu_thue,   // Thu nhập chịu thuế TNCN
      // Chi tiết ngày công / OT
      doanh_thu,
      hoa_hong,
      so_ngay_cong_chuan:           standardWorkdays,
      so_ngay_lam_viec_thuc_te:     actualWorkdays,
      so_ngay_nghi_khong_luong:     Math.max(0, standardWorkdays - actualWorkdays),
      so_gio_ot:                    totalOT,
      salary_by_day:                salaryByDay,
      ot_pay:                       otPay,
      thuong:                       totalBonus,
      phat:                         totalFine,
      // Bảo hiểm
      bao_hiem:    total_bh_emp,  // Tổng BH NV đóng
      bh_company:  total_bh_cty, // Tổng BH CTY đóng
      // Thuế
      thue,
      // Tổng hợp
      gross,
      total_deduction,
      tong_luong:  net,
      tong_chi_phi,
      // Meta
      trang_thai: 'draft' as const,
      isProbation,
      isCollaborator,
      isIntern,
      so_nguoi_phu_thuoc: so_phu_thuoc,
      items,
    };
  }
}
