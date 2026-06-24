'use client';

import { useState, useEffect, useCallback, useRef, Fragment } from 'react';
import type { CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import {
  TrendingUp, TrendingDown, BarChart3,
  DollarSign, Home, Layers, ToggleLeft, ToggleRight, Cake, ChevronDown,
  Users, GitBranch, CheckSquare, ExternalLink, FileText,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, Legend
} from 'recharts';
import type { DashboardData, SinhNhatNhanVien, CrmTotals, TongHopCompareItem, TongHopPhongKD, TongHopDuAn } from '@/lib/types';
import { formatCurrency, formatChange, calcChange } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';

const CHART_COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6'];

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w: string) => w[0])
    .slice(-2)
    .join('');
}

function SafeAvatar({
  src,
  name,
  imgClassName,
  fallbackClassName,
  imgStyle,
  fallbackStyle,
}: {
  src?: string;
  name: string;
  imgClassName?: string;
  fallbackClassName?: string;
  imgStyle?: CSSProperties;
  fallbackStyle?: CSSProperties;
}) {
  const [failed, setFailed] = useState(false);
  if (src && !failed) {
    return (
      <img
        src={src}
        alt={name}
        className={imgClassName}
        style={imgStyle}
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <div className={fallbackClassName} style={fallbackStyle}>
      {getInitials(name)}
    </div>
  );
}

// ─── Cinematic 3D Rank Number ─────────────────────────────────────────────────
// Layered SVG: bloom → extrusion depth → metallic face → specular → rim light

function CinematicRankNumber({ rank, size = 160 }: { rank: 1|2|3; size?: number }) {
  const id = `crn${rank}`;
  const cx = size / 2;
  const fs = Math.round(size * 0.96);  // fills almost full SVG height
  const ty = Math.round(size * 0.84);  // low baseline — number sits flush
  const depth = rank === 1 ? 10 : 8;  // controlled trophy extrusion

  const tiers = {
    1: {
      face: [
        ['0%','#fffdf0'],['4%','#ffe566'],['11%','#d4a010'],
        ['24%','#ffd700'],['38%','#c89010'],['52%','#ffcc20'],
        ['66%','#9a6400'],['82%','#4a2800'],['100%','#1e0e00'],
      ],
      ext: ['#a06000','#3a1600'] as [string,string],
      glow: 'rgba(255,210,0,1)',
      rim: '#fff8a0',
      shim: 'rgba(255,252,180,0.60)',
      spec: 0.95,
    },
    2: {
      face: [
        ['0%','#ffffff'],['4%','#f2f4fc'],['11%','#b0bcd4'],
        ['24%','#dce4f0'],['38%','#8898b8'],['52%','#c4d0e4'],
        ['66%','#606878'],['82%','#282c3c'],['100%','#0c0e16'],
      ],
      ext: ['#485868','#0a0e1a'] as [string,string],
      glow: 'rgba(180,205,255,1)',
      rim: '#e0f0ff',
      shim: 'rgba(220,238,255,0.52)',
      spec: 0.90,
    },
    3: {
      face: [
        ['0%','#fff0d0'],['4%','#f0a030'],['11%','#b06020'],
        ['24%','#e09848'],['38%','#9a4c18'],['52%','#d08030'],
        ['66%','#7a3800'],['82%','#3c1800'],['100%','#180800'],
      ],
      ext: ['#8a3800','#200a00'] as [string,string],
      glow: 'rgba(230,120,10,1)',
      rim: '#ffd888',
      shim: 'rgba(255,210,110,0.52)',
      spec: 0.88,
    },
  } as const;

  const t = tiers[rank];

  return (
    <svg
      width={size} height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{ overflow: 'visible', display: 'block', flexShrink: 0 }}
    >
      <defs>
        {/* Focused cinematic bloom — clipped below to not bleed into name */}
        <filter id={`${id}bl`} x="-60%" y="-70%" width="220%" height="185%" colorInterpolationFilters="linearRGB">
          <feGaussianBlur stdDeviation="10" result="b"/>
          <feBlend in="SourceGraphic" in2="b" mode="screen"/>
        </filter>
        {/* Inner edge glow */}
        <filter id={`${id}ig`} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="5" result="b"/>
          <feComposite in="SourceGraphic" in2="b" operator="over"/>
        </filter>
        {/* Rim glow — screen-blend on stroke */}
        <filter id={`${id}rg`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="5" result="b"/>
          <feBlend in="SourceGraphic" in2="b" mode="screen"/>
        </filter>
        {/* Metallic face — 9 stops */}
        <linearGradient id={`${id}fc`} x1="0" y1="0" x2="0" y2="1">
          {t.face.map(([offset, color]) => (
            <stop key={offset} offset={offset} stopColor={color} />
          ))}
        </linearGradient>
        {/* Extrusion — bottom-right diagonal */}
        <linearGradient id={`${id}ex`} x1="0" y1="0" x2="0.6" y2="1">
          <stop offset="0%"   stopColor={t.ext[0]} />
          <stop offset="100%" stopColor={t.ext[1]} />
        </linearGradient>
        {/* Top specular */}
        <linearGradient id={`${id}sp`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={`rgba(255,255,255,${t.spec})`} />
          <stop offset="20%"  stopColor="rgba(255,255,255,0.58)" />
          <stop offset="44%"  stopColor="rgba(255,255,255,0.10)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </linearGradient>
        {/* Lateral shimmer */}
        <linearGradient id={`${id}sh`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"   stopColor="rgba(255,255,255,0)" />
          <stop offset="30%"  stopColor={t.shim} />
          <stop offset="58%"  stopColor={t.shim} />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </linearGradient>
        <clipPath id={`${id}cl`}>
          <rect x={0} y={ty - fs * 0.94} width={size} height={fs * 0.42} />
        </clipPath>
        <clipPath id={`${id}cl2`}>
          <rect x={0} y={ty - fs * 0.52} width={size} height={fs * 0.22} />
        </clipPath>
      </defs>

      {/* Layer 1: Wide bloom backlight */}
      <text x={cx} y={ty} textAnchor="middle"
        fontSize={fs} fontWeight="900"
        fontFamily="'Inter','Geist',system-ui,sans-serif"
        fill={t.glow} filter={`url(#${id}bl)`} opacity={0.40}
        style={{ userSelect:'none' }}>{rank}</text>

      {/* Layer 2: Deep 3D extrusion — trophy depth */}
      {Array.from({ length: depth }, (_, i) => {
        const step = depth - i;
        return (
          <text key={`e${i}`}
            x={cx + step * 0.45} y={ty + step * 0.95}
            textAnchor="middle" fontSize={fs} fontWeight="900"
            fontFamily="'Inter','Geist',system-ui,sans-serif"
            fill={`url(#${id}ex)`}
            opacity={Math.max(0.18, 0.85 - i * 0.028)}
            style={{ userSelect:'none' }}>{rank}</text>
        );
      })}

      {/* Layer 3: Main metallic face */}
      <text x={cx} y={ty} textAnchor="middle"
        fontSize={fs} fontWeight="900"
        fontFamily="'Inter','Geist',system-ui,sans-serif"
        fill={`url(#${id}fc)`}
        style={{ userSelect:'none' }}>{rank}</text>

      {/* Layer 4: Lateral shimmer */}
      <text x={cx} y={ty} textAnchor="middle"
        fontSize={fs} fontWeight="900"
        fontFamily="'Inter','Geist',system-ui,sans-serif"
        fill={`url(#${id}sh)`}
        style={{ userSelect:'none' }}>{rank}</text>

      {/* Layer 5: Top specular highlight */}
      <text x={cx} y={ty} textAnchor="middle"
        fontSize={fs} fontWeight="900"
        fontFamily="'Inter','Geist',system-ui,sans-serif"
        fill={`url(#${id}sp)`}
        clipPath={`url(#${id}cl)`}
        style={{ userSelect:'none' }}>{rank}</text>

      {/* Layer 6: Mid shine band */}
      <text x={cx} y={ty} textAnchor="middle"
        fontSize={fs} fontWeight="900"
        fontFamily="'Inter','Geist',system-ui,sans-serif"
        fill="rgba(255,255,255,0.18)"
        clipPath={`url(#${id}cl2)`}
        style={{ userSelect:'none' }}>{rank}</text>

      {/* Layer 7: Rim stroke — polished chrome edge */}
      <text x={cx} y={ty} textAnchor="middle"
        fontSize={fs} fontWeight="900"
        fontFamily="'Inter','Geist',system-ui,sans-serif"
        fill="none" stroke={t.rim}
        strokeWidth="2.5" opacity={0.72}
        style={{ userSelect:'none' }}>{rank}</text>

      {/* Layer 8: Rim glow bloom on stroke */}
      <text x={cx} y={ty} textAnchor="middle"
        fontSize={fs} fontWeight="900"
        fontFamily="'Inter','Geist',system-ui,sans-serif"
        fill="none" stroke={t.rim} strokeWidth="6"
        filter={`url(#${id}rg)`} opacity={0.40}
        style={{ userSelect:'none' }}>{rank}</text>

      {/* Layer 9: Soft inner core glow */}
      <text x={cx} y={ty} textAnchor="middle"
        fontSize={fs} fontWeight="900"
        fontFamily="'Inter','Geist',system-ui,sans-serif"
        fill={t.glow} filter={`url(#${id}ig)`}
        opacity={0.14}
        style={{ userSelect:'none' }}>{rank}</text>
    </svg>
  );
}


// Ngày thành lập công ty — mốc bắt đầu cuộc đua CỰC CHIẾN 2026
const RACE_START_DATE = '2025-12-23';

export default function DashboardPage() {
  const { isAdmin } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [raceData, setRaceData] = useState<any[] | null>(null);
  const [period, setPeriod] = useState('month');
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(() => new Date().getFullYear());
  const [showMonthDropdown, setShowMonthDropdown] = useState(false);
  const [showYearDropdown, setShowYearDropdown] = useState(false);
  const monthDropdownRef = useRef<HTMLDivElement>(null);
  const [compare, setCompare] = useState('');
  const [loading, setLoading] = useState(true);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (monthDropdownRef.current && !monthDropdownRef.current.contains(e.target as Node)) {
        setShowMonthDropdown(false);
        setShowYearDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ period });
      if (period === 'month') {
        const mm = String(selectedMonth).padStart(2, '0');
        const lastDay = new Date(selectedYear, selectedMonth, 0).getDate();
        params.set('from', `${selectedYear}-${mm}-01`);
        params.set('to', `${selectedYear}-${mm}-${String(lastDay).padStart(2, '0')}`);
      }
      if (period === 'year') {
        params.set('from', `${selectedYear}-01-01`);
        params.set('to', `${selectedYear}-12-31`);
      }
      if (compare) params.set('compare', compare);
      const res = await fetch(`/api/dashboard?${params}`);
      const result = await res.json();
      if (result.success) setData(result.data);
    } catch (err) {
      console.error('Dashboard fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [period, compare, selectedMonth, selectedYear]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Fetch riêng cho CỰC CHIẾN 2026: tính từ ngày thành lập công ty (23/12/2025)
  // Bao gồm cả các deal ký cuối tháng 12/2025 (23/12, 26/12) vào cuộc đua
  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    fetch(`/api/dashboard?from=${RACE_START_DATE}&to=${today}`)
      .then(r => r.json())
      .then(result => {
        if (result.success) setRaceData(result.data.doanh_thu_theo_sale);
      })
      .catch(err => console.error('Race data fetch error:', err));
  }, []);

  const periods = [
    { value: 'month', label: 'Tháng' },
    { value: 'quarter', label: 'Quý' },
    { value: 'year', label: 'Năm' },
  ];

  // Tính khoảng thời gian hiển thị ở Bảng xếp hạng theo period đang chọn
  const periodDateRange = (() => {
    const fmt = (d: Date) =>
      `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
    const today = new Date();
    let from: Date;
    let to: Date = today;
    switch (period) {
      case 'month': {
        from = new Date(selectedYear, selectedMonth - 1, 1);
        const isCurrentMonth = selectedYear === today.getFullYear() && selectedMonth === today.getMonth() + 1;
        to = isCurrentMonth ? today : new Date(selectedYear, selectedMonth, 0);
        break;
      }
      case 'quarter': {
        const q = Math.floor(today.getMonth() / 3);
        from = new Date(today.getFullYear(), q * 3, 1);
        break;
      }
      case 'year':
        from = new Date(selectedYear, 0, 1);
        to = selectedYear === today.getFullYear() ? today : new Date(selectedYear, 11, 31);
        break;
      default:
        from = new Date(today.getFullYear(), today.getMonth(), 1);
    }
    return `Từ ${fmt(from)} đến ${fmt(to)}`;
  })();

  const renderKpiCard = (
    label: string,
    value: number,
    prevValue: number | undefined,
    icon: React.ReactNode,
    format: 'number' | 'currency' = 'number',
    cardColor?: { icon: string; iconBg: string; value: string; unit?: string }
  ) => {
    const displayValue = format === 'currency' ? formatCurrency(value) : value.toString();
    const change = prevValue !== undefined ? calcChange(value, prevValue) : null;

    return (
      <div className="kpi-card">
        <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
          <span className="kpi-label">{label}</span>
          <div style={{
            width: 40, height: 40, borderRadius: 12,
            background: cardColor?.iconBg ?? 'var(--primary-light)',
            color: cardColor?.icon ?? 'var(--primary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {icon}
          </div>
        </div>
        <div className="kpi-value" style={cardColor ? { color: cardColor.value } : undefined}>
          {displayValue}
          {cardColor?.unit && (
            <span style={{ fontSize: '1rem', fontWeight: 500, marginLeft: 6, color: cardColor.value, opacity: 0.7 }}>
              {cardColor.unit}
            </span>
          )}
        </div>
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
          {/* Period selector — wrapper has position:relative so dropdown escapes toggle-group overflow:hidden */}
          <div ref={monthDropdownRef} style={{ position: 'relative' }}>
            <div className="toggle-group">
              <button
                className={`toggle-btn ${period === 'month' ? 'active' : ''}`}
                style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                onClick={() => { setPeriod('month'); setShowMonthDropdown(v => !v); setShowYearDropdown(false); }}
              >
                {period === 'month' ? `T${selectedMonth}/${selectedYear}` : 'Tháng'}
                <ChevronDown size={13} style={{ opacity: 0.7, transition: 'transform 150ms', transform: showMonthDropdown ? 'rotate(180deg)' : 'none' }} />
              </button>
              <button
                className={`toggle-btn ${period === 'quarter' ? 'active' : ''}`}
                onClick={() => { setPeriod('quarter'); setShowMonthDropdown(false); setShowYearDropdown(false); }}
              >Quý</button>
              <button
                className={`toggle-btn ${period === 'year' ? 'active' : ''}`}
                style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                onClick={() => { setPeriod('year'); setShowYearDropdown(v => !v); setShowMonthDropdown(false); }}
              >
                {period === 'year' ? `${selectedYear}` : 'Năm'}
                <ChevronDown size={13} style={{ opacity: 0.7, transition: 'transform 150ms', transform: showYearDropdown ? 'rotate(180deg)' : 'none' }} />
              </button>
            </div>

            {/* Month dropdown */}
            {showMonthDropdown && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 6px)', left: 0,
                background: 'var(--bg-surface)', border: '1px solid var(--border-light)',
                borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)',
                padding: 8, zIndex: 200,
                display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4,
                minWidth: 192,
              }}>
                {/* Chọn năm trong month dropdown */}
                <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 4, marginBottom: 4, paddingBottom: 6, borderBottom: '1px solid var(--border)' }}>
                  {[2025, 2026].map(y => (
                    <button key={y} onClick={() => {
                      setSelectedYear(y);
                      const curMonth = new Date().getMonth() + 1;
                      const curYear = new Date().getFullYear();
                      if (y === curYear && selectedMonth > curMonth) setSelectedMonth(curMonth);
                    }} style={{
                      flex: 1, padding: '4px 0', borderRadius: 'var(--radius-sm)', border: 'none',
                      cursor: 'pointer', fontSize: 12, fontWeight: 600,
                      background: selectedYear === y ? 'var(--primary)' : 'var(--bg-muted)',
                      color: selectedYear === y ? '#fff' : 'var(--text-body)',
                    }}>{y}</button>
                  ))}
                </div>
                {Array.from({ length: 12 }, (_, i) => i + 1).map(m => {
                  const today = new Date();
                  const isFuture = selectedYear > today.getFullYear() ||
                    (selectedYear === today.getFullYear() && m > today.getMonth() + 1);
                  return (
                    <button
                      key={m}
                      disabled={isFuture}
                      onClick={() => { if (!isFuture) { setSelectedMonth(m); setShowMonthDropdown(false); } }}
                      style={{
                        padding: '6px 4px', borderRadius: 'var(--radius-sm)',
                        border: 'none',
                        cursor: isFuture ? 'not-allowed' : 'pointer',
                        fontSize: 13, fontWeight: 500,
                        background: selectedMonth === m ? 'var(--primary)' : 'transparent',
                        color: isFuture ? 'var(--text-muted)' : selectedMonth === m ? '#fff' : 'var(--text-body)',
                        opacity: isFuture ? 0.4 : 1,
                        transition: 'background var(--transition-fast)',
                      }}
                      onMouseEnter={e => { if (!isFuture && selectedMonth !== m) (e.target as HTMLButtonElement).style.background = 'var(--primary-light)'; }}
                      onMouseLeave={e => { if (!isFuture && selectedMonth !== m) (e.target as HTMLButtonElement).style.background = 'transparent'; }}
                    >
                      T{m}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Year dropdown */}
            {showYearDropdown && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 6px)', right: 0,
                background: 'var(--bg-surface)', border: '1px solid var(--border-light)',
                borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)',
                padding: 8, zIndex: 200,
                display: 'flex', flexDirection: 'column', gap: 4, minWidth: 100,
              }}>
                {[2025, 2026].map(y => (
                  <button key={y} onClick={() => {
                    setSelectedYear(y);
                    setShowYearDropdown(false);
                    const curMonth = new Date().getMonth() + 1;
                    const curYear = new Date().getFullYear();
                    if (y === curYear && selectedMonth > curMonth) setSelectedMonth(curMonth);
                  }} style={{
                    padding: '7px 16px', borderRadius: 'var(--radius-sm)', border: 'none',
                    cursor: 'pointer', fontSize: 14, fontWeight: 600, textAlign: 'center',
                    background: selectedYear === y ? 'var(--primary)' : 'transparent',
                    color: selectedYear === y ? '#fff' : 'var(--text-body)',
                    transition: 'background var(--transition-fast)',
                  }}
                  onMouseEnter={e => { if (selectedYear !== y) (e.target as HTMLButtonElement).style.background = 'var(--primary-light)'; }}
                  onMouseLeave={e => { if (selectedYear !== y) (e.target as HTMLButtonElement).style.background = 'transparent'; }}
                  >{y}</button>
                ))}
              </div>
            )}
          </div>
          {/* Compare toggle — admin only */}
          {isAdmin && (
            <button
              className={`btn ${compare ? 'btn-primary' : 'btn-secondary'} btn-sm`}
              onClick={() => setCompare(compare ? '' : 'prev')}
              title="So sánh cùng kỳ"
            >
              {compare ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
              So sánh
            </button>
          )}
          {/* Báo cáo tổng kết PDF — admin only */}
          {isAdmin && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => router.push('/bao-cao')}
              title="Báo cáo tổng kết 6 tháng (xuất PDF)"
            >
              <FileText size={16} />
              Báo cáo
            </button>
          )}
        </div>
      </div>

      {/* KPI Grid — admin only */}
      {isAdmin && (
        <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          {renderKpiCard(
            'TỔNG DOANH SỐ',
            data.tonghop?.tong_doanh_so ?? data.kpi.doanh_thu,
            undefined,
            <DollarSign size={20} />,
            'currency',
            { icon: '#3b82f6', iconBg: '#eff6ff', value: '#1d4ed8' }
          )}
          {renderKpiCard(
            'TỔNG SỐ CĂN',
            data.tonghop?.tong_so_can ?? data.kpi.da_ky,
            undefined,
            <Home size={20} />,
            'number',
            { icon: '#f59e0b', iconBg: '#fffbeb', value: '#d97706', unit: 'căn' }
          )}
          {renderKpiCard(
            'GIÁ TRỊ TB / CĂN',
            data.tonghop?.gia_tri_tb_can ?? (data.kpi.da_ky > 0 ? Math.round(data.kpi.doanh_thu / data.kpi.da_ky) : 0),
            undefined,
            <Layers size={20} />,
            'currency',
            { icon: '#10b981', iconBg: '#ecfdf5', value: '#059669' }
          )}
        </div>
      )}


      {/* ── Bảng tổng hợp so sánh — admin only ── */}
      {isAdmin && data.tonghop && (
        <TongHopTables tonghop={data.tonghop} isMobile={isMobile} />
      )}

      {/* Hà Nội vs TP.HCM + Doanh thu theo thời gian — cùng hàng */}
      {isAdmin && (
        <div className="charts-grid" style={{ marginBottom: 16 }}>
          {(() => {
            const kv = data.tonghop?.khu_vuc ?? [];
            if (!kv.length) return null;
            const maxKV = Math.max(...kv.map(x => x.doanh_so), 1);
            return (
              <div className="chart-card" style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, height: 38 }}>
                  <GitBranch size={16} style={{ color: '#3b82f6' }} />
                  <span style={{ fontWeight: 800, fontSize: '0.85rem', color: 'var(--text-title)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Hà Nội vs TP.HCM</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'space-evenly' }}>
                  {kv.slice(0, 6).map((k, i) => {
                    const pct = Math.round((k.doanh_so / maxKV) * 100);
                    const barColor = ['#3b82f6', '#10b981', '#f59e0b', '#6366f1'][i % 4];
                    return (
                      <div key={k.loai}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                          <span style={{ fontWeight: 700, color: 'var(--text-title)', fontSize: '0.95rem' }}>{k.loai}</span>
                          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>{k.so_can} căn</span>
                            <span style={{ fontWeight: 800, color: barColor, fontSize: '1.05rem' }}>{formatCurrency(k.doanh_so)}</span>
                          </div>
                        </div>
                        <div style={{ height: 14, borderRadius: 8, background: 'var(--border)' }}>
                          <div style={{ height: '100%', borderRadius: 8, width: `${pct}%`, background: barColor, transition: 'width 0.4s ease' }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
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
      )}

      {/* Middle Row: BXH Sale & Vinh Danh Champion */}
      <div className="charts-grid">
        {/* BXH Sale - Podium + List */}
        <div className="chart-card" style={{ overflow: 'hidden' }}>
          <div className="card-header">
            <div>
              <div className="card-title" style={{ fontWeight: 800, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: 0.5 }}>🏆 Bảng xếp hạng</div>
              <div className="card-subtitle">{periodDateRange}</div>
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
                    padding: isMobile ? '80px 4px 20px' : '80px 20px 28px',
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

                    {/* Sắp xếp: Hạng 2 — Hạng 1 (centre) — Hạng 3 */}
                    {[1, 0, 2].map((rankIdx) => {
                      const sale = data.doanh_thu_theo_sale[rankIdx];
                      if (!sale) return null;
                      const rank = (rankIdx + 1) as 1|2|3;

                      // Ring frame + number below + pedestal — matches reference image
                      // Desktop sizes scaled to fit within 1fr column (~152px/slot on 1440px)
                      const ringSize = isMobile
                        ? (rank === 1 ? 96 : 80)
                        : (rank === 1 ? 148 : 122);
                      const ringThick = isMobile
                        ? (rank === 1 ? 7 : 6)
                        : (rank === 1 ? 10 : 8);
                      const numSize = isMobile
                        ? (rank === 1 ? 74 : 62)
                        : (rank === 1 ? 112 : 92);
                      // Number overlaps bottom 1/10 of ring
                      const numMt = Math.round(-(ringSize * 0.10));
                      const pedestalW = isMobile
                        ? (rank === 1 ? 78 : 64)
                        : (rank === 1 ? 118 : 96);
                      const pedestalH = isMobile
                        ? (rank === 1 ? 14 : 11)
                        : (rank === 1 ? 20 : 16);

                      const tc = ({
                        1: {
                          ringGlow:'rgba(255,210,0,0.65)',
                          score:'#FFE88A', border:'rgba(255,200,0,0.35)',
                          avBg:'linear-gradient(145deg,#7a4800,#c8960c)',
                          beam:'linear-gradient(to top, rgba(255,210,0,0.28) 0%, transparent 80%)',
                          ringGrad:'linear-gradient(145deg, #fff0a0 0%, #d4a010 18%, #ffd700 42%, #b87800 68%, #5a2c00 100%)',
                          pedestalGrad:'linear-gradient(180deg, #ffe040 0%, #c89010 35%, #7a4800 72%, #2e1400 100%)',
                        },
                        2: {
                          ringGlow:'rgba(180,205,255,0.55)',
                          score:'#d8eaff', border:'rgba(160,185,235,0.28)',
                          avBg:'linear-gradient(145deg,#2c3848,#7890b0)',
                          beam:'linear-gradient(to top, rgba(160,185,235,0.20) 0%, transparent 80%)',
                          ringGrad:'linear-gradient(145deg, #ffffff 0%, #a8bcd4 18%, #d4dff0 42%, #7890b0 68%, #1a2030 100%)',
                          pedestalGrad:'linear-gradient(180deg, #d8e4f4 0%, #8090aa 35%, #384050 72%, #101420 100%)',
                        },
                        3: {
                          ringGlow:'rgba(220,120,10,0.55)',
                          score:'#f5c888', border:'rgba(200,110,15,0.30)',
                          avBg:'linear-gradient(145deg,#6a2800,#cd7f32)',
                          beam:'linear-gradient(to top, rgba(210,110,10,0.20) 0%, transparent 80%)',
                          ringGrad:'linear-gradient(145deg, #ffc870 0%, #c07028 18%, #e09848 42%, #8a4018 68%, #281000 100%)',
                          pedestalGrad:'linear-gradient(180deg, #e09030 0%, #904020 35%, #4a1c08 72%, #180800 100%)',
                        },
                      } as const)[rank];

                      return (
                        <div key={sale.nhan_vien}
                          className={`floating-platform-${rank}`}
                          style={{
                            flex: 1,
                            maxWidth: isMobile
                              ? (rank === 1 ? '120px' : '102px')
                              : (rank === 1 ? '200px' : '168px'),
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            position: 'relative',
                            zIndex: rank === 1 ? 5 : 2,
                            gap: 0,
                          }}>

                          {/* Stage spotlight beam */}
                          <div style={{
                            position: 'absolute',
                            bottom: '30px',
                            width: isMobile
                              ? (rank === 1 ? '86px' : '72px')
                              : (rank === 1 ? '196px' : '162px'),
                            height: isMobile ? '150px' : '320px',
                            background: tc.beam,
                            clipPath: 'polygon(14% 0%, 86% 0%, 100% 100%, 0% 100%)',
                            pointerEvents: 'none',
                            zIndex: 1,
                            opacity: 0.70,
                          }} />

                          {/* ── Rank 1 luxury crown ── */}
                          {rank === 1 && (() => {
                            const crownW = Math.round(ringSize * 0.57);
                            const crownH = Math.round(crownW * 0.695);
                            const crownOverlap = Math.round(ringSize * 0.115);
                            return (
                              <div style={{
                                position: 'absolute',
                                top: -(crownH - crownOverlap),
                                left: '50%',
                                transform: 'translateX(-50%)',
                                width: crownW,
                                height: crownH,
                                zIndex: 15,
                                pointerEvents: 'none',
                                filter: [
                                  'drop-shadow(0 0 12px rgba(255,200,0,0.75))',
                                  'drop-shadow(0 0 4px rgba(255,160,0,0.50))',
                                  'drop-shadow(0 5px 10px rgba(0,0,0,0.85))',
                                ].join(' '),
                              }}>
                                <svg viewBox="0 0 80 56" fill="none" xmlns="http://www.w3.org/2000/svg"
                                     style={{ width: '100%', height: '100%', overflow: 'visible' }}>
                                  <defs>
                                    <linearGradient id="rlcg1" x1="0" y1="0" x2="0" y2="1">
                                      <stop offset="0%"  stopColor="#fffce4"/>
                                      <stop offset="10%" stopColor="#ffe566"/>
                                      <stop offset="36%" stopColor="#d4a010"/>
                                      <stop offset="66%" stopColor="#9a6400"/>
                                      <stop offset="100%" stopColor="#4a2800"/>
                                    </linearGradient>
                                    <linearGradient id="rlcb1" x1="0" y1="0" x2="0" y2="1">
                                      <stop offset="0%"  stopColor="#ffe566"/>
                                      <stop offset="32%" stopColor="#c89010"/>
                                      <stop offset="100%" stopColor="#3c1a00"/>
                                    </linearGradient>
                                    <linearGradient id="rlch1" x1="0.08" y1="0" x2="0.92" y2="1">
                                      <stop offset="0%"   stopColor="rgba(255,255,255,0.62)"/>
                                      <stop offset="45%"  stopColor="rgba(255,255,255,0.10)"/>
                                      <stop offset="100%" stopColor="rgba(255,255,255,0)"/>
                                    </linearGradient>
                                    <linearGradient id="rlcedge" x1="0" y1="0" x2="0" y2="1">
                                      <stop offset="0%"   stopColor="rgba(255,252,180,0.70)"/>
                                      <stop offset="55%"  stopColor="rgba(220,170,20,0.30)"/>
                                      <stop offset="100%" stopColor="rgba(80,40,0,0.10)"/>
                                    </linearGradient>
                                    <radialGradient id="rlcdiamond" cx="36%" cy="30%" r="64%">
                                      <stop offset="0%"   stopColor="#ffffff"/>
                                      <stop offset="38%"  stopColor="#ddf0ff"/>
                                      <stop offset="100%" stopColor="#88b4d0"/>
                                    </radialGradient>
                                    <radialGradient id="rlcruby" cx="38%" cy="32%" r="60%">
                                      <stop offset="0%"   stopColor="#ff9090"/>
                                      <stop offset="52%"  stopColor="#cc0010"/>
                                      <stop offset="100%" stopColor="#680008"/>
                                    </radialGradient>
                                    <radialGradient id="rlcemerald" cx="38%" cy="32%" r="60%">
                                      <stop offset="0%"   stopColor="#88ffa0"/>
                                      <stop offset="52%"  stopColor="#007c1e"/>
                                      <stop offset="100%" stopColor="#003c0e"/>
                                    </radialGradient>
                                  </defs>

                                  {/* Shadow layer behind crown */}
                                  <path d="M4,53 L4,27 L20,8 L29,30 L40,2 L51,30 L60,8 L76,27 L76,53 Z"
                                        fill="rgba(0,0,0,0.35)" transform="translate(0,3)"/>

                                  {/* Crown body */}
                                  <path d="M4,53 L4,27 L20,8 L29,30 L40,2 L51,30 L60,8 L76,27 L76,53 Z"
                                        fill="url(#rlcg1)"/>

                                  {/* Crown outer edge highlight */}
                                  <path d="M4,53 L4,27 L20,8 L29,30 L40,2 L51,30 L60,8 L76,27 L76,53"
                                        fill="none" stroke="url(#rlcedge)" strokeWidth="1.4" strokeLinejoin="round"/>

                                  {/* Diagonal shine — left face */}
                                  <ellipse cx="26" cy="22" rx="8.5" ry="13"
                                           fill="url(#rlch1)" transform="rotate(-28 26 22)" opacity="0.42"/>

                                  {/* Diagonal shine — right face (mirrored, softer) */}
                                  <ellipse cx="54" cy="22" rx="8.5" ry="13"
                                           fill="url(#rlch1)" transform="scale(-1,1) translate(-80,0) rotate(-28 26 22)" opacity="0.25"/>

                                  {/* Base band */}
                                  <rect x="4" y="42" width="72" height="11.5" rx="2.5" fill="url(#rlcb1)"/>
                                  {/* Band top edge shine */}
                                  <rect x="4" y="42" width="72" height="2" rx="1.2" fill="rgba(255,250,160,0.38)"/>
                                  {/* Band bottom shadow */}
                                  <rect x="4" y="51.5" width="72" height="1.5" rx="0.8" fill="rgba(0,0,0,0.42)"/>

                                  {/* Center peak gem — diamond */}
                                  <circle cx="40" cy="4.8" r="4.4" fill="url(#rlcdiamond)"/>
                                  <circle cx="40" cy="4.8" r="4.4" fill="none" stroke="rgba(255,255,255,0.62)" strokeWidth="0.5"/>
                                  <circle cx="38.3" cy="3.1" r="1.4" fill="rgba(255,255,255,0.96)"/>
                                  <circle cx="41.8" cy="5.8" r="0.65" fill="rgba(255,255,255,0.65)"/>

                                  {/* Left peak gem — ruby */}
                                  <circle cx="20" cy="10.8" r="3.4" fill="url(#rlcruby)"/>
                                  <circle cx="20" cy="10.8" r="3.4" fill="none" stroke="rgba(255,160,160,0.45)" strokeWidth="0.4"/>
                                  <circle cx="18.7" cy="9.5" r="1.1" fill="rgba(255,210,210,0.90)"/>

                                  {/* Right peak gem — emerald */}
                                  <circle cx="60" cy="10.8" r="3.4" fill="url(#rlcemerald)"/>
                                  <circle cx="60" cy="10.8" r="3.4" fill="none" stroke="rgba(160,255,160,0.45)" strokeWidth="0.4"/>
                                  <circle cx="58.7" cy="9.5" r="1.1" fill="rgba(210,255,210,0.90)"/>

                                  {/* Valley accent beads */}
                                  <circle cx="29" cy="31" r="1.7" fill="#ffe066" opacity="0.70"/>
                                  <circle cx="51" cy="31" r="1.7" fill="#ffe066" opacity="0.70"/>

                                  {/* Band center ruby ornament */}
                                  <circle cx="40" cy="47.5" r="3.3" fill="url(#rlcruby)"/>
                                  <circle cx="40" cy="47.5" r="3.3" fill="none" stroke="rgba(255,160,160,0.35)" strokeWidth="0.4"/>
                                  <circle cx="38.8" cy="46.2" r="1.05" fill="rgba(255,200,200,0.85)"/>

                                  {/* Band side gold accents */}
                                  <circle cx="26" cy="47.5" r="2.1" fill="#ffe066" opacity="0.82"/>
                                  <circle cx="54" cy="47.5" r="2.1" fill="#ffe066" opacity="0.82"/>
                                  <circle cx="14" cy="47.5" r="1.45" fill="#ffd030" opacity="0.62"/>
                                  <circle cx="66" cy="47.5" r="1.45" fill="#ffd030" opacity="0.62"/>
                                </svg>
                              </div>
                            );
                          })()}

                          {/* ── Thick 3D metallic ring frame ── */}
                          <div style={{
                            position: 'relative',
                            width: ringSize,
                            height: ringSize,
                            borderRadius: '50%',
                            background: tc.ringGrad,
                            padding: ringThick,
                            boxShadow: [
                              `0 0 ${rank === 1 ? 50 : 34}px ${tc.ringGlow}`,
                              `inset 0 ${ringThick * 0.5}px ${ringThick}px rgba(255,255,255,0.30)`,
                              `inset 0 -${ringThick * 0.5}px ${ringThick}px rgba(0,0,0,0.50)`,
                              `0 ${rank === 1 ? 14 : 10}px ${rank === 1 ? 44 : 30}px rgba(0,0,0,0.75)`,
                            ].join(', '),
                            zIndex: 3,
                            flexShrink: 0,
                          }}>
                            {/* Avatar inside ring */}
                            <div style={{
                              width: '100%',
                              height: '100%',
                              borderRadius: '50%',
                              overflow: 'hidden',
                              background: tc.avBg,
                            }}>
                              <SafeAvatar
                                src={sale.avatar_url}
                                name={sale.nhan_vien}
                                imgStyle={{ width:'100%', height:'100%', objectFit:'cover', objectPosition:'top center' }}
                                fallbackStyle={{
                                  width:'100%', height:'100%',
                                  display:'flex', alignItems:'center', justifyContent:'center',
                                  background: tc.avBg,
                                  fontSize: Math.round((ringSize - ringThick * 2) * 0.36),
                                  fontWeight: 800, color: '#fff', letterSpacing: '-1px',
                                }}
                              />
                            </div>
                          </div>

                          {/* ── 3D rank number — bloom clipped at bottom so name stays visible ── */}
                          <div style={{
                            position: 'relative',
                            zIndex: 5,
                            marginTop: `${numMt}px`,
                            flexShrink: 0,
                            overflow: 'hidden',
                            paddingBottom: isMobile ? '4px' : '8px',
                          }}>
                            <CinematicRankNumber rank={rank} size={numSize} />
                          </div>

                          {/* ── Trophy pedestal base ── */}
                          <div style={{
                            width: pedestalW,
                            height: pedestalH,
                            background: tc.pedestalGrad,
                            borderRadius: '6px 6px 10px 10px',
                            marginTop: '-8px',
                            flexShrink: 0,
                            position: 'relative',
                            zIndex: 6,
                            boxShadow: [
                              '0 8px 24px rgba(0,0,0,0.60)',
                              'inset 0 1px 0 rgba(255,255,255,0.22)',
                              'inset 0 -3px 6px rgba(0,0,0,0.45)',
                            ].join(', '),
                          }} />

                          {/* Name */}
                          <div style={{
                            fontSize: rank === 1
                              ? (isMobile ? '0.68rem' : '1.00rem')
                              : (isMobile ? '0.62rem' : '0.88rem'),
                            fontWeight: 700,
                            color: '#ffffff',
                            textAlign: 'center',
                            marginTop: isMobile ? '6px' : '12px',
                            width: '100%',
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                            textShadow: `0 0 18px ${tc.ringGlow}, 0 2px 6px rgba(0,0,0,0.95)`,
                            position: 'relative',
                            zIndex: 7,
                            paddingLeft: '6px', paddingRight: '6px',
                            letterSpacing: '0.01em',
                          }}>
                            {sale.nhan_vien}
                          </div>

                          {/* Revenue pill */}
                          <div style={{
                            background: 'rgba(0,0,0,0.60)',
                            border: `1px solid ${tc.border}`,
                            borderRadius: '20px',
                            padding: isMobile ? '3px 10px' : '4px 14px',
                            marginTop: isMobile ? '4px' : '6px',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            position: 'relative',
                            zIndex: 7,
                            boxShadow: '0 2px 12px rgba(0,0,0,0.5)',
                          }}>
                            <span style={{
                              fontSize: rank === 1
                                ? (isMobile ? '0.60rem' : '0.84rem')
                                : (isMobile ? '0.56rem' : '0.76rem'),
                              fontWeight: 700,
                              color: tc.score,
                              display: 'flex', alignItems: 'center', gap: '4px',
                              fontVariantNumeric: 'tabular-nums',
                            }}>
                              {formatCurrency(sale.doanh_thu)} <span style={{ opacity: 0.88 }}>⭐</span>
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
                    {data.doanh_thu_theo_sale.slice(3).map((sale, i) => {
                      const rank = i + 4;
                      const AVATAR_COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#14b8a6'];
                      const color = AVATAR_COLORS[(rank - 1) % AVATAR_COLORS.length];
                      return (
                        <div key={sale.nhan_vien} className="leaderboard-row">
                          <div className="leaderboard-rank">{rank}</div>
                          <SafeAvatar
                            src={sale.avatar_url}
                            name={sale.nhan_vien}
                            imgClassName="leaderboard-avatar-initials"
                            fallbackClassName="leaderboard-avatar-initials"
                            fallbackStyle={{ background: color }}
                          />
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
                    return (
                      <div key={sale.nhan_vien} className="leaderboard-row">
                        <div className="leaderboard-rank" style={{ background: '#fffbeb', color: '#b45309' }}>
                          {i + 1}
                        </div>
                        <SafeAvatar
                          src={sale.avatar_url}
                          name={sale.nhan_vien}
                          imgClassName="leaderboard-avatar-initials"
                          fallbackClassName="leaderboard-avatar-initials"
                          fallbackStyle={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}
                        />
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

        {/* Vinh danh Global Champion — dữ liệu từ 23/12/2025 (ngày thành lập) */}
        <GlobalChampionWidget data={raceData ?? data.doanh_thu_theo_sale} />
      </div>

      {/* Sinh nhật nhân viên */}
      <div style={{ marginTop: 24 }}>
        <BirthdayWidget employees={data.sinh_nhat_thang_nay} />
      </div>
    </div>
  );
}

// ─── TongHop Tables ──────────────────────────────────────────────────────────

function TongHopTables({ tonghop, isMobile }: { tonghop: NonNullable<DashboardData['tonghop']>; isMobile?: boolean }) {
  const fmtTy = (v: number) => {
    if (v >= 1e9) return `${(v / 1e9).toFixed(1)} TỶ`;
    if (v >= 1e6) return `${(v / 1e6).toFixed(0)} TR`;
    return formatCurrency(v);
  };

  const maxPhongKD = Math.max(...(tonghop.top_phong_kd.map(p => p.doanh_so) || [1]), 1);

  const SoSanhCard = ({
    title, icon, items, color1, color2,
  }: {
    title: string;
    icon: React.ReactNode;
    items: TongHopCompareItem[];
    color1: string;
    color2: string;
  }) => {
    if (!items || items.length === 0) return null;
    const total_can = items.reduce((s, x) => s + x.so_can, 0) || 1;
    const total_ds  = items.reduce((s, x) => s + x.doanh_so, 0) || 1;
    const colors = [color1, color2, '#94a3b8', '#f59e0b'];
    const pieData = items.map(x => ({ name: x.loai, value: x.doanh_so }));

    const donutSize  = isMobile ? 120 : 160;
    const innerR     = isMobile ? 30  : 42;
    const outerR     = isMobile ? 54  : 74;

    return (
      <div className="chart-card" style={{ padding: '18px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          {icon}
          <span style={{ fontWeight: 800, fontSize: '0.85rem', color: 'var(--text-title)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{title}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? 12 : 20, alignItems: isMobile ? 'center' : 'center' }}>
          {/* Donut — nhỏ hơn trên mobile để tránh tràn */}
          <div style={{ width: donutSize, height: donutSize, flexShrink: 0 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  cx="50%" cy="50%"
                  innerRadius={innerR} outerRadius={outerR}
                  strokeWidth={2} stroke="#fff"
                  labelLine={false}
                  label={({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) => {
                    if (percent < 0.06) return null;
                    const RADIAN = Math.PI / 180;
                    const r = innerRadius + (outerRadius - innerRadius) * 0.5;
                    const x = cx + r * Math.cos(-midAngle * RADIAN);
                    const y = cy + r * Math.sin(-midAngle * RADIAN);
                    return (
                      <text x={x} y={y} fill="#fff" textAnchor="middle" dominantBaseline="central"
                            fontSize={isMobile ? 10 : 11} fontWeight={700} style={{ pointerEvents: 'none' }}>
                        {`${(percent * 100).toFixed(1)}%`}
                      </text>
                    );
                  }}
                >
                  {pieData.map((_, i) => <Cell key={i} fill={colors[i % colors.length]} />)}
                </Pie>
                <Tooltip formatter={(v) => fmtTy(Number(v))} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          {/* Table — single grid so all rows share the same column widths */}
          <div style={{ flex: 1, minWidth: 0, width: isMobile ? '100%' : undefined }}>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 38px 76px' : '1fr 44px 88px', rowGap: 8, columnGap: isMobile ? 8 : 12, alignItems: 'center' }}>
              {/* Header */}
              <span style={{ fontSize: '0.78rem', color: 'var(--text-label)', fontWeight: 600 }}>Loại</span>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-label)', fontWeight: 600, textAlign: 'right' }}>Số căn</span>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-label)', fontWeight: 600, textAlign: 'right' }}>Doanh số</span>

              {/* Data rows — Fragment with key renders no DOM wrapper, children go directly into grid */}
              {items.map((x, i) => (
                <Fragment key={x.loai}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 10, height: 10, borderRadius: 2, background: colors[i % colors.length], flexShrink: 0 }} />
                    <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-body)', whiteSpace: 'nowrap' }}>{x.loai}</span>
                  </div>
                  <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-title)', textAlign: 'right' }}>
                    {x.so_can}
                  </span>
                  <span style={{ fontSize: '0.82rem', fontWeight: 700, color: colors[i % colors.length], textAlign: 'right' }}>
                    {fmtTy(x.doanh_so)}
                  </span>
                </Fragment>
              ))}

              {/* Total row */}
              <Fragment key="total">
                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-title)', borderTop: '1px solid var(--border)', paddingTop: 6 }}>Tổng</span>
                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-title)', textAlign: 'right', borderTop: '1px solid var(--border)', paddingTop: 6 }}>{total_can}</span>
                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-title)', textAlign: 'right', borderTop: '1px solid var(--border)', paddingTop: 6 }}>{fmtTy(total_ds)}</span>
              </Fragment>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const maxDuAn = Math.max(...(tonghop.top_du_an.map(d => d.doanh_so) || [1]), 1);
  const rankColors = ['#f59e0b', '#94a3b8', '#b45309', '#6366f1', '#10b981'];
  const barColors  = ['#f59e0b', '#6366f1', '#10b981', '#3b82f6', '#ec4899', '#8b5cf6', '#ef4444', '#14b8a6', '#f97316', '#06b6d4'];

  return (
    <div style={{ marginBottom: 24 }}>
      {/* Row 1: Top Dự Án + Top Phòng KD — half width each */}
      {(tonghop.top_du_an.length > 0 || tonghop.top_phong_kd.length > 0) && (
        <div className="charts-grid" style={{ marginBottom: 16 }}>
          {/* Top Dự Án */}
          {tonghop.top_du_an.length > 0 && (
            <div className="chart-card" style={{ padding: '18px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, height: 38 }}>
                <span style={{ fontSize: '1rem' }}>🏆</span>
                <span style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--text-title)', letterSpacing: 0.5 }}>
                  TOP {tonghop.top_du_an.length} DỰ ÁN
                </span>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 24, fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-label)' }}>
                  <span>Doanh số</span>
                  <span>Số căn</span>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {tonghop.top_du_an.map((d, i) => {
                  const pct = Math.round((d.doanh_so / maxDuAn) * 100);
                  const rankBg = i < 3 ? rankColors[i] : 'var(--bg-muted)';
                  const rankText = i < 3 ? '#fff' : 'var(--text-label)';
                  const bar = barColors[i % barColors.length];
                  return (
                    <div key={d.ten}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 5, minHeight: 24 }}>
                        <div style={{
                          width: 24, height: 24, borderRadius: 6, flexShrink: 0,
                          background: rankBg, color: rankText,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '0.72rem', fontWeight: 800,
                        }}>{i + 1}</div>
                        <span style={{ flex: 1, fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-title)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {d.ten}
                        </span>
                        <span style={{ fontWeight: 800, fontSize: '0.9rem', color: bar, minWidth: 72, textAlign: 'right' }}>
                          {fmtTy(d.doanh_so)}
                        </span>
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem', minWidth: 52, textAlign: 'right' }}>
                          {d.so_can} căn
                        </span>
                      </div>
                      <div style={{ height: 7, borderRadius: 4, background: 'var(--border)', marginLeft: 34 }}>
                        <div style={{
                          height: '100%', borderRadius: 4,
                          width: `${pct}%`,
                          background: bar,
                          transition: 'width 0.4s ease',
                        }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Top 5 Phòng KD */}
          {tonghop.top_phong_kd.length > 0 && (
            <div className="chart-card" style={{ padding: '18px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, height: 38 }}>
                <BarChart3 size={16} style={{ color: '#f59e0b' }} />
                <span style={{ fontWeight: 800, fontSize: '0.85rem', color: 'var(--text-title)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Top 5 Phòng kinh doanh</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {tonghop.top_phong_kd.map((p, i) => (
                  <div key={p.ten}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, minHeight: 24, alignItems: 'center', fontSize: '0.8rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontWeight: 700, color: '#f59e0b', width: 18, textAlign: 'center' }}>{i + 1}</span>
                        <span style={{ fontWeight: 600, color: 'var(--text-title)' }}>{p.ten}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{p.so_can} căn</span>
                        <span style={{ fontWeight: 700, color: '#f59e0b' }}>{fmtTy(p.doanh_so)}</span>
                      </div>
                    </div>
                    <div style={{ height: 7, borderRadius: 4, background: 'var(--border)' }}>
                      <div style={{
                        height: '100%', borderRadius: 4,
                        width: `${Math.round((p.doanh_so / maxPhongKD) * 100)}%`,
                        background: ['#6366f1', '#10b981', '#f59e0b', '#3b82f6', '#ec4899'][i % 5],
                        transition: 'width 0.4s ease',
                      }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Row 2: Cao tầng/Thấp tầng + Nội bộ/Đối tác */}
      {(tonghop.loai_hinh.length > 0 || tonghop.loai_nguon.length > 0) && (
        <div className="charts-grid" style={{ marginBottom: 16 }}>
          <SoSanhCard
            title="Cao tầng vs Thấp tầng"
            icon={<Layers size={16} style={{ color: '#6366f1' }} />}
            items={tonghop.loai_hinh}
            color1="#6366f1"
            color2="#f59e0b"
          />
          <SoSanhCard
            title="Nội bộ vs Đối tác"
            icon={<Users size={16} style={{ color: '#10b981' }} />}
            items={tonghop.loai_nguon}
            color1="#10b981"
            color2="#f472b6"
          />
        </div>
      )}

    </div>
  );
}

// ─── CRM Module Health Cards ─────────────────────────────────────────────────

function CrmModuleCards({ totals }: { totals: CrmTotals }) {
  const cards = [
    {
      href: '/khach-hang',
      icon: <Users size={20} />,
      label: 'Khách hàng',
      accent: '#6366f1',
      accentLight: '#eef2ff',
      primary: totals.kh_total,
      primaryLabel: 'tổng',
      badge: `+${totals.kh_moi_thang} tháng này`,
      badgeColor: '#15803d',
      badgeBg: '#dcfce7',
      rows: totals.kh_by_nguon,
    },
    {
      href: '/pipeline',
      icon: <GitBranch size={20} />,
      label: 'Pipeline',
      accent: '#f59e0b',
      accentLight: '#fffbeb',
      primary: totals.pipeline_active,
      primaryLabel: 'đang xử lý',
      badge: `${totals.pipeline_total} tổng`,
      badgeColor: '#92400e',
      badgeBg: '#fef3c7',
      rows: totals.pipeline_by_stage,
    },
    {
      href: '/cong-viec',
      icon: <CheckSquare size={20} />,
      label: 'Công việc',
      accent: '#10b981',
      accentLight: '#ecfdf5',
      primary: totals.cv_total,
      primaryLabel: 'tổng',
      badge: (() => {
        const chua = totals.cv_by_status.find(s => s.label === 'Chưa xử lý')?.count ?? 0;
        return chua > 0 ? `${chua} chưa xử lý` : 'Tất cả đã xử lý';
      })(),
      badgeColor: (() => {
        const chua = totals.cv_by_status.find(s => s.label === 'Chưa xử lý')?.count ?? 0;
        return chua > 0 ? '#92400e' : '#15803d';
      })(),
      badgeBg: (() => {
        const chua = totals.cv_by_status.find(s => s.label === 'Chưa xử lý')?.count ?? 0;
        return chua > 0 ? '#fef3c7' : '#dcfce7';
      })(),
      rows: totals.cv_by_status,
    },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16, marginBottom: 24 }}>
      {cards.map(card => (
        <a key={card.href} href={card.href} style={{ textDecoration: 'none' }}>
          <div style={{
            background: 'var(--bg-card)',
            border: '1.5px solid var(--border)',
            borderRadius: 14,
            padding: '16px 18px',
            cursor: 'pointer',
            transition: 'box-shadow 0.15s, border-color 0.15s',
          }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLDivElement).style.boxShadow = `0 4px 20px ${card.accent}22`;
              (e.currentTarget as HTMLDivElement).style.borderColor = card.accent + '55';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLDivElement).style.boxShadow = '';
              (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border)';
            }}
          >
            {/* Card header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 38, height: 38, borderRadius: 10,
                  background: card.accentLight, color: card.accent,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {card.icon}
                </div>
                <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-title)' }}>{card.label}</span>
              </div>
              <ExternalLink size={14} color="var(--text-muted)" />
            </div>

            {/* Primary count */}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 8 }}>
              <span style={{ fontSize: '2rem', fontWeight: 800, color: card.accent, lineHeight: 1 }}>
                {card.primary}
              </span>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                {card.primaryLabel}
              </span>
              <span style={{
                marginLeft: 'auto',
                fontSize: '0.72rem', fontWeight: 600,
                padding: '2px 8px', borderRadius: 20,
                background: card.badgeBg, color: card.badgeColor,
              }}>
                {card.badge}
              </span>
            </div>

            {/* Breakdown rows */}
            {card.rows.length > 0 && (
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 5 }}>
                {card.rows.slice(0, 5).map(row => {
                  const total = card.rows.reduce((s, r) => s + r.count, 0) || 1;
                  const pct = Math.round((row.count / total) * 100);
                  return (
                    <div key={row.label}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-body)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>
                          {row.label}
                        </span>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: row.color ?? card.accent }}>
                          {row.count}
                        </span>
                      </div>
                      <div style={{ height: 4, borderRadius: 4, background: 'var(--border)' }}>
                        <div style={{ height: '100%', borderRadius: 4, width: `${pct}%`, background: row.color ?? card.accent, transition: 'width 0.4s ease' }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </a>
      ))}
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
    <div className="chart-card">
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
            <div className="card-title" style={{ fontWeight: 800, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: 0.5 }}>🎂 Sinh nhật nhân viên</div>
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
                <SafeAvatar
                  src={emp.avatar_url}
                  name={emp.ho_ten}
                  imgStyle={{
                      width: 64, height: 64, borderRadius: '50%',
                      objectFit: 'cover',
                      border: isToday ? '3px solid #f59e0b' : '3px solid #e2e8f0',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
                    }}
                  fallbackStyle={{
                    width: 64, height: 64, borderRadius: '50%',
                    background: grad,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 22, fontWeight: 700, color: '#fff',
                    border: isToday ? '3px solid #f59e0b' : '3px solid transparent',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                    flexShrink: 0,
                  }}
                />

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
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia('(max-width: 768px)');
    setIsMobile(mql.matches);
    const h = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener('change', h);
    return () => mql.removeEventListener('change', h);
  }, []);
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
    <div className="chart-card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', border: '1.5px solid #d4af37', height: '100%', boxSizing: 'border-box' }}>
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
      <div style={{ flex: 1, padding: '16px', display: 'flex', flexDirection: 'column', justifyContent: 'space-evenly', background: '#f8fafc', overflowY: 'auto' }}>
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
              <div style={{ display: 'flex', height: isMobile ? 'auto' : '148px', minHeight: isMobile ? '120px' : undefined }}>
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
                  <div style={{ display: 'flex', gap: isMobile ? '10px' : '14px', marginTop: '10px', alignItems: 'center' }}>
                    {/* Destination Symbol Pic */}
                    <img
                      src={level.bgImg}
                      alt={level.title}
                      loading="lazy"
                      onError={e => {
                        const el = e.currentTarget;
                        el.style.display = 'none';
                        const fb = el.nextElementSibling as HTMLElement | null;
                        if (fb) fb.style.display = 'flex';
                      }}
                      style={{
                        width: isMobile ? '80px' : '112px',
                        height: isMobile ? '56px' : '72px',
                        borderRadius: '8px',
                        objectFit: 'cover',
                        border: '1px solid #e2e8f0',
                        boxShadow: '0 2px 6px rgba(0,0,0,0.12)',
                        flexShrink: 0
                      }}
                    />
                    {/* Fallback khi ảnh không load được */}
                    <div style={{
                      display: 'none',
                      width: isMobile ? '80px' : '112px',
                      height: isMobile ? '56px' : '72px',
                      borderRadius: '8px',
                      background: `linear-gradient(135deg, ${level.color}33, ${level.color}88)`,
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: isMobile ? '22px' : '32px',
                      flexShrink: 0,
                      border: `1px solid ${level.color}55`,
                    }}>
                      {level.id === 'europe' ? '🗼' : level.id === 'japan' ? '🗾' : '🌴'}
                    </div>

                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 700, letterSpacing: '0.5px' }}>DESTINATION:</div>
                      <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a', lineHeight: 1.15, marginTop: 2 }}>{level.title}</div>

                      <div style={{ display: 'flex', gap: isMobile ? '8px' : '12px', marginTop: '6px', flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
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

                {/* Right: Ticket Stub Receipt (30% width) */}
                <div style={{
                  width: '30%',
                  padding: '14px 10px',
                  background: '#fffdf6',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  alignItems: 'center',
                  gap: '14px',
                  position: 'relative'
                }}>
                  {/* Target Revenue Badge — main visual anchor */}
                  <div style={{
                    background: 'linear-gradient(135deg, #d4af37 0%, #b89028 100%)',
                    color: '#fff',
                    fontSize: '1.05rem',
                    fontWeight: 900,
                    padding: '10px 6px',
                    borderRadius: '8px',
                    textAlign: 'center',
                    width: '100%',
                    boxShadow: '0 3px 10px rgba(212,175,55,0.45)',
                    letterSpacing: '0.5px',
                    lineHeight: 1.2,
                  }}>
                    {level.condition}
                  </div>

                  {/* Barcode simulator */}
                  <div style={{ display: 'flex', gap: '1.5px', height: '22px', width: '92%', alignItems: 'stretch', opacity: 0.75 }}>
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
                          <SafeAvatar
                            src={emp.avatar_url}
                            name={emp.nhan_vien}
                            imgStyle={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }}
                            fallbackStyle={{
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
                            }}
                          />
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
