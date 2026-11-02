'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowDown, ArrowUp, ArrowUpDown, Download, Filter, Loader2, Phone, RefreshCw, Sheet, TrendingUp, Users } from 'lucide-react';
import type { QualifiedLeadFilters } from '@/lib/types';
import { useAuth } from '@/hooks/useAuth';
import { useCrmModule } from '@/hooks/useCrmModule';
import { canAccessCrmModule } from '@/lib/crm-module-access';
import { leadQualityRankLabel, qualificationStatusLabel } from '@/lib/crm-funnel/quality-labels';

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
type LeadSortColumn = 'customer' | 'project' | 'sale' | 'status' | 'potential' | 'handoff';
interface LeadSort { column: LeadSortColumn; direction: 'asc' | 'desc' }

const emptyFilters: QualifiedLeadFilters = {};
function percent(value: number): string { return `${Math.round(value * 100)}%`; }
function statusTone(status: string): { bg: string; color: string } {
  if (status === 'HOT' || status === 'Tiềm năng cao') return { bg: '#fef2f2', color: '#b91c1c' };
  if (status === 'QUALIFIED' || status === 'Đủ điều kiện') return { bg: '#ecfdf5', color: '#047857' };
  if (status === 'INTERESTED' || status === 'Quan tâm') return { bg: '#eff6ff', color: '#1d4ed8' };
  if (status === 'CONTACTED' || status === 'Đã liên hệ') return { bg: '#fefce8', color: '#a16207' };
  return { bg: '#f1f5f9', color: '#64748b' };
}
function interestTone(interest: string): { bg: string; color: string } {
  if (interest === 'Rất cao') return { bg: '#fce7f3', color: '#be185d' };
  if (interest === 'Cao') return { bg: '#fff7ed', color: '#c2410c' };
  if (interest === 'Trung bình') return { bg: '#eff6ff', color: '#1d4ed8' };
  return { bg: '#f1f5f9', color: '#64748b' };
}
function leadSortValue(row: QualityRow, column: LeadSortColumn): string | number {
  if (column === 'customer') return row.ten_KH || '';
  if (column === 'project') return row.du_an || '';
  if (column === 'sale') return row.telesale || '';
  if (column === 'status') return qualificationStatusLabel(row.qualification_status);
  if (column === 'potential') return row.lead_quality_score || 0;
  return `${row.handoff_status || ''} ${row.pipeline_status || ''}`;
}

export default function DataChatLuongPage() {
  const { isAdmin, isLoading: authLoading } = useAuth();
  const { enabled: crmEnabled, isLoading: crmModuleLoading } = useCrmModule();
  const [filters, setFilters] = useState<QualifiedLeadFilters>(emptyFilters);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState('');
  const [error, setError] = useState('');
  const [leadSort, setLeadSort] = useState<LeadSort | null>(null);

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

  // DATA_TIEM_NANG_BUSINESS_REDESIGN_APPROVED — funnel còn 4 mốc, TRONG
  // population eligible (INTERESTED/QUALIFIED/HOT) — bỏ "Tổng data"/"Đã liên
  // hệ" (đo trên toàn bộ CSKH, ra khỏi quyền sở hữu trang này). UI CLEANUP:
  // bỏ tiếp thẻ "Quan tâm" đứng riêng — population đã gate ở entry (mọi dòng
  // đều đã ≥ INTERESTED) nên data.metrics.interested LUÔN bằng
  // data.metrics.total, hiển thị 2 thẻ trùng số nhau là dư thừa/gây hiểu lầm.
  // metrics.interested vẫn giữ nguyên ở backend (không đổi analytics.ts) —
  // chỉ không còn thẻ UI riêng đọc nó.
  const funnel = data ? [
    ['Tổng tiềm năng', data.metrics.total, '#475569'],
    ['Đủ điều kiện', data.metrics.qualified, '#059669'], ['Tiềm năng cao', data.metrics.hot, '#dc2626'],
    ['Giao dịch', data.metrics.transactions, '#7c3aed'],
  ] as const : [];
  const sortedRows = useMemo(() => {
    if (!data || !leadSort) return data?.rows ?? [];
    const direction = leadSort.direction === 'asc' ? 1 : -1;
    return [...data.rows].sort((left, right) => {
      const leftValue = leadSortValue(left, leadSort.column);
      const rightValue = leadSortValue(right, leadSort.column);
      if (typeof leftValue === 'number' && typeof rightValue === 'number') return (leftValue - rightValue) * direction;
      return String(leftValue).localeCompare(String(rightValue), 'vi', { sensitivity: 'base' }) * direction;
    });
  }, [data, leadSort]);

  function toggleLeadSort(column: LeadSortColumn) {
    setLeadSort(current => current?.column === column
      ? { column, direction: current.direction === 'asc' ? 'desc' : 'asc' }
      : { column, direction: 'asc' });
  }

  function sortableHeader(column: LeadSortColumn, label: string, width: number) {
    const direction = leadSort?.column === column ? leadSort.direction : null;
    return <th key={column} style={{ width, padding: 0 }}>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => toggleLeadSort(column)} title={`Sắp xếp theo ${label}`} aria-label={`Sắp xếp theo ${label}`} style={{ width: '100%', justifyContent: 'flex-start', gap: 5, fontWeight: 650, color: 'inherit' }}>
        {label}
        {direction === 'asc' ? <ArrowUp size={12} /> : direction === 'desc' ? <ArrowDown size={12} /> : <ArrowUpDown size={11} style={{ opacity: 0.45 }} />}
      </button>
    </th>;
  }

  if (authLoading || crmModuleLoading) return null;

  // CRM Module Toggle là authority DUY NHẤT cho việc non-admin có vào được
  // trang này hay không (thay thế hard-coded isAdmin-only gate cũ). Admin
  // luôn bypass; dữ liệu thực tế vẫn do canQualityDashboard (server-side,
  // useCrmAccess) quyết định như hiện tại.
  if (!canAccessCrmModule(isAdmin, crmEnabled)) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: 12, color: 'var(--text-secondary)' }}>
      <AlertCircle size={40} style={{ color: '#ef4444', opacity: 0.7 }} />
      <p style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Bạn không có quyền truy cập trang này</p>
      <p style={{ fontSize: 13, margin: 0 }}>Module CRM hiện đang tắt. Liên hệ Admin để bật lại.</p>
    </div>
  );

  return <div>
    <div className="page-header"><div className="page-header-left"><h1>Data tiềm năng</h1><p>Phễu chất lượng lead và chất lượng nguồn data — tổng hợp từ server</p></div><div style={{ display: 'flex', gap: 8 }}>
      <button className="btn btn-secondary" onClick={() => void load()} disabled={loading}><RefreshCw size={15} /> Làm mới</button>
      <a className="btn btn-secondary" href={`/api/crm/qualified-leads/export/xlsx?${params.toString()}`}><Download size={15} /> Excel</a>
      <button className="btn btn-primary" onClick={() => void exportGoogle()} disabled={Boolean(exporting)}>{exporting === 'google' ? <Loader2 size={15} className="spin" /> : <Sheet size={15} />} Google Sheets</button>
    </div></div>
    {/* Campaign CSKH (M1B.1): số liệu dưới đây đọc field CSKH/qualification
        Customer-global (KhachHang) — kể từ CAMPAIGN_CUSTOMER_QUALIFICATION_SYNC
        (commit d356167), kết quả qualification đạt được trong Campaign
        (CampaignMembership) được ĐỒNG BỘ sang canonical KhachHang (xem
        membership-workflow.ts) nên KHÔNG còn là dữ liệu đóng băng trước khi
        vào Campaign — khách đạt Quan tâm trở lên trong Campaign xuất hiện ở
        đây đúng như khách được chăm sóc ngoài Campaign.
        KHÔNG chuyển trang này sang đọc CampaignMembership: 1 Customer có thể
        thuộc NHIỀU Campaign (@@unique([customer_id, campaign_id]) — không có
        1 hàng "đại diện" duy nhất để gộp vào bảng tổng hợp toàn Customer này
        mà không tự chọn ngầm 1 Campaign. Cần quyết định kiến trúc lớn hơn
        (scope theo 1 Campaign, hay đổi grain của cả trang sang theo dòng
        Customer×Campaign) — ngoài phạm vi thay đổi localization/display này. */}
    <div style={{ padding: '10px 14px', marginBottom: 14, borderRadius: 8, background: '#fffbeb', color: '#a16207', fontSize: 13 }}>
      Khách hàng đạt mức Quan tâm trở lên sẽ được tổng hợp tại Data tiềm năng, bao gồm cả khách được chăm sóc trong Campaign. Quá trình chăm sóc theo Campaign được quản lý tại CSKH (mục &quot;Theo Campaign&quot;).
    </div>
    {error && <div style={{ background: '#fef2f2', color: '#b91c1c', borderRadius: 8, padding: 12, marginBottom: 14 }}>{error}</div>}

    <div className="card" style={{ padding: 14, marginBottom: 14 }}><div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12, fontWeight: 700 }}><Filter size={16} /> Bộ lọc dữ liệu</div><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 9 }}>
      <FilterSelect label="Dự án" value={filters.project} options={data?.options.projects} onChange={value => update('project', value)} />
      <FilterSelect label="Sale CSKH" value={filters.telesale} options={data?.options.telesales} onChange={value => update('telesale', value)} />
      <FilterSelect label="Sale nhận khách" value={filters.sale} options={data?.options.sales} onChange={value => update('sale', value)} />
      <FilterSelect label="Nguồn data" value={filters.source} options={data?.options.sources} onChange={value => update('source', value)} />
      <FilterSelect label="Xếp hạng" value={filters.rank} options={['HOT', 'QUALIFIED', 'WARM', 'UNQUALIFIED']} optionLabel={leadQualityRankLabel} onChange={value => update('rank', value)} />
      <FilterSelect label="Mức quan tâm" value={filters.interest} options={['Rất cao', 'Cao', 'Trung bình', 'Thấp', 'Chưa xác định']} onChange={value => update('interest', value)} />
      <FilterSelect label="Mục đích" value={filters.purpose} options={['Để ở', 'Đầu tư', 'Cho thuê', 'Khác']} onChange={value => update('purpose', value)} />
      <FilterSelect label="Thời gian mua" value={filters.timeframe} options={['Trong 1 tháng', '1-3 tháng', '3-6 tháng', '6-12 tháng', 'Trên 12 tháng', 'Chưa xác định']} onChange={value => update('timeframe', value)} />
      <FilterSelect label="Bàn giao" value={filters.handoffStatus} options={['Chưa bàn giao', 'Chờ xác nhận', 'Đã nhận', 'Từ chối', 'Thiếu người nhận']} onChange={value => update('handoffStatus', value)} />
      <FilterSelect label="Giao dịch" value={filters.pipelineStatus} options={data?.options.pipelineStatuses} onChange={value => update('pipelineStatus', value)} />
      <FilterInput label="Từ ngày" type="date" value={filters.from} onChange={value => update('from', value)} />
      <FilterInput label="Đến ngày" type="date" value={filters.to} onChange={value => update('to', value)} />
      <FilterInput label="Điểm từ" type="number" value={filters.scoreMin} onChange={value => update('scoreMin', value)} />
      <FilterInput label="Điểm đến" type="number" value={filters.scoreMax} onChange={value => update('scoreMax', value)} />
      <FilterInput label="Ngân sách từ" type="number" value={filters.budgetMin} onChange={value => update('budgetMin', value)} />
      <FilterInput label="Ngân sách đến" type="number" value={filters.budgetMax} onChange={value => update('budgetMax', value)} />
    </div><div style={{ marginTop: 10 }}><button className="btn btn-ghost btn-sm" onClick={() => setFilters(emptyFilters)}>Xóa bộ lọc</button></div></div>

    {loading && !data ? <div className="loading-spinner"><div className="spinner" /></div> : data && <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(120px,1fr))', gap: 10, overflowX: 'auto', marginBottom: 14 }}>{funnel.map(([label, value, color], index) => <div className="card" key={label} style={{ padding: 14, minWidth: 120, border: `2px solid ${color}55`, borderTop: `4px solid ${color}`, background: `${color}08` }}><div style={{ fontSize: 12, color: 'var(--text-label)' }}>{label}</div><div style={{ fontSize: 25, fontWeight: 800, color, marginTop: 4 }}>{value}</div>{index > 0 && <div style={{ fontSize: 11, color, marginTop: 4 }}>{percent(value / Math.max(1, funnel[index - 1][1]))} bước trước</div>}</div>)}</div>
      {/* DATA_TIEM_NANG_BUSINESS_REDESIGN_APPROVED — chỉ còn 3 conversion card
          trong phạm vi Data tiềm năng (contactRate/interestRate đo trên toàn
          bộ CSKH, ra khỏi trang này — API vẫn trả 2 field đó vì summarize()
          dùng chung cho mọi population, chỉ không hiển thị ở đây). */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 14 }}>{(['qualifiedRate', 'hotRate', 'transactionRate'] as const).map(key => <div className="card" key={key} style={{ padding: 12 }}><div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{({ qualifiedRate: 'Tiềm năng → Đủ điều kiện', hotRate: 'Đủ điều kiện → Tiềm năng cao', transactionRate: 'Đủ điều kiện → Giao dịch' } as Record<string, string>)[key]}</div><div style={{ fontSize: 20, fontWeight: 750, marginTop: 3 }}>{percent(data.conversion[key])}</div></div>)}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}><GroupTable title="Chất lượng theo nguồn data" icon={<TrendingUp size={17} />} rows={data.bySource} /><GroupTable title="Chuyển đổi theo Sale CSKH" icon={<Users size={17} />} rows={data.byTelesale} /></div>
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontWeight: 700 }}>Danh sách lead sau lọc ({data.rows.length})</div>
        <div className="table-wrapper" style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: '62vh' }}>
          <table className="data-table cskh-compact" style={{ minWidth: 860 }}>
            <thead><tr><th style={{ width: 42 }}>STT</th>{sortableHeader('customer', 'Khách hàng', 190)}{sortableHeader('project', 'Dự án', 150)}{sortableHeader('sale', 'Sale CSKH', 120)}{sortableHeader('status', 'Trạng thái', 135)}{sortableHeader('potential', 'Tiềm năng', 120)}{sortableHeader('handoff', 'Bàn giao / GD', 145)}</tr></thead>
            <tbody>{sortedRows.map((row, index) => {
              const status = statusTone(row.qualification_status);
              const rank = statusTone(row.lead_quality_rank);
              const interest = interestTone(row.muc_do_quan_tam);
              const interested = row.qualification_status === 'INTERESTED' || row.muc_do_quan_tam === 'Quan tâm';
              return <tr key={row.id_khach_hang} style={interested ? { background: '#F0FDF4' } : undefined}>
                <td style={{ color: 'var(--text-label)', fontWeight: 500 }}>{index + 1}</td>
                <td><div style={{ fontWeight: 700 }}>{row.ten_KH}</div>{row.so_dien_thoai && <a href={`tel:${row.so_dien_thoai}`} style={{ display: 'inline-flex', gap: 5, alignItems: 'center', marginTop: 5, color: 'var(--primary)', fontSize: 13 }}><Phone size={13} />{row.so_dien_thoai}</a>}</td>
                <td><span style={{ display: 'inline-block', maxWidth: 150, background: row.du_an ? 'linear-gradient(135deg, #EEF2FF 0%, #DBEAFE 100%)' : '#f8fafc', color: row.du_an ? '#3730A3' : 'var(--text-muted)', border: row.du_an ? '1px solid #818CF8' : '1px solid var(--border)', borderRadius: 12, padding: '6px 9px', fontWeight: row.du_an ? 700 : 500, lineHeight: 1.25 }}>{row.du_an || 'Chưa chọn dự án'}</span><div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 5 }}>{row.san_pham_quan_tam || 'Chưa rõ sản phẩm'}</div></td>
                <td>{row.telesale ? <><span style={{ background: '#ecfdf5', color: '#047857', borderRadius: 20, padding: '2px 6px', fontSize: 11, fontWeight: 650 }}>Đã chia</span><div style={{ fontWeight: 600, fontSize: 12, marginTop: 4 }}>{row.telesale}</div></> : <span style={{ background: '#f1f5f9', color: '#64748b', borderRadius: 20, padding: '2px 6px', fontSize: 11, fontWeight: 650 }}>Chưa chia</span>}</td>
                <td><span style={{ background: status.bg, color: status.color, borderRadius: 20, padding: '3px 7px', fontSize: 11, fontWeight: 650 }}>{qualificationStatusLabel(row.qualification_status)}</span><div style={{ fontSize: 11, color: interest.color, background: interest.bg, borderRadius: 999, padding: '2px 7px', fontWeight: 650, display: 'inline-block', marginTop: 5 }}>{row.muc_do_quan_tam || 'Chưa xác định'}</div></td>
                <td><span style={{ color: rank.color, fontWeight: 800, fontSize: 16 }}>{row.lead_quality_score}</span><div style={{ fontSize: 11, color: rank.color }}>{leadQualityRankLabel(row.lead_quality_rank)}</div></td>
                <td><div style={{ fontSize: 12, fontWeight: 600 }}>{row.handoff_status || 'Chưa bàn giao'}</div><div style={{ fontSize: 11, color: row.pipeline_status ? '#047857' : 'var(--text-muted)', marginTop: 4 }}>{row.pipeline_status || 'Chưa có Giao dịch'}</div></td>
              </tr>;
            })}</tbody>
          </table>
        </div>
      </div>
    </>}
  </div>;
}

function FilterSelect({ label, value, options = [], onChange, optionLabel }: { label: string; value?: string; options?: string[]; onChange: (value: string) => void; optionLabel?: (value: string) => string }) {
  // optionLabel chỉ đổi CHỮ hiển thị trong <option> — value gửi lên onChange/API
  // vẫn là giá trị enum gốc (VD 'HOT'), không đổi filter contract.
  return <label style={{ fontSize: 11, color: 'var(--text-label)' }}>{label}<select className="form-select" style={{ marginTop: 4, fontSize: 12 }} value={value || ''} onChange={event => onChange(event.target.value)}><option value="">Tất cả</option>{options.map(option => <option key={option} value={option}>{optionLabel ? optionLabel(option) : option}</option>)}</select></label>;
}
function FilterInput({ label, value, type, onChange }: { label: string; value?: string | number; type: string; onChange: (value: string) => void }) {
  return <label style={{ fontSize: 11, color: 'var(--text-label)' }}>{label}<input className="form-input" style={{ marginTop: 4, fontSize: 12 }} type={type} value={value ?? ''} onChange={event => onChange(event.target.value)} /></label>;
}
function GroupTable({ title, icon, rows }: { title: string; icon: React.ReactNode; rows: GroupMetric[] }) {
  return <div className="card" style={{ padding: 0, overflow: 'hidden' }}><div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 7, alignItems: 'center', fontWeight: 700 }}>{icon}{title}</div><div style={{ maxHeight: 320, overflowY: 'auto' }}><table className="data-table"><thead><tr><th>Tên</th><th>Data</th><th>Đủ điều kiện</th><th>Tiềm năng cao</th><th>GD</th></tr></thead><tbody>{rows.map(row => <tr key={row.name}><td>{row.name}</td><td>{row.total}</td><td>{row.qualified} <small>({percent(row.qualifiedRate)})</small></td><td style={{ color: '#dc2626' }}>{row.hot}</td><td>{row.transactions}</td></tr>)}</tbody></table></div></div>;
}
