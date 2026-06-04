'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search, Plus, Edit3, Trash2, X, ChevronLeft, ChevronRight,
  Users, Phone, Mail, GitBranch, RefreshCw, CheckCircle, AlertCircle
} from 'lucide-react';
import type { KhachHang, NhanVien, Pipeline } from '@/lib/types';
import { formatDate, formatPhone } from '@/lib/utils';
import { NGUON, GIAI_DOAN_COLORS } from '@/lib/constants';

export default function KhachHangPage() {
  const router = useRouter();
  const [data, setData] = useState<KhachHang[]>([]);
  const [employees, setEmployees] = useState<NhanVien[]>([]);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const limit = 20;

  // Filters
  const [search, setSearch] = useState('');
  const [nguon, setNguon] = useState('');
  const [sale, setSale] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<KhachHang | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [deletingId, setDeletingId] = useState('');
  const [saving, setSaving] = useState(false);

  // Sync từ phễu
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{
    imported: number; duplicates: number; errors: number;
    duplicateList: { ten_KH: string; so_dien_thoai: string; nguon: string }[];
    errorList: { ten_KH: string; nguon: string; error: string }[];
    bySource: Record<string, { imported: number; duplicates: number }>;
  } | null>(null);

  // Form
  const [form, setForm] = useState({
    ten_KH: '', so_dien_thoai: '', email: '',
    nguon: '', nhu_cau: '', ghi_chu: '', sale_phu_trach: '',
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (search) params.set('search', search);
      if (nguon) params.set('nguon', nguon);
      if (sale) params.set('sale', sale);
      if (fromDate) params.set('from', fromDate);
      if (toDate) params.set('to', toDate);
      const res = await fetch(`/api/khach-hang?${params}`);
      const result = await res.json();
      if (result.success) {
        setData(result.data);
        setTotal(result.total);
      }
    } catch (err) {
      console.error('Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [page, search, nguon, sale, fromDate, toDate]);

  const fetchEmployees = useCallback(async () => {
    try {
      const res = await fetch('/api/nhan-vien');
      const result = await res.json();
      if (result.success) setEmployees(result.data);
    } catch (err) {
      console.error('Fetch employees error:', err);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { fetchEmployees(); }, [fetchEmployees]);

  // Load pipeline data in background để hiển thị trạng thái deal của mỗi KH
  useEffect(() => {
    fetch('/api/pipeline')
      .then(r => r.json())
      .then(d => { if (d.success) setPipelines(d.data); })
      .catch(() => {});
  }, []);

  // Lấy deal mới nhất của 1 khách hàng
  const getDealOfKH = (id_khach_hang: string): Pipeline | undefined =>
    pipelines
      .filter(p => p.id_khach_hang === id_khach_hang)
      .sort((a, b) => new Date(b.ngay_cap_nhat).getTime() - new Date(a.ngay_cap_nhat).getTime())[0];

  // Debounced search
  const [searchInput, setSearchInput] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const handleSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch('/api/khach-hang/sync-leads', { method: 'POST' });
      const result = await res.json();
      if (result.success) {
        setSyncResult(result);
        if (result.imported > 0) fetchData();
      } else {
        alert('Sync thất bại: ' + result.error);
      }
    } catch (err) {
      console.error('Sync error:', err);
      alert('Lỗi kết nối khi sync');
    } finally {
      setSyncing(false);
    }
  };

  const openCreate = () => {
    setEditingItem(null);
    setForm({ ten_KH: '', so_dien_thoai: '', email: '', nguon: '', nhu_cau: '', ghi_chu: '', sale_phu_trach: '' });
    setShowModal(true);
  };

  const openEdit = (kh: KhachHang) => {
    setEditingItem(kh);
    setForm({
      ten_KH: kh.ten_KH,
      so_dien_thoai: kh.so_dien_thoai,
      email: kh.email,
      nguon: kh.nguon,
      nhu_cau: kh.nhu_cau,
      ghi_chu: kh.ghi_chu,
      sale_phu_trach: kh.sale_phu_trach,
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.ten_KH.trim()) return;
    setSaving(true);
    try {
      const method = editingItem ? 'PUT' : 'POST';
      const body = editingItem ? { ...editingItem, ...form } : form;
      const res = await fetch('/api/khach-hang', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = await res.json();
      if (result.success) {
        setShowModal(false);
        fetchData();
      }
    } catch (err) {
      console.error('Save error:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      const res = await fetch('/api/khach-hang', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: deletingId }),
      });
      const result = await res.json();
      if (result.success) {
        setShowConfirm(false);
        fetchData();
      }
    } catch (err) {
      console.error('Delete error:', err);
    }
  };

  const totalPages = Math.ceil(total / limit);

  const clearFilters = () => {
    setSearchInput('');
    setNguon('');
    setSale('');
    setFromDate('');
    setToDate('');
    setPage(1);
  };

  const hasFilters = searchInput || nguon || sale || fromDate || toDate;

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div className="page-header-left">
          <h1>Khách hàng</h1>
          <p>Quản lý thông tin khách hàng ({total} khách hàng)</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="btn btn-secondary"
            onClick={handleSync}
            disabled={syncing}
          >
            <RefreshCw size={16} style={syncing ? { animation: 'spin 1s linear infinite' } : {}} />
            {syncing ? 'Đang sync...' : 'Sync từ phễu'}
          </button>
          <button className="btn btn-primary" onClick={openCreate}>
            <Plus size={18} />
            Thêm khách hàng
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="filter-bar" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div className="search-wrapper" style={{ flex: '1 1 100%', minWidth: 0 }}>
          <Search size={16} className="search-icon" />
          <input
            className="form-input"
            placeholder="Tìm kiếm theo tên, SĐT, email..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', width: '100%' }}>
          <select className="form-select" style={{ width: 'auto', minWidth: 140, flex: '0 0 auto' }} value={nguon} onChange={(e) => { setNguon(e.target.value); setPage(1); }}>
            <option value="">Tất cả nguồn</option>
            {NGUON.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          <select className="form-select" style={{ width: 'auto', minWidth: 130, flex: '0 0 auto' }} value={sale} onChange={(e) => { setSale(e.target.value); setPage(1); }}>
            <option value="">Tất cả sale</option>
            {employees.map(nv => <option key={nv.id_nhan_vien} value={nv.ho_ten}>{nv.ho_ten}</option>)}
          </select>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: '0 0 auto' }}>
            <span style={{ fontSize: '0.8125rem', color: 'var(--text-label)', whiteSpace: 'nowrap' }}>Từ</span>
            <input type="date" className="form-input" style={{ width: 'auto', minWidth: 140 }}
              value={fromDate} onChange={(e) => { setFromDate(e.target.value); setPage(1); }}
            />
            <span style={{ fontSize: '0.8125rem', color: 'var(--text-label)', whiteSpace: 'nowrap' }}>đến</span>
            <input type="date" className="form-input" style={{ width: 'auto', minWidth: 140 }}
              value={toDate} onChange={(e) => { setToDate(e.target.value); setPage(1); }}
            />
          </div>
          {hasFilters && (
            <button className="btn btn-ghost btn-sm" style={{ flex: '0 0 auto', whiteSpace: 'nowrap' }} onClick={clearFilters}>
              <X size={14} />
              Xóa lọc
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div className="loading-spinner">
            <div className="spinner" />
          </div>
        ) : data.length === 0 ? (
          <div className="empty-state">
            <Users size={40} />
            <h3>Chưa có khách hàng</h3>
            <p>Nhấn &quot;Thêm khách hàng&quot; để tạo mới</p>
          </div>
        ) : (
          <>
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ width: 50 }}>#</th>
                    <th>Tên KH</th>
                    <th>SĐT</th>
                    <th>Email</th>
                    <th>Nguồn</th>
                    <th>Nhu cầu</th>
                    <th>Deal</th>
                    <th>Sale</th>
                    <th>Ngày tạo</th>
                    <th style={{ width: 140, textAlign: 'center' }}>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((kh, idx) => (
                    <tr key={kh.id_khach_hang}>
                      <td style={{ color: 'var(--text-label)', fontWeight: 500 }}>
                        {(page - 1) * limit + idx + 1}
                      </td>
                      <td style={{ fontWeight: 500, color: 'var(--text-title)' }}>{kh.ten_KH}</td>
                      <td>
                        <span className="flex items-center gap-2">
                          <Phone size={13} style={{ color: 'var(--text-label)' }} />
                          {formatPhone(kh.so_dien_thoai)}
                        </span>
                      </td>
                      <td>
                        <span className="flex items-center gap-2">
                          <Mail size={13} style={{ color: 'var(--text-label)' }} />
                          {kh.email || '—'}
                        </span>
                      </td>
                      <td>
                        {kh.nguon ? (
                          <span className="badge badge-info">{kh.nguon}</span>
                        ) : '—'}
                      </td>
                      <td className="truncate" style={{ maxWidth: 200 }}>{kh.nhu_cau || '—'}</td>
                      <td>
                        {(() => {
                          const deal = getDealOfKH(kh.id_khach_hang);
                          if (!deal) return <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>—</span>;
                          const colors = GIAI_DOAN_COLORS[deal.giai_doan] || { bg: '#f1f5f9', text: '#475569' };
                          return (
                            <span className="badge" style={{ background: colors.bg, color: colors.text, fontSize: '0.72rem', cursor: 'pointer' }}
                              onClick={() => router.push(`/pipeline?kh=${kh.id_khach_hang}`)}>
                              {deal.giai_doan}
                            </span>
                          );
                        })()}
                      </td>
                      <td style={{ fontWeight: 500, color: 'var(--primary-text)' }}>{kh.sale_phu_trach || '—'}</td>
                      <td>{formatDate(kh.ngay_tao)}</td>
                      <td>
                        <div className="flex items-center gap-2" style={{ justifyContent: 'center' }}>
                          <button
                            className="btn btn-ghost btn-icon btn-sm"
                            title="Xem deal trong Pipeline"
                            style={{ color: getDealOfKH(kh.id_khach_hang) ? 'var(--primary)' : 'var(--text-muted)' }}
                            onClick={() => router.push(`/pipeline?kh=${kh.id_khach_hang}`)}
                          >
                            <GitBranch size={15} />
                          </button>
                          <button className="btn btn-ghost btn-icon btn-sm" onClick={() => openEdit(kh)} title="Sửa">
                            <Edit3 size={15} />
                          </button>
                          <button className="btn btn-ghost btn-icon btn-sm" onClick={() => { setDeletingId(kh.id_khach_hang); setShowConfirm(true); }} title="Xóa"
                            style={{ color: 'var(--danger-text)' }}>
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="pagination" style={{ padding: '12px 20px' }}>
                <span className="pagination-info">
                  Hiển thị {(page - 1) * limit + 1}–{Math.min(page * limit, total)} / {total}
                </span>
                <div className="pagination-buttons">
                  <button className="pagination-btn" disabled={page === 1} onClick={() => setPage(page - 1)}>
                    <ChevronLeft size={16} />
                  </button>
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pg: number;
                    if (totalPages <= 5) {
                      pg = i + 1;
                    } else if (page <= 3) {
                      pg = i + 1;
                    } else if (page >= totalPages - 2) {
                      pg = totalPages - 4 + i;
                    } else {
                      pg = page - 2 + i;
                    }
                    return (
                      <button key={pg} className={`pagination-btn ${page === pg ? 'active' : ''}`}
                        onClick={() => setPage(pg)}>
                        {pg}
                      </button>
                    );
                  })}
                  <button className="pagination-btn" disabled={page === totalPages} onClick={() => setPage(page + 1)}>
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">
                {editingItem ? 'Chỉnh sửa khách hàng' : 'Thêm khách hàng mới'}
              </h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowModal(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Tên khách hàng *</label>
                <input className="form-input" value={form.ten_KH}
                  onChange={(e) => setForm({ ...form, ten_KH: e.target.value })} placeholder="Nhập tên khách hàng" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div className="form-group">
                  <label className="form-label">Số điện thoại</label>
                  <input className="form-input" value={form.so_dien_thoai}
                    onChange={(e) => setForm({ ...form, so_dien_thoai: e.target.value })} placeholder="0901234567" />
                </div>
                <div className="form-group">
                  <label className="form-label">Email</label>
                  <input className="form-input" type="email" value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="email@example.com" />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div className="form-group">
                  <label className="form-label">Nguồn</label>
                  <select className="form-select" value={form.nguon}
                    onChange={(e) => setForm({ ...form, nguon: e.target.value })}>
                    <option value="">Chọn nguồn</option>
                    {NGUON.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Sale phụ trách</label>
                  <select className="form-select" value={form.sale_phu_trach}
                    onChange={(e) => setForm({ ...form, sale_phu_trach: e.target.value })}>
                    <option value="">Chọn sale</option>
                    {employees.map(nv => <option key={nv.id_nhan_vien} value={nv.ho_ten}>{nv.ho_ten}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Nhu cầu</label>
                <textarea className="form-textarea" value={form.nhu_cau}
                  onChange={(e) => setForm({ ...form, nhu_cau: e.target.value })} placeholder="Mô tả nhu cầu" />
              </div>
              <div className="form-group">
                <label className="form-label">Ghi chú</label>
                <textarea className="form-textarea" value={form.ghi_chu}
                  onChange={(e) => setForm({ ...form, ghi_chu: e.target.value })} placeholder="Ghi chú thêm" />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Hủy</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving || !form.ten_KH.trim()}>
                {saving ? 'Đang lưu...' : (editingItem ? 'Cập nhật' : 'Thêm mới')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sync Result Modal */}
      {syncResult && (
        <div className="modal-overlay" onClick={() => setSyncResult(null)}>
          <div className="modal-content" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Kết quả Sync từ phễu</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setSyncResult(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Tổng kết */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <div style={{ textAlign: 'center', padding: '12px 8px', background: '#f0fdf4', borderRadius: 8 }}>
                  <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#16a34a' }}>{syncResult.imported}</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-label)', marginTop: 2 }}>Đã thêm mới</div>
                </div>
                <div style={{ textAlign: 'center', padding: '12px 8px', background: '#fffbeb', borderRadius: 8 }}>
                  <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#d97706' }}>{syncResult.duplicates}</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-label)', marginTop: 2 }}>Trùng SĐT</div>
                </div>
                <div style={{ textAlign: 'center', padding: '12px 8px', background: '#fef2f2', borderRadius: 8 }}>
                  <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#dc2626' }}>{syncResult.errors}</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-label)', marginTop: 2 }}>Lỗi</div>
                </div>
              </div>

              {/* Breakdown theo nguồn */}
              {syncResult.bySource && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {Object.entries(syncResult.bySource).map(([src, stat]) => (
                    <div key={src} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', background: 'var(--bg-subtle, #f8fafc)', border: '1px solid var(--border)', borderRadius: 20, fontSize: '0.82rem' }}>
                      <span style={{ fontWeight: 600 }}>{src}</span>
                      <span style={{ color: '#16a34a' }}>+{stat.imported}</span>
                      {stat.duplicates > 0 && <span style={{ color: '#d97706' }}>/ {stat.duplicates} trùng</span>}
                    </div>
                  ))}
                </div>
              )}

              {syncResult.duplicateList.length > 0 && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, color: '#d97706', fontWeight: 600, fontSize: '0.85rem' }}>
                    <AlertCircle size={15} />
                    Bỏ qua (đã tồn tại trong CRM)
                  </div>
                  <div style={{ maxHeight: 140, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 6 }}>
                    {syncResult.duplicateList.map((d, i) => (
                      <div key={i} style={{ padding: '6px 12px', fontSize: '0.82rem', borderBottom: i < syncResult.duplicateList.length - 1 ? '1px solid var(--border)' : 'none', display: 'flex', justifyContent: 'space-between' }}>
                        <span>{d.ten_KH}</span>
                        <span style={{ color: 'var(--text-label)' }}>{d.so_dien_thoai}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {syncResult.errorList.length > 0 && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, color: '#dc2626', fontWeight: 600, fontSize: '0.85rem' }}>
                    <AlertCircle size={15} />
                    Lỗi khi ghi dữ liệu
                  </div>
                  <div style={{ maxHeight: 120, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 6 }}>
                    {syncResult.errorList.map((e, i) => (
                      <div key={i} style={{ padding: '6px 12px', fontSize: '0.82rem', borderBottom: i < syncResult.errorList.length - 1 ? '1px solid var(--border)' : 'none' }}>
                        <span style={{ fontWeight: 500 }}>{e.ten_KH}</span>
                        <span style={{ color: 'var(--text-label)', marginLeft: 8 }}>{e.error}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {syncResult.imported > 0 && syncResult.errors === 0 && syncResult.duplicates === 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#16a34a', fontSize: '0.9rem' }}>
                  <CheckCircle size={18} />
                  Sync thành công {syncResult.imported} khách hàng mới!
                </div>
              )}

              {syncResult.imported === 0 && syncResult.errors === 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-label)', fontSize: '0.9rem' }}>
                  <CheckCircle size={18} />
                  Tất cả lead trong phễu đã có trong CRM.
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-primary" onClick={() => setSyncResult(null)}>Đóng</button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Delete */}
      {showConfirm && (
        <div className="confirm-overlay" onClick={() => setShowConfirm(false)}>
          <div className="confirm-box" onClick={(e) => e.stopPropagation()}>
            <h3>Xác nhận xóa</h3>
            <p>Bạn có chắc muốn xóa khách hàng này? Hành động này không thể hoàn tác.</p>
            <div className="confirm-actions">
              <button className="btn btn-secondary" onClick={() => setShowConfirm(false)}>Hủy</button>
              <button className="btn btn-danger" onClick={handleDelete}>Xóa</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
