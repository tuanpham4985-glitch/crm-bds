'use client';

import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Cell,
} from 'recharts';
import { TrendingUp, TrendingDown, AlertTriangle, CheckCircle, DollarSign, Home, BarChart2, Percent } from 'lucide-react';

const fmt = (v: number) =>
  v >= 1e9 ? `${(v / 1e9).toFixed(2)} tỷ` : v >= 1e6 ? `${(v / 1e6).toFixed(0)} tr` : v.toLocaleString('vi');

const fmtTy = (v: number) => `${v.toFixed(2)} tỷ`;

const MONTHLY = [
  { thang: 'T12/25', doanhSo: 73.63,  dtHH: 2.45, soCan: 3 },
  { thang: 'T1/26',  doanhSo: 115.52, dtHH: 3.91, soCan: 11 },
  { thang: 'T2/26',  doanhSo: 19.94,  dtHH: 0.62, soCan: 2 },
  { thang: 'T3/26',  doanhSo: 60.52,  dtHH: 1.81, soCan: 3 },
  { thang: 'T4/26',  doanhSo: 66.90,  dtHH: 2.15, soCan: 7 },
  { thang: 'T5/26',  doanhSo: 120.73, dtHH: 4.62, soCan: 7 },
];

const PNL = [
  { label: 'Doanh thu MG',      value: 15.64,  pct: 100,   type: 'pos' },
  { label: 'HH Sales (70,4%)',  value: -11.00, pct: -70.4, type: 'neg' },
  { label: 'Thưởng nóng sales', value: -0.69,  pct: -4.4,  type: 'neg' },
  { label: 'Lợi nhuận gộp',     value: 3.94,   pct: 25.2,  type: 'mid' },
  { label: 'CP bán hàng/MKT',   value: -0.74,  pct: -4.8,  type: 'neg' },
  { label: 'CP vận hành',       value: -2.34,  pct: -15.0, type: 'warn' },
  { label: 'LN trước thuế',     value: 0.86,   pct: 5.5,   type: 'result' },
];

const KPIS = [
  {
    icon: DollarSign, label: 'Doanh số GD', value: '457,2 tỷ',
    sub: 'BQ/tháng: 91,4 tỷ', target: 'Mục tiêu ≥ 58 tỷ/tháng',
    status: 'green', note: 'Vượt mục tiêu +57%',
  },
  {
    icon: TrendingUp, label: 'Doanh thu môi giới', value: '15,64 tỷ',
    sub: 'BQ/tháng: 3,13 tỷ', target: 'Mục tiêu ≥ 2,3 tỷ/tháng',
    status: 'green', note: 'Vượt mục tiêu +36%',
  },
  {
    icon: Home, label: 'Số căn bán', value: '32 căn',
    sub: 'BQ/tháng: 6,4 căn', target: 'Mục tiêu ≥ 6–7 căn/tháng',
    status: 'green', note: 'Đạt mục tiêu',
  },
  {
    icon: Percent, label: 'HH Sales / Doanh thu', value: '74,8%',
    sub: 'HH Sales: 11,69 tỷ / 5 tháng', target: 'Mục tiêu ≤ 65%',
    status: 'red', note: 'Vượt giới hạn +9,8% ≈ 1,53 tỷ dư',
  },
  {
    icon: BarChart2, label: 'CP vận hành / DT', value: '15,0%',
    sub: 'CP VH: 2,34 tỷ / 5 tháng', target: 'Mục tiêu ≤ 15%',
    status: 'amber', note: 'Sát giới hạn (có 569 tr setup VP 1 lần)',
  },
  {
    icon: TrendingDown, label: 'Lợi nhuận trước thuế', value: '5,5%',
    sub: 'LN: 855 triệu / 5 tháng', target: 'Mục tiêu ≥ 20% DT',
    status: 'red', note: 'Thiếu 14,5% — LN thực ≈ 855 tr/5 tháng',
  },
];

const INSIGHTS = [
  {
    type: 'red',
    title: 'HH Sales 74,8% — vượt trần 65%',
    body: 'Nguyên nhân: tỷ trọng deal đối tác cao (Vinhomes Cần Giờ qua NEWWAY, FIVE STAR…) với HH 3,5–4%+. Mỗi điểm % dư ≈ 156 triệu/5 tháng. Cần tăng tỷ lệ deal nội bộ hoặc đàm phán lại HH khung với đối tác.',
  },
  {
    type: 'red',
    title: 'Lợi nhuận 5,5% — xa mục tiêu 20%',
    body: 'Điểm hòa vốn ~2,7 tỷ DT/tháng. Tháng 2/2026 (DT 0,62 tỷ) lỗ nặng. Nếu kéo HH Sales về 65%, LN tăng thêm ~1,53 tỷ → đạt ~15% DT, tiệm cận mục tiêu.',
  },
  {
    type: 'amber',
    title: 'CP vận hành đúng giới hạn 15%',
    body: 'Loại CP setup VP một lần (569 triệu) thì chỉ còn 11,4% DT. Từ T6/2026 trở đi CP này không lặp lại, biên lợi nhuận sẽ cải thiện rõ.',
  },
  {
    type: 'green',
    title: 'T5/2026 bứt phá — momentum tích cực',
    body: 'T5/2026 đạt 120,7 tỷ (7 căn, DT 4,62 tỷ) — tháng tốt nhất trong kỳ. Xu hướng tăng mạnh vào nửa cuối 2026.',
  },
  {
    type: 'amber',
    title: 'Biến động doanh số lớn — cần pipeline dự phòng',
    body: 'T2/2026 chỉ 19,9 tỷ, T5/2026 đạt 120,7 tỷ — chênh lệch 6x. Cần pipeline 3–6 tháng tới để tránh tháng trống dưới điểm hòa vốn.',
  },
];

const statusStyle = (s: string) => ({
  green: { bg: 'var(--success-bg)', text: 'var(--success-text)', border: 'var(--success-border)' },
  red:   { bg: 'var(--danger-bg)',  text: 'var(--danger-text)',  border: 'var(--danger-border)' },
  amber: { bg: 'var(--warning-bg)', text: 'var(--warning-text)', border: 'var(--warning-border)' },
}[s] ?? { bg: 'var(--info-bg)', text: 'var(--info-text)', border: 'var(--info-border)' });

const insightStyle = (t: string) => ({
  red:   { bg: 'var(--danger-bg)',  text: 'var(--danger-text)',  accent: '#e24b4a' },
  amber: { bg: 'var(--warning-bg)', text: 'var(--warning-text)', accent: '#d97706' },
  green: { bg: 'var(--success-bg)', text: 'var(--success-text)', accent: '#059669' },
}[t] ?? { bg: 'var(--info-bg)', text: 'var(--info-text)', accent: '#3b82f6' });

const pnlColor = (type: string) =>
  type === 'pos' ? '#6366f1' : type === 'neg' ? '#ef4444' : type === 'warn' ? '#f59e0b' : type === 'mid' ? '#10b981' : '#6366f1';

const CustomTooltipDS = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-light)', borderRadius: 8, padding: '10px 14px', fontSize: 12 }}>
      <p style={{ fontWeight: 700, marginBottom: 4, color: 'var(--text-title)' }}>{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color, margin: '2px 0' }}>{p.name}: {fmtTy(p.value)}</p>
      ))}
    </div>
  );
};

export default function TaiChinhPage() {
  return (
    <div style={{ padding: '24px 28px', maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-title)', marginBottom: 4 }}>
            Dashboard Tài chính
          </h1>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            Victory Holdings — Kết quả HĐKD lũy kế T1–T5/2026 (gồm 3 HĐ T12/2025)
          </p>
        </div>
        <span style={{
          fontSize: '0.75rem', padding: '4px 12px', borderRadius: 20,
          background: 'var(--primary-light)', color: 'var(--primary-text)', fontWeight: 600,
        }}>
          Kế toán trưởng
        </span>
      </div>

      {/* KPI Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
        {KPIS.map((k) => {
          const Icon = k.icon;
          const s = statusStyle(k.status);
          return (
            <div key={k.label} style={{
              background: 'var(--bg-card)', border: '1px solid var(--border-light)',
              borderRadius: 12, padding: '14px 16px', borderLeft: `3px solid ${s.border}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon size={16} style={{ color: s.text }} />
                </div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>{k.label}</span>
              </div>
              <div style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--text-title)', marginBottom: 2 }}>{k.value}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 6 }}>{k.sub}</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-label)', marginBottom: 4 }}>{k.target}</div>
              <div style={{
                fontSize: '0.72rem', fontWeight: 600, color: s.text,
                background: s.bg, padding: '3px 8px', borderRadius: 6, display: 'inline-block',
              }}>{k.note}</div>
            </div>
          );
        })}
      </div>

      {/* Charts row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        {/* Monthly DS + DT */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-light)', borderRadius: 14, padding: '16px 18px' }}>
          <div style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--text-title)', marginBottom: 4 }}>
            DOANH SỐ & DOANH THU THEO THÁNG
          </div>
          <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
            {[
              { color: '#818cf8', label: 'Doanh số (tỷ)' },
              { color: '#10b981', label: 'DT môi giới (tỷ)' },
              { color: '#ef4444', label: 'Mục tiêu DS 58 tỷ', dashed: true },
            ].map(l => (
              <span key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                <span style={{
                  width: 12, height: l.dashed ? 2 : 10, borderRadius: l.dashed ? 0 : 2,
                  background: l.color, borderTop: l.dashed ? `2px dashed ${l.color}` : undefined, display: 'inline-block',
                }} />
                {l.label}
              </span>
            ))}
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={MONTHLY} barSize={18}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-lighter)" />
              <XAxis dataKey="thang" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} tickFormatter={v => `${v}tỷ`} />
              <Tooltip content={<CustomTooltipDS />} />
              <ReferenceLine y={58} stroke="#ef4444" strokeDasharray="5 4" strokeWidth={1.5} />
              <Bar dataKey="doanhSo" name="Doanh số" fill="#818cf8" radius={[3, 3, 0, 0]} />
              <Bar dataKey="dtHH" name="DT môi giới" fill="#10b981" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* So can */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-light)', borderRadius: 14, padding: '16px 18px' }}>
          <div style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--text-title)', marginBottom: 4 }}>
            SỐ CĂN BÁN THEO THÁNG
          </div>
          <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
            {[
              { color: '#10b981', label: '≥ 6 căn (đạt)' },
              { color: '#f87171', label: '< 6 căn (thiếu)' },
              { color: '#ef4444', label: 'Mục tiêu 6 căn', dashed: true },
            ].map(l => (
              <span key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                <span style={{
                  width: 12, height: l.dashed ? 2 : 10, borderRadius: l.dashed ? 0 : 2,
                  background: l.color, borderTop: l.dashed ? `2px dashed ${l.color}` : undefined, display: 'inline-block',
                }} />
                {l.label}
              </span>
            ))}
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={MONTHLY} barSize={28}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-lighter)" />
              <XAxis dataKey="thang" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} domain={[0, 13]} />
              <Tooltip formatter={(v: any) => [`${v} căn`, 'Số căn']} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <ReferenceLine y={6} stroke="#ef4444" strokeDasharray="5 4" strokeWidth={1.5} />
              <Bar dataKey="soCan" name="Số căn" radius={[4, 4, 0, 0]}>
                {MONTHLY.map((m) => (
                  <Cell key={m.thang} fill={m.soCan >= 6 ? '#10b981' : '#f87171'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* P&L + Insights */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        {/* P&L Waterfall */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-light)', borderRadius: 14, padding: '16px 18px' }}>
          <div style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--text-title)', marginBottom: 14 }}>
            CẤU TRÚC P&amp;L — LŨY KẾ 5 THÁNG (tỷ VND)
          </div>
          {PNL.map((row, i) => {
            const isResult = row.type === 'result';
            const isMid = row.type === 'mid';
            const color = pnlColor(row.type);
            const barWidth = Math.abs(row.pct);
            const labelOutside = barWidth < 20;
            return (
              <div key={i} style={{ marginBottom: isResult || isMid ? 8 : 5 }}>
                {(isMid || isResult) && <div style={{ height: '0.5px', background: 'var(--border-light)', margin: '6px 0' }} />}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    width: 150, fontSize: '0.75rem', flexShrink: 0,
                    color: isResult || isMid ? 'var(--text-title)' : 'var(--text-muted)',
                    fontWeight: isResult || isMid ? 700 : 400,
                  }}>{row.label}</span>
                  <div style={{ flex: 1, height: 18, position: 'relative', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{
                      width: `${barWidth}%`, minWidth: 4, height: 18, borderRadius: 3,
                      background: color, opacity: isResult || isMid ? 1 : 0.8, flexShrink: 0,
                      display: 'flex', alignItems: 'center', paddingLeft: labelOutside ? 0 : 6,
                    }}>
                      {!labelOutside && (
                        <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#fff', whiteSpace: 'nowrap' }}>
                          {row.value > 0 ? '+' : ''}{fmtTy(row.value)}
                        </span>
                      )}
                    </div>
                    {labelOutside && (
                      <span style={{ fontSize: '0.72rem', fontWeight: 700, color, whiteSpace: 'nowrap' }}>
                        {row.value > 0 ? '+' : ''}{fmtTy(row.value)}
                      </span>
                    )}
                  </div>
                  <span style={{ width: 44, textAlign: 'right', fontSize: '0.75rem', fontWeight: 700, color, flexShrink: 0 }}>
                    {Math.abs(row.pct).toFixed(1)}%
                  </span>
                </div>
              </div>
            );
          })}
          <div style={{
            marginTop: 12, padding: '8px 10px', borderRadius: 8,
            background: 'var(--bg-page)', fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.6,
          }}>
            MKT: 2,0% DT ✓ &nbsp;|&nbsp; Lương Sales+BO: 5,8% DT &nbsp;|&nbsp; Thuê VP: 4,1% DT &nbsp;|&nbsp; Setup VP 1 lần: 3,6%
          </div>
        </div>

        {/* Insights */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-light)', borderRadius: 14, padding: '16px 18px' }}>
          <div style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--text-title)', marginBottom: 14 }}>
            PHÂN TÍCH & KHUYẾN NGHỊ BGĐ
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {INSIGHTS.map((ins, i) => {
              const s = insightStyle(ins.type);
              return (
                <div key={i} style={{
                  padding: '10px 12px', borderRadius: 8,
                  background: s.bg, borderLeft: `3px solid ${s.accent}`,
                }}>
                  <div style={{ fontWeight: 700, fontSize: '0.78rem', color: s.text, marginBottom: 3 }}>{ins.title}</div>
                  <div style={{ fontSize: '0.72rem', color: s.text, lineHeight: 1.55, opacity: 0.85 }}>{ins.body}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* DT trend line */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-light)', borderRadius: 14, padding: '16px 18px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
          <div style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--text-title)' }}>
            XU HƯỚNG DOANH THU MÔI GIỚI (tỷ VND)
          </div>
          <div style={{ display: 'flex', gap: 16, flexShrink: 0 }}>
            {[
              { color: '#6366f1', label: 'DT môi giới', dashed: false },
              { color: '#10b981', label: 'Mục tiêu ≥ 2,3 tỷ', dashed: true },
              { color: '#f59e0b', label: 'Hòa vốn ~2,7 tỷ', dashed: true },
            ].map(l => (
              <span key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                <svg width="22" height="10" style={{ flexShrink: 0 }}>
                  {l.dashed
                    ? <line x1="0" y1="5" x2="22" y2="5" stroke={l.color} strokeWidth="2" strokeDasharray="5,3" />
                    : <line x1="0" y1="5" x2="22" y2="5" stroke={l.color} strokeWidth="2.5" />
                  }
                </svg>
                {l.label}
              </span>
            ))}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={150}>
          <LineChart data={MONTHLY}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-lighter)" />
            <XAxis dataKey="thang" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
            <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} tickFormatter={v => `${v}tỷ`} domain={[0, 5.5]} />
            <Tooltip formatter={(v: any) => [`${Number(v).toFixed(2)} tỷ`, 'DT môi giới']} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
            <ReferenceLine y={2.3} stroke="#10b981" strokeDasharray="5 4" strokeWidth={1.5} />
            <ReferenceLine y={2.7} stroke="#f59e0b" strokeDasharray="4 3" strokeWidth={1.5} />
            <Line
              type="monotone" dataKey="dtHH" stroke="#6366f1" strokeWidth={2.5}
              dot={{ r: 5, fill: '#6366f1', strokeWidth: 0 }}
              activeDot={{ r: 7 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Footer */}
      <div style={{ marginTop: 16, fontSize: '0.72rem', color: 'var(--text-label)', textAlign: 'center' }}>
        Nguồn: VH_BC KQ HĐKD T1–5.2026.xlsx &nbsp;·&nbsp; VIC NS dự kiến VH 2026.xlsx &nbsp;·&nbsp; Cập nhật: T5/2026
      </div>
    </div>
  );
}
