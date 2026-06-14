'use client';

import { useState, useMemo } from 'react';
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, Cell, PieChart, Pie, Legend, ComposedChart,
} from 'recharts';
import {
  TrendingUp, TrendingDown, DollarSign, AlertTriangle, Target,
  BarChart2, Activity, Layers, ChevronRight,
} from 'lucide-react';

// ─── Data constants (from actual T12/25–T5/26) ───────────────────────────────

const B = 1e9;

const ACTUALS = {
  period:    'T12/25–T5/26',
  months:    6,
  gmv:       457.24,   // tỷ
  revenue:   15.64,
  hhSales:   11.00,
  thuongNong: 0.69,
  cpBH:      0.74,
  cpVH:      2.34,
  pbt:       0.85,
  soCan:     32,
  commissionRate: 3.42,  // % of GMV
  hhPct:     70.4,        // % of revenue
};

// Derived
const GROSS_PROFIT   = ACTUALS.revenue - ACTUALS.hhSales - ACTUALS.thuongNong; // 3.95
const GROSS_MARGIN   = GROSS_PROFIT / ACTUALS.revenue * 100;                   // 25.3%
const EBITDA         = ACTUALS.pbt + 0.12;                                     // + est D&A
const EBITDA_MARGIN  = EBITDA / ACTUALS.revenue * 100;
const PBT_MARGIN     = ACTUALS.pbt / ACTUALS.revenue * 100;
const PAT            = ACTUALS.pbt * 0.8;                                      // 20% CIT
const AVG_DEAL_SIZE  = ACTUALS.gmv / ACTUALS.soCan;                            // 14.29 tỷ/căn
const AVG_DT_DEAL    = ACTUALS.revenue / ACTUALS.soCan;                        // 0.489 tỷ/căn

// Break-even parameters
const VARIABLE_COST_RATE = (ACTUALS.hhSales + ACTUALS.thuongNong + ACTUALS.cpBH * 0.8) / ACTUALS.revenue; // ~78.5%
const CM_RATE            = 1 - VARIABLE_COST_RATE;                              // ~21.5%
const FIXED_MONTHLY      = ACTUALS.cpVH / ACTUALS.months + ACTUALS.cpBH * 0.2 / ACTUALS.months; // ~0.42 tỷ
const BEP_DT             = FIXED_MONTHLY / CM_RATE;                             // ~1.95 tỷ
const BEP_GMV            = BEP_DT / (ACTUALS.commissionRate / 100);             // ~57 tỷ
const BEP_CAN            = BEP_GMV / AVG_DEAL_SIZE;                             // ~4 căn
const MARGIN_OF_SAFETY   = (ACTUALS.revenue / ACTUALS.months - BEP_DT) / (ACTUALS.revenue / ACTUALS.months) * 100;

// Monthly data
const MONTHLY = [
  { thang: 'T12/25', gmv: 73.6,  dt: 2.45, can: 3 },
  { thang: 'T1/26',  gmv: 115.5, dt: 3.91, can: 11 },
  { thang: 'T2/26',  gmv: 19.9,  dt: 0.62, can: 2 },
  { thang: 'T3/26',  gmv: 60.5,  dt: 1.81, can: 3 },
  { thang: 'T4/26',  gmv: 66.9,  dt: 2.15, can: 7 },
  { thang: 'T5/26',  gmv: 120.7, dt: 4.62, can: 7 },
].map((m, i, arr) => ({
  ...m,
  pbt: +(m.dt * CM_RATE - FIXED_MONTHLY).toFixed(3),
  gross: +(m.dt * (1 - (ACTUALS.hhSales + ACTUALS.thuongNong) / ACTUALS.revenue)).toFixed(3),
  mom:  i === 0 ? 0 : +((m.dt / arr[i-1].dt - 1) * 100).toFixed(1),
  gpMargin: +((m.dt * (1 - (ACTUALS.hhSales + ACTUALS.thuongNong) / ACTUALS.revenue)) / m.dt * 100).toFixed(1),
}));

// Cost structure for pie
const COST_PIE = [
  { name: 'HH Sales', value: ACTUALS.hhSales, color: '#ef4444' },
  { name: 'Thưởng nóng', value: ACTUALS.thuongNong, color: '#f97316' },
  { name: 'CP Bán hàng', value: ACTUALS.cpBH, color: '#f59e0b' },
  { name: 'CP Vận hành', value: ACTUALS.cpVH, color: '#6366f1' },
];

// Cost detail (with estimates for CP VH breakdown)
const COST_DETAIL = [
  { cat: 'COGS', item: 'HH Sales', amount: 11.00, pctDT: 70.4, pctTotal: 74.5, type: 'Variable', status: 'red' },
  { cat: 'COGS', item: 'Thưởng nóng Sales', amount: 0.69, pctDT: 4.4, pctTotal: 4.7, type: 'Variable', status: 'ok' },
  { cat: 'Bán hàng', item: 'MKT/Event/Lương KD', amount: 0.74, pctDT: 4.8, pctTotal: 5.0, type: 'Semi', status: 'warn' },
  { cat: 'Vận hành', item: 'Lương Back Office', amount: 0.80, pctDT: 5.1, pctTotal: 5.4, type: 'Fixed', status: 'warn' },
  { cat: 'Vận hành', item: 'Thuê văn phòng', amount: 0.70, pctDT: 4.5, pctTotal: 4.7, type: 'Fixed', status: 'red' },
  { cat: 'Vận hành', item: 'BHXH', amount: 0.15, pctDT: 1.0, pctTotal: 1.0, type: 'Fixed', status: 'ok' },
  { cat: 'Vận hành', item: 'Setup/CCDC (one-off)', amount: 0.30, pctDT: 1.9, pctTotal: 2.0, type: 'One-off', status: 'warn' },
  { cat: 'Vận hành', item: 'Điện/nước/Internet/PM', amount: 0.39, pctDT: 2.5, pctTotal: 2.6, type: 'Fixed', status: 'ok' },
];

// Break-even scenarios
const SCENARIOS = [
  { name: 'Hiện tại', dtMonthly: ACTUALS.revenue/ACTUALS.months, change: 'Baseline', pbt: ACTUALS.pbt/ACTUALS.months, color: '#6366f1' },
  { name: 'A: DS −20%', dtMonthly: ACTUALS.revenue/ACTUALS.months*0.8, change: 'DS giảm 20%', pbt: +(ACTUALS.revenue/ACTUALS.months*0.8*CM_RATE-FIXED_MONTHLY), color: '#ef4444' },
  { name: 'B: HH +5%', dtMonthly: ACTUALS.revenue/ACTUALS.months, change: 'HH tăng 5% DT', pbt: +(ACTUALS.revenue/ACTUALS.months*(CM_RATE-0.05)-FIXED_MONTHLY), color: '#ef4444' },
  { name: 'C: MKT +30%', dtMonthly: ACTUALS.revenue/ACTUALS.months, change: 'MKT tăng 30%', pbt: +(ACTUALS.revenue/ACTUALS.months*CM_RATE-FIXED_MONTHLY-ACTUALS.cpBH*0.3/ACTUALS.months), color: '#f59e0b' },
  { name: 'D: Thêm VP', dtMonthly: ACTUALS.revenue/ACTUALS.months, change: 'Thêm VP +0.25tỷ', pbt: +(ACTUALS.revenue/ACTUALS.months*CM_RATE-FIXED_MONTHLY-0.25), color: '#f59e0b' },
  { name: 'D+: VP & DS×1.4', dtMonthly: ACTUALS.revenue/ACTUALS.months*1.4, change: 'VP + DS tăng 40%', pbt: +(ACTUALS.revenue/ACTUALS.months*1.4*CM_RATE-FIXED_MONTHLY-0.25), color: '#10b981' },
];

// BEP chart data (DT range vs PBT)
const BEP_CHART = Array.from({ length: 20 }, (_, i) => {
  const dt = (i + 1) * 0.4;
  return { dt: +dt.toFixed(1), pbt: +(dt * CM_RATE - FIXED_MONTHLY).toFixed(3), bep: 0 };
});

// Forecast H2/2026
const H2_MONTHS = ['T6/26', 'T7/26', 'T8/26', 'T9/26', 'T10/26', 'T11/26'];
const FORECAST = {
  worst: [2.5, 1.5, 1.6, 2.0, 2.5, 2.8],
  base:  [3.5, 2.0, 2.2, 2.8, 3.5, 4.0],
  best:  [4.5, 3.0, 3.2, 3.8, 4.5, 5.5],
};
const FORECAST_DATA = H2_MONTHS.map((m, i) => ({
  thang: m,
  worst: FORECAST.worst[i],
  base:  FORECAST.base[i],
  best:  FORECAST.best[i],
  pbtWorst: +(FORECAST.worst[i]*CM_RATE - FIXED_MONTHLY).toFixed(2),
  pbtBase:  +(FORECAST.base[i]*CM_RATE - FIXED_MONTHLY).toFixed(2),
  pbtBest:  +(FORECAST.best[i]*CM_RATE - FIXED_MONTHLY).toFixed(2),
}));

const FORECAST_SUMMARY = {
  worst: { dt: FORECAST.worst.reduce((a,b)=>a+b,0), pbt: +(FORECAST.worst.reduce((a,b)=>a+b,0)*CM_RATE - FIXED_MONTHLY*6) },
  base:  { dt: FORECAST.base.reduce((a,b)=>a+b,0),  pbt: +(FORECAST.base.reduce((a,b)=>a+b,0)*CM_RATE - FIXED_MONTHLY*6) },
  best:  { dt: FORECAST.best.reduce((a,b)=>a+b,0),  pbt: +(FORECAST.best.reduce((a,b)=>a+b,0)*CM_RATE - FIXED_MONTHLY*6) },
};

// P&L waterfall
const WATERFALL = [
  { name: 'Doanh thu', value: ACTUALS.revenue, cumulative: ACTUALS.revenue, type: 'pos' },
  { name: 'HH Sales', value: -ACTUALS.hhSales, cumulative: ACTUALS.revenue - ACTUALS.hhSales, type: 'neg' },
  { name: 'Thưởng nóng', value: -ACTUALS.thuongNong, cumulative: GROSS_PROFIT, type: 'neg' },
  { name: 'Gross Profit', value: GROSS_PROFIT, cumulative: GROSS_PROFIT, type: 'sub' },
  { name: 'CP Bán hàng', value: -ACTUALS.cpBH, cumulative: GROSS_PROFIT - ACTUALS.cpBH, type: 'neg' },
  { name: 'CP Vận hành', value: -ACTUALS.cpVH, cumulative: ACTUALS.pbt, type: 'neg' },
  { name: 'PBT', value: ACTUALS.pbt, cumulative: ACTUALS.pbt, type: 'result' },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

const f2 = (v: number) => v.toFixed(2);
const f1 = (v: number) => v.toFixed(1);
const fPct = (v: number) => `${v.toFixed(1)}%`;

const statusColor = (s: string) => ({
  red:  { text: 'var(--danger-text)',  bg: 'var(--danger-bg)',  border: '#fca5a5' },
  warn: { text: 'var(--warning-text)', bg: 'var(--warning-bg)', border: '#fcd34d' },
  ok:   { text: 'var(--success-text)', bg: 'var(--success-bg)', border: '#6ee7b7' },
}[s] ?? { text: 'var(--text-muted)', bg: 'var(--bg-page)', border: 'var(--border-light)' });

const KPICard = ({ label, value, sub, icon: Icon, color, note }: any) => (
  <div style={{ background: 'var(--bg-card)', border: `1px solid var(--border-light)`, borderRadius: 12, padding: '14px 16px', borderLeft: `3px solid ${color}` }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
      <div style={{ width: 30, height: 30, borderRadius: 8, background: `${color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={15} style={{ color }} />
      </div>
      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>{label}</span>
    </div>
    <div style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--text-title)', marginBottom: 2 }}>{value}</div>
    {sub && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 4 }}>{sub}</div>}
    {note && <div style={{ fontSize: '0.7rem', color, fontWeight: 600, background: `${color}15`, padding: '2px 7px', borderRadius: 5, display: 'inline-block' }}>{note}</div>}
  </div>
);

const SectionTitle = ({ children }: any) => (
  <div style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--text-title)', marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.03em' }}>{children}</div>
);

const Card = ({ children, style }: any) => (
  <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-light)', borderRadius: 14, padding: '16px 18px', ...style }}>{children}</div>
);

const CustomTip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-light)', borderRadius: 8, padding: '10px 14px', fontSize: 12 }}>
      <p style={{ fontWeight: 700, marginBottom: 4, color: 'var(--text-title)' }}>{label}</p>
      {payload.map((p: any) => <p key={p.dataKey} style={{ color: p.color ?? p.fill, margin: '2px 0' }}>{p.name}: {typeof p.value === 'number' ? p.value.toFixed(2) : p.value} {p.unit ?? 'tỷ'}</p>)}
    </div>
  );
};

// ─── Tab content components ───────────────────────────────────────────────────

function TabExecutive() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 8 KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
        <KPICard label="GMV (Doanh số GD)" value={`${f1(ACTUALS.gmv)} tỷ`} sub={`BQ ${f1(ACTUALS.gmv/ACTUALS.months)} tỷ/tháng`} icon={DollarSign} color="#6366f1" note={`${ACTUALS.soCan} căn | avg ${f1(AVG_DEAL_SIZE)} tỷ/căn`} />
        <KPICard label="Doanh thu MG" value={`${f2(ACTUALS.revenue)} tỷ`} sub={`BQ ${f2(ACTUALS.revenue/ACTUALS.months)} tỷ/tháng`} icon={TrendingUp} color="#10b981" note={`Rate ${f1(ACTUALS.commissionRate)}% GMV`} />
        <KPICard label="Gross Profit" value={`${f2(GROSS_PROFIT)} tỷ`} sub={`Margin ${fPct(GROSS_MARGIN)}`} icon={BarChart2} color="#f59e0b" note={`Sau HH & Thưởng nóng`} />
        <KPICard label="EBITDA" value={`~${f2(EBITDA)} tỷ`} sub={`Margin ${fPct(EBITDA_MARGIN)}`} icon={Activity} color="#8b5cf6" note={`PBT + D&A ước ~120tr`} />
        <KPICard label="PBT (LN trước thuế)" value={`${f2(ACTUALS.pbt)} tỷ`} sub={`Margin ${fPct(PBT_MARGIN)}`} icon={Target} color={PBT_MARGIN < 10 ? '#ef4444' : '#10b981'} note={PBT_MARGIN < 10 ? '🔴 Cần cải thiện' : '✅ Đạt'} />
        <KPICard label="PAT (Sau thuế ước)" value={`~${f2(PAT)} tỷ`} sub="CIT 20% giả định" icon={DollarSign} color="#64748b" note="SME rate" />
        <KPICard label="Break-even DT" value={`${f2(BEP_DT)} tỷ/tháng`} sub={`BEP GMV: ${f1(BEP_GMV)} tỷ | ${Math.ceil(BEP_CAN)} căn`} icon={AlertTriangle} color="#f59e0b" note={`MoS ${fPct(MARGIN_OF_SAFETY)}`} />
        <KPICard label="HH Sales / DT" value={fPct(ACTUALS.hhPct)} sub={`Giới hạn tốt ≤ 65%`} icon={TrendingDown} color="#ef4444" note={`🔴 Cao hơn chuẩn +${f1(ACTUALS.hhPct-65)}%`} />
      </div>

      {/* Monthly trend + PBT */}
      <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 16 }}>
        <Card>
          <SectionTitle>Doanh thu & Lợi nhuận theo tháng</SectionTitle>
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={MONTHLY}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-lighter)" />
              <XAxis dataKey="thang" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
              <YAxis yAxisId="dt" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} tickFormatter={v=>`${v}tỷ`} />
              <YAxis yAxisId="pbt" orientation="right" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} tickFormatter={v=>`${v}tỷ`} />
              <Tooltip content={<CustomTip />} />
              <ReferenceLine yAxisId="dt" y={BEP_DT} stroke="#ef4444" strokeDasharray="5 4" strokeWidth={1.5} label={{ value: 'BEP', position: 'left', fontSize: 10, fill: '#ef4444' }} />
              <Bar yAxisId="dt" dataKey="dt" name="DT môi giới" fill="#818cf8" radius={[3,3,0,0]} />
              <Line yAxisId="pbt" type="monotone" dataKey="pbt" name="PBT tháng" stroke="#10b981" strokeWidth={2} dot={{ r: 4, fill: '#10b981' }} />
            </ComposedChart>
          </ResponsiveContainer>
        </Card>

        <Card>
          <SectionTitle>Cơ cấu chi phí (6 tháng)</SectionTitle>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={COST_PIE} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ percent }: { percent?: number }) => `${((percent ?? 0)*100).toFixed(0)}%`} labelLine={false}>
                {COST_PIE.map((e, i) => <Cell key={i} fill={e.color} />)}
              </Pie>
              <Tooltip formatter={(v: any) => [`${Number(v).toFixed(2)} tỷ`, '']} />
              <Legend iconSize={10} wrapperStyle={{ fontSize: '0.72rem' }} />
            </PieChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* Profit waterfall */}
      <Card>
        <SectionTitle>Waterfall P&L — Lũy kế {ACTUALS.period} (tỷ VND)</SectionTitle>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {WATERFALL.map((row) => {
            const isNeg = row.type === 'neg';
            const isSub = row.type === 'sub';
            const isResult = row.type === 'result';
            const color = isSub ? '#10b981' : isResult ? '#6366f1' : isNeg ? '#ef4444' : '#818cf8';
            const barWidth = Math.abs(row.value) / ACTUALS.revenue * 100;
            const outside = barWidth < 15;
            if (isSub || isResult) return (
              <div key={row.name} style={{ padding: '4px 0', borderTop: '1px solid var(--border-light)', marginTop: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 160, fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-title)', flexShrink: 0 }}>{row.name}</span>
                  <span style={{ fontWeight: 700, color, fontSize: '0.88rem' }}>{row.value > 0 ? '+' : ''}{f2(row.value)} tỷ</span>
                  <span style={{ marginLeft: 'auto', fontSize: '0.75rem', fontWeight: 700, color }}>{fPct(row.value/ACTUALS.revenue*100)}</span>
                </div>
              </div>
            );
            return (
              <div key={row.name} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 160, fontSize: '0.75rem', color: 'var(--text-muted)', flexShrink: 0 }}>{row.name}</span>
                <div style={{ flex: 1, height: 20, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: `${barWidth}%`, height: 20, minWidth: 4, borderRadius: 3, background: color, opacity: 0.85, flexShrink: 0, display: 'flex', alignItems: 'center', paddingLeft: outside ? 0 : 6 }}>
                    {!outside && <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#fff', whiteSpace: 'nowrap' }}>{f2(Math.abs(row.value))} tỷ</span>}
                  </div>
                  {outside && <span style={{ fontSize: '0.72rem', fontWeight: 700, color, whiteSpace: 'nowrap' }}>{f2(Math.abs(row.value))} tỷ</span>}
                </div>
                <span style={{ width: 44, textAlign: 'right', fontSize: '0.72rem', fontWeight: 700, color, flexShrink: 0 }}>{fPct(Math.abs(row.value)/ACTUALS.revenue*100)}</span>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

function TabSales() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <Card>
          <SectionTitle>GMV & Số căn theo tháng</SectionTitle>
          <ResponsiveContainer width="100%" height={200}>
            <ComposedChart data={MONTHLY}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-lighter)" />
              <XAxis dataKey="thang" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
              <YAxis yAxisId="gmv" tick={{ fontSize: 11 }} tickFormatter={v=>`${v}tỷ`} />
              <YAxis yAxisId="can" orientation="right" tick={{ fontSize: 11 }} />
              <Tooltip content={<CustomTip />} />
              <Bar yAxisId="gmv" dataKey="gmv" name="GMV" fill="#818cf8" radius={[3,3,0,0]}>
                {MONTHLY.map(m => <Cell key={m.thang} fill={m.gmv >= BEP_GMV ? '#818cf8' : '#fca5a5'} />)}
              </Bar>
              <Line yAxisId="can" type="monotone" dataKey="can" name="Số căn" stroke="#10b981" strokeWidth={2} dot={{ r: 4 }} unit=" căn" />
            </ComposedChart>
          </ResponsiveContainer>
        </Card>

        <Card>
          <SectionTitle>MoM Revenue Growth (%)</SectionTitle>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={MONTHLY.slice(1)}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-lighter)" />
              <XAxis dataKey="thang" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v=>`${v}%`} />
              <Tooltip formatter={(v: any) => [`${Number(v).toFixed(1)}%`, 'MoM']} />
              <ReferenceLine y={0} stroke="var(--border-light)" />
              <Bar dataKey="mom" name="MoM %" radius={[3,3,0,0]}>
                {MONTHLY.slice(1).map(m => <Cell key={m.thang} fill={m.mom >= 0 ? '#10b981' : '#ef4444'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* Monthly KPI table */}
      <Card>
        <SectionTitle>Chi tiết KPI theo tháng</SectionTitle>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
            <thead>
              <tr style={{ background: 'var(--bg-page)' }}>
                {['Tháng','GMV (tỷ)','DT MG (tỷ)','Gross (tỷ)','GP%','PBT ước (tỷ)','Số căn','Avg Deal (tỷ)','MoM DT'].map(h => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, color: 'var(--text-muted)', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border-lighter)' }}>
                    {h === 'Tháng' ? <span style={{ textAlign: 'left', display: 'block' }}>{h}</span> : h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MONTHLY.map((m, i) => (
                <tr key={m.thang} style={{ background: i % 2 === 0 ? 'transparent' : 'var(--bg-page)' }}>
                  <td style={{ padding: '8px 12px', fontWeight: 600, color: 'var(--text-title)' }}>{m.thang}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right' }}>{f1(m.gmv)}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, color: m.dt >= BEP_DT ? 'var(--success-text)' : 'var(--danger-text)' }}>{f2(m.dt)}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right' }}>{f2(m.gross)}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right' }}>{fPct(m.gpMargin)}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: m.pbt >= 0 ? 'var(--success-text)' : 'var(--danger-text)' }}>{m.pbt >= 0 ? '+' : ''}{f2(m.pbt)}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right' }}>{m.can}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right' }}>{m.can > 0 ? f1(m.gmv/m.can) : '—'}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', color: m.mom > 0 ? 'var(--success-text)' : m.mom < 0 ? 'var(--danger-text)' : 'var(--text-muted)' }}>{i === 0 ? '—' : `${m.mom > 0 ? '+' : ''}${f1(m.mom)}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Project & Sales placeholders */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {['Phân tích theo Dự án', 'Top Sales Performance'].map(title => (
          <Card key={title}>
            <SectionTitle>{title}</SectionTitle>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 160, gap: 10 }}>
              <Layers size={36} style={{ color: 'var(--text-label)', opacity: 0.4 }} />
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>Cần dữ liệu chi tiết</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-label)', lineHeight: 1.5 }}>
                  Thêm cột Dự án & Sales Person vào sheet<br />
                  <code style={{ background: 'var(--bg-page)', padding: '1px 6px', borderRadius: 3 }}>TH DT-HH</code> để hiển thị biểu đồ này
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function TabProfitability() {
  const marginData = MONTHLY.map(m => ({
    thang: m.thang,
    gpMargin: m.gpMargin,
    pbtMargin: +(m.pbt / m.dt * 100).toFixed(1),
    hhPct: +(ACTUALS.hhPct),
  }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
        {[
          { label: 'Gross Margin', value: fPct(GROSS_MARGIN), note: 'Chuẩn tốt > 30%', color: GROSS_MARGIN > 30 ? '#10b981' : '#f59e0b' },
          { label: 'EBITDA Margin', value: fPct(EBITDA_MARGIN), note: 'Chuẩn tốt > 15%', color: EBITDA_MARGIN > 15 ? '#10b981' : '#ef4444' },
          { label: 'PBT Margin', value: fPct(PBT_MARGIN), note: 'Chuẩn tốt > 15%', color: PBT_MARGIN > 15 ? '#10b981' : '#ef4444' },
          { label: 'HH Sales Rate', value: fPct(ACTUALS.hhPct), note: 'Chuẩn tốt < 65%', color: ACTUALS.hhPct > 65 ? '#ef4444' : '#10b981' },
        ].map(k => (
          <div key={k.label} style={{ background: 'var(--bg-card)', border: `1px solid var(--border-light)`, borderRadius: 12, padding: '14px 16px', borderLeft: `3px solid ${k.color}` }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 6, fontWeight: 600 }}>{k.label}</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 700, color: k.color, marginBottom: 4 }}>{k.value}</div>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-label)' }}>{k.note}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <Card>
          <SectionTitle>Xu hướng biên lợi nhuận theo tháng (%)</SectionTitle>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={marginData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-lighter)" />
              <XAxis dataKey="thang" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v=>`${v}%`} domain={[-20, 40]} />
              <Tooltip formatter={(v:any) => [`${Number(v).toFixed(1)}%`, '']} />
              <ReferenceLine y={0} stroke="var(--border-light)" strokeWidth={2} />
              <Line type="monotone" dataKey="gpMargin" name="Gross Margin" stroke="#10b981" strokeWidth={2} dot={{ r: 4 }} />
              <Line type="monotone" dataKey="pbtMargin" name="PBT Margin" stroke="#6366f1" strokeWidth={2} strokeDasharray="5 3" dot={{ r: 4 }} />
              <Legend wrapperStyle={{ fontSize: '0.72rem' }} />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        <Card>
          <SectionTitle>Revenue vs Total Cost theo tháng (tỷ)</SectionTitle>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={MONTHLY}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-lighter)" />
              <XAxis dataKey="thang" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v=>`${v}tỷ`} />
              <Tooltip content={<CustomTip />} />
              <Bar dataKey="dt" name="Doanh thu" fill="#818cf8" radius={[3,3,0,0]} />
              <Bar dataKey={(d) => +(d.dt - d.pbt).toFixed(2)} name="Tổng chi phí" fill="#fca5a5" radius={[3,3,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <Card>
        <SectionTitle>Phân tích What-if: Nếu HH Sales giảm xuống...</SectionTitle>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
            <thead>
              <tr style={{ background: 'var(--bg-page)' }}>
                {['HH Sales %', 'HH (tỷ)', 'Gross Profit', 'Gross Margin', 'PBT ước', 'PBT Margin', 'Cải thiện'].map(h => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, color: 'var(--text-muted)', borderBottom: '1px solid var(--border-lighter)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[70.4, 68, 65, 62, 60].map((hhPct, i) => {
                const hh     = ACTUALS.revenue * hhPct / 100;
                const gp     = ACTUALS.revenue - hh - ACTUALS.thuongNong;
                const gpM    = gp / ACTUALS.revenue * 100;
                const varRate = (hh + ACTUALS.thuongNong + ACTUALS.cpBH * 0.8) / ACTUALS.revenue;
                const pbt    = ACTUALS.revenue * (1 - varRate) - ACTUALS.cpVH - ACTUALS.cpBH * 0.2;
                const pbtM   = pbt / ACTUALS.revenue * 100;
                const improvement = pbt - ACTUALS.pbt;
                const isBase = hhPct === 70.4;
                return (
                  <tr key={hhPct} style={{ background: isBase ? 'rgba(99,102,241,0.05)' : i % 2 === 0 ? 'transparent' : 'var(--bg-page)', fontWeight: isBase ? 700 : 400 }}>
                    <td style={{ padding: '8px 12px', textAlign: 'right', color: hhPct > 65 ? 'var(--danger-text)' : 'var(--success-text)', fontWeight: 700 }}>{fPct(hhPct)} {isBase && '← Hiện tại'}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right' }}>{f2(hh)}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right' }}>{f2(gp)}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', color: gpM > 30 ? 'var(--success-text)' : 'var(--text-body)' }}>{fPct(gpM)}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: pbt > 0 ? 'var(--success-text)' : 'var(--danger-text)' }}>{f2(pbt)}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right' }}>{fPct(pbtM)}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', color: improvement > 0 ? 'var(--success-text)' : 'var(--text-muted)', fontWeight: 600 }}>{improvement > 0 ? `+${f2(improvement)}` : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{ marginTop: 10, fontSize: '0.72rem', color: 'var(--warning-text)', background: 'var(--warning-bg)', padding: '6px 10px', borderRadius: 6 }}>
          ⚠ Nếu cắt HH từ 70.4% → 65%: PBT tăng thêm ~0.85 tỷ (tương đương nhân đôi LN cả kỳ)
        </div>
      </Card>
    </div>
  );
}

function TabCosts() {
  const fixedMonthly  = ACTUALS.cpVH / ACTUALS.months + ACTUALS.cpBH * 0.2 / ACTUALS.months;
  const varTotal      = ACTUALS.hhSales + ACTUALS.thuongNong + ACTUALS.cpBH * 0.8;
  const fixedTotal    = ACTUALS.cpVH + ACTUALS.cpBH * 0.2;

  const costMonthly = MONTHLY.map(m => ({
    thang: m.thang,
    varCost: +(m.dt * VARIABLE_COST_RATE).toFixed(3),
    fixedCost: +fixedMonthly.toFixed(3),
    totalCost: +(m.dt * VARIABLE_COST_RATE + fixedMonthly).toFixed(3),
  }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
        {[
          { label: 'Fixed Cost (6 tháng)', value: `${f2(fixedTotal)} tỷ`, sub: `${f2(fixedMonthly)} tỷ/tháng`, color: '#6366f1', note: `${fPct(fixedTotal/ACTUALS.revenue*100)} DT` },
          { label: 'Variable Cost (6 tháng)', value: `${f2(varTotal)} tỷ`, sub: `${fPct(VARIABLE_COST_RATE*100)} mỗi đồng DT`, color: '#ef4444', note: `CM Rate: ${fPct(CM_RATE*100)}` },
          { label: 'Total Cost (6 tháng)', value: `${f2(fixedTotal+varTotal)} tỷ`, sub: `${fPct((fixedTotal+varTotal)/ACTUALS.revenue*100)} DT`, color: '#f59e0b', note: `Còn lại: ${f2(ACTUALS.pbt)} tỷ PBT` },
        ].map(k => (
          <div key={k.label} style={{ background: 'var(--bg-card)', border: `1px solid var(--border-light)`, borderRadius: 12, padding: '14px 16px', borderLeft: `3px solid ${k.color}` }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 6, fontWeight: 600 }}>{k.label}</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-title)', marginBottom: 2 }}>{k.value}</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 4 }}>{k.sub}</div>
            <div style={{ fontSize: '0.68rem', color: k.color, fontWeight: 600, background: `${k.color}15`, padding: '2px 7px', borderRadius: 5, display: 'inline-block' }}>{k.note}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
        <Card>
          <SectionTitle>Fixed vs Variable cost theo tháng (tỷ)</SectionTitle>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={costMonthly}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-lighter)" />
              <XAxis dataKey="thang" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v=>`${v}tỷ`} />
              <Tooltip content={<CustomTip />} />
              <Bar dataKey="varCost" name="Variable Cost" fill="#fca5a5" stackId="a" />
              <Bar dataKey="fixedCost" name="Fixed Cost" fill="#818cf8" stackId="a" radius={[3,3,0,0]} />
              <Legend wrapperStyle={{ fontSize: '0.72rem' }} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card>
          <SectionTitle>Fixed vs Variable split</SectionTitle>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={[{ name: 'Variable', value: varTotal, color: '#fca5a5' }, { name: 'Fixed', value: fixedTotal, color: '#818cf8' }]} dataKey="value" cx="50%" cy="50%" outerRadius={75} label={({ name, percent }: { name?: string; percent?: number }) => `${name ?? ''} ${((percent ?? 0)*100).toFixed(0)}%`} labelLine={false}>
                {[{ color: '#fca5a5' }, { color: '#818cf8' }].map((e, i) => <Cell key={i} fill={e.color} />)}
              </Pie>
              <Tooltip formatter={(v:any) => [`${Number(v).toFixed(2)} tỷ`, '']} />
            </PieChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <Card>
        <SectionTitle>Bảng chi phí chi tiết — % và đánh giá</SectionTitle>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
          <thead>
            <tr style={{ background: 'var(--bg-page)' }}>
              {['Loại','Khoản mục','Số tiền (tỷ)','% DT','% Tổng CP','Phân loại','Đánh giá'].map(h => (
                <th key={h} style={{ padding: '8px 12px', textAlign: h === 'Số tiền (tỷ)' || h === '% DT' || h === '% Tổng CP' ? 'right' : 'left', fontWeight: 600, color: 'var(--text-muted)', borderBottom: '1px solid var(--border-lighter)', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {COST_DETAIL.map((r, i) => {
              const c = statusColor(r.status);
              return (
                <tr key={i} style={{ background: i % 2 === 0 ? 'transparent' : 'var(--bg-page)' }}>
                  <td style={{ padding: '8px 12px', color: 'var(--text-muted)', fontSize: '0.72rem' }}>{r.cat}</td>
                  <td style={{ padding: '8px 12px', fontWeight: 600 }}>{r.item}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right' }}>{f2(r.amount)}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: r.pctDT > 20 ? 'var(--danger-text)' : 'var(--text-body)' }}>{fPct(r.pctDT)}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right' }}>{fPct(r.pctTotal)}</td>
                  <td style={{ padding: '8px 12px', fontSize: '0.68rem' }}>{r.type}</td>
                  <td style={{ padding: '8px 12px' }}>
                    <span style={{ fontSize: '0.68rem', fontWeight: 600, color: c.text, background: c.bg, padding: '2px 8px', borderRadius: 4 }}>
                      {r.status === 'red' ? '🔴 Cần kiểm soát' : r.status === 'warn' ? '⚠️ Theo dõi' : '✅ OK'}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div style={{ marginTop: 10, fontSize: '0.7rem', color: 'var(--text-label)', fontStyle: 'italic' }}>
          * Chi tiết nội bộ CP Vận hành (2.34 tỷ) là ước tính theo chuẩn ngành. Cần audit thực tế để xác nhận từng khoản.
        </div>
      </Card>
    </div>
  );
}

function TabBreakeven() {
  const bepLine = BEP_CHART.map(d => ({ ...d, bep: +(d.dt * CM_RATE - FIXED_MONTHLY).toFixed(3) }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
        {[
          { label: 'BEP Doanh thu', value: `${f2(BEP_DT)} tỷ/tháng`, sub: 'Doanh thu tối thiểu', color: '#f59e0b' },
          { label: 'BEP GMV', value: `${f1(BEP_GMV)} tỷ/tháng`, sub: 'Doanh số tối thiểu', color: '#f59e0b' },
          { label: 'BEP Số căn', value: `${Math.ceil(BEP_CAN)} căn/tháng`, sub: 'Số giao dịch tối thiểu', color: '#f59e0b' },
          { label: 'Margin of Safety', value: fPct(MARGIN_OF_SAFETY), sub: `BQ ${f2(ACTUALS.revenue/ACTUALS.months)} vs BEP ${f2(BEP_DT)} tỷ`, color: MARGIN_OF_SAFETY > 30 ? '#10b981' : '#f59e0b' },
        ].map(k => (
          <div key={k.label} style={{ background: 'var(--bg-card)', border: `1px solid var(--border-light)`, borderRadius: 12, padding: '14px 16px', borderLeft: `3px solid ${k.color}` }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 6, fontWeight: 600 }}>{k.label}</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 700, color: k.color, marginBottom: 4 }}>{k.value}</div>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-label)' }}>{k.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 16 }}>
        <Card>
          <SectionTitle>Biểu đồ hòa vốn — PBT vs Doanh thu (tỷ)</SectionTitle>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={bepLine}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-lighter)" />
              <XAxis dataKey="dt" tick={{ fontSize: 11 }} label={{ value: 'DT MG (tỷ)', position: 'insideBottom', offset: -5, fontSize: 11 }} tickFormatter={v=>`${v}tỷ`} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v=>`${v}tỷ`} />
              <Tooltip formatter={(v:any) => [`${Number(v).toFixed(3)} tỷ`, 'PBT']} labelFormatter={v=>`DT = ${v} tỷ`} />
              <ReferenceLine y={0} stroke="#ef4444" strokeWidth={2} label={{ value: 'Hòa vốn', position: 'right', fontSize: 11, fill: '#ef4444' }} />
              <ReferenceLine x={ACTUALS.revenue/ACTUALS.months} stroke="#6366f1" strokeDasharray="5 4" label={{ value: 'BQ hiện tại', position: 'top', fontSize: 10, fill: '#6366f1' }} />
              <Line type="linear" dataKey="bep" name="PBT" stroke="#10b981" strokeWidth={2.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
          <div style={{ marginTop: 8, fontSize: '0.72rem', color: 'var(--text-muted)', background: 'var(--bg-page)', padding: '6px 10px', borderRadius: 6 }}>
            Điểm hòa vốn: DT = {f2(BEP_DT)} tỷ/tháng | BEP GMV = {f1(BEP_GMV)} tỷ | {Math.ceil(BEP_CAN)} căn/tháng
          </div>
        </Card>

        <Card>
          <SectionTitle>Contribution Margin Structure</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
            {[
              { label: 'Doanh thu', pct: 100, color: '#818cf8' },
              { label: 'HH Sales', pct: -ACTUALS.hhPct, color: '#ef4444' },
              { label: 'Thưởng nóng', pct: -(ACTUALS.thuongNong/ACTUALS.revenue*100), color: '#f97316' },
              { label: 'CP BH (80% var)', pct: -(ACTUALS.cpBH*0.8/ACTUALS.revenue*100), color: '#f59e0b' },
              { label: '→ CM Rate', pct: CM_RATE*100, color: '#10b981', bold: true },
              { label: 'Fixed Cost/DT avg', pct: -(FIXED_MONTHLY/(ACTUALS.revenue/ACTUALS.months)*100), color: '#6366f1' },
              { label: '→ PBT Margin avg', pct: PBT_MARGIN, color: '#8b5cf6', bold: true },
            ].map(r => (
              <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 140, fontSize: '0.72rem', fontWeight: r.bold ? 700 : 400, color: r.bold ? 'var(--text-title)' : 'var(--text-muted)', flexShrink: 0 }}>{r.label}</span>
                <div style={{ flex: 1, height: 16, borderRadius: 3, background: `${r.color}25`, overflow: 'hidden' }}>
                  <div style={{ width: `${Math.abs(r.pct)}%`, height: '100%', background: r.color, opacity: 0.8 }} />
                </div>
                <span style={{ width: 50, textAlign: 'right', fontSize: '0.72rem', fontWeight: 700, color: r.color, flexShrink: 0 }}>{r.pct > 0 ? '+' : ''}{f1(r.pct)}%</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card>
        <SectionTitle>Scenario Simulation — Impact của các kịch bản</SectionTitle>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
          {SCENARIOS.map(s => (
            <div key={s.name} style={{ padding: '12px 14px', borderRadius: 10, background: 'var(--bg-page)', border: `1px solid ${s.pbt < 0 ? '#fca5a5' : s.pbt < 0.05 ? '#fcd34d' : '#6ee7b7'}`, borderLeft: `3px solid ${s.color}` }}>
              <div style={{ fontWeight: 700, fontSize: '0.78rem', color: 'var(--text-title)', marginBottom: 4 }}>{s.name}</div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: 8 }}>{s.change}</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: s.pbt < 0 ? 'var(--danger-text)' : s.pbt < 0.05 ? 'var(--warning-text)' : 'var(--success-text)' }}>
                {s.pbt >= 0 ? '+' : ''}{f2(s.pbt)} tỷ/tháng
              </div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-label)', marginTop: 4 }}>
                {s.pbt < 0 ? '❌ Thua lỗ' : s.pbt < 0.05 ? '⚠️ Gần BEP' : '✅ Có lãi'}
              </div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: '0.72rem', color: 'var(--danger-text)', background: 'var(--danger-bg)', padding: '8px 12px', borderRadius: 6, lineHeight: 1.6 }}>
          🔴 <strong>Cảnh báo CFO:</strong> 5/6 kịch bản ngoài Base đều gần hoặc âm PBT. Margin of Safety chỉ {fPct(MARGIN_OF_SAFETY)} — cần ưu tiên tăng CM rate (cắt HH) trước khi xem xét mở rộng.
        </div>
      </Card>
    </div>
  );
}

function TabForecast() {
  const targets = [
    { label: '500 triệu/tháng', pbt: 0.5, dtNeeded: +(0.5 + FIXED_MONTHLY) / CM_RATE, color: '#10b981' },
    { label: '1 tỷ/tháng', pbt: 1.0, dtNeeded: +(1.0 + FIXED_MONTHLY) / CM_RATE, color: '#6366f1' },
    { label: '2 tỷ/tháng', pbt: 2.0, dtNeeded: +(2.0 + FIXED_MONTHLY) / CM_RATE, color: '#f59e0b' },
    { label: '3 tỷ/tháng', pbt: 3.0, dtNeeded: +(3.0 + FIXED_MONTHLY) / CM_RATE, color: '#ef4444' },
  ].map(t => ({
    ...t,
    gmvNeeded: +(t.dtNeeded / (ACTUALS.commissionRate / 100)),
    canNeeded: Math.ceil(t.dtNeeded / (ACTUALS.commissionRate / 100) / AVG_DEAL_SIZE),
    salesNeeded: Math.ceil(t.dtNeeded / (ACTUALS.commissionRate / 100) / AVG_DEAL_SIZE / 2.5),
  }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Scenario summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        {[
          { title: 'Worst Case', sub: 'Thị trường chậm, T7-T9 yếu', color: '#ef4444', ...FORECAST_SUMMARY.worst },
          { title: 'Base Case', sub: 'Duy trì momentum T5/26, T7-T8 giảm nhẹ', color: '#6366f1', ...FORECAST_SUMMARY.base },
          { title: 'Best Case', sub: 'Thêm dự án mới, đội mở rộng', color: '#10b981', ...FORECAST_SUMMARY.best },
        ].map(s => (
          <div key={s.title} style={{ background: 'var(--bg-card)', border: `1px solid var(--border-light)`, borderRadius: 12, padding: '16px', borderTop: `3px solid ${s.color}` }}>
            <div style={{ fontWeight: 700, color: s.color, fontSize: '0.88rem', marginBottom: 4 }}>{s.title}</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 12 }}>{s.sub}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>DT H2/26</span>
                <span style={{ fontWeight: 700 }}>{f2(s.dt)} tỷ</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>PBT H2/26</span>
                <span style={{ fontWeight: 700, color: s.pbt > 0 ? 'var(--success-text)' : 'var(--danger-text)' }}>{s.pbt > 0 ? '+' : ''}{f2(s.pbt)} tỷ</span>
              </div>
              <div style={{ height: '1px', background: 'var(--border-lighter)', margin: '4px 0' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', fontWeight: 700 }}>
                <span style={{ color: 'var(--text-muted)' }}>DT cả năm</span>
                <span>{f2(ACTUALS.revenue + s.dt)} tỷ</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', fontWeight: 700 }}>
                <span style={{ color: 'var(--text-muted)' }}>PBT cả năm</span>
                <span style={{ color: s.color }}>{f2(ACTUALS.pbt + s.pbt)} tỷ</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <Card>
        <SectionTitle>Forecast DT môi giới H2/2026 — 3 kịch bản (tỷ)</SectionTitle>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={FORECAST_DATA}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-lighter)" />
            <XAxis dataKey="thang" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={v=>`${v}tỷ`} />
            <Tooltip content={<CustomTip />} />
            <ReferenceLine y={BEP_DT} stroke="#f59e0b" strokeDasharray="5 4" strokeWidth={1.5} label={{ value: `BEP ${f2(BEP_DT)}tỷ`, fontSize: 10, fill: '#f59e0b' }} />
            <Line type="monotone" dataKey="worst" name="Worst Case" stroke="#ef4444" strokeWidth={2} strokeDasharray="5 3" dot={{ r: 4 }} />
            <Line type="monotone" dataKey="base" name="Base Case" stroke="#6366f1" strokeWidth={2.5} dot={{ r: 4 }} />
            <Line type="monotone" dataKey="best" name="Best Case" stroke="#10b981" strokeWidth={2} strokeDasharray="5 3" dot={{ r: 4 }} />
            <Legend wrapperStyle={{ fontSize: '0.72rem' }} />
          </LineChart>
        </ResponsiveContainer>
      </Card>

      <Card>
        <SectionTitle>Doanh số cần đạt để đạt mục tiêu LN (giữ cơ cấu chi phí hiện tại)</SectionTitle>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
          <thead>
            <tr style={{ background: 'var(--bg-page)' }}>
              {['Mục tiêu LN', 'DT cần/tháng', 'GMV cần/tháng', 'Số căn/tháng', 'Sales cần có', 'Tăng vs hiện tại', 'Khả thi?'].map(h => (
                <th key={h} style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, color: 'var(--text-muted)', borderBottom: '1px solid var(--border-lighter)', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr style={{ background: 'rgba(99,102,241,0.05)' }}>
              <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--primary)', fontWeight: 700 }}>Hiện tại (BQ)</td>
              <td style={{ padding: '8px 12px', textAlign: 'right' }}>{f2(ACTUALS.revenue/ACTUALS.months)}</td>
              <td style={{ padding: '8px 12px', textAlign: 'right' }}>{f1(ACTUALS.gmv/ACTUALS.months)}</td>
              <td style={{ padding: '8px 12px', textAlign: 'right' }}>{f1(ACTUALS.soCan/ACTUALS.months)}</td>
              <td style={{ padding: '8px 12px', textAlign: 'right' }}>~8</td>
              <td style={{ padding: '8px 12px', textAlign: 'right' }}>—</td>
              <td style={{ padding: '8px 12px', textAlign: 'right' }}>🟡 Vừa đủ</td>
            </tr>
            {targets.map(t => {
              const pctIncrease = ((t.dtNeeded / (ACTUALS.revenue/ACTUALS.months)) - 1) * 100;
              return (
                <tr key={t.label}>
                  <td style={{ padding: '8px 12px', textAlign: 'right', color: t.color, fontWeight: 700 }}>{t.label}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right' }}>{f2(t.dtNeeded)}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right' }}>{f1(t.gmvNeeded)}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right' }}>{t.canNeeded}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right' }}>{t.salesNeeded}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', color: pctIncrease > 100 ? 'var(--danger-text)' : 'var(--warning-text)', fontWeight: 700 }}>+{f0(pctIncrease)}%</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right' }}>{pctIncrease < 50 ? '🟢 Đạt được' : pctIncrease < 150 ? '🟡 Thách thức' : '🔴 Cần cải cách'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div style={{ marginTop: 10, fontSize: '0.72rem', color: 'var(--text-label)', fontStyle: 'italic' }}>
          * Giả định: avg deal size {f1(AVG_DEAL_SIZE)} tỷ, commission rate {f1(ACTUALS.commissionRate)}%, mỗi sales bán 2.5 căn/tháng.
          Nếu cắt HH về 65%: cần DT ít hơn ~20% để đạt cùng mục tiêu LN.
        </div>
      </Card>
    </div>
  );
}

const f0 = (v: number) => v.toFixed(0);

// ─── Main page ────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'exec',   label: 'Executive',     icon: BarChart2 },
  { id: 'sales',  label: 'Sales',         icon: TrendingUp },
  { id: 'profit', label: 'Profitability', icon: DollarSign },
  { id: 'cost',   label: 'Costs',         icon: Layers },
  { id: 'bep',    label: 'Break-even',    icon: Target },
  { id: 'fcst',   label: 'Forecast',      icon: Activity },
];

export default function CFODashboard() {
  const [tab, setTab] = useState('exec');

  return (
    <div style={{ padding: '20px 28px', maxWidth: 1280, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <a href="/tai-chinh" style={{ fontSize: '0.75rem', color: 'var(--primary)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
              ← Tài chính
            </a>
            <ChevronRight size={14} style={{ color: 'var(--text-label)' }} />
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>CFO Dashboard</span>
          </div>
          <h1 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-title)', marginTop: 4 }}>
            CFO Dashboard — Victory Holdings
          </h1>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>
            Phân tích tài chính chuyên sâu · Dữ liệu thực tế {ACTUALS.period} · {ACTUALS.months} tháng · {ACTUALS.soCan} căn
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {[
            { label: `GMV ${f1(ACTUALS.gmv)} tỷ`, color: '#6366f1' },
            { label: `DT ${f2(ACTUALS.revenue)} tỷ`, color: '#10b981' },
            { label: `PBT ${fPct(PBT_MARGIN)}`, color: PBT_MARGIN > 10 ? '#10b981' : '#ef4444' },
          ].map(b => (
            <div key={b.label} style={{ padding: '4px 12px', borderRadius: 6, background: `${b.color}15`, border: `1px solid ${b.color}30`, fontSize: '0.72rem', fontWeight: 700, color: b.color }}>
              {b.label}
            </div>
          ))}
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 20, background: 'var(--bg-page)', borderRadius: 10, padding: 4, width: 'fit-content' }}>
        {TABS.map(t => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: '0.78rem', fontWeight: active ? 700 : 500, transition: 'all 0.15s',
                background: active ? 'var(--bg-card)' : 'transparent',
                color: active ? 'var(--primary)' : 'var(--text-muted)',
                boxShadow: active ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
              }}>
              <Icon size={14} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {tab === 'exec'   && <TabExecutive />}
      {tab === 'sales'  && <TabSales />}
      {tab === 'profit' && <TabProfitability />}
      {tab === 'cost'   && <TabCosts />}
      {tab === 'bep'    && <TabBreakeven />}
      {tab === 'fcst'   && <TabForecast />}

      <div style={{ marginTop: 20, fontSize: '0.7rem', color: 'var(--text-label)', textAlign: 'center', lineHeight: 1.6 }}>
        CFO Dashboard · Dữ liệu: {ACTUALS.period} · Break-even: {f2(BEP_DT)} tỷ/tháng · CM Rate: {fPct(CM_RATE*100)} · Victory Holdings CRM
      </div>
    </div>
  );
}
