import { WorkCalendar } from '../types';

export class CalendarEngine {
  constructor(private calendarData: WorkCalendar[]) {}

  /**
   * Tính tổng số ngày công chuẩn trong một khoảng thời gian
   */
  getStandardWorkdays(startDate: Date, endDate: Date): number {
    let total = 0;
    const current = new Date(startDate);
    while (current <= endDate) {
      const dateStr = current.toISOString().split('T')[0];
      const dayConfig = this.calendarData.find(c => c.date === dateStr);
      
      if (dayConfig) {
        total += dayConfig.weight;
      } else {
        // Dự phòng nếu chưa cấu hình ngày đó trong WorkCalendar
        const dayOfWeek = current.getDay();
        if (dayOfWeek === 0) total += 0;      // CN
        else if (dayOfWeek === 6) total += 0.5; // T7
        else total += 1;                      // T2-T6
      }
      current.setDate(current.getDate() + 1);
    }
    return total;
  }

  getDayConfig(dateStr: string): WorkCalendar | null {
    return this.calendarData.find(c => c.date === dateStr) || null;
  }
}
