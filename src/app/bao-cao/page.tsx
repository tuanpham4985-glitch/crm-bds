'use client';

import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Printer, ArrowLeft, FileText, Layers, Users } from 'lucide-react';
import type { DashboardData, TongHopCompareItem, NhanSuBienDongItem } from '@/lib/types';
import { useAuth } from '@/hooks/useAuth';

// Định dạng số tiền đầy đủ (VND) — dùng cho báo cáo in
function fmtVND(value: number): string {
  const n = Number(value) || 0;
  return n.toLocaleString('vi-VN') + ' đ';
}

// Định dạng rút gọn (tỷ / triệu) cho tiêu đề KPI
function fmtShort(value: number): string {
  const n = Number(value) || 0;
  if (n >= 1_000_000_000) {
    const ty = n / 1_000_000_000;
    return `${ty % 1 === 0 ? ty.toFixed(0) : ty.toFixed(1)} tỷ`;
  }
  if (n >= 1_000_000) {
    const tr = n / 1_000_000;
    return `${tr % 1 === 0 ? tr.toFixed(0) : tr.toFixed(1)} triệu`;
  }
  return n.toLocaleString('vi-VN');
}

const MONTH_LABELS: Record<string, string> = {};

// Chuẩn hoá key tháng (MM-YYYY, YYYY-MM, M-YYYY...) -> "Tháng M/YYYY"
function thangLabel(key: string): string {
  if (MONTH_LABELS[key]) return MONTH_LABELS[key];
  const m = key.match(/^(\d{1,4})[-/](\d{1,4})$/);
  if (!m) return key;
  let month: number, year: number;
  const a = parseInt(m[1], 10), b = parseInt(m[2], 10);
  if (a > 12) { year = a; month = b; } else { month = a; year = b; }
  const label = `Tháng ${month}/${year}`;
  MONTH_LABELS[key] = label;
  return label;
}

type Ky = 'h1' | 'h2' | 'full';
type ReportMode = 'standard' | 'race';

const KY_CONFIG: Record<Ky, { label: string; tieu_de: string; range: (y: number) => { from: string; to: string } }> = {
  h1: {
    label: '6 tháng đầu năm',
    tieu_de: 'BÁO CÁO TỔNG KẾT 6 THÁNG ĐẦU NĂM',
    range: (y) => ({ from: `${y}-01-01`, to: `${y}-06-30` }),
  },
  h2: {
    label: '6 tháng cuối năm',
    tieu_de: 'BÁO CÁO TỔNG KẾT 6 THÁNG CUỐI NĂM',
    range: (y) => ({ from: `${y}-07-01`, to: `${y}-12-31` }),
  },
  full: {
    label: 'Cả năm',
    tieu_de: 'BÁO CÁO TỔNG KẾT CẢ NĂM',
    range: (y) => ({ from: `${y}-01-01`, to: `${y}-12-31` }),
  },
};

const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => i + 1);

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function monthKey(year: number, month: number): number {
  return year * 12 + month;
}

function formatMonthYear(month: number, year: number): string {
  return `Tháng ${month}/${year}`;
}

function DonutCompareCard({
  title,
  icon,
  items,
  colors,
}: {
  title: string;
  icon: ReactNode;
  items: TongHopCompareItem[];
  colors: string[];
}) {
  if (!items || items.length === 0) return null;

  const totalCan = items.reduce((sum, item) => sum + item.so_can, 0);
  const totalDoanhSo = items.reduce((sum, item) => sum + item.doanh_so, 0);
  const center = 70;
  const radius = 48;
  const ringWidth = 28;
  const labelRadius = radius - ringWidth / 2 + 3;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="bc-donut-card">
      <div className="bc-donut-title">
        {icon}
        <span>{title}</span>
      </div>
      <div className="bc-donut-content">
        <div className="bc-donut-chart">
          <svg viewBox="-12 -12 164 164" role="img" aria-label={title}>
            <circle cx={center} cy={center} r={radius} fill="none" stroke="#eef2f7" strokeWidth={ringWidth} />
            {items.map((item, index) => {
              const pct = totalDoanhSo > 0 ? item.doanh_so / totalDoanhSo : 0;
              const dash = pct * circumference;
              const currentOffset = offset;
              offset += dash;
              return (
                <circle
                  key={item.loai}
                  cx={center}
                  cy={center}
                  r={radius}
                  fill="none"
                  stroke={colors[index % colors.length]}
                  strokeWidth={ringWidth}
                  strokeDasharray={`${dash} ${circumference - dash}`}
                  strokeDashoffset={-currentOffset}
                  transform={`rotate(-90 ${center} ${center})`}
                />
              );
            })}
            <circle cx={center} cy={center} r={28} fill="#fff" />
            {items.map((item, index) => {
              const pct = totalDoanhSo > 0 ? item.doanh_so / totalDoanhSo : 0;
              if (pct < 0.06) return null;
              const priorPct = items
                .slice(0, index)
                .reduce((sum, x) => sum + (totalDoanhSo > 0 ? x.doanh_so / totalDoanhSo : 0), 0);
              const angle = (priorPct + pct / 2) * Math.PI * 2 - Math.PI / 2;
              const x = center + Math.cos(angle) * labelRadius;
              const y = center + Math.sin(angle) * labelRadius;
              return (
                <text
                  key={`${item.loai}-label`}
                  x={x}
                  y={y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  style={{ fontSize: pct < 0.1 ? 10 : 11 }}
                >
                  {(pct * 100).toFixed(1)}%
                </text>
              );
            })}
          </svg>
        </div>
        <div className="bc-donut-table">
          <div className="bc-donut-head">Loại</div>
          <div className="bc-donut-head bc-num">Số căn</div>
          <div className="bc-donut-head bc-num">Doanh số</div>
          {items.map((item, index) => (
            <div className="bc-donut-row" key={item.loai}>
              <div className="bc-donut-name">
                <span className="bc-donut-swatch" style={{ background: colors[index % colors.length] }} />
                <span>{item.loai}</span>
              </div>
              <div className="bc-num">{item.so_can}</div>
              <div className="bc-num" style={{ color: colors[index % colors.length] }}>{fmtShort(item.doanh_so)}</div>
            </div>
          ))}
          <div className="bc-donut-total">
            <div>Tổng</div>
            <div className="bc-num">{totalCan}</div>
            <div className="bc-num">{fmtShort(totalDoanhSo)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ReportBar({
  value,
  max,
  color = '#3b82f6',
}: {
  value: number;
  max: number;
  color?: string;
}) {
  const pct = max > 0 ? Math.max(3, Math.round((value / max) * 100)) : 0;
  return (
    <div className="bc-inline-bar-track">
      <div className="bc-inline-bar-fill" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

function MonthlyRevenueTrendChart({
  items,
}: {
  items: Array<{ thang: string; doanh_thu: number }>;
}) {
  if (!items || items.length === 0) return null;

  const maxValue = Math.max(1, ...items.map(item => item.doanh_thu));
  const width = Math.max(680, items.length * 92 + 90);
  const height = 300;
  const padding = { top: 28, right: 26, bottom: 64, left: 58 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const step = items.length > 1 ? plotWidth / (items.length - 1) : plotWidth;

  const points = items.map((item, index) => {
    const x = padding.left + (items.length === 1 ? plotWidth / 2 : step * index);
    const y = padding.top + plotHeight - ((item.doanh_thu / maxValue) * (plotHeight - 10));
    return { x, y, value: item.doanh_thu, thang: item.thang };
  });

  const linePath = points.map((point, index) => {
    if (index === 0) return `M ${point.x} ${point.y}`;
    const prev = points[index - 1];
    const midX = (prev.x + point.x) / 2;
    return `C ${midX} ${prev.y}, ${midX} ${point.y}, ${point.x} ${point.y}`;
  }).join(' ');

  const areaPath = `${linePath} L ${points[points.length - 1].x} ${padding.top + plotHeight} L ${points[0].x} ${padding.top + plotHeight} Z`;
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(ratio => ({
    ratio,
    value: Math.round(maxValue * ratio),
    y: padding.top + plotHeight - ratio * plotHeight,
  }));

  return (
    <div className="bc-trend-card">
      <div className="bc-trend-header">
        <div className="bc-trend-title">Doanh số theo thời gian</div>
        <div className="bc-trend-subtitle">Xu hướng doanh thu qua các tháng trong kỳ báo cáo</div>
      </div>
      <div className="bc-trend-chart-wrap">
        <svg viewBox={`0 0 ${width} ${height}`} className="bc-trend-chart" role="img" aria-label="Biểu đồ doanh số theo tháng">
          <defs>
            <linearGradient id="bcTrendArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(99, 102, 241, 0.22)" />
              <stop offset="100%" stopColor="rgba(99, 102, 241, 0.02)" />
            </linearGradient>
          </defs>

          {yTicks.map(tick => (
            <g key={tick.ratio}>
              <line
                x1={padding.left}
                y1={tick.y}
                x2={width - padding.right}
                y2={tick.y}
                stroke="#e7ecf5"
                strokeDasharray="4 4"
              />
              <text
                x={padding.left - 10}
                y={tick.y}
                textAnchor="end"
                dominantBaseline="central"
                className="bc-trend-y-label"
              >
                {tick.ratio === 0 ? '0' : fmtShort(tick.value)}
              </text>
            </g>
          ))}

          {points.map(point => (
            <line
              key={`${point.thang}-grid`}
              x1={point.x}
              y1={padding.top}
              x2={point.x}
              y2={padding.top + plotHeight}
              stroke="#eef2f7"
              strokeDasharray="3 5"
            />
          ))}

          <path d={areaPath} fill="url(#bcTrendArea)" />
          <path d={linePath} fill="none" stroke="#6366f1" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />

          {points.map(point => (
            <g key={point.thang}>
              <circle cx={point.x} cy={point.y} r="5.5" fill="#6366f1" stroke="#fff" strokeWidth="2.5" />
              <text x={point.x} y={point.y - 14} textAnchor="middle" className="bc-trend-point-label">
                {fmtShort(point.value)}
              </text>
              <text x={point.x} y={height - 18} textAnchor="middle" className="bc-trend-x-label">
                {point.thang}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}

function _StaffMovementChart({
  items,
}: {
  items: Array<{ thang: string; dau_ky: number; tang_moi: number; giam: number; cuoi_ky: number }>;
}) {
  if (!items || items.length === 0) return null;

  const totalTang = items.reduce((sum, item) => sum + item.tang_moi, 0);
  const totalGiam = items.reduce((sum, item) => sum + item.giam, 0);
  const dauKy = items[0]?.dau_ky ?? 0;
  const cuoiKy = items[items.length - 1]?.cuoi_ky ?? 0;
  const maxFlow = Math.max(1, ...items.map(item => Math.max(item.tang_moi, item.giam)));
  const maxHeadcount = Math.max(1, ...items.map(item => Math.max(item.dau_ky, item.cuoi_ky)));
  const width = Math.max(640, items.length * 72 + 90);
  const height = 260;
  const padding = { top: 20, right: 24, bottom: 72, left: 30 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const step = items.length > 1 ? plotWidth / (items.length - 1) : plotWidth;
  const barWidth = Math.min(18, step * 0.24);

  const linePoints = items
    .map((item, index) => {
      const x = padding.left + (items.length === 1 ? plotWidth / 2 : step * index);
      const y = padding.top + plotHeight - ((item.cuoi_ky / maxHeadcount) * (plotHeight - 20));
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <div className="bc-staff-card">
      <div className="bc-staff-summary">
        <div className="bc-staff-kpi">
          <div className="bc-staff-kpi-label">Đầu kỳ</div>
          <div className="bc-staff-kpi-value">{dauKy}</div>
        </div>
        <div className="bc-staff-kpi">
          <div className="bc-staff-kpi-label">Tăng mới</div>
          <div className="bc-staff-kpi-value" style={{ color: '#10b981' }}>+{totalTang}</div>
        </div>
        <div className="bc-staff-kpi">
          <div className="bc-staff-kpi-label">Giảm</div>
          <div className="bc-staff-kpi-value" style={{ color: '#ef4444' }}>-{totalGiam}</div>
        </div>
        <div className="bc-staff-kpi">
          <div className="bc-staff-kpi-label">Cuối kỳ</div>
          <div className="bc-staff-kpi-value" style={{ color: '#2563eb' }}>{cuoiKy}</div>
        </div>
      </div>

      <div className="bc-staff-legend">
        <span><i style={{ background: '#10b981' }} /> Tăng mới</span>
        <span><i style={{ background: '#ef4444' }} /> Giảm</span>
        <span><i style={{ background: '#2563eb' }} /> Nhân sự cuối kỳ</span>
      </div>

      <div className="bc-staff-chart-wrap">
        <svg viewBox={`0 0 ${width} ${height}`} className="bc-staff-chart" role="img" aria-label="Biểu đồ biến động nhân sự">
          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
            const y = padding.top + plotHeight - ratio * plotHeight;
            return <line key={ratio} x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="#e5e7eb" strokeDasharray="4 4" />;
          })}

          {items.map((item, index) => {
            const x = padding.left + (items.length === 1 ? plotWidth / 2 : step * index);
            const tangHeight = (item.tang_moi / maxFlow) * (plotHeight - 28);
            const giamHeight = (item.giam / maxFlow) * (plotHeight - 28);
            const tangY = padding.top + plotHeight - tangHeight;
            const giamY = padding.top + plotHeight - giamHeight;
            const lineY = padding.top + plotHeight - ((item.cuoi_ky / maxHeadcount) * (plotHeight - 20));

            return (
              <g key={item.thang}>
                <rect x={x - barWidth - 3} y={tangY} width={barWidth} height={Math.max(4, tangHeight)} rx="4" fill="#10b981" />
                <rect x={x + 3} y={giamY} width={barWidth} height={Math.max(4, giamHeight)} rx="4" fill="#ef4444" />
                <circle cx={x} cy={lineY} r="4.5" fill="#2563eb" stroke="#fff" strokeWidth="2" />
                <text x={x} y={lineY - 10} textAnchor="middle" className="bc-staff-point-label">{item.cuoi_ky}</text>
                <text x={x} y={height - 18} textAnchor="end" transform={`rotate(-35 ${x} ${height - 18})`} className="bc-staff-axis-label">
                  {thangLabel(item.thang)}
                </text>
              </g>
            );
          })}

          <polyline fill="none" stroke="#2563eb" strokeWidth="3" points={linePoints} />
        </svg>
      </div>

      <table className="bc-table bc-staff-table">
        <thead>
          <tr>
            <th>Tháng</th>
            <th style={{ textAlign: 'center', width: 90 }}>Đầu kỳ</th>
            <th style={{ textAlign: 'center', width: 90 }}>Tăng mới</th>
            <th style={{ textAlign: 'center', width: 90 }}>Giảm</th>
            <th style={{ textAlign: 'center', width: 90 }}>Cuối kỳ</th>
          </tr>
        </thead>
        <tbody>
          {items.map(item => (
            <tr key={item.thang}>
              <td>{thangLabel(item.thang)}</td>
              <td style={{ textAlign: 'center' }}>{item.dau_ky}</td>
              <td style={{ textAlign: 'center', color: '#10b981', fontWeight: 700 }}>{item.tang_moi}</td>
              <td style={{ textAlign: 'center', color: '#ef4444', fontWeight: 700 }}>{item.giam}</td>
              <td style={{ textAlign: 'center', color: '#2563eb', fontWeight: 700 }}>{item.cuoi_ky}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OfficialStaffTrendChart({ items }: { items: NhanSuBienDongItem[] }) {
  if (!items || items.length === 0) return null;

  const dauKy = items[0]?.tong_chinh_thuc ?? 0;
  const cuoiKy = items[items.length - 1]?.tong_chinh_thuc ?? 0;
  const bienDongRong = cuoiKy - dauKy;
  const peakHeadcount = Math.max(1, ...items.map(item => item.tong_chinh_thuc));
  const width = Math.max(640, items.length * 78 + 90);
  const height = 270;
  const padding = { top: 18, right: 24, bottom: 72, left: 30 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const step = items.length > 1 ? plotWidth / (items.length - 1) : plotWidth;
  const barWidth = Math.min(34, step * 0.34);

  const linePoints = items
    .map((item, index) => {
      const x = padding.left + (items.length === 1 ? plotWidth / 2 : step * index);
      const y = padding.top + plotHeight - ((item.tong_chinh_thuc / peakHeadcount) * (plotHeight - 18));
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <div className="bc-staff-card">
      <div className="bc-staff-summary">
        <div className="bc-staff-kpi">
          <div className="bc-staff-kpi-label">Đầu kỳ</div>
          <div className="bc-staff-kpi-value">{dauKy}</div>
        </div>
        <div className="bc-staff-kpi">
          <div className="bc-staff-kpi-label">Cuối kỳ</div>
          <div className="bc-staff-kpi-value" style={{ color: '#2563eb' }}>{cuoiKy}</div>
        </div>
        <div className="bc-staff-kpi">
          <div className="bc-staff-kpi-label">Biến động ròng</div>
          <div className="bc-staff-kpi-value" style={{ color: bienDongRong >= 0 ? '#10b981' : '#ef4444' }}>
            {bienDongRong >= 0 ? '+' : ''}{bienDongRong}
          </div>
        </div>
        <div className="bc-staff-kpi">
          <div className="bc-staff-kpi-label">Đỉnh kỳ</div>
          <div className="bc-staff-kpi-value" style={{ color: '#d97706' }}>{peakHeadcount}</div>
        </div>
      </div>

      <div className="bc-staff-note">
        Nguồn: VIC_DATA NHÂN SỰ — lọc theo Ngày vào làm việc và Trạng thái NV.
      </div>

      <div className="bc-staff-legend">
        <span><i style={{ background: '#d4a106' }} /> Tổng nhân sự theo tháng</span>
        <span><i style={{ background: '#2563eb' }} /> Đường biến động theo tháng</span>
      </div>

      <div className="bc-staff-chart-wrap">
        <svg viewBox={`0 0 ${width} ${height}`} className="bc-staff-chart" role="img" aria-label="Biểu đồ nhân sự chính thức theo tháng">
          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
            const y = padding.top + plotHeight - ratio * plotHeight;
            return <line key={ratio} x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="#e5e7eb" strokeDasharray="4 4" />;
          })}

          {items.map((item, index) => {
            const x = padding.left + (items.length === 1 ? plotWidth / 2 : step * index);
            const barHeight = (item.tong_chinh_thuc / peakHeadcount) * (plotHeight - 18);
            const barY = padding.top + plotHeight - barHeight;
            const lineY = padding.top + plotHeight - ((item.tong_chinh_thuc / peakHeadcount) * (plotHeight - 18));

            return (
              <g key={item.thang}>
                <rect x={x - barWidth / 2} y={barY} width={barWidth} height={Math.max(4, barHeight)} rx="4" fill="#d4a106" />
                <circle cx={x} cy={lineY} r="4.5" fill="#2563eb" stroke="#fff" strokeWidth="2" />
                <text x={x} y={lineY - 10} textAnchor="middle" className="bc-staff-point-label">{item.tong_chinh_thuc}</text>
                <text x={x} y={height - 18} textAnchor="end" transform={`rotate(-35 ${x} ${height - 18})`} className="bc-staff-axis-label">
                  {thangLabel(item.thang)}
                </text>
              </g>
            );
          })}

          <polyline fill="none" stroke="#2563eb" strokeWidth="3" points={linePoints} />
        </svg>
      </div>

      <table className="bc-table bc-staff-table">
        <thead>
          <tr>
            <th>Tháng</th>
            <th style={{ textAlign: 'center', width: 140 }}>Tổng nhân sự</th>
            <th style={{ textAlign: 'center', width: 120 }}>NV mới vào</th>
            <th style={{ textAlign: 'center', width: 120 }}>Biến động</th>
          </tr>
        </thead>
        <tbody>
          {items.map(item => (
            <tr key={item.thang}>
              <td>{thangLabel(item.thang)}</td>
              <td style={{ textAlign: 'center', color: '#d97706', fontWeight: 700 }}>{item.tong_chinh_thuc}</td>
              <td style={{ textAlign: 'center', color: '#10b981', fontWeight: 700 }}>
                {item.nv_vao != null ? (item.nv_vao > 0 ? `+${item.nv_vao}` : '—') : '—'}
              </td>
              <td style={{ textAlign: 'center', color: item.bien_dong >= 0 ? '#10b981' : '#ef4444', fontWeight: 700 }}>
                {item.bien_dong >= 0 ? '+' : ''}{item.bien_dong}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function BaoCaoPage() {
  const router = useRouter();
  const { isAdmin, isLoading: authLoading } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(() => currentYear);
  const [ky, setKy] = useState<Ky | 'custom'>('h1');
  const [reportMode, setReportMode] = useState<ReportMode>('standard');
  const [fromMonth, setFromMonth] = useState(1);
  const [fromYear, setFromYear] = useState(() => currentYear);
  const [toMonth, setToMonth] = useState(6);
  const [toYear, setToYear] = useState(() => currentYear);

  const rangeInvalid = monthKey(fromYear, fromMonth) > monthKey(toYear, toMonth);
  const from = `${fromYear}-${pad2(fromMonth)}-01`;
  const to = `${toYear}-${pad2(toMonth)}-${pad2(lastDayOfMonth(toYear, toMonth))}`;
  const cfg = ky === 'custom' ? null : KY_CONFIG[ky];
  const reportTitle = reportMode === 'race'
    ? (cfg ? `BÁO CÁO THI ĐUA THEO NGÀY CỌC ${year}` : 'BÁO CÁO THI ĐUA THEO NGÀY CỌC')
    : (cfg ? `${cfg.tieu_de} ${year}` : 'BÁO CÁO TỔNG KẾT THEO KỲ');
  const reportBasisText = reportMode === 'race'
    ? 'Doanh số ghi nhận theo ngày cọc'
    : 'Doanh số ghi nhận theo ngày ký VBTT/TTĐC / Ký HĐ';
  const dealLabel = reportMode === 'race' ? 'Số giao dịch đã cọc' : 'Số giao dịch đã ký HĐ';
  const yearOptions = Array.from(
    { length: Math.max(4, currentYear - 2024 + 2) },
    (_, i) => currentYear + 1 - i
  );

  const applyPreset = (preset: Ky, presetYear = year) => {
    const nextRange = KY_CONFIG[preset].range(presetYear);
    setKy(preset);
    setYear(presetYear);
    setFromYear(Number(nextRange.from.slice(0, 4)));
    setFromMonth(Number(nextRange.from.slice(5, 7)));
    setToYear(Number(nextRange.to.slice(0, 4)));
    setToMonth(Number(nextRange.to.slice(5, 7)));
  };

  const markCustom = () => setKy('custom');

  useEffect(() => {
    if (rangeInvalid) {
      setToYear(fromYear);
      setToMonth(fromMonth);
    }
  }, [rangeInvalid, fromYear, fromMonth]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      if (rangeInvalid) {
        setData(null);
        return;
      }
      const params = new URLSearchParams({ period: 'custom', from, to, report_mode: reportMode });
      const res = await fetch(`/api/dashboard?${params}`);
      const result = await res.json();
      if (result.success) setData(result.data);
    } catch (err) {
      console.error('Báo cáo fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [from, to, rangeInvalid, reportMode]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const fmtDate = (s: string) => {
    const [y, m, d] = s.split('-');
    return `${d}/${m}/${y}`;
  };

  const ngayXuat = new Date().toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });

  if (authLoading) {
    return <div className="loading-spinner"><div className="spinner" /></div>;
  }

  if (!isAdmin) {
    return (
      <div className="empty-state" style={{ marginTop: 80 }}>
        <h3>Không có quyền truy cập</h3>
        <p>Báo cáo tổng kết chỉ dành cho quản trị viên.</p>
      </div>
    );
  }

  const th = data?.tonghop;
  const tongDoanhSo = th?.tong_doanh_so ?? data?.kpi.doanh_thu ?? 0;
  const tongSoCan = th?.tong_so_can ?? data?.kpi.da_ky ?? 0;
  const giaTriTB = th?.gia_tri_tb_can ?? (tongSoCan > 0 ? Math.round(tongDoanhSo / tongSoCan) : 0);

  // Doanh thu theo tháng — sắp xếp tăng dần theo thời gian
  const theoThang = [...(data?.doanh_thu_theo_thang ?? [])].sort((a, b) => {
    const pa = a.thang.match(/^(\d{1,4})[-/](\d{1,4})$/);
    const pb = b.thang.match(/^(\d{1,4})[-/](\d{1,4})$/);
    const norm = (m: RegExpMatchArray | null) => {
      if (!m) return 0;
      const x = parseInt(m[1], 10), z = parseInt(m[2], 10);
      const yr = x > 12 ? x : z, mo = x > 12 ? z : x;
      return yr * 100 + mo;
    };
    return norm(pa) - norm(pb);
  });
  const maxThang = Math.max(...theoThang.map(t => t.doanh_thu), 1);
  const maxSale = Math.max(...(data?.doanh_thu_theo_sale.map(s => s.doanh_thu) ?? []), 1);
  const maxKhuVuc = Math.max(...(th?.khu_vuc.map(k => k.doanh_so) ?? []), 1);
  const maxPhongKD = Math.max(...(th?.top_phong_kd.map(p => p.doanh_so) ?? []), 1);
  const maxDuAn = Math.max(...(th?.top_du_an.map(p => p.doanh_so) ?? []), 1);
  const nhanSuBienDong = data?.nhan_su_bien_dong ?? [];
  const reportBarColors = ['#6366f1', '#10b981', '#f59e0b', '#3b82f6', '#ec4899', '#8b5cf6', '#ef4444', '#14b8a6'];

  return (
    <div className="bao-cao-wrap">
      <style>{printStyles}</style>

      {/* Thanh công cụ — ẩn khi in */}
      <div className="bc-toolbar no-print">
        <button className="btn btn-secondary btn-sm" onClick={() => router.push('/')}>
          <ArrowLeft size={16} /> Quay lại Dashboard
        </button>
        <div className="bc-toolbar-right">
          <div className="toggle-group">
            <button
              className={`toggle-btn ${reportMode === 'standard' ? 'active' : ''}`}
              onClick={() => setReportMode('standard')}
            >
              Báo cáo chuẩn
            </button>
            <button
              className={`toggle-btn ${reportMode === 'race' ? 'active' : ''}`}
              onClick={() => setReportMode('race')}
            >
              Thi đua ngày cọc
            </button>
          </div>
          <div className="toggle-group">
            {(Object.keys(KY_CONFIG) as Ky[]).map(k => (
              <button
                key={k}
                className={`toggle-btn ${ky === k ? 'active' : ''}`}
                onClick={() => applyPreset(k)}
              >{KY_CONFIG[k].label}</button>
            ))}
          </div>
          <select
            className="bc-year-select"
            value={year}
            onChange={e => {
              const nextYear = Number(e.target.value);
              setYear(nextYear);
              if (ky !== 'custom') applyPreset(ky, nextYear);
            }}
          >
            {yearOptions.map(y => (
              <option key={y} value={y}>Năm {y}</option>
            ))}
          </select>
          <div className="bc-range-controls">
            <span className="bc-range-label">Từ</span>
            <select className="bc-date-select" value={fromMonth} onChange={e => { markCustom(); setFromMonth(Number(e.target.value)); }}>
              {MONTH_OPTIONS.map(m => <option key={m} value={m}>Tháng {m}</option>)}
            </select>
            <select className="bc-date-select" value={fromYear} onChange={e => { markCustom(); setFromYear(Number(e.target.value)); }}>
              {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <span className="bc-range-label">Đến</span>
            <select className="bc-date-select" value={toMonth} onChange={e => { markCustom(); setToMonth(Number(e.target.value)); }}>
              {MONTH_OPTIONS.map(m => <option key={m} value={m}>Tháng {m}</option>)}
            </select>
            <select className="bc-date-select" value={toYear} onChange={e => { markCustom(); setToYear(Number(e.target.value)); }}>
              {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => window.print()} disabled={loading || !data}>
            <Printer size={16} /> In / Lưu PDF
          </button>
        </div>
      </div>

      {loading ? (
        <div className="loading-spinner"><div className="spinner" /></div>
      ) : !data ? (
        <div className="empty-state"><h3>Không tải được dữ liệu</h3></div>
      ) : (
        <div className="bc-page">
          {/* ── Tiêu đề báo cáo ── */}
          <div className="bc-header">
            <div className="bc-company">VICTORY HOLDINGS</div>
            <h1 className="bc-title">{reportTitle}</h1>
            <div className="bc-period">
              Kỳ báo cáo: {formatMonthYear(fromMonth, fromYear)} - {formatMonthYear(toMonth, toYear)} ({fmtDate(from)} - {fmtDate(to)}) &nbsp;·&nbsp; {reportBasisText}
            </div>
            <div className="bc-export-date">Ngày xuất báo cáo: {ngayXuat}</div>
          </div>

          {/* ── Chỉ số tổng quan ── */}
          <h2 className="bc-section-title">I. Tổng quan kết quả kinh doanh</h2>
          <div className="bc-kpi-grid">
            <div className="bc-kpi">
              <div className="bc-kpi-label">Tổng doanh số</div>
              <div className="bc-kpi-value" style={{ color: '#1d4ed8' }}>{fmtShort(tongDoanhSo)}</div>
              <div className="bc-kpi-sub">{fmtVND(tongDoanhSo)}</div>
            </div>
            <div className="bc-kpi">
              <div className="bc-kpi-label">Tổng số căn</div>
              <div className="bc-kpi-value" style={{ color: '#d97706' }}>{tongSoCan.toLocaleString('vi-VN')} <span style={{ fontSize: '0.9rem' }}>căn</span></div>
              <div className="bc-kpi-sub">{dealLabel}</div>
            </div>
            <div className="bc-kpi">
              <div className="bc-kpi-label">Giá trị TB / căn</div>
              <div className="bc-kpi-value" style={{ color: '#059669' }}>{fmtShort(giaTriTB)}</div>
              <div className="bc-kpi-sub">{fmtVND(giaTriTB)}</div>
            </div>
          </div>

          {/* ── Doanh số theo tháng ── */}
          {(th?.loai_hinh?.length || th?.loai_nguon?.length) ? (
            <>
              <h2 className="bc-section-title">II. Cơ cấu doanh số</h2>
              <div className="bc-donut-grid">
                <DonutCompareCard
                  title="Cao tầng vs Thấp tầng"
                  icon={<Layers size={15} style={{ color: '#6366f1' }} />}
                  items={th?.loai_hinh ?? []}
                  colors={['#6366f1', '#f59e0b', '#94a3b8', '#10b981']}
                />
                <DonutCompareCard
                  title="Nội bộ vs Đối tác"
                  icon={<Users size={15} style={{ color: '#10b981' }} />}
                  items={th?.loai_nguon ?? []}
                  colors={['#10b981', '#f472b6', '#94a3b8', '#f59e0b']}
                />
              </div>
            </>
          ) : null}

          {theoThang.length > 0 && (
            <>
              <h2 className="bc-section-title">III. Doanh số theo tháng</h2>
              <MonthlyRevenueTrendChart items={theoThang.map(t => ({ thang: thangLabel(t.thang), doanh_thu: t.doanh_thu }))} />
              <table className="bc-table">
                <thead>
                  <tr>
                    <th style={{ width: '32%' }}>Tháng</th>
                    <th style={{ width: '38%' }}>Biểu đồ</th>
                    <th style={{ width: '30%', textAlign: 'right' }}>Doanh số</th>
                  </tr>
                </thead>
                <tbody>
                  {theoThang.map(t => (
                    <tr key={t.thang}>
                      <td>{thangLabel(t.thang)}</td>
                      <td>
                        <div className="bc-bar-track">
                          <div className="bc-bar-fill" style={{ width: `${Math.round((t.doanh_thu / maxThang) * 100)}%` }} />
                        </div>
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtVND(t.doanh_thu)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={2} style={{ fontWeight: 700 }}>Tổng cộng</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: '#1d4ed8' }}>
                      {fmtVND(theoThang.reduce((s, t) => s + t.doanh_thu, 0))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </>
          )}

          {/* ── Bảng xếp hạng sale ── */}
          {data.doanh_thu_theo_sale.length > 0 && (
            <>
              <h2 className="bc-section-title">IV. Bảng xếp hạng nhân viên kinh doanh</h2>
              <table className="bc-table">
                <thead>
                  <tr>
                    <th style={{ width: 50 }}>#</th>
                    <th>Nhân viên</th>
                    <th style={{ width: '28%' }}>Biểu đồ</th>
                    <th style={{ textAlign: 'center', width: 90 }}>Số deal</th>
                    <th style={{ textAlign: 'right', width: 160 }}>Doanh số</th>
                  </tr>
                </thead>
                <tbody>
                  {data.doanh_thu_theo_sale.map((s, i) => (
                    <tr key={s.nhan_vien}>
                      <td>
                        <span className={`bc-rank ${i < 3 ? `bc-rank-${i + 1}` : ''}`}>{i + 1}</span>
                      </td>
                      <td style={{ fontWeight: 500 }}>{s.nhan_vien}</td>
                      <td><ReportBar value={s.doanh_thu} max={maxSale} color={reportBarColors[i % reportBarColors.length]} /></td>
                      <td style={{ textAlign: 'center' }}>{s.so_deal}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtVND(s.doanh_thu)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {/* ── Khu vực ── */}
          {th?.khu_vuc && th.khu_vuc.length > 0 && (
            <>
              <h2 className="bc-section-title">V. Doanh số theo khu vực</h2>
              <table className="bc-table">
                <thead>
                  <tr>
                    <th>Khu vực</th>
                    <th style={{ width: '34%' }}>Biểu đồ</th>
                    <th style={{ textAlign: 'center', width: 90 }}>Số căn</th>
                    <th style={{ textAlign: 'right', width: 160 }}>Doanh số</th>
                  </tr>
                </thead>
                <tbody>
                  {th.khu_vuc.map(k => (
                    <tr key={k.loai}>
                      <td style={{ fontWeight: 500 }}>{k.loai}</td>
                      <td><ReportBar value={k.doanh_so} max={maxKhuVuc} color="#10b981" /></td>
                      <td style={{ textAlign: 'center' }}>{k.so_can}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtVND(k.doanh_so)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {/* ── Top phòng KD ── */}
          {th?.top_phong_kd && th.top_phong_kd.length > 0 && (
            <>
              <h2 className="bc-section-title">VI. Top phòng kinh doanh</h2>
              <table className="bc-table">
                <thead>
                  <tr>
                    <th style={{ width: 50 }}>#</th>
                    <th>Phòng kinh doanh</th>
                    <th style={{ width: '28%' }}>Biểu đồ</th>
                    <th style={{ textAlign: 'center', width: 90 }}>Số căn</th>
                    <th style={{ textAlign: 'right', width: 160 }}>Doanh số</th>
                  </tr>
                </thead>
                <tbody>
                  {th.top_phong_kd.map((p, i) => (
                    <tr key={p.ten}>
                      <td><span className={`bc-rank ${i < 3 ? `bc-rank-${i + 1}` : ''}`}>{i + 1}</span></td>
                      <td style={{ fontWeight: 500 }}>{p.ten}</td>
                      <td><ReportBar value={p.doanh_so} max={maxPhongKD} color={reportBarColors[i % reportBarColors.length]} /></td>
                      <td style={{ textAlign: 'center' }}>{p.so_can}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtVND(p.doanh_so)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {/* ── Top dự án ── */}
          {th?.top_du_an && th.top_du_an.length > 0 && (
            <>
              <h2 className="bc-section-title">VII. Top dự án theo doanh số</h2>
              <table className="bc-table">
                <thead>
                  <tr>
                    <th style={{ width: 50 }}>#</th>
                    <th>Dự án</th>
                    <th style={{ width: '28%' }}>Biểu đồ</th>
                    <th style={{ textAlign: 'center', width: 90 }}>Số căn</th>
                    <th style={{ textAlign: 'right', width: 160 }}>Doanh số</th>
                  </tr>
                </thead>
                <tbody>
                  {th.top_du_an.map((p, i) => (
                    <tr key={p.ten}>
                      <td><span className={`bc-rank ${i < 3 ? `bc-rank-${i + 1}` : ''}`}>{i + 1}</span></td>
                      <td style={{ fontWeight: 500 }}>{p.ten}</td>
                      <td><ReportBar value={p.doanh_so} max={maxDuAn} color={reportBarColors[i % reportBarColors.length]} /></td>
                      <td style={{ textAlign: 'center' }}>{p.so_can}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtVND(p.doanh_so)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {false && nhanSuBienDong.length > 0 && (
            <>
              <h2 className="bc-section-title">VIII. Biến động nhân sự</h2>
              <OfficialStaffTrendChart items={nhanSuBienDong} />
            </>
          )}

          {/* ── Footer ── */}
          <div className="bc-footer">
            <div>
              <FileText size={13} style={{ verticalAlign: '-2px', marginRight: 4 }} />
              Báo cáo được tạo tự động từ hệ thống CRM VICTORY HOLDINGS
            </div>
            <div>{reportBasisText} · Đơn vị: VNĐ</div>
          </div>
        </div>
      )}
    </div>
  );
}

const printStyles = `
.bao-cao-wrap { max-width: 920px; margin: 0 auto; }

.bc-toolbar {
  display: flex; align-items: center; justify-content: space-between;
  flex-wrap: wrap; gap: 12px; margin-bottom: 20px;
}
.bc-toolbar-right { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.bc-year-select {
  padding: 7px 12px; border-radius: var(--radius-md); border: 1px solid var(--border);
  background: var(--bg-surface); color: var(--text-body); font-size: 13px; font-weight: 600;
  cursor: pointer;
}
.bc-range-controls {
  display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
  padding: 4px; border: 1px solid var(--border); border-radius: var(--radius-md);
  background: var(--bg-surface);
}
.bc-range-label {
  font-size: 12px; font-weight: 700; color: var(--text-label); padding: 0 2px;
}
.bc-date-select {
  padding: 6px 8px; border-radius: 6px; border: 1px solid var(--border-light);
  background: #fff; color: var(--text-body); font-size: 12px; font-weight: 600;
  cursor: pointer;
}

.bc-page {
  background: #fff; color: #1a1a1a;
  padding: 40px 44px; border-radius: 12px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.08), 0 8px 30px rgba(0,0,0,0.06);
  border: 1px solid var(--border-light);
}

.bc-header { text-align: center; border-bottom: 3px solid #1d4ed8; padding-bottom: 18px; margin-bottom: 8px; }
.bc-company { font-size: 0.82rem; font-weight: 800; letter-spacing: 2px; color: #1d4ed8; }
.bc-title { font-size: 1.5rem; font-weight: 800; color: #111827; margin: 8px 0 6px; line-height: 1.25; }
.bc-period { font-size: 0.82rem; color: #4b5563; }
.bc-export-date { font-size: 0.74rem; color: #9ca3af; margin-top: 4px; }

.bc-section-title {
  font-size: 1.0rem; font-weight: 700; color: #1d4ed8;
  margin: 26px 0 12px; padding-bottom: 6px; border-bottom: 1px solid #e5e7eb;
}

.bc-kpi-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
.bc-kpi {
  border: 1px solid #e5e7eb; border-radius: 10px; padding: 16px 18px;
  background: #f9fafb;
}
.bc-kpi-label { font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #6b7280; }
.bc-kpi-value { font-size: 1.5rem; font-weight: 800; margin: 6px 0 2px; }
.bc-kpi-sub { font-size: 0.72rem; color: #9ca3af; }

.bc-donut-grid {
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px;
  break-inside: avoid;
}
.bc-donut-card {
  border: 1px solid #e5e7eb; border-radius: 10px; padding: 12px;
  background: #fff;
}
.bc-donut-title {
  display: flex; align-items: center; gap: 8px; margin-bottom: 10px;
  font-size: 0.78rem; font-weight: 800; color: #111827; text-transform: uppercase;
}
.bc-donut-content {
  display: grid; grid-template-columns: 104px minmax(0, 1fr); gap: 10px; align-items: center;
}
.bc-donut-chart { width: 104px; height: 104px; }
.bc-donut-chart svg { width: 104px; height: 104px; display: block; overflow: visible; }
.bc-donut-chart text { fill: #fff; font-size: 11px; font-weight: 800; }
.bc-donut-table {
  display: grid; grid-template-columns: minmax(0, 1fr) 38px 62px;
  column-gap: 6px; row-gap: 7px; align-items: center; min-width: 0;
}
.bc-donut-head {
  font-size: 0.66rem; color: #94a3b8; font-weight: 800;
}
.bc-donut-row,
.bc-donut-total {
  display: contents;
}
.bc-donut-name {
  display: flex; align-items: center; gap: 6px; min-width: 0;
  font-size: 0.72rem; font-weight: 700; color: #1f2937;
}
.bc-donut-name span:last-child {
  min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.bc-donut-swatch {
  width: 9px; height: 9px; border-radius: 2px; flex-shrink: 0;
}
.bc-num {
  text-align: right; font-size: 0.72rem; font-weight: 800; color: #111827;
}
.bc-donut-total > div {
  border-top: 1px solid #e5e7eb; padding-top: 7px; font-weight: 800; color: #111827;
}

.bc-table { width: 100%; border-collapse: collapse; font-size: 0.84rem; }
.bc-table th {
  text-align: left; padding: 9px 12px; background: #f3f4f6;
  font-weight: 700; color: #374151; font-size: 0.76rem;
  text-transform: uppercase; letter-spacing: 0.3px;
  border-bottom: 2px solid #e5e7eb;
}
.bc-table td { padding: 9px 12px; border-bottom: 1px solid #f0f1f3; color: #1f2937; }
.bc-table tbody tr:nth-child(even) { background: #fafbfc; }
.bc-table tfoot td { background: #eff6ff; border-top: 2px solid #d1d5db; }

.bc-bar-track { height: 12px; background: #e5e7eb; border-radius: 6px; overflow: hidden; }
.bc-bar-fill { height: 100%; background: linear-gradient(90deg, #3b82f6, #6366f1); border-radius: 6px; }
.bc-inline-bar-track {
  height: 10px; width: 100%; min-width: 90px;
  background: #e5e7eb; border-radius: 999px; overflow: hidden;
}
.bc-inline-bar-fill {
  height: 100%; border-radius: 999px;
}

.bc-trend-card {
  border: 1px solid #e5e7eb; border-radius: 12px; padding: 18px 18px 10px;
  background: #fff; margin-bottom: 14px;
}
.bc-trend-header { margin-bottom: 8px; }
.bc-trend-title {
  font-size: 0.96rem; font-weight: 800; color: #111827;
}
.bc-trend-subtitle {
  font-size: 0.76rem; color: #64748b; margin-top: 4px;
}
.bc-trend-chart-wrap {
  width: 100%; overflow: hidden;
}
.bc-trend-chart {
  width: 100%; height: auto; display: block;
}
.bc-trend-y-label {
  fill: #64748b; font-size: 10px; font-weight: 700;
}
.bc-trend-x-label {
  fill: #64748b; font-size: 11px; font-weight: 700;
}
.bc-trend-point-label {
  fill: #6366f1; font-size: 10px; font-weight: 800;
}

.bc-staff-card {
  border: 1px solid #e5e7eb; border-radius: 12px; padding: 14px 14px 10px;
  background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
}
.bc-staff-summary {
  display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin-bottom: 12px;
}
.bc-staff-kpi {
  border: 1px solid #e5e7eb; border-radius: 10px; padding: 10px 12px; background: #fff;
}
.bc-staff-kpi-label {
  font-size: 0.68rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px; color: #6b7280;
}
.bc-staff-kpi-value {
  font-size: 1.2rem; font-weight: 800; color: #111827; margin-top: 3px;
}
.bc-staff-legend {
  display: flex; align-items: center; gap: 14px; flex-wrap: wrap; margin-bottom: 8px;
  font-size: 0.72rem; font-weight: 700; color: #475569;
}
.bc-staff-note {
  margin-bottom: 8px; font-size: 0.72rem; color: #64748b; font-style: italic;
}
.bc-staff-legend span {
  display: inline-flex; align-items: center; gap: 6px;
}
.bc-staff-legend i {
  width: 10px; height: 10px; border-radius: 999px; display: inline-block;
}
.bc-staff-chart-wrap {
  width: 100%; overflow: hidden; margin-bottom: 8px;
}
.bc-staff-chart {
  width: 100%; height: auto; display: block;
}
.bc-staff-axis-label {
  fill: #64748b; font-size: 10px; font-weight: 700;
}
.bc-staff-point-label {
  fill: #1d4ed8; font-size: 10px; font-weight: 800;
}
.bc-staff-table tbody tr:nth-child(even) {
  background: rgba(255,255,255,0.65);
}

.bc-rank {
  display: inline-flex; align-items: center; justify-content: center;
  width: 24px; height: 24px; border-radius: 6px;
  font-weight: 700; font-size: 0.78rem; background: #f3f4f6; color: #6b7280;
}
.bc-rank-1 { background: #fef3c7; color: #b45309; }
.bc-rank-2 { background: #e5e7eb; color: #4b5563; }
.bc-rank-3 { background: #fde4d3; color: #9a3412; }

.bc-footer {
  margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e7eb;
  display: flex; justify-content: space-between; flex-wrap: wrap; gap: 8px;
  font-size: 0.72rem; color: #9ca3af;
}

/* ── Print: A4, ẩn UI thừa ── */
@media (max-width: 760px) {
  .bc-donut-grid { grid-template-columns: 1fr; }
  .bc-donut-content { grid-template-columns: 118px minmax(0, 1fr); }
  .bc-donut-chart,
  .bc-donut-chart svg { width: 118px; height: 118px; }
  .bc-trend-card { padding: 14px 12px 8px; }
  .bc-staff-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media print {
  @page { size: A4; margin: 14mm; }
  body { background: #fff !important; }
  .sidebar-wrapper, .sidebar-toggle-btn, .mobile-header, .no-print { display: none !important; }
  .main-content { margin: 0 !important; padding: 0 !important; }
  .content-fluid { padding: 0 !important; max-width: 100% !important; }
  .bao-cao-wrap { max-width: 100% !important; margin: 0 !important; }
  .bc-page {
    box-shadow: none !important; border: none !important;
    padding: 0 !important; border-radius: 0 !important;
  }
  .bc-section-title { break-after: avoid; }
  .bc-table { break-inside: auto; }
  .bc-table tr { break-inside: avoid; }
  .bc-kpi-grid { break-inside: avoid; }
  .bc-trend-card { break-inside: avoid; }
  .bc-staff-card, .bc-staff-summary { break-inside: avoid; }
}
`;
