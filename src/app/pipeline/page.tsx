'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import {
  Plus, Edit3, Trash2, X,
  SlidersHorizontal
} from 'lucide-react';
import type { Pipeline, KhachHang, DuAn, NhanVien } from '@/lib/types';
import { formatCurrency, formatDate } from '@/lib/utils';
import { GIAI_DOAN_PIPELINE, GIAI_DOAN_ACTIVE, GIAI_DOAN_COLORS } from '@/lib/constants';

export default function PipelinePage() {
  const { user } = useAuth();
  const isAllVisible = user && (
    user.vai_tro === 'Admin' ||
    ['Admin', 'Chủ tịch', 'TGĐ'].includes(user.employee_type || '')
  );

  const canViewProfit = isAllVisible;

  const showPhiTraSale = isAllVisible || (user?.employee_type === 'NVKD');
  const showPhiTraGDDA = isAllVisible || (user?.employee_type === 'GDDA');
  const showPhiTraGDKD = isAllVisible || (user?.employee_type === 'GĐKD');
  const showThuongNong = isAllVisible || (user?.employee_type === 'NVKD');
  const showPhiTKKD = isAllVisible || (user?.employee_type === 'TKKD');

  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [customers, setCustomers] = useState<KhachHang[]>([]);
  const [projects, setProjects] = useState<DuAn[]>([]);
  const [employees, setEmployees] = useState<NhanVien[]>([]);
  const [loading, setLoading] = useState(true);

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
    thuong_nong: 0, tkkd: '', phi_tkkd: 0, ngay_cap_nhat: '',
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

  const openCreate = () => {
    setEditingItem(null);
    setForm({
      id_khach_hang: '', giai_doan: 'Mới', gia_tri_thuc_te: 0,
      sale_phu_trach: '', id_du_an: '', ten_du_an: '', hoa_hong: 0, thang: '',
      thuong_nong: 0,
      tkkd: '',
      phi_tkkd: 0,
      ngay_cap_nhat: new Date().toISOString().split('T')[0],
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
      thuong_nong: Number(pl.thuong_nong) || 0,
      tkkd: pl.tkkd || '',
      phi_tkkd: Number(pl.phi_tkkd) || 0,
      ngay_cap_nhat: pl.ngay_cap_nhat ? new Date(pl.ngay_cap_nhat).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
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

  if (loading) {
    return <div className="loading-spinner"><div className="spinner" /></div>;
  }

  // Summary stats for active stages
  const activeDeals = filteredPipelines.filter(pl => GIAI_DOAN_ACTIVE.includes(pl.giai_doan as typeof GIAI_DOAN_ACTIVE[number]));
  const totalValue = activeDeals.reduce((s, pl) => s + pl.gia_tri_thuc_te, 0);
  const totalProfit = activeDeals.reduce((s, pl) => s + (pl.loi_nhuan || 0), 0);

  // Sum of personal stats for specific roles
  const personalCommission = activeDeals.reduce((s, pl) => {
    if (isAllVisible) return s + (pl.phi_tra_sale || 0);
    if (user?.employee_type === 'NVKD' && pl.sale_phu_trach === user.ho_ten) return s + (pl.phi_tra_sale || 0);
    if (user?.employee_type === 'GDDA' && pl.gdda === user.ho_ten) return s + (pl.phi_tra_gdda || 0);
    if (user?.employee_type === 'GĐKD' && pl.gdkd === user.ho_ten) return s + (pl.phi_tra_gdkd || 0);
    return s;
  }, 0);

  const personalHotBonus = activeDeals.reduce((s, pl) => {
    if (isAllVisible) return s + (pl.thuong_nong || 0);
    if (user?.employee_type === 'NVKD' && pl.sale_phu_trach === user.ho_ten) return s + (pl.thuong_nong || 0);
    return s;
  }, 0);

  let colSpan = 9;
  if (showPhiTraSale) colSpan++;
  if (showPhiTraGDDA) colSpan++;
  if (showPhiTraGDKD) colSpan++;
  if (showThuongNong) colSpan++;
  if (showPhiTKKD) colSpan++;

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div className="page-header-left">
          <h1>Pipeline</h1>
          <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <span style={{ 
              background: '#f1f5f9', 
              color: '#334155', 
              padding: '6px 14px', 
              borderRadius: '14px', 
              fontWeight: 700, 
              fontSize: '0.88rem', 
              display: 'inline-flex', 
              alignItems: 'center', 
              gap: '6px',
              boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
            }}>
              <span style={{ fontSize: '1.15rem', lineHeight: 1 }}>📊</span> {filteredPipelines.length} deal
            </span>
            <span style={{ 
              background: 'rgba(99, 102, 241, 0.08)', 
              color: '#4f46e5', 
              padding: '6px 15px', 
              borderRadius: '14px', 
              fontWeight: 700, 
              fontSize: '0.88rem', 
              display: 'inline-flex', 
              alignItems: 'center', 
              gap: '6px',
              border: '1px solid rgba(99, 102, 241, 0.15)',
              boxShadow: '0 1px 2px rgba(99, 102, 241, 0.05)'
            }}>
              <span style={{ fontSize: '1.15rem', lineHeight: 1 }}>💰</span> Tổng giá trị: <span style={{ color: '#4f46e5', fontWeight: 850 }}>{formatCurrency(totalValue, false)}</span>
            </span>

            {/* Personal or administrative Commission stats */}
            {(showPhiTraSale || showPhiTraGDDA || showPhiTraGDKD) && (
              <span style={{ 
                background: 'rgba(16, 185, 129, 0.08)', 
                color: '#059669', 
                padding: '6px 15px', 
                borderRadius: '14px', 
                fontWeight: 700, 
                fontSize: '0.88rem', 
                display: 'inline-flex', 
                alignItems: 'center', 
                gap: '6px',
                border: '1px solid rgba(16, 185, 129, 0.15)',
                boxShadow: '0 1px 2px rgba(16, 185, 129, 0.05)'
              }}>
                <span style={{ fontSize: '1.15rem', lineHeight: 1 }}>💵</span> {isAllVisible ? 'Tổng hoa hồng' : 'Hoa hồng cá nhân'}: <span style={{ color: '#059669', fontWeight: 850 }}>{formatCurrency(personalCommission, false)}</span>
              </span>
            )}

            {/* Personal or administrative Hot Bonus stats */}
            {showThuongNong && (
              <span style={{ 
                background: 'rgba(239, 68, 68, 0.08)', 
                color: '#dc2626', 
                padding: '6px 15px', 
                borderRadius: '14px', 
                fontWeight: 700, 
                fontSize: '0.88rem', 
                display: 'inline-flex', 
                alignItems: 'center', 
                gap: '6px',
                border: '1px solid rgba(239, 68, 68, 0.15)',
                boxShadow: '0 1px 2px rgba(239, 68, 68, 0.05)'
              }}>
                <span style={{ fontSize: '1.15rem', lineHeight: 1 }}>🔥</span> {isAllVisible ? 'Tổng thưởng nóng' : 'Thưởng nóng cá nhân'}: <span style={{ color: '#dc2626', fontWeight: 850 }}>{formatCurrency(personalHotBonus, false)}</span>
              </span>
            )}

            {canViewProfit && (
              <span style={{ 
                background: 'rgba(212, 175, 55, 0.15)', 
                color: '#b45309', 
                padding: '6px 16px', 
                borderRadius: '14px', 
                fontWeight: 800, 
                fontSize: '0.88rem',
                border: '1.5px solid rgba(212, 175, 55, 0.45)',
                boxShadow: '0 2px 6px rgba(212,175,55,0.18)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}>
                <span style={{ fontSize: '1.15rem', lineHeight: 1 }}>💎</span> Tổng lợi nhuận: <span style={{ color: '#d97706', fontWeight: 950 }}>{formatCurrency(totalProfit, false)}</span>
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
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

      {/* Table View */}
      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrapper" style={{ borderRadius: 'var(--radius-xl)', overflow: 'visible' }}>
          <table className="data-table" style={{ minWidth: '850px' }}>
            <thead>
              <tr>
                <th>#</th>
                <th>Khách hàng</th>
                <th>Giai đoạn</th>
                <th>Dự án</th>
                <th style={{ textAlign: 'right' }}>Giá trị</th>
                {showPhiTraSale && <th style={{ textAlign: 'right' }}>Phí trả sale</th>}
                {showPhiTraGDDA && <th style={{ textAlign: 'right' }}>Phí trả GDDA</th>}
                {showPhiTraGDKD && <th style={{ textAlign: 'right' }}>Phí trả GĐKD</th>}
                {showThuongNong && <th style={{ textAlign: 'right' }}>Thưởng nóng</th>}
                <th>TKKD</th>
                {showPhiTKKD && <th style={{ textAlign: 'right' }}>Phí TKKD</th>}
                <th>Sale</th>
                <th>Ngày ký TTĐC/VBTT</th>
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
                      {formatCurrency(pl.gia_tri_thuc_te)}
                    </td>

                    {showPhiTraSale && (
                      <td style={{ textAlign: 'right', color: 'var(--success-text)', fontWeight: 600 }}>
                        {isAllVisible || pl.sale_phu_trach === user?.ho_ten 
                          ? formatCurrency(pl.phi_tra_sale || 0) 
                          : '—'}
                      </td>
                    )}

                    {showPhiTraGDDA && (
                      <td style={{ textAlign: 'right', color: 'var(--primary-text)', fontWeight: 600 }}>
                        {isAllVisible || pl.gdda === user?.ho_ten 
                          ? formatCurrency(pl.phi_tra_gdda || 0) 
                          : '—'}
                      </td>
                    )}

                    {showPhiTraGDKD && (
                      <td style={{ textAlign: 'right', color: '#b45309', fontWeight: 600 }}>
                        {isAllVisible || pl.gdkd === user?.ho_ten 
                          ? formatCurrency(pl.phi_tra_gdkd || 0) 
                          : '—'}
                      </td>
                    )}

                    {showThuongNong && (
                      <td style={{ textAlign: 'right', color: '#dc2626', fontWeight: 600 }}>
                        {isAllVisible || pl.sale_phu_trach === user?.ho_ten 
                          ? formatCurrency(pl.thuong_nong || 0) 
                          : '—'}
                      </td>
                    )}

                    <td style={{ color: 'var(--primary-text)', fontWeight: 500 }}>{pl.tkkd || '—'}</td>
                    {showPhiTKKD && (
                      <td style={{ textAlign: 'right', color: '#8b5cf6', fontWeight: 600 }}>
                        {isAllVisible || pl.tkkd === user?.ho_ten 
                          ? formatCurrency(pl.phi_tkkd || 0) 
                          : '—'}
                      </td>
                    )}

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
                  <td colSpan={colSpan} className="empty-state">
                    <h3>Chưa có deal nào</h3>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

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
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div className="form-group">
                  <label className="form-label">Thưởng nóng (Gồm VAT)</label>
                  <input className="form-input" type="number" value={form.thuong_nong}
                    onChange={(e) => setForm({ ...form, thuong_nong: parseFloat(e.target.value) || 0 })} />
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
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div className="form-group">
                  <label className="form-label">Thư ký kinh doanh (TKKD)</label>
                  <select className="form-select" value={form.tkkd}
                    onChange={(e) => setForm({ ...form, tkkd: e.target.value })}>
                    <option value="">Chọn TKKD</option>
                    {employees.map(nv => (
                      <option key={nv.id_nhan_vien} value={nv.ho_ten}>{nv.ho_ten}</option>
                    ))}
                  </select>
                </div>
                {showPhiTKKD && (
                  <div className="form-group">
                    <label className="form-label">Phí TKKD (VNĐ)</label>
                    <input className="form-input" type="number" value={form.phi_tkkd}
                      onChange={(e) => setForm({ ...form, phi_tkkd: parseFloat(e.target.value) || 0 })} />
                  </div>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div className="form-group">
                  <label className="form-label">Ngày ký TTĐC/VBTT</label>
                  <input className="form-input" type="date" value={form.ngay_cap_nhat}
                    onChange={(e) => setForm({ ...form, ngay_cap_nhat: e.target.value })} />
                </div>
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
