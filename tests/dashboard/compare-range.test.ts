import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildComparedRevenueSeries,
  getComparisonRange,
} from '../../src/lib/dashboard-revenue';

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const range = (from: string, to: string) => ({
  from: new Date(`${from}T00:00:00`),
  to: new Date(`${to}T23:59:59`),
});

test('prev: month/quarter/year compare against the SELECTED period, not today', () => {
  const month = getComparisonRange(range('2026-08-01', '2026-08-31'), 'prev');
  assert.equal(ymd(month.from), '2026-07-01');
  assert.equal(ymd(month.to), '2026-07-31');
  assert.equal(month.to.getHours(), 23, 'last day of previous period must be included');

  const january = getComparisonRange(range('2026-01-01', '2026-01-31'), 'prev');
  assert.equal(ymd(january.from), '2025-12-01');
  assert.equal(ymd(january.to), '2025-12-31');

  const quarter = getComparisonRange(range('2026-01-01', '2026-03-31'), 'prev');
  assert.equal(ymd(quarter.from), '2025-10-01');
  assert.equal(ymd(quarter.to), '2025-12-31');

  const year = getComparisonRange(range('2025-01-01', '2025-12-31'), 'prev');
  assert.equal(ymd(year.from), '2024-01-01');
  assert.equal(ymd(year.to), '2024-12-31');
});

test('yoy: same period last year, clamps Feb 29', () => {
  const oct = getComparisonRange(range('2026-10-01', '2026-10-31'), 'yoy');
  assert.equal(ymd(oct.from), '2025-10-01');
  assert.equal(ymd(oct.to), '2025-10-31');

  const feb = getComparisonRange(range('2028-02-01', '2028-02-29'), 'yoy');
  assert.equal(ymd(feb.to), '2027-02-28');
});

test('compared series aligns month i of both periods on the same point', () => {
  const series = buildComparedRevenueSeries({
    current: [
      { date: new Date(2026, 6, 5), revenue: 10 },
      { date: new Date(2026, 8, 30), revenue: 3 },
      { date: new Date(2026, 9, 1), revenue: 999 }, // sau kỳ — bỏ
    ],
    previous: [
      { date: new Date(2026, 3, 2), revenue: 4 },
      { date: new Date(2026, 5, 30, 12), revenue: 6 },
      { date: null, revenue: 1 },
    ],
    range: range('2026-07-01', '2026-09-30'),
    prevRange: getComparisonRange(range('2026-07-01', '2026-09-30'), 'prev'),
    now: new Date(2026, 9, 12),
  });

  assert.deepEqual(series, [
    { thang: '07-2026', doanh_thu: 10, doanh_thu_prev: 4, thang_prev: '04-2026' },
    { thang: '08-2026', doanh_thu: 0, doanh_thu_prev: 0, thang_prev: '05-2026' },
    { thang: '09-2026', doanh_thu: 3, doanh_thu_prev: 6, thang_prev: '06-2026' },
  ]);
});

test('compared series marks future months of the current period', () => {
  const series = buildComparedRevenueSeries({
    current: [{ date: new Date(2026, 0, 10), revenue: 5 }],
    previous: [{ date: new Date(2025, 11, 10), revenue: 8 }],
    range: range('2026-01-01', '2026-12-31'),
    prevRange: range('2025-01-01', '2025-12-31'),
    now: new Date(2026, 9, 12),
  });

  assert.equal(series.length, 12);
  assert.equal(series[9].chua_den, undefined, 'current month is not future');
  assert.equal(series[10].chua_den, true);
  assert.equal(series[11].doanh_thu_prev, 8);
  assert.equal(series[11].thang_prev, '12-2025');
});
