'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, CheckCircle2, Circle, Loader2, RefreshCw, Users } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

type PresenceRow = {
  id_nhan_vien: string;
  ho_ten: string;
  email: string;
  phong_KD: string;
  last_seen_at: string | null;
  status: 'online' | 'offline';
};

type PresenceSortColumn = 'ho_ten' | 'email' | 'phong_KD' | 'status' | 'last_seen_at';
type PresenceSort = { column: PresenceSortColumn; direction: 'asc' | 'desc' };

function formatLastSeen(value: string | null): string {
  if (!value) return 'Chưa ghi nhận';
  return new Date(value).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });
}

export default function SaleOnlinePage() {
  const { isAdmin, isLoading: authLoading } = useAuth();
  const [rows, setRows] = useState<PresenceRow[]>([]);
  const [department, setDepartment] = useState('');
  const [sort, setSort] = useState<PresenceSort | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/presence', { cache: 'no-store' });
      const result = await response.json();
      if (!result.success) throw new Error(result.error || 'Không thể tải trạng thái online');
      setRows(result.data);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể tải trạng thái online');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (isAdmin) void load(); }, [isAdmin, load]);
  useEffect(() => {
    if (!isAdmin) return;
    const timer = window.setInterval(() => { void load(); }, 30_000);
    return () => window.clearInterval(timer);
  }, [isAdmin, load]);

  const departments = useMemo(
    () => [...new Set(rows.map(row => row.phong_KD).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'vi')),
    [rows],
  );
  const filtered = department ? rows.filter(row => row.phong_KD === department) : rows;
  const sortedRows = useMemo(() => {
    if (!sort) return filtered;
    return [...filtered].sort((a, b) => {
      const va = a[sort.column];
      const vb = b[sort.column];
      const comparison = sort.column === 'last_seen_at'
        ? (va ? new Date(va).getTime() : 0) - (vb ? new Date(vb).getTime() : 0)
        : String(va || '').localeCompare(String(vb || ''), 'vi');
      return (sort.direction === 'asc' ? comparison : -comparison)
        || a.ho_ten.localeCompare(b.ho_ten, 'vi');
    });
  }, [filtered, sort]);
  const onlineCount = filtered.filter(row => row.status === 'online').length;

  function toggleSort(column: PresenceSortColumn) {
    setSort(current => {
      if (!current || current.column !== column) return { column, direction: 'asc' };
      if (current.direction === 'asc') return { column, direction: 'desc' };
      return null;
    });
  }

  function tableHeader(column: PresenceSortColumn, label: string) {
    const direction = sort?.column === column ? sort.direction : null;
    return <th key={column} style={{ padding: 0 }}>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={() => toggleSort(column)}
        title="Bấm để sắp xếp"
        style={{ width: '100%', justifyContent: 'flex-start', gap: 5, fontWeight: 650, color: 'inherit' }}
      >
        {label}
        {direction === 'asc' ? <ArrowUp size={12} /> : direction === 'desc' ? <ArrowDown size={12} /> : <ArrowUpDown size={11} style={{ opacity: 0.45 }} />}
      </button>
    </th>;
  }

  if (authLoading) return null;
  if (!isAdmin) return <div className="empty-state"><Users size={40} /><h3>Không có quyền truy cập</h3></div>;

  return <div>
    <div className="page-header">
      <div className="page-header-left">
        <h1>Sale Online</h1>
        <p>Theo dõi trạng thái đăng nhập của Sale · Online nếu có hoạt động trong 3 phút gần nhất</p>
      </div>
      <button className="btn btn-secondary" onClick={() => void load()} disabled={loading}>
        {loading ? <Loader2 size={15} className="spin" /> : <RefreshCw size={15} />} Làm mới
      </button>
    </div>

    {error && <div className="card" style={{ padding: 14, marginBottom: 14, color: '#b91c1c' }}>{error}</div>}
    <div className="card" style={{ padding: 14, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
      <strong><CheckCircle2 size={16} style={{ verticalAlign: 'middle', color: '#16a34a' }} /> Đang online: {onlineCount}</strong>
      <span style={{ color: 'var(--text-muted)' }}> / {filtered.length} Sale</span>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
        <span style={{ color: 'var(--text-label)', fontSize: 13 }}>Phòng:</span>
        <select className="form-select" style={{ width: 190 }} value={department} onChange={event => setDepartment(event.target.value)}>
          <option value="">Tất cả Phòng</option>
          {departments.map(item => <option key={item} value={item}>{item}</option>)}
        </select>
      </label>
    </div>

    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      {loading && rows.length === 0 ? <div className="loading-spinner"><div className="spinner" /></div> : filtered.length === 0 ? <div className="empty-state"><Users size={40} /><h3>Chưa có dữ liệu Sale</h3></div> : <div className="table-wrapper">
        <table className="data-table">
          <thead><tr>
            {tableHeader('ho_ten', 'Sale')}
            {tableHeader('email', 'Email')}
            {tableHeader('phong_KD', 'Phòng')}
            {tableHeader('status', 'Trạng thái')}
            {tableHeader('last_seen_at', 'Hoạt động gần nhất')}
          </tr></thead>
          <tbody>{sortedRows.map(row => <tr key={row.id_nhan_vien}>
            <td style={{ fontWeight: 650 }}>{row.ho_ten}</td>
            <td>{row.email}</td>
            <td>{row.phong_KD || '—'}</td>
            <td><span className="badge" style={{ background: row.status === 'online' ? '#dcfce7' : '#f1f5f9', color: row.status === 'online' ? '#15803d' : '#64748b' }}>
              {row.status === 'online' ? <CheckCircle2 size={13} /> : <Circle size={13} />} {row.status === 'online' ? 'Online' : 'Offline'}
            </span></td>
            <td>{formatLastSeen(row.last_seen_at)}</td>
          </tr>)}</tbody>
        </table>
      </div>}
    </div>
  </div>;
}
