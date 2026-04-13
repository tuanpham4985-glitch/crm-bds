'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Plus, Edit3, Trash2, X, LayoutGrid, List, GripVertical,
  Users, Calendar, DollarSign, SlidersHorizontal
} from 'lucide-react';
import type { Pipeline, KhachHang, DuAn, NhanVien } from '@/lib/types';
import { formatCurrency, formatDate } from '@/lib/utils';
import { GIAI_DOAN_PIPELINE, GIAI_DOAN_ACTIVE, GIAI_DOAN_COLORS } from '@/lib/constants';

export default function PipelinePage() {
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [customers, setCustomers] = useState<KhachHang[]>([]);
  const [projects, setProjects] = useState<DuAn[]>([]);
  const [employees, setEmployees] = useState<NhanVien[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'kanban' | 'table'>('kanban');

  // Filters
  const [filterSale, setFilterSale] = useState('');
  const [filterDuAn, setFilterDuAn] = useState('');

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<Pipeline | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [deletingId, setDeletingId] = useState('');
  const [saving, setSaving] = useState(false);

  // Form
  const [form, setForm] = useState({
    id_khach_hang: '', giai_doan: 'Mới', gia_tri_thuc_te: 0,
    sale_phu_trach: '', id_du_an: '', ten_du_an: '', hoa_hong: 0, thang: '',
  });

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [plRes, khRes, daRes, nvRes] = await Promise.all([
        fetch('/api/pipeline'), fetch('/api/khach-hang?limit=999'),
        fetch('/api/du-an'), fetch('/api/nhan-vien'),
      ]);
      const [plData, khData, daData, nvData] = await Promise.all([
        plRes.json(), khRes.json(), daRes.json(), nvRes.json(),
      ]);
      if (plData.success) setPipelines(plData.data);
      if (khData.success) setCustomers(khData.data);
      if (daData.success) setProjects(daData.data);
      if (nvData.success) setEmployees(nvData.data);
    } catch (err) {
      console.error('Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Get customer name
  const getCustomerName = (id: string) => {
    const kh = customers.find(k => k.id_khach_hang === id);
    return kh ? kh.ten_KH : id;
  };

  // Filter pipelines
  const filteredPipelines = pipelines.filter(pl => {
    if (filterSale && pl.sale_phu_trach !== filterSale) return false;
    if (filterDuAn && pl.id_du_an !== filterDuAn) return false;
    return true;
  });

  // Group by giai_doan for kanban
  const groupedByStage = GIAI_DOAN_PIPELINE.reduce((acc, stage) => {
    acc[stage] = filteredPipelines.filter(pl => pl.giai_doan === stage);
    return acc;
  }, {} as Record<string, Pipeline[]>);

  const openCreate = () => {
    setEditingItem(null);
    setForm({
      id_khach_hang: '', giai_doan: 'Mới', gia_tri_thuc_te: 0,
      sale_phu_trach: '', id_du_an: '', ten_du_an: '', hoa_hong: 0, thang: '',
    });
    setShowModal(true);
  };

  const openEdit = (pl: Pipeline) => {
    setEditingItem(pl);

    setForm({
      id_khach_hang: pl.id_khach_hang,
      giai_doan: pl.giai_doan,
      gia_tri_thuc_te: Number(pl.gia_tri_thuc_te) || 0,
      sale_phu_trach: pl.sale_phu_trach,
      id_du_an: pl.id_du_an,
      ten_du_an: pl.ten_du_an,
      hoa_hong: pl.hoa_hong,
      thang: pl.thang,
    });

    setShowModal(true);
  };

  const handleProjectChange = (idDuAn: string) => {
    const project = projects.find(p => p.id_du_an === idDuAn);
    setForm({
      ...form,
      id_du_an: idDuAn,
      ten_du_an: project ? project.ten_du_an : '',
      hoa_hong: project ? project.hoa_hong_mac_dinh : form.hoa_hong,
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const method = editingItem ? 'PUT' : 'POST';
      const body = editingItem ? { ...editingItem, ...form } : form;
      const res = await fetch('/api/pipeline', {
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
      const res = await fetch('/api/pipeline', {
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

  const handleDragStart = (e: React.DragEvent, plId: string) => {
    e.dataTransfer.setData('text/plain', plId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDrop = async (e: React.DragEvent, newStage: string) => {
    e.preventDefault();
    const plId = e.dataTransfer.getData('text/plain');
    const pl = pipelines.find(p => p.id_pipeline === plId);
    if (!pl || pl.giai_doan === newStage) return;

    try {
      await fetch('/api/pipeline', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...pl, giai_doan: newStage }),
      });
      fetchAll();
    } catch (err) {
      console.error('Drag update error:', err);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  if (loading) {
    return <div className="loading-spinner"><div className="spinner" /></div>;
  }

  // Summary stats for active stages
  const activeDeals = filteredPipelines.filter(pl => GIAI_DOAN_ACTIVE.includes(pl.giai_doan as typeof GIAI_DOAN_ACTIVE[number]));
  const totalValue = activeDeals.reduce((s, pl) => s + pl.gia_tri_thuc_te, 0);

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div className="page-header-left">
          <h1>Pipeline</h1>
          <p>{filteredPipelines.length} deal · Tổng giá trị: {formatCurrency(totalValue)}</p>
        </div>
        <div className="flex items-center gap-3">
          {/* View toggle */}
          <div className="toggle-group">
            <button className={`toggle-btn ${viewMode === 'kanban' ? 'active' : ''}`}
              onClick={() => setViewMode('kanban')}>
              <LayoutGrid size={14} style={{ marginRight: 4, verticalAlign: -2 }} />Kanban
            </button>
            <button className={`toggle-btn ${viewMode === 'table' ? 'active' : ''}`}
              onClick={() => setViewMode('table')}>
              <List size={14} style={{ marginRight: 4, verticalAlign: -2 }} />Bảng
            </button>
          </div>
          <button className="btn btn-primary" onClick={openCreate}>
            <Plus size={18} />
            Thêm deal
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="filter-bar">
        <div className="flex items-center gap-2">
          <SlidersHorizontal size={14} style={{ color: 'var(--text-label)' }} />
          <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', fontWeight: 500 }}>Lọc:</span>
        </div>
        <select className="form-select" value={filterSale} onChange={(e) => setFilterSale(e.target.value)}>
          <option value="">Tất cả sale</option>
          {employees.map(nv => <option key={nv.id_nhan_vien} value={nv.ho_ten}>{nv.ho_ten}</option>)}
        </select>
        <select className="form-select" value={filterDuAn} onChange={(e) => setFilterDuAn(e.target.value)}>
          <option value="">Tất cả dự án</option>
          {projects.map(da => <option key={da.id_du_an} value={da.id_du_an}>{da.ten_du_an}</option>)}
        </select>
        {(filterSale || filterDuAn) && (
          <button className="btn btn-ghost btn-sm" onClick={() => { setFilterSale(''); setFilterDuAn(''); }}>
            <X size={14} />Xóa lọc
          </button>
        )}
      </div>

      {/* Kanban View */}
      {viewMode === 'kanban' ? (
        <div className="kanban-board">
          {GIAI_DOAN_PIPELINE.map(stage => {
            const deals = groupedByStage[stage] || [];
            const stageValue = deals.reduce((s, pl) => s + pl.gia_tri_thuc_te, 0);
            const colors = GIAI_DOAN_COLORS[stage] || { bg: '#f1f5f9', text: '#475569', border: '#94a3b8' };

            return (
              <div key={stage} className="kanban-column"
                onDrop={(e) => handleDrop(e, stage)}
                onDragOver={handleDragOver}>
                <div className="kanban-column-header">
                  <div className="flex items-center gap-2">
                    <div style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: colors.border,
                    }} />
                    <span className="kanban-column-title">{stage}</span>
                    <span className="kanban-column-count">{deals.length}</span>
                  </div>
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: colors.text }}>
                    {formatCurrency(stageValue)}
                  </span>
                </div>
                <div className="kanban-cards">
                  {deals.map(pl => (
                    <div key={pl.id_pipeline} className="kanban-card"
                      draggable
                      onDragStart={(e) => handleDragStart(e, pl.id_pipeline)}>
                      <div className="flex items-center justify-between" style={{ marginBottom: 4 }}>
                        <span className="kanban-card-name">{getCustomerName(pl.id_khach_hang)}</span>
                        <GripVertical size={14} style={{ color: 'var(--text-label)', opacity: 0.5 }} />
                      </div>
                      <div className="kanban-card-project">{pl.ten_du_an || '—'}</div>
                      <div className="kanban-card-value">{formatCurrency(pl.gia_tri_thuc_te)}</div>
                      <div className="kanban-card-footer">
                        <span className="flex items-center gap-2">
                          <Users size={11} />{pl.sale_phu_trach || '—'}
                        </span>
                        <span className="flex items-center gap-2">
                          <Calendar size={11} />{formatDate(pl.ngay_cap_nhat)}
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: 4, marginTop: 8, justifyContent: 'flex-end' }}>
                        <button className="btn btn-ghost btn-icon btn-sm" onClick={() => openEdit(pl)}>
                          <Edit3 size={13} />
                        </button>
                        <button className="btn btn-ghost btn-icon btn-sm"
                          style={{ color: 'var(--danger-text)' }}
                          onClick={() => { setDeletingId(pl.id_pipeline); setShowConfirm(true); }}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                  {deals.length === 0 && (
                    <div style={{
                      padding: '24px 16px', textAlign: 'center',
                      color: 'var(--text-label)', fontSize: '0.8125rem',
                      border: '2px dashed var(--border-light)',
                      borderRadius: 'var(--radius-lg)',
                    }}>
                      Kéo thả deal vào đây
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Table View */
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Khách hàng</th>
                  <th>Giai đoạn</th>
                  <th>Dự án</th>
                  <th style={{ textAlign: 'right' }}>Giá trị</th>
                  <th style={{ textAlign: 'right' }}>Hoa hồng</th>
                  <th>Sale</th>
                  <th>Cập nhật</th>
                  <th style={{ width: 90, textAlign: 'center' }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {filteredPipelines.map((pl, idx) => {
                  const colors = GIAI_DOAN_COLORS[pl.giai_doan] || { bg: '#f1f5f9', text: '#475569' };
                  return (
                    <tr key={pl.id_pipeline}>
                      <td style={{ color: 'var(--text-label)' }}>{idx + 1}</td>
                      <td style={{ fontWeight: 500, color: 'var(--text-title)' }}>{getCustomerName(pl.id_khach_hang)}</td>
                      <td>
                        <span className="badge" style={{ background: colors.bg, color: colors.text }}>
                          {pl.giai_doan}
                        </span>
                      </td>
                      <td>{pl.ten_du_an || '—'}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>
                        <span className="flex items-center gap-2" style={{ justifyContent: 'flex-end' }}>
                          <DollarSign size={13} style={{ color: 'var(--text-label)' }} />
                          {formatCurrency(pl.gia_tri_thuc_te)}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right', color: 'var(--success-text)' }}>{formatCurrency(pl.tien_hoa_hong)}</td>
                      <td style={{ color: 'var(--primary-text)', fontWeight: 500 }}>{pl.sale_phu_trach || '—'}</td>
                      <td>{formatDate(pl.ngay_cap_nhat)}</td>
                      <td>
                        <div className="flex items-center gap-2" style={{ justifyContent: 'center' }}>
                          <button className="btn btn-ghost btn-icon btn-sm" onClick={() => openEdit(pl)}><Edit3 size={15} /></button>
                          <button className="btn btn-ghost btn-icon btn-sm" style={{ color: 'var(--danger-text)' }}
                            onClick={() => { setDeletingId(pl.id_pipeline); setShowConfirm(true); }}><Trash2 size={15} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filteredPipelines.length === 0 && (
                  <tr>
                    <td colSpan={9} className="empty-state">
                      <h3>Chưa có deal nào</h3>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{editingItem ? 'Chỉnh sửa deal' : 'Thêm deal mới'}</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowModal(false)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Khách hàng *</label>
                <select className="form-select" value={form.id_khach_hang}
                  onChange={(e) => setForm({ ...form, id_khach_hang: e.target.value })}>
                  <option value="">Chọn khách hàng</option>
                  {customers.map(kh => (
                    <option key={kh.id_khach_hang} value={kh.id_khach_hang}>{kh.ten_KH}</option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div className="form-group">
                  <label className="form-label">Giai đoạn</label>
                  <select className="form-select" value={form.giai_doan}
                    onChange={(e) => setForm({ ...form, giai_doan: e.target.value })}>
                    {GIAI_DOAN_PIPELINE.map(gd => <option key={gd} value={gd}>{gd}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Dự án</label>
                  <select className="form-select" value={form.id_du_an}
                    onChange={(e) => handleProjectChange(e.target.value)}>
                    <option value="">Chọn dự án</option>
                    {projects.map(da => (
                      <option key={da.id_du_an} value={da.id_du_an}>{da.ten_du_an}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div className="form-group">
                  <label className="form-label">Giá trị thực tế (VNĐ)</label>
                  <input className="form-input" type="number" value={form.gia_tri_thuc_te}
                    onChange={(e) => setForm({ ...form, gia_tri_thuc_te: parseFloat(e.target.value) || 0 })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Hoa hồng (%)</label>
                  <input className="form-input" type="number" step="0.01" value={form.hoa_hong}
                    onChange={(e) => setForm({ ...form, hoa_hong: parseFloat(e.target.value) || 0 })} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Sale phụ trách</label>
                <select className="form-select" value={form.sale_phu_trach}
                  onChange={(e) => setForm({ ...form, sale_phu_trach: e.target.value })}>
                  <option value="">Chọn sale</option>
                  {employees.map(nv => (
                    <option key={nv.id_nhan_vien} value={nv.ho_ten}>{nv.ho_ten}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Hủy</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
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
            <p>Bạn có chắc muốn xóa deal này?</p>
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
