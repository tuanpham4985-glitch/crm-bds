import type { DoanhThuTheoThang } from '@/lib/types';

export type DashboardReportMode = 'default' | 'standard' | 'race';

export interface RevenueSeriesPoint {
  date: Date | null | undefined;
  revenue: number;
}

/**
 * Gom doanh thu theo tháng và luôn sắp xếp đúng theo thời gian.
 * Key nội bộ dùng YYYY-MM để tránh lỗi sắp xếp chuỗi MM-YYYY qua nhiều năm.
 */
export function buildMonthlyRevenueSeries(points: RevenueSeriesPoint[]): DoanhThuTheoThang[] {
  const monthly = new Map<string, number>();

  for (const point of points) {
    if (!point.date || Number.isNaN(point.date.getTime()) || !Number.isFinite(point.revenue)) continue;
    const key = `${point.date.getFullYear()}-${String(point.date.getMonth() + 1).padStart(2, '0')}`;
    monthly.set(key, (monthly.get(key) ?? 0) + point.revenue);
  }

  return Array.from(monthly.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, doanh_thu]) => {
      const [year, month] = key.split('-');
      return { thang: `${month}-${year}`, doanh_thu };
    });
}

/**
 * Dashboard mặc định và báo cáo thi đua dùng nguồn Tổng hợp giao dịch.
 * Chế độ standard giữ nguồn Pipeline; nếu nguồn tổng hợp không có dữ liệu thì
 * fallback về Pipeline để biểu đồ không bị mất dữ liệu ngoài ý muốn.
 */
export function selectDashboardRevenueSeries({
  reportMode,
  transactionSeries,
  pipelineSeries,
}: {
  reportMode: DashboardReportMode;
  transactionSeries: DoanhThuTheoThang[];
  pipelineSeries: DoanhThuTheoThang[];
}): DoanhThuTheoThang[] {
  if (reportMode !== 'standard' && transactionSeries.length > 0) return transactionSeries;
  return pipelineSeries;
}

export type DashboardCompareMode = 'prev' | 'yoy';

export interface DateRange {
  from: Date;
  to: Date;
}

const endOfDay = (y: number, m: number, d: number): Date => new Date(y, m, d, 23, 59, 59, 999);
const monthLabel = (y: number, m: number): string => `${String(m + 1).padStart(2, '0')}-${y}`;

/**
 * Kỳ so sánh tính theo ĐÚNG kỳ đang chọn (from/to), không theo ngày hôm nay.
 * - prev: kỳ liền trước cùng độ dài theo tháng (T10 → T9, Q3 → Q2, 2026 → 2025).
 * - yoy:  cùng kỳ năm trước (T10/2026 → T10/2025).
 * Giả định from là ngày 1 của tháng — đúng với mọi kỳ Dashboard gửi lên.
 */
export function getComparisonRange(range: DateRange, mode: DashboardCompareMode): DateRange {
  const fy = range.from.getFullYear();
  const fm = range.from.getMonth();
  const ty = range.to.getFullYear();
  const tm = range.to.getMonth();

  if (mode === 'yoy') {
    const lastDayPrevYear = new Date(ty - 1, tm + 1, 0).getDate();
    return {
      from: new Date(fy - 1, fm, range.from.getDate()),
      to: endOfDay(ty - 1, tm, Math.min(range.to.getDate(), lastDayPrevYear)),
    };
  }

  const spanMonths = (ty * 12 + tm) - (fy * 12 + fm) + 1;
  return {
    from: new Date(fy, fm - spanMonths, 1),
    to: endOfDay(fy, fm, 0),
  };
}

/**
 * Biểu đồ so sánh: ghép tháng thứ i của kỳ hiện tại với tháng thứ i của kỳ so
 * sánh trên CÙNG một điểm trục X, để 2 đường chồng lên nhau. Tháng chưa tới
 * của kỳ hiện tại được đánh dấu chua_den (client vẽ thành khoảng trống thay vì
 * kéo đường về 0).
 */
export function buildComparedRevenueSeries({
  current,
  previous,
  range,
  prevRange,
  now = new Date(),
}: {
  current: RevenueSeriesPoint[];
  previous: RevenueSeriesPoint[];
  range: DateRange;
  prevRange: DateRange;
  now?: Date;
}): DoanhThuTheoThang[] {
  const fy = range.from.getFullYear();
  const fm = range.from.getMonth();
  const py = prevRange.from.getFullYear();
  const pm = prevRange.from.getMonth();
  const spanMonths = (range.to.getFullYear() * 12 + range.to.getMonth()) - (fy * 12 + fm) + 1;
  if (spanMonths <= 0) return [];

  const sumByIndex = (points: RevenueSeriesPoint[], startY: number, startM: number, r: DateRange): number[] => {
    const sums = new Array<number>(spanMonths).fill(0);
    for (const point of points) {
      if (!point.date || Number.isNaN(point.date.getTime()) || !Number.isFinite(point.revenue)) continue;
      if (point.date < r.from || point.date > r.to) continue;
      const idx = (point.date.getFullYear() * 12 + point.date.getMonth()) - (startY * 12 + startM);
      if (idx >= 0 && idx < spanMonths) sums[idx] += point.revenue;
    }
    return sums;
  };

  const currentSums = sumByIndex(current, fy, fm, range);
  const prevSums = sumByIndex(previous, py, pm, prevRange);
  const nowKey = now.getFullYear() * 12 + now.getMonth();

  return currentSums.map((doanh_thu, i) => {
    const cur = new Date(fy, fm + i, 1);
    const prev = new Date(py, pm + i, 1);
    const chuaDen = cur.getFullYear() * 12 + cur.getMonth() > nowKey;
    return {
      thang: monthLabel(cur.getFullYear(), cur.getMonth()),
      doanh_thu,
      doanh_thu_prev: prevSums[i],
      thang_prev: monthLabel(prev.getFullYear(), prev.getMonth()),
      ...(chuaDen ? { chua_den: true } : {}),
    };
  });
}
