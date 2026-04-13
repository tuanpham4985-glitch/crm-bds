'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Plus, Edit3, Trash2, X, Building2, Eye, EyeOff,
  TrendingUp, Hash, Percent
} from 'lucide-react';
import type { DuAn, Pipeline } from '@/lib/types';
import { formatCurrency, formatPercent } from '@/lib/utils';

export default function DuAnPage() {
  const [projects, setProjects] = useState<DuAn[]>([]);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [loading, setLoading] = useState(true);
  const [showHidden, setShowHidden] = useState(false);

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<DuAn | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [deletingId, setDeletingId] = useState('');
  const [saving, setSaving] = useState(false);

  // Form
  const [form, setForm] = useState({
    ma_du_an: '', ten_du_an: '', hien_thi: 1, hoa_hong_mac_dinh: 0,
  });

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [daRes, plRes] = await Promise.all([
        fetch('/api/du-an'), fetch('/api/pipeline'),
      ]);
      const [daData, plData] = await Promise.all([daRes.json(), plRes.json()]);
      if (daData.success) setProjects(daData.data);
      if (plData.success) setPipelines(plData.data);
    } catch (err) {
      console.error('Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Stats per project
  const getProjectStats = (idDuAn: string) => {
    const deals = pipelines.filter(pl => pl.id_du_an === idDuAn);
    const daKy = deals.filter(pl => pl.giai_doan === 'Ký HĐ');
    return {
      totalDeals: deals.length,
      signedDeals: daKy.length,
      revenue: daKy.reduce((s, pl) => s + pl.gia_tri_thuc_te, 0),
      commission: daKy.reduce((s, pl) => s + pl.tien_hoa_hong, 0),
    };
  };

  const filteredProjects = showHidden ? projects : projects.filter(p => p.hien_thi === 1);

  const openCreate = () => {
    setEditingItem(null);
    setForm({ ma_du_an: '', ten_du_an: '', hien_thi: 1, hoa_hong_mac_dinh: 0 });
    setShowModal(true);
  };

  const openEdit = (da: DuAn) => {
    setEditingItem(da);
    setForm({
      ma_du_an: da.ma_du_an,
      ten_du_an: da.ten_du_an,
      hien_thi: da.hien_thi,
      hoa_hong_mac_dinh: da.hoa_hong_mac_dinh,
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.ten_du_an.trim()) return;
    setSaving(true);
    try {
      const method = editingItem ? 'PUT' : 'POST';
      const body = editingItem ? { ...editingItem, ...form } : form;
      const res = await fetch('/api/du-an', {
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
      const res = await fetch('/api/du-an', {
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
          <h1>Dự án</h1>
          <p>Quản lý các dự án bất động sản ({projects.length} dự án)</p>
        </div>
        <div className="flex items-center gap-3">
          <button className={`btn ${showHidden ? 'btn-primary' : 'btn-secondary'} btn-sm`}
            onClick={() => setShowHidden(!showHidden)}>
            {showHidden ? <Eye size={14} /> : <EyeOff size={14} />}
            {showHidden ? 'Hiển thị tất cả' : 'Ẩn DA tắt'}
          </button>
          <button className="btn btn-primary" onClick={openCreate}>
            <Plus size={18} />
            Thêm dự án
          </button>
        </div>
      </div>

      {/* Project Cards Grid */}
      {filteredProjects.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <Building2 size={40} />
            <h3>Chưa có dự án</h3>
            <p>Nhấn &quot;Thêm dự án&quot; để tạo mới</p>
          </div>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
          gap: 20,
        }}>
          {filteredProjects.map(da => {
            const stats = getProjectStats(da.id_du_an);
            return (
              <div key={da.id_du_an} className="card card-interactive"
                style={{
                  position: 'relative',
                  opacity: da.hien_thi === 0 ? 0.6 : 1,
                }}>
                {/* Status indicator */}
                <div style={{
                  position: 'absolute', top: 20, right: 20,
                }}>
                  <span className={`badge ${da.hien_thi === 1 ? 'badge-success' : 'badge-neutral'}`}>
                    {da.hien_thi === 1 ? 'Đang triển khai' : 'Tạm ngừng'}
                  </span>
                </div>

                {/* Project info */}
                <div style={{ marginBottom: 20 }}>
                  <div className="flex items-center gap-3" style={{ marginBottom: 8 }}>
                    <div style={{
                      width: 44, height: 44, borderRadius: 'var(--radius-lg)',
                      background: 'linear-gradient(135deg, var(--primary-light) 0%, #e0e7ff 100%)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: 'var(--primary)',
                    }}>
                      <Building2 size={22} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '1.0625rem', color: 'var(--text-title)' }}>
                        {da.ten_du_an}
                      </div>
                      <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                        <Hash size={12} style={{ display: 'inline', verticalAlign: -1, marginRight: 2 }} />
                        {da.ma_du_an}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Commission */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '10px 14px', background: 'var(--bg-page)',
                  borderRadius: 'var(--radius-md)', marginBottom: 16,
                }}>
                  <Percent size={14} style={{ color: 'var(--primary)' }} />
                  <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>Hoa hồng mặc định:</span>
                  <span style={{ fontWeight: 600, color: 'var(--primary-text)' }}>
                    {formatPercent(da.hoa_hong_mac_dinh)}
                  </span>
                </div>

                {/* Stats */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                  <div style={{ padding: '10px 14px', background: 'var(--info-bg)', borderRadius: 'var(--radius-md)' }}>
                    <div style={{ fontSize: '0.6875rem', color: 'var(--info-text)', fontWeight: 500, marginBottom: 2 }}>Tổng Deal</div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--info-text)' }}>{stats.totalDeals}</div>
                  </div>
                  <div style={{ padding: '10px 14px', background: 'var(--success-bg)', borderRadius: 'var(--radius-md)' }}>
                    <div style={{ fontSize: '0.6875rem', color: 'var(--success-text)', fontWeight: 500, marginBottom: 2 }}>Đã ký</div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--success-text)' }}>{stats.signedDeals}</div>
                  </div>
                </div>

                <div style={{
                  padding: '12px 14px', background: 'var(--bg-page)',
                  borderRadius: 'var(--radius-md)', marginBottom: 16,
                }}>
                  <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
                    <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                      <TrendingUp size={13} style={{ display: 'inline', verticalAlign: -2, marginRight: 4 }} />
                      Doanh thu
                    </span>
                    <span style={{ fontWeight: 600, color: 'var(--text-title)' }}>{formatCurrency(stats.revenue)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>Hoa hồng</span>
                    <span style={{ fontWeight: 600, color: 'var(--success-text)' }}>{formatCurrency(stats.commission)}</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2" style={{ justifyContent: 'flex-end' }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => openEdit(da)}>
                    <Edit3 size={14} />Sửa
                  </button>
                  <button className="btn btn-danger btn-sm"
                    onClick={() => { setDeletingId(da.id_du_an); setShowConfirm(true); }}>
                    <Trash2 size={14} />Xóa
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{editingItem ? 'Chỉnh sửa dự án' : 'Thêm dự án mới'}</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowModal(false)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div className="form-group">
                  <label className="form-label">Mã dự án *</label>
                  <input className="form-input" value={form.ma_du_an}
                    onChange={(e) => setForm({ ...form, ma_du_an: e.target.value })} placeholder="VD: DA001" />
                </div>
                <div className="form-group">
                  <label className="form-label">Tên dự án *</label>
                  <input className="form-input" value={form.ten_du_an}
                    onChange={(e) => setForm({ ...form, ten_du_an: e.target.value })} placeholder="Tên dự án" />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div className="form-group">
                  <label className="form-label">Hoa hồng mặc định</label>
                  <input className="form-input" type="number" step="0.01" value={form.hoa_hong_mac_dinh}
onChange={(e) => {
  let value = parseFloat(e.target.value) || 0;

  // Nếu nhập 3 → hiểu là 3%
  if (value > 1) value = value / 100;

  setForm({
    ...form,
    hoa_hong_mac_dinh: value
  });
}}
placeholder="VD: 3 (%) hoặc 0.03"
/>
                </div>
                <div className="form-group">
                  <label className="form-label">Hiển thị</label>
                  <select className="form-select" value={form.hien_thi}
                    onChange={(e) => setForm({ ...form, hien_thi: parseInt(e.target.value) })}>
                    <option value={1}>Đang triển khai</option>
                    <option value={0}>Tạm ngừng</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Hủy</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving || !form.ten_du_an.trim()}>
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
            <p>Bạn có chắc muốn xóa dự án này? Các deal liên quan sẽ không bị ảnh hưởng.</p>
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
