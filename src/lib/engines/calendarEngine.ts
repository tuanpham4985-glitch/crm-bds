import { WorkCalendar } from '../types';

export class CalendarEngine {
  constructor(private calendarData: WorkCalendar[]) {}

  /**
   * Tính tổng số ngày công chuẩn trong một khoảng thời gian.
   * Quy tắc: T2–T6 = 1 công, T7 = 0.5 công, CN = 0.
   * WORK_CALENDAR KHÔNG trừ bớt mẫu số — ngày lễ hưởng lương (L) vẫn nằm trong
   * công chuẩn và được bù bởi status 'L' = 1.0 trong tử số.
   * Ví dụ: tháng 4/2026 = 22 ngày T2–T6 + 4×0.5 T7 = 24 công chuẩn,
   * dù có 2 ngày nghỉ lễ 27/4 và 30/4.
   */
  getStandardWorkdays(startDate: Date, endDate: Date): number {
    let total = 0;
    const current = new Date(startDate.getTime());

    while (current <= endDate) {
      const dayOfWeek = current.getDay();
      if (dayOfWeek === 0)      total += 0;    // CN
      else if (dayOfWeek === 6) total += 0.5;  // T7
      else                      total += 1;    // T2–T6 (kể cả ngày lễ)
      current.setDate(current.getDate() + 1);
    }
    return total;
  }

  getDayConfig(dateStr: string): WorkCalendar | null {
    return this.calendarData.find(c => c.date === dateStr) || null;
  }
}
