import { AttendanceRaw, AttendanceStatus, Shift, WorkCalendar } from '../types';

// ================================================================
// Bảng quy đổi mã chấm công → số công + loại
// ================================================================

/**
 * Trả về số công thực tế (0–1) theo mã status.
 * Dùng để tính lương: chỉ N / N/2 mới bị trừ công.
 */
export function statusToWorkday(status: AttendanceStatus): number {
  switch (status) {
    case 'x':   return 1.0;   // Đi làm ngày thường
    case 'x/2': return 0.5;   // Thứ 7
    case 'WFH': return 1.0;   // Work from home — đủ công
    case 'P':   return 1.0;   // Nghỉ phép có lương
    case 'P/2': return 0.5;   // Nghỉ phép thứ 7
    case 'CĐ':  return 1.0;   // Nghỉ chế độ (thai sản/ốm) — BH trả, không trừ lương cty
    case 'L':   return 1.0;   // Nghỉ lễ hưởng lương
    case 'N':   return 0;     // Nghỉ không lương
    case 'N/2': return 0;     // Nghỉ nửa ngày không lương
    case '0':   return 0;     // Chủ nhật / không làm
    default:    return 0;
  }
}

/**
 * Ngày có "tính lương" hay không:
 * - true  → được tính vào phần trăm công hưởng lương (x, WFH, P, CĐ, L)
 * - false → N/0 → trừ lương
 */
export function isPaidStatus(status: AttendanceStatus): boolean {
  return ['x', 'x/2', 'WFH', 'P', 'P/2', 'CĐ', 'L'].includes(status as string);
}

export interface AttendanceResult {
  date: string;
  isWorkday: boolean;
  status: AttendanceStatus;        // Mã gốc để UI hiển thị
  actualWorkday: number;           // 0–1 (đã nhân dayWeight)
  lateMinutes: number;
  earlyMinutes: number;
  otHours: number;
}

// ================================================================
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
      const dayWeight = dayConfig
        ? dayConfig.weight
        : (current.getDay() === 6 ? 0.5 : (current.getDay() === 0 ? 0 : 1));

      const att = empData.find(a => a.date === dateStr);

      if (att) {
        const status = att.status || '';

        // ── Ưu tiên: dùng status code (bảng chấm công Excel) ──────
        if (status !== '') {
          const baseWorkday = statusToWorkday(status as AttendanceStatus);
          // Với các ngày lễ (weight>1 nếu cấu hình), nhân thêm;
          // ngày thường giữ nguyên giá trị từ status
          const actualWorkday = status === '0'
            ? 0
            : (status === 'x/2' || status === 'P/2')
              ? 0.5 * (dayWeight > 0 ? 1 : 0)   // Thứ 7 — chỉ tính nếu ngày làm
            : status === 'L'
              ? (dayWeight > 0 ? 1.0 : 0)        // Nghỉ lễ: weight=0 → 0 (đã loại khỏi mẫu số), weight>0 → 1
              : baseWorkday;

          // OT: ưu tiên ot_hours trực tiếp (từ BCC OT), fallback check_in/check_out
          const otHours = att.ot_hours ?? this.calcOtFromTime(att, dateStr, dayWeight > 0
            ? this.pickShift(current.getDay())
            : null);

          // Late / early: ưu tiên giá trị đã nhập, fallback tính từ giờ
          const lateMinutes  = att.late_minutes  ?? this.calcLate(att, dateStr, this.pickShift(current.getDay()));
          const earlyMinutes = att.late_minutes  != null ? 0
            : this.calcEarly(att, dateStr, this.pickShift(current.getDay()));

          results.push({ date: dateStr, isWorkday, status: status as AttendanceStatus, actualWorkday, lateMinutes, earlyMinutes, otHours });
        } else {
          // ── Fallback: tính từ check_in / check_out ──────────────
          const isSat = current.getDay() === 6;
          const shift = this.pickShift(current.getDay());

          if (att.check_in && att.check_out && shift) {
            const metrics = this.calculateMetricsFromTime(att, shift, dayWeight, dateStr);
            results.push({
              date: dateStr,
              isWorkday,
              status: '',
              actualWorkday: metrics.actualWorkday * dayWeight,
              lateMinutes: metrics.lateMinutes,
              earlyMinutes: metrics.earlyMinutes,
              otHours: metrics.otHours,
            });
          } else {
            results.push({ date: dateStr, isWorkday, status: '', actualWorkday: 0, lateMinutes: 0, earlyMinutes: 0, otHours: 0 });
          }
        }
      } else {
        // Không có record → chưa nhập chấm công ngày đó
        results.push({ date: dateStr, isWorkday, status: '', actualWorkday: 0, lateMinutes: 0, earlyMinutes: 0, otHours: 0 });
      }

      current.setDate(current.getDate() + 1);
    }

    return results;
  }

  // ── Helpers ──────────────────────────────────────────────────

  private pickShift(dayOfWeek: number): Shift | null {
    const shiftId = dayOfWeek === 6 ? 'SATURDAY' : 'DEFAULT';
    return this.shifts.find(s => s.id === shiftId)
      || this.shifts[0]
      || { id: 'default', name: 'Hành chính', start_time: '08:00', end_time: '17:00', grace_period: 15 };
  }

  private parseTime(timeStr: string, dateStr: string): Date {
    return new Date(`${dateStr}T${timeStr}:00`);
  }

  private calcOtFromTime(att: AttendanceRaw, dateStr: string, shift: Shift | null): number {
    if (!shift || !att.check_in || !att.check_out) return 0;
    const inDate  = this.parseTime(att.check_in,  dateStr);
    const outDate = this.parseTime(att.check_out, dateStr);
    const shiftEnd = this.parseTime(shift.end_time, dateStr);
    const actualDuration = Math.max(0, (outDate.getTime() - inDate.getTime()) / 60000);
    const shiftDuration  = Math.max(1,  (shiftEnd.getTime() - this.parseTime(shift.start_time, dateStr).getTime()) / 60000);
    return actualDuration > shiftDuration
      ? Number(((actualDuration - shiftDuration) / 60).toFixed(2))
      : 0;
  }

  private calcLate(att: AttendanceRaw, dateStr: string, shift: Shift | null): number {
    if (!shift || !att.check_in) return 0;
    const inDate    = this.parseTime(att.check_in, dateStr);
    const shiftStart = this.parseTime(shift.start_time, dateStr);
    return Math.max(0, (inDate.getTime() - shiftStart.getTime()) / 60000);
  }

  private calcEarly(att: AttendanceRaw, dateStr: string, shift: Shift | null): number {
    if (!shift || !att.check_out) return 0;
    const outDate  = this.parseTime(att.check_out, dateStr);
    const shiftEnd = this.parseTime(shift.end_time, dateStr);
    return Math.max(0, (shiftEnd.getTime() - outDate.getTime()) / 60000);
  }

  private calculateMetricsFromTime(att: AttendanceRaw, shift: Shift, weight: number, dateStr: string) {
    if (!att.check_in || !att.check_out) return { actualWorkday: 0, lateMinutes: 0, earlyMinutes: 0, otHours: 0 };

    const inDate   = this.parseTime(att.check_in,  dateStr);
    const outDate  = this.parseTime(att.check_out, dateStr);
    const shiftStart = this.parseTime(shift.start_time, dateStr);
    const shiftEnd   = this.parseTime(shift.end_time,   dateStr);

    const actualDuration = Math.max(0, (outDate.getTime() - inDate.getTime())   / 60000);
    const shiftDuration  = Math.max(1, (shiftEnd.getTime() - shiftStart.getTime()) / 60000);

    const actualWorkday = Math.min(1, actualDuration / shiftDuration);
    const otHours = actualDuration > shiftDuration
      ? Number(((actualDuration - shiftDuration) / 60).toFixed(2))
      : 0;
    const lateMinutes  = Math.max(0, (inDate.getTime()  - shiftStart.getTime()) / 60000);
    const earlyMinutes = Math.max(0, (shiftEnd.getTime() - outDate.getTime())   / 60000);

    return { actualWorkday, otHours, lateMinutes, earlyMinutes };
  }
}
