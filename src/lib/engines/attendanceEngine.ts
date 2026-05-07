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
      const y = current.getFullYear();
      const m = String(current.getMonth() + 1).padStart(2, '0');
      const d = String(current.getDate()).padStart(2, '0');
      const dateStr = `${y}-${m}-${d}`;
      const dayConfig = this.calendar.find(c => c.date === dateStr);
      const isWorkday = dayConfig ? dayConfig.weight > 0 : (current.getDay() !== 0);
      const dayWeight = dayConfig ? dayConfig.weight : (current.getDay() === 6 ? 0.5 : (current.getDay() === 0 ? 0 : 1));
      
      const att = empData.find(a => a.date === dateStr);
      
      // Chọn ca làm việc: Thứ 7 dùng 'SATURDAY', ngày thường dùng 'DEFAULT'
      const isSat = current.getDay() === 6;
      const shiftId = isSat ? 'SATURDAY' : 'DEFAULT';
      let shift = this.shifts.find(s => s.id === shiftId) || this.shifts[0];

      // Ca mặc định dự phòng nếu không tìm thấy ca nào
      if (!shift) {
        shift = {
          id: 'default',
          name: 'Hành chính',
          start_time: '08:00',
          end_time: '17:00',
          grace_period: 15
        };
      }

      if (att && shift) {
        const metrics = this.calculateMetrics(att, shift, dayWeight, dateStr);
        results.push({
          date: dateStr,
          isWorkday,
          actualWorkday: metrics.actualWorkday * dayWeight,
          lateMinutes: metrics.lateMinutes,
          earlyMinutes: metrics.earlyMinutes,
          otHours: metrics.otHours
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

  private parseTime(timeStr: string, dateStr: string): Date {
    return new Date(`${dateStr}T${timeStr}:00`);
  }

  private calculateMetrics(att: AttendanceRaw, shift: Shift, weight: number, dateStr: string) {
    if (!att.check_in || !att.check_out) return { actualWorkday: 0, lateMinutes: 0, earlyMinutes: 0, otHours: 0 };

    const inDate = this.parseTime(att.check_in, dateStr);
    const outDate = this.parseTime(att.check_out, dateStr);
    const actualDuration = Math.max(0, (outDate.getTime() - inDate.getTime()) / (1000 * 60));
    const shiftStart = this.parseTime(shift.start_time, dateStr);
    const shiftEnd = this.parseTime(shift.end_time, dateStr);
    const shiftDuration = Math.max(1, (shiftEnd.getTime() - shiftStart.getTime()) / (1000 * 60));
    
    const actualWorkday = Math.min(1, actualDuration / shiftDuration);

    let otHours = 0;
    if (actualDuration > shiftDuration) {
      otHours = Number(((actualDuration - shiftDuration) / 60).toFixed(2));
    }

    const lateMinutes = Math.max(0, (inDate.getTime() - shiftStart.getTime()) / (1000 * 60));
    const earlyMinutes = Math.max(0, (shiftEnd.getTime() - outDate.getTime()) / (1000 * 60));

    return {
      actualWorkday,
      otHours,
      lateMinutes,
      earlyMinutes,
    };
  }
}
