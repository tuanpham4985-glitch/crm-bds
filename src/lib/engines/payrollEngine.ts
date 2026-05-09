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
    
    // THEO YÊU CẦU: Luôn mặc định là đi làm đủ công chuẩn (Nghỉ = 0)
    // HR sẽ chủ động trừ ngày nghỉ thủ công trên giao diện hoặc qua adjustments.
    const actualWorkdays = standardWorkdays; 

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
    
    // 7. Thuế TNCN
    const so_phu_thuoc = nv.so_nguoi_phu_thuoc || 0;
    const giam_tru = 11000000 + (4400000 * so_phu_thuoc);
    const thu_nhap_tinh_thue = Math.max(0, gross - bao_hiem - giam_tru);
    const thue = Math.round(calculateTaxMonthly(thu_nhap_tinh_thue));

    // 8. TỔNG HỢP PAYROLL ITEMS (Mô hình Components)
    const items: any[] = [];
    
    // Thu nhập
    if (salaryByDay > 0) items.push({ loai_khoan: 'Lương thực tế', nhom: 'thu_nhap', so_tien: Math.round(salaryByDay), ghi_chu: '' });
    if (otPay > 0)       items.push({ loai_khoan: 'Lương OT', nhom: 'thu_nhap', so_tien: Math.round(otPay), ghi_chu: '' });
    if (totalBonus > 0)  items.push({ loai_khoan: 'Thưởng', nhom: 'thu_nhap', so_tien: totalBonus, ghi_chu: '' });
    
    // Khấu trừ
    if (totalFine > 0)   items.push({ loai_khoan: 'Phạt', nhom: 'khau_tru', so_tien: totalFine, ghi_chu: '' });
    if (bao_hiem > 0)    items.push({ loai_khoan: 'BHXH (10.5%)', nhom: 'khau_tru', so_tien: bao_hiem, ghi_chu: '' });
    if (thue > 0)        items.push({ loai_khoan: 'Thuế TNCN', nhom: 'khau_tru', so_tien: thue, ghi_chu: '' });

    const totalIncome = items.filter(i => i.nhom === 'thu_nhap').reduce((s, i) => s + i.so_tien, 0);
    const totalDeduction = items.filter(i => i.nhom === 'khau_tru').reduce((s, i) => s + i.so_tien, 0);

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
      gross: totalIncome,
      total_deduction: totalDeduction,
      tong_luong: Math.max(0, totalIncome - totalDeduction),
      trang_thai: 'draft' as const,
      items
    };
  }
}
