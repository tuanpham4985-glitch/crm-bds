'use client';

import { useState, useEffect, useCallback } from 'react';
import { 
  TrendingUp, TrendingDown, BarChart3, Target, 
  DollarSign, Handshake, ToggleLeft, ToggleRight, Cake 
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, Legend
} from 'recharts';
import type { DashboardData, SinhNhatNhanVien } from '@/lib/types';
import { formatCurrency, formatChange, calcChange } from '@/lib/utils';

const CHART_COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6'];

// ─── Premium Award Medal ─────────────────────────────────────────────────────
// Each tier: gC=glow, rO/rM1/rSp/rM2/rI/rB = ring layers, lS/lM/lH = leaf, ri* = ribbon
const MEDAL = {
  1: { // Gold
    gC:'#E8C820',
    rO:'#3a2200', rM1:'#906010', rSp:'#fff8a8', rM2:'#c8a020', rI:'#5a3800', rB:'#ffe060',
    lS:'#5a3200', lM:'#b88010', lH:'#ffe060',
    riD:'#5a3800', riM:'#d0a010', riH:'#fff5a0', riN:'#2a1000',
  },
  2: { // Silver
    gC:'#A8C0D8',
    rO:'#18202a', rM1:'#485870', rSp:'#ecf2ff', rM2:'#7890b0', rI:'#283848', rB:'#c0d8f0',
    lS:'#283848', lM:'#6878a0', lH:'#d8eaff',
    riD:'#283848', riM:'#6878a0', riH:'#d0e0f0', riN:'#060e18',
  },
  3: { // Bronze
    gC:'#C87828',
    rO:'#381800', rM1:'#783818', rSp:'#ffd090', rM2:'#a85c28', rI:'#582800', rB:'#e8a050',
    lS:'#481e08', lM:'#985828', lH:'#ffc860',
    riD:'#481e08', riM:'#985828', riH:'#ffc878', riN:'#1e0800',
  },
} as const;

function LaurelWreathMedal({ rank, avatarSize, children }: { rank:1|2|3; avatarSize:number; children:React.ReactNode }) {
  const m  = MEDAL[rank];
  const aR = avatarSize / 2;

  // ── Leaf geometry ────────────────────────────────────────────────────────
  // Orbit radius: leaves centered just outside the metallic ring so their
  // outer half emerges visually from behind the ring (natural layering)
  const lLen = rank === 1 ? 21 : 18;   // leaf half-length (tangential)
  const lWid = rank === 1 ? 7.5 : 6.5; // leaf half-width (radial)
  const lOrb = aR + 11;                 // orbit radius (center of each leaf)
  const N    = 13;                      // leaves per branch

  const pad  = 12;
  const ctr  = aR + pad;
  const svgW = avatarSize + pad * 2;

  // Quadratic-bezier leaf — smooth taper to a point at both ends,
  // natural curved silhouette unlike a plain ellipse
  const lBody = `M ${-lLen},0 Q 0,${-lWid} ${lLen},0 Q 0,${lWid} ${-lLen},0 Z`;
  // Highlight streak along the "lit" face of each leaf (gives embossed depth)
  const lGlow = `M ${-lLen*0.55},${-lWid*0.22} Q ${lLen*0.18},${-lWid*0.72} ${lLen*0.86},${-lWid*0.1}`;

  const mkLeaves = (a0: number, a1: number) =>
    Array.from({ length: N }, (_, i) => {
      const t = i / (N - 1);
      const d = a0 + (a1 - a0) * t;
      const r = d * Math.PI / 180;
      // Opacity & scale: full mid-branch, tapered at both ends
      const op = 0.56 + 0.42 * Math.sin(t * Math.PI);
      const sc = 0.74 + 0.26 * Math.sin(t * Math.PI);
      return { x: ctr + Math.cos(r) * lOrb, y: ctr + Math.sin(r) * lOrb, rot: d + 90, op, sc };
    });

  // Left branch : 108° → 252° (lower-right corner CCW to upper-left)
  // Right branch: 72°  → −72° (lower-left corner CW  to upper-right)
  // ~36° gap at 12 o'clock keeps the wreath naturally open at the top
  const LL = mkLeaves(108, 252);
  const RL = mkLeaves(72, -72);
  const p  = `pm${rank}`; // unique gradient-ID prefix per rank

  // Ribbon
  const ribW = Math.round(avatarSize * 0.68);
  const ribH = 29;
  const tail = 14;
  const ribY = ctr + aR + 14;
  const svgH = ribY + ribH + 13;

  return (
    <div style={{ position:'relative', width:svgW, height:svgH, flexShrink:0 }}>
      <svg width={svgW} height={svgH} viewBox={`0 0 ${svgW} ${svgH}`}
        style={{ position:'absolute', top:0, left:0 }} overflow="visible">
        <defs>
          {/* ── Radial glow behind the entire medal ── */}
          <radialGradient id={`${p}gl`} cx="50%" cy="50%" r="50%">
            <stop offset="0%"   stopColor={m.gC} stopOpacity="0.60" />
            <stop offset="50%"  stopColor={m.gC} stopOpacity="0.18" />
            <stop offset="100%" stopColor={m.gC} stopOpacity="0"    />
          </radialGradient>

          {/* ── Leaf body gradient: dark stem → mid → bright highlight → dark tip ── */}
          <linearGradient id={`${p}lb`} x1="0" y1="0" x2="1" y2="0" gradientUnits="objectBoundingBox">
            <stop offset="0%"   stopColor={m.lS} />
            <stop offset="32%"  stopColor={m.lM} />
            <stop offset="64%"  stopColor={m.lH} stopOpacity="0.90" />
            <stop offset="100%" stopColor={m.lS} stopOpacity="0.85" />
          </linearGradient>

          {/* ── Leaf highlight streak (semi-transparent bright line) ── */}
          <linearGradient id={`${p}lh`} x1="0" y1="0" x2="1" y2="0" gradientUnits="objectBoundingBox">
            <stop offset="0%"   stopColor={m.lH} stopOpacity="0"    />
            <stop offset="42%"  stopColor={m.lH} stopOpacity="0.95" />
            <stop offset="100%" stopColor={m.lH} stopOpacity="0"    />
          </linearGradient>

          {/* ── Main ring gradient: top-left specular → upper-dark → lower-metallic → bottom-dark ── */}
          {/* Creates "light hitting from top-left" metallic illusion */}
          <linearGradient id={`${p}rg`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%"   stopColor={m.rSp}  />
            <stop offset="20%"  stopColor={m.rM1}  />
            <stop offset="58%"  stopColor={m.rM2}  />
            <stop offset="100%" stopColor={m.rO}   />
          </linearGradient>

          {/* ── Second ring gradient (cross-axis) for lateral metallic band ── */}
          <linearGradient id={`${p}r2`} x1="1" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={m.rB}  stopOpacity="0.40" />
            <stop offset="50%"  stopColor={m.rSp} stopOpacity="0.15" />
            <stop offset="100%" stopColor={m.rB}  stopOpacity="0"    />
          </linearGradient>

          {/* ── Ribbon gradient ── */}
          <linearGradient id={`${p}rb`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={m.riM} />
            <stop offset="100%" stopColor={m.riD} />
          </linearGradient>
        </defs>

        {/* ══ 0. Glow halo disc (largest, deepest layer) ══ */}
        <circle cx={ctr} cy={ctr} r={aR * 1.65} fill={`url(#${p}gl)`} />

        {/* ══ 1. Outer engraved border ring ══ */}
        <circle cx={ctr} cy={ctr} r={aR + 14}
          fill="none" stroke={m.rO} strokeWidth="2.5" opacity={0.80} />

        {/* ══ 2. Laurel branches — drawn BEFORE main ring so bases hide under it ══ */}
        {LL.map((l, i) => (
          <g key={`ll${i}`}
            transform={`translate(${l.x},${l.y}) rotate(${l.rot}) scale(${l.sc})`}>
            {/* Leaf body (shadow-side gradient) */}
            <path d={lBody} fill={`url(#${p}lb)`} opacity={l.op} />
            {/* Highlight streak (lit-face specular) */}
            <path d={lGlow} fill="none"
              stroke={`url(#${p}lh)`} strokeWidth="1.3"
              strokeLinecap="round" opacity={l.op * 0.88} />
          </g>
        ))}
        {RL.map((l, i) => (
          <g key={`rl${i}`}
            transform={`translate(${l.x},${l.y}) rotate(${l.rot}) scale(${l.sc})`}>
            <path d={lBody} fill={`url(#${p}lb)`} opacity={l.op} />
            <path d={lGlow} fill="none"
              stroke={`url(#${p}lh)`} strokeWidth="1.3"
              strokeLinecap="round" opacity={l.op * 0.88} />
          </g>
        ))}

        {/* ══ 3. Four-layer metallic ring stack (creates depth & reflections) ══ */}

        {/* 3a. Outer dark edge — defines the ring's outer boundary */}
        <circle cx={ctr} cy={ctr} r={aR + 11}
          fill="none" stroke={m.rO} strokeWidth="3" opacity={0.78} />

        {/* 3b. Main gradient band — primary metallic surface */}
        <circle cx={ctr} cy={ctr} r={aR + 7}
          fill="none" stroke={`url(#${p}rg)`}
          strokeWidth={rank === 1 ? 10 : 8.5} />

        {/* 3c. Cross-axis shimmer (second gradient overlaid, ~45° offset) */}
        <circle cx={ctr} cy={ctr} r={aR + 7}
          fill="none" stroke={`url(#${p}r2)`}
          strokeWidth={rank === 1 ? 10 : 8.5} />

        {/* 3d. Inner specular line — bright edge where ring meets dark interior */}
        <circle cx={ctr} cy={ctr} r={aR + 2}
          fill="none" stroke={m.rB} strokeWidth="1.5" opacity={0.52} />

        {/* 3e. Inner dark shadow ring — crisp boundary before avatar */}
        <circle cx={ctr} cy={ctr} r={aR + 0.6}
          fill="none" stroke={m.rI} strokeWidth="2.5" opacity={0.55} />

        {/* ══ 4. Ribbon tails ══ */}
        <polygon
          points={`${ctr-ribW/2},${ribY} ${ctr-ribW/2-tail},${ribY+ribH/2} ${ctr-ribW/2},${ribY+ribH}`}
          fill={m.riD} opacity={0.94} />
        <polygon
          points={`${ctr+ribW/2},${ribY} ${ctr+ribW/2+tail},${ribY+ribH/2} ${ctr+ribW/2},${ribY+ribH}`}
          fill={m.riD} opacity={0.94} />

        {/* ══ 5. Ribbon body with 3D detail ══ */}
        <rect x={ctr-ribW/2} y={ribY} width={ribW} height={ribH} rx={5}
          fill={`url(#${p}rb)`} />
        {/* Top sheen line */}
        <rect x={ctr-ribW/2+7} y={ribY+5} width={ribW-14} height={2} rx={1}
          fill={m.riH} opacity={0.52} />
        {/* Bottom shadow edge */}
        <rect x={ctr-ribW/2+3} y={ribY+ribH-4} width={ribW-6} height={3} rx={2}
          fill={m.riD} opacity={0.45} />

        {/* ══ 6. Rank number ══ */}
        <text x={ctr} y={ribY+ribH-8} textAnchor="middle"
          fontSize={rank===1 ? 18 : 15} fontWeight="900" letterSpacing={1}
          fill={m.riN} fontFamily="Inter, system-ui, sans-serif">
          {rank}
        </text>
      </svg>

      {/* ══ Avatar (sits above SVG, visible through transparent medal center) ══ */}
      <div style={{
        position:'absolute', top:pad, left:pad,
        width:avatarSize, height:avatarSize,
        borderRadius:'50%', overflow:'hidden', zIndex:2,
        // Triple-ring shadow: dark edge + metallic halo + soft glow
        boxShadow:`0 0 0 2px ${m.rI}, 0 0 0 4.5px ${m.rM2}60, 0 12px 40px ${m.gC}90`,
      }}>
        {children}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [period, setPeriod] = useState('month');
  const [compare, setCompare] = useState('');
  const [loading, setLoading] = useState(true);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ period });
      if (compare) params.set('compare', compare);
      const res = await fetch(`/api/dashboard?${params}`);
      const result = await res.json();
      if (result.success) setData(result.data);
    } catch (err) {
      console.error('Dashboard fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [period, compare]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const periods = [
    { value: 'week', label: 'Tuần' },
    { value: 'month', label: 'Tháng' },
    { value: 'quarter', label: 'Quý' },
    { value: 'year', label: 'Năm' },
  ];

  const renderKpiCard = (
    label: string, 
    value: number, 
    prevValue: number | undefined, 
    icon: React.ReactNode,
    format: 'number' | 'currency' = 'number'
  ) => {
    const displayValue = format === 'currency' ? formatCurrency(value) : value.toString();
    const change = prevValue !== undefined ? calcChange(value, prevValue) : null;

    return (
      <div className="kpi-card">
        <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
          <span className="kpi-label">{label}</span>
          <div style={{ 
            width: 40, height: 40, borderRadius: 12, 
            background: 'var(--primary-light)', color: 'var(--primary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            {icon}
          </div>
        </div>
        <div className="kpi-value">{displayValue}</div>
        {change !== null && (
          <div className={`kpi-change ${change >= 0 ? 'positive' : 'negative'}`}>
            {change >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
            {formatChange(change)} so với kỳ trước
          </div>
        )}
      </div>
    );
  };

  if (loading && !data) {
    return (
      <div className="loading-spinner">
        <div className="spinner" />
      </div>
    );
  }

  if (!data) return null;

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div className="page-header-left">
          <h1>Dashboard</h1>
          <p>Tổng quan hoạt động kinh doanh</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Period selector */}
          <div className="toggle-group">
            {periods.map(p => (
              <button
                key={p.value}
                className={`toggle-btn ${period === p.value ? 'active' : ''}`}
                onClick={() => setPeriod(p.value)}
              >
                {p.label}
              </button>
            ))}
          </div>
          {/* Compare toggle */}
          <button
            className={`btn ${compare ? 'btn-primary' : 'btn-secondary'} btn-sm`}
            onClick={() => setCompare(compare ? '' : 'prev')}
            title="So sánh cùng kỳ"
          >
            {compare ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
            So sánh
          </button>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="kpi-grid">
        {renderKpiCard('Tổng Deal', data.kpi.tong_deal, data.kpi.tong_deal_prev, <BarChart3 size={20} />)}
        {renderKpiCard('Đang xử lý', data.kpi.dang_xu_ly, data.kpi.dang_xu_ly_prev, <Target size={20} />)}
        {renderKpiCard('Đã ký HĐ', data.kpi.da_ky, data.kpi.da_ky_prev, <Handshake size={20} />)}
        {renderKpiCard('Doanh thu', data.kpi.doanh_thu, data.kpi.doanh_thu_prev, <DollarSign size={20} />, 'currency')}
      </div>

      {/* Charts Row */}
      <div className="charts-grid">
        {/* Doanh thu theo dự án */}
        <div className="chart-card">
          <div className="card-header">
            <div>
              <div className="card-title">Doanh thu theo dự án</div>
              <div className="card-subtitle">Tổng doanh thu các deal đã ký</div>
            </div>
          </div>
          <div style={{ width: '100%', height: 280 }}>
            <ResponsiveContainer>
              <BarChart data={data.doanh_thu_theo_du_an} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis type="number" tickFormatter={(v) => formatCurrency(v as number)} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="du_an" width={150} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => formatCurrency(v as number)} />
                <Bar dataKey="doanh_thu" fill="#6366f1" radius={[0, 6, 6, 0]} name="Doanh thu" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Doanh thu theo thời gian */}
        <div className="chart-card">
          <div className="card-header">
            <div>
              <div className="card-title">Doanh thu theo thời gian</div>
              <div className="card-subtitle">Xu hướng doanh thu qua các tháng</div>
            </div>
          </div>
          <div style={{ width: '100%', height: 280 }}>
            <ResponsiveContainer>
              <LineChart data={data.doanh_thu_theo_thang}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="thang" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(v) => formatCurrency(v as number)} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => formatCurrency(v as number)} />
                <Line 
                  type="monotone" dataKey="doanh_thu" 
                  stroke="#6366f1" strokeWidth={2.5} 
                  dot={{ r: 4, fill: '#6366f1' }}
                  name="Kỳ hiện tại"
                />
                {compare && (
                  <Line 
                    type="monotone" dataKey="doanh_thu_prev" 
                    stroke="#cbd5e1" strokeWidth={2} strokeDasharray="5 5"
                    dot={{ r: 3, fill: '#cbd5e1' }}
                    name="Kỳ trước"
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Middle Row: BXH Sale & Vinh Danh Champion */}
      <div className="charts-grid">
        {/* BXH Sale - Podium + List */}
        <div className="chart-card">
          <div className="card-header">
            <div>
              <div className="card-title">🏆 Bảng xếp hạng Sale</div>
              <div className="card-subtitle">Doanh thu deal đã ký theo nhân viên</div>
            </div>
          </div>

          {data.doanh_thu_theo_sale.length > 0 ? (
            <>
              {/* Podium Top 3 */}
              {data.doanh_thu_theo_sale.length >= 2 && (
                <>
                  <style>{`
                    @keyframes float-rank-1 {
                      0%   { transform: translateY(-22px); }
                      50%  { transform: translateY(-30px); }
                      100% { transform: translateY(-22px); }
                    }
                    @keyframes float-rank-2 {
                      0%   { transform: translateY(4px); }
                      50%  { transform: translateY(-2px); }
                      100% { transform: translateY(4px); }
                    }
                    @keyframes float-rank-3 {
                      0%   { transform: translateY(18px); }
                      50%  { transform: translateY(12px); }
                      100% { transform: translateY(18px); }
                    }
                    .floating-platform-1 { animation: float-rank-1 4s   ease-in-out infinite; }
                    .floating-platform-2 { animation: float-rank-2 4.4s ease-in-out infinite; }
                    .floating-platform-3 { animation: float-rank-3 4.8s ease-in-out infinite; }
                  `}</style>
                  
                  <div className="podium-container" style={{
                    background: 'radial-gradient(ellipse at 50% 30%, #0d1a3a 0%, #050c1c 55%, #020609 100%)',
                    borderRadius: '20px',
                    padding: isMobile ? '40px 4px 20px' : '80px 20px 28px',
                    minHeight: isMobile ? 'unset' : '460px',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'flex-end',
                    position: 'relative',
                    overflow: 'hidden',
                    border: '1px solid rgba(255,255,255,0.05)',
                    boxShadow: 'inset 0 0 80px rgba(0,0,0,0.95), 0 20px 50px rgba(0,0,0,0.7)',
                    gap: isMobile ? '6px' : '16px',
                  }}>
                    {/* Stage floor spotlight — gold halo at center bottom */}
                    <div style={{
                      position: 'absolute', bottom: '-20px', left: '50%',
                      transform: 'translateX(-50%)',
                      width: '60%', height: '120px',
                      background: 'radial-gradient(ellipse at 50% 100%, rgba(212,175,55,0.18) 0%, transparent 70%)',
                      pointerEvents: 'none',
                    }} />
                    {/* Left spot (silver) */}
                    <div style={{
                      position: 'absolute', bottom: '-10px', left: '12%',
                      width: '30%', height: '90px',
                      background: 'radial-gradient(ellipse at 50% 100%, rgba(168,192,216,0.10) 0%, transparent 70%)',
                      pointerEvents: 'none',
                    }} />
                    {/* Right spot (bronze) */}
                    <div style={{
                      position: 'absolute', bottom: '-10px', right: '12%',
                      width: '30%', height: '90px',
                      background: 'radial-gradient(ellipse at 50% 100%, rgba(200,120,40,0.10) 0%, transparent 70%)',
                      pointerEvents: 'none',
                    }} />
                    {/* Faint star-field dots */}
                    <div style={{
                      position: 'absolute', inset: 0,
                      backgroundImage: 'radial-gradient(rgba(255,255,255,0.06) 1px, transparent 1px)',
                      backgroundSize: '28px 28px',
                      pointerEvents: 'none', opacity: 0.6,
                    }} />

                    {/* Sắp xếp: Hạng 2 - Hạng 1 - Hạng 3 */}
                    {[1, 0, 2].map((rankIdx) => {
                      const sale = data.doanh_thu_theo_sale[rankIdx];
                      if (!sale) return null;
                      const rank = rankIdx + 1;
                      
                      const initials = sale.nhan_vien
                        .split(' ')
                        .map((w: string) => w[0])
                        .slice(-2)
                        .join('');

                      const typedRank = rank as 1 | 2 | 3;
                      const aSize = isMobile
                        ? (rank === 1 ? 78 : rank === 2 ? 68 : 64)
                        : (rank === 1 ? 148 : rank === 2 ? 128 : 120);
                      const beamBg =
                        rank === 1 ? 'linear-gradient(to top, rgba(251,191,36,0.22) 0%, transparent 80%)' :
                        rank === 2 ? 'linear-gradient(to top, rgba(148,163,184,0.14) 0%, transparent 80%)' :
                                     'linear-gradient(to top, rgba(234,88,12,0.12) 0%, transparent 80%)';

                      return (
                        <div
                          key={sale.nhan_vien}
                          className={`floating-platform-${rank}`}
                          style={{
                            flex: 1,
                            maxWidth: isMobile ? (rank === 1 ? '110px' : '98px') : (rank === 1 ? '210px' : '190px'),
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            position: 'relative',
                            transition: 'all 0.3s ease',
                            zIndex: rank === 1 ? 5 : 2,
                          }}
                        >
                          {/* Upward light beam */}
                          <div style={{
                            position: 'absolute',
                            bottom: '50px',
                            width: isMobile ? (rank === 1 ? '80px' : '70px') : (rank === 1 ? '140px' : '120px'),
                            height: isMobile ? '140px' : '220px',
                            background: beamBg,
                            clipPath: 'polygon(15% 0%, 85% 0%, 100% 100%, 0% 100%)',
                            pointerEvents: 'none',
                            zIndex: 1,
                            opacity: 0.8,
                          }} />

                          {/* Laurel wreath medal with embedded avatar */}
                          <LaurelWreathMedal rank={typedRank} avatarSize={aSize}>
                            <div style={{
                              width: '100%',
                              height: '100%',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              background: '#0f172a',
                            }}>
                              {sale.avatar_url ? (
                                <img
                                  src={sale.avatar_url}
                                  alt={sale.nhan_vien}
                                  style={{
                                    width: '100%',
                                    height: '100%',
                                    objectFit: 'cover',
                                    objectPosition: 'top center',
                                  }}
                                />
                              ) : (
                                <div style={{
                                  fontSize: rank === 1 ? '2.5rem' : rank === 2 ? '2.1rem' : '2.6rem',
                                  fontWeight: 800,
                                  color: rank === 2 ? '#e2e8f0' : '#fff',
                                  letterSpacing: '-1px',
                                }}>
                                  {initials}
                                </div>
                              )}
                            </div>
                          </LaurelWreathMedal>

                          {/* Name — tier-colored metallic text */}
                          <div style={{
                            fontSize: rank === 1 ? (isMobile ? '0.72rem' : '0.84rem') : (isMobile ? '0.66rem' : '0.76rem'),
                            fontWeight: 800,
                            color: rank === 1 ? '#FFD75A' : rank === 2 ? '#BDD4EE' : '#E8A868',
                            textAlign: 'center',
                            marginTop: '6px',
                            width: '100%',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            textShadow: rank === 1
                              ? '0 0 12px rgba(232,184,32,0.6), 0 2px 4px rgba(0,0,0,0.9)'
                              : rank === 2
                              ? '0 0 10px rgba(168,192,216,0.4), 0 2px 4px rgba(0,0,0,0.9)'
                              : '0 0 10px rgba(200,120,40,0.4), 0 2px 4px rgba(0,0,0,0.9)',
                            zIndex: 3,
                            paddingLeft: '4px',
                            paddingRight: '4px',
                            letterSpacing: rank === 1 ? '0.01em' : '0',
                          }}>
                            {sale.nhan_vien}
                          </div>

                          {/* Score Pill — metallic trim matching tier */}
                          <div style={{
                            background: rank === 1
                              ? 'rgba(232,184,32,0.10)'
                              : rank === 2
                              ? 'rgba(168,192,216,0.08)'
                              : 'rgba(200,120,40,0.09)',
                            border: `1px solid ${rank === 1 ? 'rgba(232,184,32,0.25)' : rank === 2 ? 'rgba(168,192,216,0.20)' : 'rgba(200,120,40,0.22)'}`,
                            borderRadius: '20px',
                            padding: '3px 10px',
                            marginTop: '4px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            zIndex: 3,
                            boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
                          }}>
                            <span style={{
                              fontSize: rank === 1 ? (isMobile ? '0.64rem' : '0.74rem') : (isMobile ? '0.6rem' : '0.70rem'),
                              fontWeight: 700,
                              color: rank === 1 ? '#FFD75A' : rank === 2 ? '#BDD4EE' : '#E8A868',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '3px',
                            }}>
                              {formatCurrency(sale.doanh_thu)} <span style={{ opacity: 0.85 }}>⭐</span>
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
{/* Danh sách còn lại (từ hạng 4 trở đi, hoặc tất cả nếu < 2 người) */}
              {data.doanh_thu_theo_sale.length > 3 && (
                <>
                  <div className="leaderboard-divider" />
                  <div className="leaderboard-list">
                    {data.doanh_thu_theo_sale.slice(3, 10).map((sale, i) => {
                      const rank = i + 4;
                      const AVATAR_COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#14b8a6'];
                      const color = AVATAR_COLORS[(rank - 1) % AVATAR_COLORS.length];
                      const initials = sale.nhan_vien
                        .split(' ')
                        .map((w: string) => w[0])
                        .slice(-2)
                        .join('');

                      return (
                        <div key={sale.nhan_vien} className="leaderboard-row">
                          <div className="leaderboard-rank">{rank}</div>
                          {sale.avatar_url ? (
                            <img 
                              src={sale.avatar_url} 
                              alt={sale.nhan_vien}
                              className="leaderboard-avatar-initials"
                            />
                          ) : (
                            <div
                              className="leaderboard-avatar-initials"
                              style={{ background: color }}
                            >
                              {initials}
                            </div>
                          )}
                          <div className="leaderboard-info">
                            <div className="leaderboard-name">{sale.nhan_vien}</div>
                            <div className="leaderboard-detail">{sale.so_deal} deal đã ký</div>
                          </div>
                          <div className="leaderboard-stats">
                            <div className="leaderboard-stat">
                              <div className="leaderboard-stat-value">{formatCurrency(sale.doanh_thu)}</div>
                              <div className="leaderboard-stat-label">Doanh thu</div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              {/* Nếu chỉ có 1 người, hiện dạng list */}
              {data.doanh_thu_theo_sale.length === 1 && (
                <div className="leaderboard-list">
                  {data.doanh_thu_theo_sale.map((sale, i) => {
                    const initials = sale.nhan_vien
                      .split(' ')
                      .map((w: string) => w[0])
                      .slice(-2)
                      .join('');
                    return (
                      <div key={sale.nhan_vien} className="leaderboard-row">
                        <div className="leaderboard-rank" style={{ background: '#fffbeb', color: '#b45309' }}>
                          {i + 1}
                        </div>
                        {sale.avatar_url ? (
                          <img 
                            src={sale.avatar_url} 
                            alt={sale.nhan_vien}
                            className="leaderboard-avatar-initials"
                          />
                        ) : (
                          <div className="leaderboard-avatar-initials" style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}>
                            {initials}
                          </div>
                        )}
                        <div className="leaderboard-info">
                          <div className="leaderboard-name">{sale.nhan_vien}</div>
                          <div className="leaderboard-detail">{sale.so_deal} deal đã ký</div>
                        </div>
                        <div className="leaderboard-stats">
                          <div className="leaderboard-stat">
                            <div className="leaderboard-stat-value">{formatCurrency(sale.doanh_thu)}</div>
                            <div className="leaderboard-stat-label">Doanh thu</div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            <div className="empty-state">
              <h3>Chưa có dữ liệu</h3>
              <p>Chưa có deal nào được ký trong kỳ này</p>
            </div>
          )}
        </div>

        {/* Vinh danh Global Champion */}
        <GlobalChampionWidget data={data.doanh_thu_theo_sale} />
      </div>

      {/* Bottom Row: Nguồn khách hàng & Sinh nhật */}
      <div className="charts-grid" style={{ marginTop: 24 }}>
        {/* Nguồn khách hàng */}
        <div className="chart-card">
          <div className="card-header">
            <div>
              <div className="card-title">Nguồn khách hàng</div>
              <div className="card-subtitle">Phân bổ theo nguồn</div>
            </div>
          </div>
          <div style={{ width: '100%', height: 280 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={data.nguon_khach_hang}
                  dataKey="so_luong"
                  nameKey="nguon"
                  cx="50%" cy="50%"
                  outerRadius={100}
                  innerRadius={50}
                  strokeWidth={2}
                  stroke="#fff"
                >
                  {data.nguon_khach_hang.map((_, index) => (
                    <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Sinh nhật nhân viên tháng này */}
        <BirthdayWidget employees={data.sinh_nhat_thang_nay} />
      </div>
    </div>
  );
}

// ─── Birthday Widget Component ────────────────────────────────────────────────
const MONTH_NAMES = ['Tháng 1','Tháng 2','Tháng 3','Tháng 4','Tháng 5','Tháng 6',
  'Tháng 7','Tháng 8','Tháng 9','Tháng 10','Tháng 11','Tháng 12'];

const BD_COLORS = [
  'linear-gradient(135deg,#6366f1,#818cf8)',
  'linear-gradient(135deg,#ec4899,#f472b6)',
  'linear-gradient(135deg,#f59e0b,#fbbf24)',
  'linear-gradient(135deg,#10b981,#34d399)',
  'linear-gradient(135deg,#3b82f6,#60a5fa)',
  'linear-gradient(135deg,#8b5cf6,#a78bfa)',
  'linear-gradient(135deg,#ef4444,#f87171)',
  'linear-gradient(135deg,#14b8a6,#2dd4bf)',
];

function BirthdayWidget({ employees }: { employees: SinhNhatNhanVien[] }) {
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const monthLabel = MONTH_NAMES[currentMonth - 1];

  return (
    <div className="chart-card" style={{ marginTop: 24 }}>
      <div className="card-header" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 12,
            background: 'linear-gradient(135deg,#ec4899,#f472b6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(236,72,153,0.35)',
            flexShrink: 0,
          }}>
            <Cake size={20} color="#fff" />
          </div>
          <div>
            <div className="card-title">🎂 Sinh nhật nhân viên</div>
            <div className="card-subtitle">{monthLabel} — {employees.length} nhân viên</div>
          </div>
        </div>
      </div>

      {employees.length === 0 ? (
        <div className="empty-state" style={{ padding: '32px 0' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🎈</div>
          <h3 style={{ margin: 0 }}>Không có sinh nhật trong tháng này</h3>
          <p>Không có nhân viên nào có sinh nhật trong {monthLabel}</p>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: 16,
        }}>
          {employees.map((emp, idx) => {
            const initials = emp.ho_ten.split(' ').map(w => w[0]).slice(-2).join('');
            const grad = BD_COLORS[idx % BD_COLORS.length];
            const isToday = emp.la_hom_nay;

            return (
              <div
                key={emp.id_nhan_vien}
                style={{
                  position: 'relative',
                  background: isToday
                    ? 'linear-gradient(135deg,#fef3c7,#fef9ec)'
                    : 'var(--bg-secondary, #f8fafc)',
                  border: isToday
                    ? '2px solid #f59e0b'
                    : '1.5px solid var(--border, #e2e8f0)',
                  borderRadius: 16,
                  padding: '18px 16px 16px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 8,
                  boxShadow: isToday
                    ? '0 4px 20px rgba(245,158,11,0.25)'
                    : '0 2px 8px rgba(0,0,0,0.05)',
                  transition: 'transform 0.18s, box-shadow 0.18s',
                  cursor: 'default',
                  overflow: 'hidden',
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-4px)';
                  (e.currentTarget as HTMLDivElement).style.boxShadow = isToday
                    ? '0 8px 28px rgba(245,158,11,0.35)'
                    : '0 8px 24px rgba(0,0,0,0.10)';
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)';
                  (e.currentTarget as HTMLDivElement).style.boxShadow = isToday
                    ? '0 4px 20px rgba(245,158,11,0.25)'
                    : '0 2px 8px rgba(0,0,0,0.05)';
                }}
              >
                {isToday && (
                  <div style={{
                    position: 'absolute', top: 10, right: 10,
                    background: 'linear-gradient(135deg,#f59e0b,#fbbf24)',
                    color: '#fff', fontSize: 10, fontWeight: 700,
                    padding: '2px 8px', borderRadius: 20,
                    letterSpacing: '0.5px', textTransform: 'uppercase',
                  }}>Hôm nay 🎉</div>
                )}

                {/* Avatar */}
                {emp.avatar_url ? (
                  <img
                    src={emp.avatar_url}
                    alt={emp.ho_ten}
                    style={{
                      width: 64, height: 64, borderRadius: '50%',
                      objectFit: 'cover',
                      border: isToday ? '3px solid #f59e0b' : '3px solid #e2e8f0',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
                    }}
                  />
                ) : (
                  <div style={{
                    width: 64, height: 64, borderRadius: '50%',
                    background: grad,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 22, fontWeight: 700, color: '#fff',
                    border: isToday ? '3px solid #f59e0b' : '3px solid transparent',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                    flexShrink: 0,
                  }}>
                    {initials}
                  </div>
                )}

                {/* Name */}
                <div style={{
                  fontWeight: 700, fontSize: 14, textAlign: 'center',
                  color: 'var(--text-primary,#1e293b)', lineHeight: 1.3,
                  maxWidth: '100%', wordBreak: 'break-word',
                }}>
                  {emp.ho_ten}
                </div>

                {/* Date badge */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  background: isToday
                    ? 'linear-gradient(135deg,#f59e0b,#fbbf24)'
                    : 'var(--primary-light, #ede9fe)',
                  color: isToday ? '#fff' : 'var(--primary,#6366f1)',
                  borderRadius: 20, padding: '4px 12px',
                  fontSize: 13, fontWeight: 600,
                }}>
                  <Cake size={13} />
                  {String(emp.ngay).padStart(2,'0')}/{String(emp.thang).padStart(2,'0')}
                </div>

                {/* Dept */}
                {(emp.employee_type || emp.phong_KD) && (
                  <div style={{
                    fontSize: 11, color: 'var(--text-secondary,#64748b)',
                    textAlign: 'center',
                  }}>
                    {[emp.employee_type, emp.phong_KD].filter(Boolean).join(' · ')}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Global Champion Widget Component ───────────────────────────────────────
function GlobalChampionWidget({ data }: { data: any[] }) {
  // Mốc doanh thu
  const LEVELS = [
    {
      id: 'europe',
      target: 168000000000, // 168 tỷ
      title: 'EUROPE TOUR',
      condition: '168 TỶ',
      bgImg: 'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?q=80&w=400&auto=format&fit=crop', // Eiffel Tower
      color: '#fbbf24',
      badge: '👑 Đẳng Cấp Châu Âu'
    },
    {
      id: 'japan',
      target: 80000000000, // 80 tỷ
      title: 'JAPAN TOUR',
      condition: '80 TỶ',
      bgImg: 'https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?q=80&w=400&auto=format&fit=crop', // Japan temple
      color: '#38bdf8',
      badge: '🌸 Chuyến Đi Nhật Bản'
    },
    {
      id: 'singapore',
      target: 36000000000, // 36 tỷ
      title: 'SINGAPORE - MALAYSIA',
      condition: '36 TỶ',
      bgImg: 'https://images.unsplash.com/photo-1597655601841-214a4cfe8b2c?q=80&w=400&auto=format&fit=crop', // Marina Bay Sands
      color: '#f472b6',
      badge: '✈️ Hành Trình Sing-Mã'
    }
  ];

  // Phân loại sale theo mốc đạt được
  const achievers = {
    europe: [] as any[],
    japan: [] as any[],
    singapore: [] as any[]
  };

  data.forEach(sale => {
    if (sale.doanh_thu >= LEVELS[0].target) achievers.europe.push(sale);
    else if (sale.doanh_thu >= LEVELS[1].target) achievers.japan.push(sale);
    else if (sale.doanh_thu >= LEVELS[2].target) achievers.singapore.push(sale);
  });

  return (
    <div className="chart-card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', border: '1.5px solid #d4af37' }}>
      {/* Aviation Theme Title Header */}
      <div style={{
        padding: '18px 24px',
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
        color: '#fff',
        borderBottom: '3px solid #d4af37',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div>
          <div style={{ color: '#d4af37', fontSize: '0.875rem', fontWeight: 800, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 3 }}>
            CỰC CHIẾN 2026
          </div>
          <div style={{ fontSize: '1.45rem', fontWeight: 800, letterSpacing: '0.5px', textShadow: '0 2px 4px rgba(0,0,0,0.3)' }}>
            GLOBAL CHAMPION ✈️
          </div>
        </div>
        <div style={{ textAlign: 'right', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ borderRight: '1px solid rgba(255,255,255,0.2)', paddingRight: 10 }}>
            <div style={{ fontSize: '0.78rem', color: '#94a3b8', fontWeight: 700, letterSpacing: 1 }}>VICTORY AIRLINES</div>
            <div style={{ fontSize: '0.72rem', color: '#cbd5e1' }}>BOARDING PASS SYSTEM</div>
          </div>
          <div style={{ fontSize: '2.2rem', lineHeight: 1 }}>🎫</div>
        </div>
      </div>

      {/* Ticket List Body */}
      <div style={{ flex: 1, padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px', background: '#f8fafc', overflowY: 'auto' }}>
        {LEVELS.map(level => {
          const list = achievers[level.id as keyof typeof achievers];
          
          return (
            <div key={level.id} style={{
              display: 'flex',
              flexDirection: 'column',
              borderRadius: '14px',
              overflow: 'hidden',
              boxShadow: '0 4px 12px rgba(212,175,55,0.12)',
              background: '#fff',
              border: '1.5px solid #d4af37',
              position: 'relative'
            }}>
              {/* Ticket Tear Notch Top */}
              <div style={{
                position: 'absolute', top: '-10px', right: '28%',
                width: '18px', height: '18px', borderRadius: '50%',
                background: '#f8fafc', borderBottom: '1.5px solid #d4af37',
                zIndex: 10
              }} />
              {/* Ticket Tear Notch Bottom */}
              <div style={{
                position: 'absolute', bottom: '-10px', right: '28%',
                width: '18px', height: '18px', borderRadius: '50%',
                background: '#f8fafc', borderTop: '1.5px solid #d4af37',
                zIndex: 10
              }} />

              {/* Main Ticket Area */}
              <div style={{ display: 'flex', height: '148px' }}>
                {/* Left: Main Ticket Stub (72% width) */}
                <div style={{
                  flex: 1,
                  padding: '14px 18px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  borderRight: '1.5px dashed #d4af37',
                  position: 'relative'
                }}>
                  {/* Airplane Logo & Boarding Pass Text */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem', color: '#94a3b8', fontWeight: 700 }}>
                    <span style={{ color: '#d4af37', fontWeight: 800 }}>✈️ VICTORY AIRLINES</span>
                    <span style={{ letterSpacing: '0.5px' }}>BOARDING PASS</span>
                  </div>

                  {/* Destination Info & Destination Symbol Pic */}
                  <div style={{ display: 'flex', gap: '14px', marginTop: '10px', alignItems: 'center' }}>
                    {/* Destination Symbol Pic */}
                    <img
                      src={level.bgImg}
                      alt={level.title}
                      style={{
                        width: '112px',
                        height: '72px',
                        borderRadius: '8px',
                        objectFit: 'cover',
                        border: '1px solid #e2e8f0',
                        boxShadow: '0 2px 6px rgba(0,0,0,0.12)',
                        flexShrink: 0
                      }}
                    />

                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 700, letterSpacing: '0.5px' }}>DESTINATION:</div>
                      <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a', lineHeight: 1.15, marginTop: 2 }}>{level.title}</div>

                      <div style={{ display: 'flex', gap: '12px', marginTop: '6px', flexWrap: 'nowrap' }}>
                        <div style={{ flexShrink: 0 }}>
                          <span style={{ fontSize: '0.65rem', color: '#94a3b8', display: 'block', fontWeight: 600, whiteSpace: 'nowrap' }}>FLIGHT</span>
                          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#1e293b', whiteSpace: 'nowrap' }}>VIC2026</span>
                        </div>
                        <div style={{ flexShrink: 0 }}>
                          <span style={{ fontSize: '0.65rem', color: '#94a3b8', display: 'block', fontWeight: 600, whiteSpace: 'nowrap' }}>SEAT</span>
                          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#1e293b', whiteSpace: 'nowrap' }}>01A/VIP</span>
                        </div>
                        <div style={{ flexShrink: 0 }}>
                          <span style={{ fontSize: '0.65rem', color: '#94a3b8', display: 'block', fontWeight: 600, whiteSpace: 'nowrap' }}>CLASS</span>
                          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#d4af37', whiteSpace: 'nowrap' }}>FIRST</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right: Ticket Stub Receipt (28% width) */}
                <div style={{
                  width: '28%',
                  padding: '14px 10px',
                  background: '#fffdf6',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  position: 'relative'
                }}>
                  {/* Custom QR Code simulator */}
                  <div style={{
                    width: '42px',
                    height: '42px',
                    background: '#0f172a',
                    padding: '3px',
                    borderRadius: '6px',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, 1fr)',
                    gap: '1.5px'
                  }}>
                    {Array.from({ length: 16 }).map((_, i) => (
                      <div key={i} style={{ background: (i % 3 === 0 || i % 7 === 0) ? '#fff' : '#0f172a' }} />
                    ))}
                  </div>

                  {/* Target Revenue Badge */}
                  <div style={{
                    background: 'linear-gradient(135deg, #d4af37 0%, #b89028 100%)',
                    color: '#fff',
                    fontSize: '0.9rem',
                    fontWeight: 800,
                    padding: '4px 0',
                    borderRadius: '6px',
                    textAlign: 'center',
                    width: '95%',
                    boxShadow: '0 2px 6px rgba(212,175,55,0.4)',
                    letterSpacing: '0.5px'
                  }}>
                    {level.condition}
                  </div>

                  {/* Custom Barcode simulator */}
                  <div style={{ display: 'flex', gap: '1.5px', height: '20px', width: '90%', alignItems: 'stretch', opacity: 0.8 }}>
                    {[1,2,1,3,1,1,2,1,2,1,1,2,1].map((w, idx) => (
                      <div key={idx} style={{ flex: w, background: '#0f172a' }} />
                    ))}
                  </div>
                </div>
              </div>

              {/* Achievers list footer bar */}
              <div style={{
                background: '#fafbfc',
                borderTop: '1px solid #f1f5f9',
                padding: '10px 14px',
                minHeight: '50px',
                display: 'flex',
                alignItems: 'center'
              }}>
                {list.length === 0 ? (
                  <div style={{ fontSize: '0.82rem', color: '#94a3b8', fontStyle: 'italic', width: '100%', textAlign: 'center' }}>
                    Chưa có chiến binh đạt mốc này
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {list.map(emp => {
                      const initials = emp.nhan_vien.split(' ').map((w: string) => w[0]).slice(-2).join('');
                      return (
                        <div key={emp.nhan_vien} style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '7px',
                          background: '#fff',
                          padding: '3px 10px 3px 3px',
                          borderRadius: '20px',
                          border: '1px solid #e2e8f0',
                          boxShadow: '0 1px 4px rgba(0,0,0,0.07)'
                        }}>
                          {emp.avatar_url ? (
                            <img src={emp.avatar_url} alt={emp.nhan_vien} style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }} />
                          ) : (
                            <div style={{
                              width: 28,
                              height: 28,
                              borderRadius: '50%',
                              background: 'linear-gradient(135deg, #d4af37 0%, #b89028 100%)',
                              color: '#fff',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '0.7rem',
                              fontWeight: 700
                            }}>
                              {initials}
                            </div>
                          )}
                          <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#334155' }}>
                            {emp.nhan_vien}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
