'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Search, Plus, Edit3, Trash2, X, ChevronLeft, ChevronRight,
  Users, Phone, Mail, Filter
} from 'lucide-react';
import type { KhachHang, NhanVien } from '@/lib/types';
import { formatDate, formatPhone } from '@/lib/utils';
import { NGUON } from '@/lib/constants';

export default function KhachHangPage() {
  const [data, setData] = useState<KhachHang[]>([]);
  const [employees, setEmployees] = useState<NhanVien[]>([]);
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

  // Debounced search
  const [searchInput, setSearchInput] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

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
        <button className="btn btn-primary" onClick={openCreate}>
          <Plus size={18} />
          Thêm khách hàng
        </button>
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
                    <th>Sale</th>
                    <th>Ngày tạo</th>
                    <th style={{ width: 90, textAlign: 'center' }}>Thao tác</th>
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
                      <td style={{ fontWeight: 500, color: 'var(--primary-text)' }}>{kh.sale_phu_trach || '—'}</td>
                      <td>{formatDate(kh.ngay_tao)}</td>
                      <td>
                        <div className="flex items-center gap-2" style={{ justifyContent: 'center' }}>
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
