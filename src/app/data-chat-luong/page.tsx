'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Download, Filter, Loader2, RefreshCw, Sheet, TrendingUp, Users } from 'lucide-react';
import type { QualifiedLeadFilters } from '@/lib/types';
import { useAuth } from '@/hooks/useAuth';

interface QualityRow {
  id_khach_hang: string; ten_KH: string; so_dien_thoai: string; du_an: string; san_pham_quan_tam: string;
  lead_quality_score: number; lead_quality_rank: string; qualification_status: string; nguon_data: string;
  telesale: string; sale_nhan: string; muc_do_quan_tam: string; ngan_sach_min: number; ngan_sach_max: number;
  handoff_status: string; pipeline_status: string; latest_note: string;
}
interface GroupMetric { name: string; total: number; contacted: number; interested: number; qualified: number; hot: number; transactions: number; qualifiedRate: number; hotRate: number }
interface DashboardData {
  rows: QualityRow[];
  metrics: { total: number; contacted: number; interested: number; qualified: number; hot: number; transactions: number };
  conversion: { contactRate: number; interestRate: number; qualifiedRate: number; hotRate: number; transactionRate: number };
  byTelesale: GroupMetric[]; bySource: GroupMetric[];
  options: { projects: string[]; telesales: string[]; sales: string[]; sources: string[]; pipelineStatuses: string[] };
}

const emptyFilters: QualifiedLeadFilters = {};
function percent(value: number): string { return `${Math.round(value * 100)}%`; }
function money(value: number): string { return value ? new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(value) : '—'; }
function rankColor(rank: string): string { return rank === 'HOT' ? '#dc2626' : rank === 'QUALIFIED' ? '#059669' : rank === 'WARM' ? '#d97706' : '#64748b'; }

export default function DataChatLuongPage() {
  const { isAdmin, isLoading: authLoading } = useAuth();
  const [filters, setFilters] = useState<QualifiedLeadFilters>(emptyFilters);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState('');
  const [error, setError] = useState('');

  const params = useMemo(() => {
    const query = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => { if (value !== undefined && value !== '') query.set(key, String(value)); });
    return query;
  }, [filters]);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const response = await fetch(`/api/crm/qualified-leads?${params.toString()}`, { cache: 'no-store' });
      const result = await response.json();
      if (!result.success) throw new Error(result.error);
      setData(result.data);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không tải được dữ liệu'); }
    finally { setLoading(false); }
  }, [params]);
  useEffect(() => { const timer = setTimeout(() => void load(), 200); return () => clearTimeout(timer); }, [load]);

  const update = (key: keyof QualifiedLeadFilters, value: string) => setFilters(current => ({
    ...current,
    [key]: ['scoreMin', 'scoreMax', 'budgetMin', 'budgetMax'].includes(key) ? (value === '' ? undefined : Number(value)) : value || undefined,
  }));

  async function exportGoogle() {
    setExporting('google'); setError('');
    try {
      const response = await fetch('/api/crm/qualified-leads/export/google-sheets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(filters) });
      const result = await response.json();
      if (!result.success) throw new Error(result.error);
      window.open(result.data.url, '_blank', 'noopener,noreferrer');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Export thất bại'); }
    finally { setExporting(''); }
  }

  const funnel = data ? [
    ['Tổng data', data.metrics.total, '#475569'], ['Đã liên hệ', data.metrics.contacted, '#2563eb'],
    ['Quan tâm', data.metrics.interested, '#0891b2'], ['Qualified', data.metrics.qualified, '#059669'],
    ['Hot', data.metrics.hot, '#dc2626'], ['Giao dịch', data.metrics.transactions, '#7c3aed'],
  ] as const : [];

  if (authLoading) return null;

  if (!isAdmin) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: 12, color: 'var(--text-secondary)' }}>
      <AlertCircle size={40} style={{ color: '#ef4444', opacity: 0.7 }} />
      <p style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Bạn không có quyền truy cập trang này</p>
      <p style={{ fontSize: 13, margin: 0 }}>CRM đang trong giai đoạn setup, tạm thời chỉ Admin/Chủ tịch mới có thể xem</p>
    </div>
  );

  return <div>
    <div className="page-header"><div className="page-header-left"><h1>Data tiềm năng</h1><p>Qualified Lead Funnel và chất lượng nguồn data — số liệu authoritative từ server</p></div><div style={{ display: 'flex', gap: 8 }}>
      <button className="btn btn-secondary" onClick={() => void load()} disabled={loading}><RefreshCw size={15} /> Làm mới</button>
      <a className="btn btn-secondary" href={`/api/crm/qualified-leads/export/xlsx?${params.toString()}`}><Download size={15} /> Excel</a>
      <button className="btn btn-primary" onClick={() => void exportGoogle()} disabled={Boolean(exporting)}>{exporting === 'google' ? <Loader2 size={15} className="spin" /> : <Sheet size={15} />} Google Sheets</button>
    </div></div>
    {/* Campaign CSKH (M1B.1): số liệu dưới đây chỉ đọc field CSKH/qualification
        Customer-global — với khách đã có CampaignMembership, các field này là
        DỮ LIỆU LEGACY ĐÃ ĐÓNG BĂNG (trạng thái tại thời điểm trước khi tham
        gia Campaign), KHÔNG phản ánh hoạt động CSKH đang diễn ra theo Campaign.
        Rewrite sang Membership-grain là phạm vi M2, chưa thực hiện ở đây. */}
    <div style={{ padding: '10px 14px', marginBottom: 14, borderRadius: 8, background: '#fffbeb', color: '#a16207', fontSize: 13 }}>
      Chỉ phản ánh khách chăm sóc theo Dự án (ngoài Campaign). Với khách đã tham gia Campaign, các field CSKH/qualification ở đây là dữ liệu legacy đã đóng băng — không cập nhật theo hoạt động CSKH trong Campaign. Data tiềm năng theo Campaign sẽ có ở bản cập nhật sau.
    </div>
    {error && <div style={{ background: '#fef2f2', color: '#b91c1c', borderRadius: 8, padding: 12, marginBottom: 14 }}>{error}</div>}

    <div className="card" style={{ padding: 14, marginBottom: 14 }}><div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12, fontWeight: 700 }}><Filter size={16} /> Bộ lọc authoritative</div><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 9 }}>
      <FilterSelect label="Dự án" value={filters.project} options={data?.options.projects} onChange={value => update('project', value)} />
      <FilterSelect label="Telesale" value={filters.telesale} options={data?.options.telesales} onChange={value => update('telesale', value)} />
      <FilterSelect label="Sale" value={filters.sale} options={data?.options.sales} onChange={value => update('sale', value)} />
      <FilterSelect label="Nguồn data" value={filters.source} options={data?.options.sources} onChange={value => update('source', value)} />
      <FilterSelect label="Lead Rank" value={filters.rank} options={['HOT', 'QUALIFIED', 'WARM', 'UNQUALIFIED']} onChange={value => update('rank', value)} />
      <FilterSelect label="Mức quan tâm" value={filters.interest} options={['Rất cao', 'Cao', 'Trung bình', 'Thấp', 'Chưa xác định']} onChange={value => update('interest', value)} />
      <FilterSelect label="Mục đích" value={filters.purpose} options={['Để ở', 'Đầu tư', 'Cho thuê', 'Khác']} onChange={value => update('purpose', value)} />
      <FilterSelect label="Thời gian mua" value={filters.timeframe} options={['Trong 1 tháng', '1-3 tháng', '3-6 tháng', '6-12 tháng', 'Trên 12 tháng', 'Chưa xác định']} onChange={value => update('timeframe', value)} />
      <FilterSelect label="Handoff" value={filters.handoffStatus} options={['Chưa bàn giao', 'Chờ xác nhận', 'Đã nhận', 'Từ chối', 'Thiếu người nhận']} onChange={value => update('handoffStatus', value)} />
      <FilterSelect label="Pipeline" value={filters.pipelineStatus} options={data?.options.pipelineStatuses} onChange={value => update('pipelineStatus', value)} />
      <FilterInput label="Từ ngày" type="date" value={filters.from} onChange={value => update('from', value)} />
      <FilterInput label="Đến ngày" type="date" value={filters.to} onChange={value => update('to', value)} />
      <FilterInput label="Score từ" type="number" value={filters.scoreMin} onChange={value => update('scoreMin', value)} />
      <FilterInput label="Score đến" type="number" value={filters.scoreMax} onChange={value => update('scoreMax', value)} />
      <FilterInput label="Ngân sách từ" type="number" value={filters.budgetMin} onChange={value => update('budgetMin', value)} />
      <FilterInput label="Ngân sách đến" type="number" value={filters.budgetMax} onChange={value => update('budgetMax', value)} />
    </div><div style={{ marginTop: 10 }}><button className="btn btn-ghost btn-sm" onClick={() => setFilters(emptyFilters)}>Xóa bộ lọc</button></div></div>

    {loading && !data ? <div className="loading-spinner"><div className="spinner" /></div> : data && <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,minmax(120px,1fr))', gap: 10, overflowX: 'auto', marginBottom: 14 }}>{funnel.map(([label, value, color], index) => <div className="card" key={label} style={{ padding: 14, minWidth: 120, borderTop: `3px solid ${color}` }}><div style={{ fontSize: 12, color: 'var(--text-label)' }}>{label}</div><div style={{ fontSize: 25, fontWeight: 800, color, marginTop: 4 }}>{value}</div>{index > 0 && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{percent(value / Math.max(1, funnel[index - 1][1]))} bước trước</div>}</div>)}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 10, marginBottom: 14 }}>{Object.entries(data.conversion).map(([key, value]) => <div className="card" key={key} style={{ padding: 12 }}><div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{({ contactRate: 'Data → Liên hệ', interestRate: 'Liên hệ → Quan tâm', qualifiedRate: 'Quan tâm → Qualified', hotRate: 'Qualified → Hot', transactionRate: 'Qualified → Giao dịch' } as Record<string, string>)[key]}</div><div style={{ fontSize: 20, fontWeight: 750, marginTop: 3 }}>{percent(value)}</div></div>)}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}><GroupTable title="Chất lượng theo nguồn data" icon={<TrendingUp size={17} />} rows={data.bySource} /><GroupTable title="Chuyển đổi theo Telesale" icon={<Users size={17} />} rows={data.byTelesale} /></div>
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}><div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontWeight: 700 }}>Danh sách lead sau filter ({data.rows.length})</div><div className="table-wrapper" style={{ overflowX: 'auto' }}><table className="data-table" style={{ minWidth: 1250 }}><thead><tr><th>Khách hàng</th><th>Dự án / sản phẩm</th><th>Score</th><th>Qualification</th><th>Nguồn</th><th>Telesale</th><th>Sale</th><th>Ngân sách</th><th>Handoff / Pipeline</th><th>Ghi chú gần nhất</th></tr></thead><tbody>{data.rows.map(row => <tr key={row.id_khach_hang}><td><strong>{row.ten_KH}</strong><div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{row.so_dien_thoai}</div></td><td>{row.du_an || '—'}<div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{row.san_pham_quan_tam || 'Chưa rõ sản phẩm'}</div></td><td><span style={{ color: rankColor(row.lead_quality_rank), fontWeight: 800 }}>{row.lead_quality_score}</span><div style={{ fontSize: 10, color: rankColor(row.lead_quality_rank) }}>{row.lead_quality_rank}</div></td><td>{row.qualification_status}</td><td>{row.nguon_data || '—'}</td><td>{row.telesale || '—'}</td><td>{row.sale_nhan || '—'}</td><td>{money(row.ngan_sach_min)} – {money(row.ngan_sach_max)}</td><td>{row.handoff_status}<div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{row.pipeline_status || 'Chưa có Pipeline'}</div></td><td style={{ maxWidth: 220, whiteSpace: 'normal' }}>{row.latest_note || '—'}</td></tr>)}</tbody></table></div></div>
    </>}
  </div>;
}

function FilterSelect({ label, value, options = [], onChange }: { label: string; value?: string; options?: string[]; onChange: (value: string) => void }) {
  return <label style={{ fontSize: 11, color: 'var(--text-label)' }}>{label}<select className="form-select" style={{ marginTop: 4, fontSize: 12 }} value={value || ''} onChange={event => onChange(event.target.value)}><option value="">Tất cả</option>{options.map(option => <option key={option} value={option}>{option}</option>)}</select></label>;
}
function FilterInput({ label, value, type, onChange }: { label: string; value?: string | number; type: string; onChange: (value: string) => void }) {
  return <label style={{ fontSize: 11, color: 'var(--text-label)' }}>{label}<input className="form-input" style={{ marginTop: 4, fontSize: 12 }} type={type} value={value ?? ''} onChange={event => onChange(event.target.value)} /></label>;
}
function GroupTable({ title, icon, rows }: { title: string; icon: React.ReactNode; rows: GroupMetric[] }) {
  return <div className="card" style={{ padding: 0, overflow: 'hidden' }}><div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 7, alignItems: 'center', fontWeight: 700 }}>{icon}{title}</div><div style={{ maxHeight: 320, overflowY: 'auto' }}><table className="data-table"><thead><tr><th>Tên</th><th>Data</th><th>Qualified</th><th>Hot</th><th>GD</th></tr></thead><tbody>{rows.map(row => <tr key={row.name}><td>{row.name}</td><td>{row.total}</td><td>{row.qualified} <small>({percent(row.qualifiedRate)})</small></td><td style={{ color: '#dc2626' }}>{row.hot}</td><td>{row.transactions}</td></tr>)}</tbody></table></div></div>;
}
