import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildMonthlyRevenueSeries,
  selectDashboardRevenueSeries,
} from '../../src/lib/dashboard-revenue';

test('buildMonthlyRevenueSeries groups revenue and sorts months chronologically', () => {
  const series = buildMonthlyRevenueSeries([
    { date: new Date(2026, 0, 15), revenue: 10 },
    { date: new Date(2025, 11, 20), revenue: 5 },
    { date: new Date(2026, 0, 25), revenue: 7 },
    { date: null, revenue: 999 },
  ]);

  assert.deepEqual(series, [
    { thang: '12-2025', doanh_thu: 5 },
    { thang: '01-2026', doanh_thu: 17 },
  ]);
});

test('default Dashboard prefers the standard transaction summary source', () => {
  const transactionSeries = [{ thang: '08-2026', doanh_thu: 786_300_000_000 }];
  const pipelineSeries = [{ thang: '08-2026', doanh_thu: 1 }];

  assert.equal(selectDashboardRevenueSeries({
    reportMode: 'default',
    transactionSeries,
    pipelineSeries,
  }), transactionSeries);
});

test('standard mode keeps Pipeline and empty transaction source falls back to Pipeline', () => {
  const transactionSeries = [{ thang: '08-2026', doanh_thu: 100 }];
  const pipelineSeries = [{ thang: '08-2026', doanh_thu: 50 }];

  assert.equal(selectDashboardRevenueSeries({
    reportMode: 'standard',
    transactionSeries,
    pipelineSeries,
  }), pipelineSeries);

  assert.equal(selectDashboardRevenueSeries({
    reportMode: 'default',
    transactionSeries: [],
    pipelineSeries,
  }), pipelineSeries);
});
