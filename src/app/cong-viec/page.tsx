'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Plus, Edit3, Trash2, X, Search, CheckSquare,
  Clock, AlertTriangle, CheckCircle2, Circle
} from 'lucide-react';
import type { CongViec, NhanVien, Pipeline, KhachHang } from '@/lib/types';
import { formatDate } from '@/lib/utils';
import { TRANG_THAI_CONG_VIEC, TRANG_THAI_CV_COLORS } from '@/lib/constants';

export default function CongViecPage() {
  const [tasks, setTasks] = useState<CongViec[]>([]);
  const [employees, setEmployees] = useState<NhanVien[]>([]);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [customers, setCustomers] = useState<KhachHang[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [filterTrangThai, setFilterTrangThai] = useState('');
  const [filterSale, setFilterSale] = useState('');
  const [searchInput, setSearchInput] = useState('');

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<CongViec | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [deletingId, setDeletingId] = useState('');
  const [saving, setSaving] = useState(false);

  // Form
  const [form, setForm] = useState({
    ghi_chu: '', id_pipeline: '', trang_thai: 'Chưa làm',
    ngay_hen: '', sale_phu_trach: '', ket_qua: '',
  });

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [cvRes, nvRes, plRes, khRes] = await Promise.all([
        fetch('/api/cong-viec'), fetch('/api/nhan-vien'),
        fetch('/api/pipeline'), fetch('/api/khach-hang?limit=999'),
      ]);
      const [cvData, nvData, plData, khData] = await Promise.all([
        cvRes.json(), nvRes.json(), plRes.json(), khRes.json(),
      ]);
      if (cvData.success) setTasks(cvData.data);
      if (nvData.success) setEmployees(nvData.data);
      if (plData.success) setPipelines(plData.data);
      if (khData.success) setCustomers(khData.data);
    } catch (err) {
      console.error('Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Check if task is overdue
  const isOverdue = (cv: CongViec) => {
    if (cv.trang_thai === 'Hoàn thành') return false;
    if (!cv.ngay_hen) return false;
    return new Date(cv.ngay_hen) < new Date();
  };

  // Get customer name for pipeline
  const getPipelineLabel = (pipelineId: string) => {
    const pl = pipelines.find(p => p.id_pipeline === pipelineId);
    if (!pl) return pipelineId;
    const kh = customers.find(k => k.id_khach_hang === pl.id_khach_hang);
    return kh ? `${kh.ten_KH} — ${pl.giai_doan}` : pl.id_pipeline;
  };

  // Filter
  const filteredTasks = tasks.filter(cv => {
    if (filterTrangThai && cv.trang_thai !== filterTrangThai) return false;
    if (filterSale && cv.sale_phu_trach !== filterSale) return false;
    if (searchInput) {
      const q = searchInput.toLowerCase();
      return cv.ghi_chu.toLowerCase().includes(q) ||
        cv.ket_qua.toLowerCase().includes(q) ||
        cv.sale_phu_trach.toLowerCase().includes(q);
    }
    return true;
  });

  // Sort: overdue first, then by date
  const sortedTasks = [...filteredTasks].sort((a, b) => {
    const aOverdue = isOverdue(a) ? 0 : 1;
    const bOverdue = isOverdue(b) ? 0 : 1;
    if (aOverdue !== bOverdue) return aOverdue - bOverdue;
    return new Date(b.ngay_tao).getTime() - new Date(a.ngay_tao).getTime();
  });

  const statusIcon = (status: string) => {
    switch (status) {
      case 'Chưa làm': return <Circle size={14} />;
      case 'Đang làm': return <Clock size={14} />;
      case 'Hoàn thành': return <CheckCircle2 size={14} />;
      case 'Quá hạn': return <AlertTriangle size={14} />;
      default: return <Circle size={14} />;
    }
  };

  // Stats
  const stats = {
    total: tasks.length,
    chuaLam: tasks.filter(cv => cv.trang_thai === 'Chưa làm').length,
    dangLam: tasks.filter(cv => cv.trang_thai === 'Đang làm').length,
    hoanThanh: tasks.filter(cv => cv.trang_thai === 'Hoàn thành').length,
    quaHan: tasks.filter(cv => isOverdue(cv)).length,
  };

  const openCreate = () => {
    setEditingItem(null);
    setForm({ ghi_chu: '', id_pipeline: '', trang_thai: 'Chưa làm', ngay_hen: '', sale_phu_trach: '', ket_qua: '' });
    setShowModal(true);
  };

  const openEdit = (cv: CongViec) => {
    setEditingItem(cv);
    setForm({
      ghi_chu: cv.ghi_chu,
      id_pipeline: cv.id_pipeline,
      trang_thai: cv.trang_thai,
      ngay_hen: cv.ngay_hen ? cv.ngay_hen.split('T')[0] : '',
      sale_phu_trach: cv.sale_phu_trach,
      ket_qua: cv.ket_qua,
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.ghi_chu.trim()) return;
    setSaving(true);
    try {
      const method = editingItem ? 'PUT' : 'POST';
      const body = editingItem ? { ...editingItem, ...form } : form;
      const res = await fetch('/api/cong-viec', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = await res.json();
      if (result.success) {
        setShowModal(false);
        fetchAll();
      }
    } catch (err) {
      console.error('Save error:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      const res = await fetch('/api/cong-viec', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: deletingId }),
      });
      const result = await res.json();
      if (result.success) {
        setShowConfirm(false);
        fetchAll();
      }
    } catch (err) {
      console.error('Delete error:', err);
    }
  };

  if (loading) {
    return <div className="loading-spinner"><div className="spinner" /></div>;
  }

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div className="page-header-left">
          <h1>Công việc</h1>
          <p>Quản lý task và lịch hẹn</p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>
          <Plus size={18} />
          Thêm công việc
        </button>
      </div>

      {/* Status Summary Cards */}
      <div className="kpi-grid" style={{ marginBottom: 20 }}>
        <div className="kpi-card" style={{ padding: '16px 20px' }}>
          <div className="kpi-label" style={{ marginBottom: 6 }}>Tổng</div>
          <div className="kpi-value" style={{ fontSize: '1.5rem' }}>{stats.total}</div>
        </div>
        <div className="kpi-card" style={{ padding: '16px 20px' }}>
          <div className="kpi-label" style={{ marginBottom: 6 }}>Chưa làm</div>
          <div className="kpi-value" style={{ fontSize: '1.5rem', color: 'var(--text-muted)' }}>{stats.chuaLam}</div>
        </div>
        <div className="kpi-card" style={{ padding: '16px 20px' }}>
          <div className="kpi-label" style={{ marginBottom: 6 }}>Đang làm</div>
          <div className="kpi-value" style={{ fontSize: '1.5rem', color: 'var(--info-text)' }}>{stats.dangLam}</div>
        </div>
        <div className="kpi-card" style={{ padding: '16px 20px' }}>
          <div className="kpi-label" style={{ marginBottom: 6 }}>Hoàn thành</div>
          <div className="kpi-value" style={{ fontSize: '1.5rem', color: 'var(--success-text)' }}>{stats.hoanThanh}</div>
        </div>
        <div className="kpi-card" style={{ padding: '16px 20px', borderColor: stats.quaHan > 0 ? 'var(--danger-border)' : undefined }}>
          <div className="kpi-label" style={{ marginBottom: 6 }}>Quá hạn</div>
          <div className="kpi-value" style={{ fontSize: '1.5rem', color: stats.quaHan > 0 ? 'var(--danger-text)' : 'var(--text-muted)' }}>{stats.quaHan}</div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="filter-bar" style={{ flexWrap: 'nowrap' }}>
        <div className="search-wrapper" style={{ flex: '1 1 auto', minWidth: 250 }}>
          <Search size={16} className="search-icon" />
          <input className="form-input" placeholder="Tìm kiếm ghi chú, kết quả..."
            value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
        </div>
        <select className="form-select" style={{ flex: '0 0 auto', width: 'auto', minWidth: 160 }} value={filterTrangThai}
          onChange={(e) => setFilterTrangThai(e.target.value)}>
          <option value="">Tất cả trạng thái</option>
          {TRANG_THAI_CONG_VIEC.map(tt => <option key={tt} value={tt}>{tt}</option>)}
        </select>
        <select className="form-select" style={{ flex: '0 0 auto', width: 'auto', minWidth: 140 }} value={filterSale}
          onChange={(e) => setFilterSale(e.target.value)}>
          <option value="">Tất cả sale</option>
          {employees.map(nv => <option key={nv.id_nhan_vien} value={nv.ho_ten}>{nv.ho_ten}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {sortedTasks.length === 0 ? (
          <div className="empty-state">
            <CheckSquare size={40} />
            <h3>Chưa có công việc</h3>
            <p>Nhấn &quot;Thêm công việc&quot; để tạo mới</p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: 50 }}>#</th>
                  <th>Ghi chú</th>
                  <th>Pipeline</th>
                  <th>Trạng thái</th>
                  <th>Ngày hẹn</th>
                  <th>Sale</th>
                  <th>Kết quả</th>
                  <th>Ngày tạo</th>
                  <th style={{ width: 90, textAlign: 'center' }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {sortedTasks.map((cv, idx) => {
                  const overdue = isOverdue(cv);
                  const statusColors = TRANG_THAI_CV_COLORS[cv.trang_thai] || { bg: '#f1f5f9', text: '#475569' };

                  return (
                    <tr key={cv.id_cong_viec} style={overdue ? { background: 'var(--danger-bg)' } : undefined}>
                      <td style={{ color: 'var(--text-label)' }}>{idx + 1}</td>
                      <td style={{ fontWeight: 500, color: 'var(--text-title)', maxWidth: 280 }}>
                        <div className="truncate">{cv.ghi_chu || '—'}</div>
                      </td>
                      <td style={{ fontSize: '0.8125rem' }}>
                        {cv.id_pipeline ? getPipelineLabel(cv.id_pipeline) : '—'}
                      </td>
                      <td>
                        <span
                          className="badge"
                          style={{ background: overdue ? 'var(--danger-bg)' : statusColors.bg, color: overdue ? 'var(--danger-text)' : statusColors.text }}
                        >
                          {statusIcon(overdue ? 'Quá hạn' : cv.trang_thai)}
                          {overdue ? 'Quá hạn' : cv.trang_thai}
                        </span>
                      </td>
                      <td style={{ color: overdue ? 'var(--danger-text)' : undefined, fontWeight: overdue ? 600 : undefined }}>
                        {cv.ngay_hen ? formatDate(cv.ngay_hen) : '—'}
                      </td>
                      <td style={{ color: 'var(--primary-text)', fontWeight: 500 }}>{cv.sale_phu_trach || '—'}</td>
                      <td className="truncate" style={{ maxWidth: 200 }}>{cv.ket_qua || '—'}</td>
                      <td>{formatDate(cv.ngay_tao)}</td>
                      <td>
                        <div className="flex items-center gap-2" style={{ justifyContent: 'center' }}>
                          <button className="btn btn-ghost btn-icon btn-sm" onClick={() => openEdit(cv)}><Edit3 size={15} /></button>
                          <button className="btn btn-ghost btn-icon btn-sm" style={{ color: 'var(--danger-text)' }}
                            onClick={() => { setDeletingId(cv.id_cong_viec); setShowConfirm(true); }}><Trash2 size={15} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{editingItem ? 'Chỉnh sửa công việc' : 'Thêm công việc mới'}</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowModal(false)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Ghi chú / Nội dung *</label>
                <textarea className="form-textarea" value={form.ghi_chu}
                  onChange={(e) => setForm({ ...form, ghi_chu: e.target.value })} placeholder="Mô tả công việc" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div className="form-group">
                  <label className="form-label">Pipeline liên quan</label>
                  <select className="form-select" value={form.id_pipeline}
                    onChange={(e) => setForm({ ...form, id_pipeline: e.target.value })}>
                    <option value="">Không liên kết</option>
                    {pipelines.map(pl => (
                      <option key={pl.id_pipeline} value={pl.id_pipeline}>
                        {getPipelineLabel(pl.id_pipeline)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Trạng thái</label>
                  <select className="form-select" value={form.trang_thai}
                    onChange={(e) => setForm({ ...form, trang_thai: e.target.value })}>
                    {TRANG_THAI_CONG_VIEC.map(tt => <option key={tt} value={tt}>{tt}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div className="form-group">
                  <label className="form-label">Ngày hẹn</label>
                  <input className="form-input" type="date" value={form.ngay_hen}
                    onChange={(e) => setForm({ ...form, ngay_hen: e.target.value })} />
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
                <label className="form-label">Kết quả</label>
                <textarea className="form-textarea" value={form.ket_qua}
                  onChange={(e) => setForm({ ...form, ket_qua: e.target.value })} placeholder="Kết quả thực hiện" />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Hủy</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving || !form.ghi_chu.trim()}>
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
            <p>Bạn có chắc muốn xóa công việc này?</p>
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
