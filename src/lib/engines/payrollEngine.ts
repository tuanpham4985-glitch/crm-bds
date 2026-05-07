import { CalendarEngine } from './calendarEngine';
import { AttendanceEngine } from './attendanceEngine';
import { NhanVien, PayrollAdjustment, HopDong } from '../types';
import { calculateTaxMonthly } from '../tax';

export class PayrollEngine {
  constructor(
    private calendar: CalendarEngine,
    private attendance: AttendanceEngine,
    private adjustments: PayrollAdjustment[]
  ) {}

  calculate(nv: NhanVien, hd: HopDong, thang: number, nam: number) {
    const startDate = new Date(nam, thang - 1, 1);
    const endDate = new Date(nam, thang, 0);

    // 1. Công chuẩn
    const standardWorkdays = this.calendar.getStandardWorkdays(startDate, endDate);

    // 2. Chấm công thực tế
    const attendanceResults = this.attendance.processEmployee(nv.id_nhan_vien, startDate, endDate);
    const actualWorkdays = attendanceResults.reduce((s, r) => s + r.actualWorkday, 0);
    const totalOT = attendanceResults.reduce((s, r) => s + r.otHours, 0);
    const totalLate = attendanceResults.reduce((s, r) => s + r.lateMinutes, 0);

    // 3. Lương cơ bản theo ngày công
    const baseSalary = hd.luong_co_ban || 0;
    const salaryByDay = standardWorkdays > 0 ? (baseSalary / standardWorkdays) * actualWorkdays : 0;

    // 4. OT Pay
    const hourlyRate = standardWorkdays > 0 ? (baseSalary / standardWorkdays / 8) : 0;
    const otPay = totalOT * hourlyRate * 1.5;

    // 5. Điều chỉnh (Adjustments)
    const empAdjustments = this.adjustments.filter(a => a.id_nhan_vien === nv.id_nhan_vien);
    const totalBonus = empAdjustments.filter(a => a.type === 'bonus').reduce((s, a) => s + a.amount, 0);
    const totalFine = empAdjustments.filter(a => a.type === 'fine').reduce((s, a) => s + a.amount, 0);

    // 6. Gross
    const gross = Math.round(salaryByDay + otPay + totalBonus - totalFine);

    // 7. Bảo hiểm & Thuế (Logic hiện có)
    const isProbation = nv.employee_type?.toLowerCase().includes('thử việc');
    const bao_hiem = isProbation ? 0 : Math.round(baseSalary * 0.105);
    
    // Thuế TNCN
    const so_phu_thuoc = nv.so_nguoi_phu_thuoc || 0;
    const giam_tru = 11000000 + (4400000 * so_phu_thuoc);
    const thu_nhap_tinh_thue = Math.max(0, gross - bao_hiem - giam_tru);
    const thue = Math.round(calculateTaxMonthly(thu_nhap_tinh_thue));

    return {
      id_nhan_vien: nv.id_nhan_vien,
      ho_ten: nv.ho_ten,
      thang,
      nam,
      luong_co_ban: baseSalary,
      doanh_thu: 0,
      hoa_hong: 0,
      so_ngay_cong_chuan: standardWorkdays,
      so_ngay_lam_viec_thuc_te: actualWorkdays,
      so_ngay_nghi_khong_luong: Math.max(0, standardWorkdays - actualWorkdays),
      so_gio_ot: totalOT,
      salary_by_day: Math.round(salaryByDay),
      ot_pay: Math.round(otPay),
      thuong: totalBonus,
      phat: totalFine,
      bao_hiem,
      bh_company: isProbation ? 0 : Math.round(baseSalary * 0.215),
      thue,
      tong_luong: Math.max(0, gross - bao_hiem - thue),
      trang_thai: 'draft' as const,
    };
  }
}
