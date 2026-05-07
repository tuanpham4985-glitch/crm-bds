import { AttendanceRaw, Shift, WorkCalendar } from '../types';

export interface AttendanceResult {
  date: string;
  isWorkday: boolean;
  actualWorkday: number; // 1, 0.5, 0
  lateMinutes: number;
  earlyMinutes: number;
  otHours: number;
}

export class AttendanceEngine {
  constructor(
    private rawData: AttendanceRaw[],
    private shifts: Shift[],
    private calendar: WorkCalendar[]
  ) {}

  processEmployee(id_nhan_vien: string, startDate: Date, endDate: Date): AttendanceResult[] {
    const results: AttendanceResult[] = [];
    const current = new Date(startDate);
    const empData = this.rawData.filter(r => r.id_nhan_vien === id_nhan_vien);

    while (current <= endDate) {
      const dateStr = current.toISOString().split('T')[0];
      const dayConfig = this.calendar.find(c => c.date === dateStr);
      const isWorkday = dayConfig ? dayConfig.weight > 0 : (current.getDay() !== 0);
      const dayWeight = dayConfig ? dayConfig.weight : (current.getDay() === 6 ? 0.5 : (current.getDay() === 0 ? 0 : 1));
      
      const att = empData.find(a => a.date === dateStr);
      // Ca mặc định nếu không tìm thấy ca nào trong hệ thống
      const defaultShift: Shift = {
        id: 'default',
        name: 'Hành chính',
        start_time: '08:00',
        end_time: '17:00',
        grace_period: 15
      };
      const shift = this.shifts.length > 0 ? this.shifts[0] : defaultShift;

      if (att && shift) {
        const { late, early, ot } = this.calculateMetrics(att, shift, dayWeight);
        results.push({
          date: dateStr,
          isWorkday,
          actualWorkday: dayWeight,
          lateMinutes: late,
          earlyMinutes: early,
          otHours: ot
        });
      } else {
        results.push({
          date: dateStr,
          isWorkday,
          actualWorkday: 0,
          lateMinutes: 0,
          earlyMinutes: 0,
          otHours: 0
        });
      }
      current.setDate(current.getDate() + 1);
    }
    return results;
  }

  private calculateMetrics(att: AttendanceRaw, shift: Shift, weight: number) {
    if (!att.check_in || !att.check_out) return { late: 0, early: 0, ot: 0 };

    const [startH, startM] = shift.start_time.split(':').map(Number);
    const [endH, endM] = shift.end_time.split(':').map(Number);
    const [inH, inM] = att.check_in.split(':').map(Number);
    const [outH, outM] = att.check_out.split(':').map(Number);

    const shiftStart = startH * 60 + startM;
    const shiftEnd = endH * 60 + endM;
    const actualIn = inH * 60 + inM;
    const actualOut = outH * 60 + outM;

    // Đi trễ (có trừ grace period)
    const late = Math.max(0, actualIn - shiftStart - shift.grace_period);
    
    // Về sớm
    const early = Math.max(0, shiftEnd - actualOut);

    // OT (Giao thức đơn giản: sau giờ về 30p mới tính OT)
    let ot = 0;
    if (actualOut > shiftEnd + 30) {
      ot = (actualOut - shiftEnd) / 60;
    }

    return { late, early, ot };
  }
}
