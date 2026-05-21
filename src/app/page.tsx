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

// ─── Laurel Wreath Medal Frame ───────────────────────────────────────────────
const WREATH_COLORS = {
  1: { leafHigh:'#FFF08A', leafMid:'#C9960C', leafShd:'#7A5200', ringHigh:'#FFF5A0', ringMid:'#D4AF37', ringDark:'#8B6000', ribTop:'#E8B820', ribBot:'#8B6000', numFill:'#3D1E00' },
  2: { leafHigh:'#F0F0F0', leafMid:'#A8A8A8', leafShd:'#505050', ringHigh:'#FFFFFF',  ringMid:'#C0C0C0', ringDark:'#606060', ribTop:'#D0D0D0', ribBot:'#686868', numFill:'#1a1a1a' },
  3: { leafHigh:'#FFD09A', leafMid:'#A0622A', leafShd:'#5A2800', ringHigh:'#FFD0A0', ringMid:'#B86830', ringDark:'#6B3000', ribTop:'#C87030', ribBot:'#6B3000', numFill:'#2a0e00' },
} as const;

function LaurelWreathMedal({ rank, avatarSize, children }: { rank:1|2|3; avatarSize:number; children:React.ReactNode }) {
  const c   = WREATH_COLORS[rank];
  const aR  = avatarSize / 2;

  // ── Leaf geometry ──────────────────────────────────────────────────────────
  // Orbit tight against the ring so leaves visually grow FROM the medal edge
  const lR  = aR + 10;
  const lHalf = rank === 1 ? 18 : 15;   // half-length of leaf (long axis)
  const lWid  = rank === 1 ? 7  : 6;    // half-width of leaf (short axis)
  const N   = 13;                        // leaves per branch (denser = fuller wreath)

  const pad  = 10;
  const ctr  = aR + pad;
  const svgW = avatarSize + pad * 2;

  // Pointed-oval leaf path (eye/lens shape — sharper than plain ellipse)
  // In local space: extends −lHalf → +lHalf along x, ±lWid along y
  const lPath = `M ${-lHalf},0 C ${-lHalf*0.5},${-lWid} ${lHalf*0.4},${-lWid} ${lHalf},0 C ${lHalf*0.4},${lWid} ${-lHalf*0.5},${lWid} ${-lHalf},0 Z`;

  // Generate leaf positions. rot = d+90 → long axis tangential (wraps the ring).
  // Opacity tapers at the branch ends for a natural fade.
  const mkLeaves = (a0: number, a1: number) =>
    Array.from({ length: N }, (_, i) => {
      const t = i / (N - 1);
      const d = a0 + (a1 - a0) * t;
      const r = d * Math.PI / 180;
      const op = 0.65 + 0.32 * Math.sin(t * Math.PI);   // fade at both ends
      const sc = 0.80 + 0.20 * Math.sin(t * Math.PI);   // smaller at ends
      return { x: ctr + Math.cos(r) * lR, y: ctr + Math.sin(r) * lR, rot: d + 90, op, sc };
    });

  // Left branch  : ~105° (lower-right end) CCW to ~255° (upper-left end)
  // Right branch : mirror — ~75° (lower-left end) CW  to ~−75° (upper-right end)
  // Gap at top (~75°–105° and ~255°–285°) keeps the wreath open at 12 o'clock
  const LL = mkLeaves(105, 255);
  const RL = mkLeaves(75, -75);
  const g  = { lf: `wlf${rank}`, rg: `wrg${rank}`, rb: `wrb${rank}` };

  // Ribbon dimensions
  const ribW = Math.round(avatarSize * 0.72);
  const ribH = 26;
  const tail = 13;
  const ribY = ctr + aR + 12;
  const svgH = ribY + ribH + 12;

  return (
    <div style={{ position:'relative', width:svgW, height:svgH, flexShrink:0 }}>
      <svg width={svgW} height={svgH} viewBox={`0 0 ${svgW} ${svgH}`}
        style={{ position:'absolute', top:0, left:0 }} overflow="visible">
        <defs>
          {/* Leaf gradient: dark stem → bright mid → darker tip */}
          <linearGradient id={g.lf} x1="0%" y1="0%" x2="100%" y2="0%"
            gradientUnits="objectBoundingBox">
            <stop offset="0%"   stopColor={c.leafShd}  stopOpacity="0.8" />
            <stop offset="35%"  stopColor={c.leafMid} />
            <stop offset="65%"  stopColor={c.leafHigh} />
            <stop offset="100%" stopColor={c.leafShd}  stopOpacity="0.7" />
          </linearGradient>
          {/* Metallic ring gradient */}
          <linearGradient id={g.rg} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%"   stopColor={c.ringHigh} />
            <stop offset="40%"  stopColor={c.ringMid} />
            <stop offset="100%" stopColor={c.ringDark} />
          </linearGradient>
          {/* Ribbon gradient */}
          <linearGradient id={g.rb} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%"   stopColor={c.ribTop} />
            <stop offset="100%" stopColor={c.ribBot} />
          </linearGradient>
        </defs>

        {/* Left laurel branch */}
        {LL.map((l, i) => (
          <path key={`ll${i}`} d={lPath}
            fill={`url(#${g.lf})`} opacity={l.op}
            transform={`translate(${l.x},${l.y}) rotate(${l.rot}) scale(${l.sc})`} />
        ))}

        {/* Right laurel branch */}
        {RL.map((l, i) => (
          <path key={`rl${i}`} d={lPath}
            fill={`url(#${g.lf})`} opacity={l.op}
            transform={`translate(${l.x},${l.y}) rotate(${l.rot}) scale(${l.sc})`} />
        ))}

        {/* Metallic ring (renders ON TOP of leaf bases for clean separation) */}
        <circle cx={ctr} cy={ctr} r={aR + 4}
          fill="none" stroke={`url(#${g.rg})`} strokeWidth={rank === 1 ? 5 : 4} />
        {/* Inner shadow ring */}
        <circle cx={ctr} cy={ctr} r={aR + 1}
          fill="none" stroke={c.ringDark} strokeWidth="1.5" opacity="0.35" />

        {/* Ribbon tails */}
        <polygon
          points={`${ctr-ribW/2},${ribY} ${ctr-ribW/2-tail},${ribY+ribH/2} ${ctr-ribW/2},${ribY+ribH}`}
          fill={c.ribBot} opacity={0.9} />
        <polygon
          points={`${ctr+ribW/2},${ribY} ${ctr+ribW/2+tail},${ribY+ribH/2} ${ctr+ribW/2},${ribY+ribH}`}
          fill={c.ribBot} opacity={0.9} />

        {/* Ribbon body */}
        <rect x={ctr-ribW/2} y={ribY} width={ribW} height={ribH} rx={5}
          fill={`url(#${g.rb})`} />
        {/* Sheen highlight */}
        <rect x={ctr-ribW/2+6} y={ribY+5} width={ribW-12} height={1.5} rx={1}
          fill={c.ribTop} opacity={0.50} />

        {/* Rank number */}
        <text x={ctr} y={ribY+ribH-7} textAnchor="middle"
          fontSize={rank===1 ? 17 : 15} fontWeight="900"
          fill={c.numFill} fontFamily="Inter, system-ui, sans-serif">
          {rank}
        </text>
      </svg>

      {/* Avatar circle — floats above the SVG */}
      <div style={{
        position:'absolute', top:pad, left:pad,
        width:avatarSize, height:avatarSize,
        borderRadius:'50%', overflow:'hidden', zIndex:2,
        boxShadow:`0 0 0 3px ${c.ringMid}, 0 0 0 5.5px ${c.ringDark}55, 0 8px 28px ${c.ringDark}80`,
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
                      0% { transform: translateY(-16px); }
                      50% { transform: translateY(-24px); }
                      100% { transform: translateY(-16px); }
                    }
                    @keyframes float-rank-2 {
                      0% { transform: translateY(0px); }
                      50% { transform: translateY(-6px); }
                      100% { transform: translateY(0px); }
                    }
                    @keyframes float-rank-3 {
                      0% { transform: translateY(12px); }
                      50% { transform: translateY(6px); }
                      100% { transform: translateY(12px); }
                    }
                    .floating-platform-1 { animation: float-rank-1 4s ease-in-out infinite; }
                    .floating-platform-2 { animation: float-rank-2 4.3s ease-in-out infinite; }
                    .floating-platform-3 { animation: float-rank-3 4.6s ease-in-out infinite; }
                  `}</style>
                  
                  <div className="podium-container" style={{
                    background: 'radial-gradient(circle at center, #0b1329 0%, #030712 100%)',
                    borderRadius: '20px',
                    padding: isMobile ? '36px 6px 16px' : '72px 16px 20px',
                    minHeight: isMobile ? 'unset' : '440px',
                    display: 'flex',
                    justifyContent: 'space-around',
                    alignItems: 'flex-end',
                    position: 'relative',
                    overflow: 'hidden',
                    border: '1.5px solid rgba(255,255,255,0.03)',
                    boxShadow: 'inset 0 0 60px rgba(0,0,0,0.9), 0 15px 35px rgba(0,0,0,0.5)',
                    gap: '12px'
                  }}>
                    {/* Futuristic mesh background decoration */}
                    <div style={{
                      position: 'absolute', inset: 0,
                      backgroundImage: 'linear-gradient(rgba(99,102,241,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,0.015) 1px, transparent 1px)',
                      backgroundSize: '30px 30px',
                      pointerEvents: 'none',
                      opacity: 0.9
                    }} />

                    {/* Geometric mesh grid (Top right circle glow) */}
                    <div style={{
                      position: 'absolute', top: '-50px', right: '-50px', width: '250px', height: '250px',
                      borderRadius: '50%',
                      background: 'radial-gradient(circle, rgba(99,102,241,0.05) 0%, transparent 70%)',
                      pointerEvents: 'none'
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

                          {/* Name */}
                          <div style={{
                            fontSize: rank === 1 ? '0.82rem' : '0.75rem',
                            fontWeight: 800,
                            color: '#e2b857',
                            textAlign: 'center',
                            marginTop: '6px',
                            width: '100%',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            textShadow: '0 2px 4px rgba(0,0,0,0.9)',
                            zIndex: 3,
                            paddingLeft: '4px',
                            paddingRight: '4px',
                          }}>
                            {sale.nhan_vien}
                          </div>

                          {/* Score Pill */}
                          <div style={{
                            background: 'rgba(255,255,255,0.06)',
                            border: '1px solid rgba(255,255,255,0.08)',
                            borderRadius: '20px',
                            padding: '3px 10px',
                            marginTop: '4px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            zIndex: 3,
                            boxShadow: '0 2px 5px rgba(0,0,0,0.2)',
                          }}>
                            <span style={{
                              fontSize: rank === 1 ? '0.75rem' : '0.7rem',
                              fontWeight: 700,
                              color: '#cbd5e1',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '3px',
                            }}>
                              {formatCurrency(sale.doanh_thu)} <span style={{ color: '#fbbf24' }}>⭐</span>
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
