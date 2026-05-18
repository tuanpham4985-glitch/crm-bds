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

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [period, setPeriod] = useState('month');
  const [compare, setCompare] = useState('');
  const [loading, setLoading] = useState(true);

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
                <div className="podium-container">
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

                    return (
                      <div key={sale.nhan_vien} className="podium-item">
                        <div className="podium-avatar-wrapper">
                          {rank === 1 && <span className="podium-crown">👑</span>}
                          {sale.avatar_url ? (
                            <img 
                              src={sale.avatar_url} 
                              alt={sale.nhan_vien}
                              className="podium-avatar-initials"
                            />
                          ) : (
                            <div className="podium-avatar-initials">
                              {initials}
                            </div>
                          )}
                        </div>
                        <div className="podium-name">{sale.nhan_vien}</div>
                        <div className="podium-score">
                          {formatCurrency(sale.doanh_thu)} ⭐
                        </div>
                        <div className="podium-block">{rank}</div>
                      </div>
                    );
                  })}
                </div>
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
      bgImg: 'https://images.unsplash.com/photo-1499856871958-5b9627545d1a?q=80&w=800&auto=format&fit=crop',
      color: '#fbbf24',
      badge: '👑 Đẳng Cấp Châu Âu'
    },
    {
      id: 'japan',
      target: 80000000000, // 80 tỷ
      title: 'JAPAN',
      condition: '80 TỶ',
      bgImg: 'https://images.unsplash.com/photo-1490806843957-31f4c9a91c65?q=80&w=800&auto=format&fit=crop',
      color: '#38bdf8',
      badge: '🌸 Chuyến Đi Nhật Bản'
    },
    {
      id: 'singapore',
      target: 36000000000, // 36 tỷ
      title: 'SINGAPORE - MALAYSIA',
      condition: '36 TỶ',
      bgImg: 'https://images.unsplash.com/photo-1525625293386-3f8f99389edd?q=80&w=800&auto=format&fit=crop',
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
    <div className="chart-card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{
        padding: '24px 24px 20px',
        background: 'linear-gradient(135deg, #1e293b, #0f172a)',
        color: '#fff',
        borderBottom: '4px solid #fbbf24'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ color: '#fbbf24', fontSize: '0.85rem', fontWeight: 700, letterSpacing: 2, marginBottom: 4 }}>
              CỰC CHIẾN 2026
            </div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1 }}>
              Global Champion ✈️
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>VICTORY AIRLINES</div>
            <div style={{ fontSize: '1.5rem' }}>🎫</div>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px', background: '#f8fafc', overflowY: 'auto' }}>
        {LEVELS.map(level => {
          const list = achievers[level.id as keyof typeof achievers];
          
          return (
            <div key={level.id} style={{
              borderRadius: '16px',
              overflow: 'hidden',
              boxShadow: '0 4px 15px rgba(0,0,0,0.1)',
              background: '#fff',
              position: 'relative'
            }}>
              {/* Boarding Pass Ticket Header */}
              <div style={{
                height: '110px',
                backgroundImage: `url(${level.bgImg})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                position: 'relative',
                display: 'flex',
                alignItems: 'flex-end',
                padding: '16px'
              }}>
                <div style={{
                  position: 'absolute', inset: 0,
                  background: 'linear-gradient(to top, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.1) 100%)'
                }} />
                
                <div style={{ position: 'relative', zIndex: 1, width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                  <div>
                    <div style={{ color: level.color, fontSize: '0.75rem', fontWeight: 700, marginBottom: 2 }}>{level.badge}</div>
                    <div style={{ color: '#fff', fontSize: '1.25rem', fontWeight: 800, letterSpacing: 1 }}>{level.title}</div>
                  </div>
                  <div style={{ 
                    background: 'rgba(255,255,255,0.2)', backdropFilter: 'blur(4px)',
                    padding: '4px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.4)',
                    color: '#fff', fontWeight: 800, fontSize: '1.1rem'
                  }}>
                    {level.condition}
                  </div>
                </div>
              </div>

              {/* Achievers List */}
              <div style={{ padding: '16px' }}>
                {list.length === 0 ? (
                  <div style={{ fontSize: '0.85rem', color: '#94a3b8', textAlign: 'center', padding: '12px 0', fontStyle: 'italic' }}>
                    Chưa có chiến binh đạt mốc này
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                    {list.map(emp => {
                      const initials = emp.nhan_vien.split(' ').map((w: string) => w[0]).slice(-2).join('');
                      return (
                        <div key={emp.nhan_vien} style={{
                          display: 'flex', alignItems: 'center', gap: '8px',
                          background: '#f1f5f9', padding: '6px 12px 6px 6px', borderRadius: '30px',
                          border: `1px solid ${level.color}40`
                        }}>
                          {emp.avatar_url ? (
                            <img src={emp.avatar_url} alt={emp.nhan_vien} style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }} />
                          ) : (
                            <div style={{ 
                              width: 28, height: 28, borderRadius: '50%', background: level.color, 
                              color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 700 
                            }}>
                              {initials}
                            </div>
                          )}
                          <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#1e293b' }}>
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
