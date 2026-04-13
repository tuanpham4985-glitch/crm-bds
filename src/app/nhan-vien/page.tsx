'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Plus, Edit3, Trash2, X, UserCog, Phone, Mail,
  Shield, ShieldCheck, TrendingUp
} from 'lucide-react';
import type { NhanVien, Pipeline, KhachHang } from '@/lib/types';
import { formatDate, formatCurrency } from '@/lib/utils';
import { VAI_TRO } from '@/lib/constants';

export default function NhanVienPage() {
  const [employees, setEmployees] = useState<NhanVien[]>([]);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [customers, setCustomers] = useState<KhachHang[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<NhanVien | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [deletingId, setDeletingId] = useState('');
  const [saving, setSaving] = useState(false);

  // Form
  const [form, setForm] = useState({
    ho_ten: '', so_dien_thoai: '', email: '',
    vai_tro: 'Sale', trang_thai: 'Đang làm',
    avatar_url: '',
  });

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [nvRes, plRes, khRes] = await Promise.all([
        fetch('/api/nhan-vien'), fetch('/api/pipeline'), fetch('/api/khach-hang?limit=999'),
      ]);
      const [nvData, plData, khData] = await Promise.all([
        nvRes.json(), plRes.json(), khRes.json(),
      ]);
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

  // Stats per employee
  const getEmployeeStats = (name: string) => {
    const khCount = customers.filter(kh => kh.sale_phu_trach === name).length;
    const deals = pipelines.filter(pl => pl.sale_phu_trach === name);
    const daKy = deals.filter(pl => pl.giai_doan === 'Ký HĐ');
    return {
      customers: khCount,
      totalDeals: deals.length,
      signedDeals: daKy.length,
      revenue: daKy.reduce((s, pl) => s + pl.gia_tri_thuc_te, 0),
      commission: daKy.reduce((s, pl) => s + pl.tien_hoa_hong, 0),
    };
  };

  const openCreate = () => {
    setEditingItem(null);
    setForm({ 
      ho_ten: '', 
      so_dien_thoai: '', 
      email: '', 
      vai_tro: 'Sale', 
      trang_thai: 'Đang làm',
      avatar_url: '' // ✅ thêm dòng này
    });
    setShowModal(true);
  };

  const openEdit = (nv: NhanVien) => {
    setEditingItem(nv);
    setForm({
      ho_ten: nv.ho_ten,
      so_dien_thoai: nv.so_dien_thoai,
      email: nv.email,
      vai_tro: nv.vai_tro,
      trang_thai: nv.trang_thai,
      avatar_url: nv.avatar_url || '',
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.ho_ten.trim()) return;
    setSaving(true);
    try {
      const method = editingItem ? 'PUT' : 'POST';
      const body = editingItem ? { ...editingItem, ...form } : form;
      const res = await fetch('/api/nhan-vien', {
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
      const res = await fetch('/api/nhan-vien', {
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
          <h1>Nhân viên</h1>
          <p>Quản lý nhân viên kinh doanh ({employees.length} nhân viên)</p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>
          <Plus size={18} />
          Thêm nhân viên
        </button>
      </div>

      {/* Employee Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {employees.length === 0 ? (
          <div className="empty-state">
            <UserCog size={40} />
            <h3>Chưa có nhân viên</h3>
            <p>Nhấn &quot;Thêm nhân viên&quot; để tạo mới</p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: 50 }}>#</th>
                  <th>Họ tên</th>
                  <th>SĐT</th>
                  <th>Email</th>
                  <th>Vai trò</th>
                  <th>Trạng thái</th>
                  <th style={{ textAlign: 'right' }}>KH</th>
                  <th style={{ textAlign: 'right' }}>Deal</th>
                  <th style={{ textAlign: 'right' }}>Doanh thu</th>
                  <th style={{ textAlign: 'right' }}>Hoa hồng</th>
                  <th>Ngày tạo</th>
                  <th style={{ width: 90, textAlign: 'center' }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((nv, idx) => {
                  const stats = getEmployeeStats(nv.ho_ten);
                  return (
                    <tr key={nv.id_nhan_vien}>
                      <td style={{ color: 'var(--text-label)' }}>{idx + 1}</td>
                      <td>
                        <div className="flex items-center gap-3" style={{ whiteSpace: 'nowrap' }}>
                          
                          {nv.avatar_url ? (
                            <img
                              src="https://randomuser.me/api/portraits/men/32.jpg"
                              alt={nv.ho_ten}
                              style={{
                                width: 36,
                                height: 36,
                                borderRadius: '50%',
                                objectFit: 'cover',
                                flexShrink: 0,
                              }}
                            />
                          ) : (
                            <div style={{
                              width: 36, height: 36, borderRadius: '50%',
                              background: nv.vai_tro === 'Admin'
                                ? 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)'
                                : 'linear-gradient(135deg, #10b981 0%, #34d399 100%)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              color: '#fff', fontSize: '0.75rem', fontWeight: 600,
                              flexShrink: 0,
                            }}>
                              {nv.ho_ten.split(' ').pop()?.charAt(0).toUpperCase()}
                            </div>
                          )}

                          <span style={{ fontWeight: 500, color: 'var(--text-title)' }}>
                            {nv.ho_ten}
                          </span>

                        </div>
                      </td>
                      <td>
                        <span className="flex items-center gap-2">
                          <Phone size={13} style={{ color: 'var(--text-label)' }} />
                          {nv.so_dien_thoai || '—'}
                        </span>
                      </td>
                      <td>
                        <span className="flex items-center gap-2">
                          <Mail size={13} style={{ color: 'var(--text-label)' }} />
                          {nv.email || '—'}
                        </span>
                      </td>
                      <td>
                        <span className="flex items-center gap-2">
                          {nv.vai_tro === 'Admin' ? (
                            <><ShieldCheck size={14} style={{ color: 'var(--primary)' }} />
                              <span className="badge badge-info">{nv.vai_tro}</span></>
                          ) : (
                            <><Shield size={14} style={{ color: 'var(--success-text)' }} />
                              <span className="badge badge-success">{nv.vai_tro}</span></>
                          )}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${nv.trang_thai === 'Đang làm' ? 'badge-success' : 'badge-neutral'}`}>
                          {nv.trang_thai}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 500 }}>{stats.customers}</td>
                      <td style={{ textAlign: 'right', fontWeight: 500 }}>
                        {stats.signedDeals}/{stats.totalDeals}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>
                        <span className="flex items-center gap-2" style={{ justifyContent: 'flex-end' }}>
                          <TrendingUp size={13} style={{ color: 'var(--success-text)' }} />
                          {formatCurrency(stats.revenue)}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right', color: 'var(--success-text)', fontWeight: 500 }}>
                        {formatCurrency(stats.commission)}
                      </td>
                      <td>{formatDate(nv.ngay_tao)}</td>
                      <td>
                        <div className="flex items-center gap-2" style={{ justifyContent: 'center' }}>
                          <button className="btn btn-ghost btn-icon btn-sm" onClick={() => openEdit(nv)}><Edit3 size={15} /></button>
                          <button className="btn btn-ghost btn-icon btn-sm" style={{ color: 'var(--danger-text)' }}
                            onClick={() => { setDeletingId(nv.id_nhan_vien); setShowConfirm(true); }}><Trash2 size={15} /></button>
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
              <h3 className="modal-title">{editingItem ? 'Chỉnh sửa nhân viên' : 'Thêm nhân viên mới'}</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowModal(false)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Họ tên *</label>
                <input className="form-input" value={form.ho_ten}
                  onChange={(e) => setForm({ ...form, ho_ten: e.target.value })} placeholder="Nhập họ tên" />
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

              {/* 🔥 THÊM AVATAR UPLOAD Ở ĐÂY */}
              <div className="form-group">
                <label className="form-label">Avatar</label>

                <input
                  type="file"
                  accept="image/*"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;

                    const formData = new FormData();
                    formData.append('file', file);

                    const res = await fetch('/api/upload-avatar', {
                      method: 'POST',
                      body: formData,
                    });

                    const data = await res.json();

                    if (data.url) {
                      setForm(prev => ({
                        ...prev,
                        avatar_url: data.url,
                      }));
                    }
                  }}
                />

                {/* Preview ảnh */}
                {form.avatar_url && (
                  <img
                    src={form.avatar_url}
                    alt="avatar"
                    style={{
                      marginTop: 8,
                      width: 60,
                      height: 60,
                      borderRadius: '50%',
                      objectFit: 'cover',
                    }}
                  />
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div className="form-group">
                  <label className="form-label">Vai trò</label>
                  <select className="form-select" value={form.vai_tro}
                    onChange={(e) => setForm({ ...form, vai_tro: e.target.value })}>
                    {VAI_TRO.map(vt => <option key={vt} value={vt}>{vt}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Trạng thái</label>
                  <select className="form-select" value={form.trang_thai}
                    onChange={(e) => setForm({ ...form, trang_thai: e.target.value })}>
                    <option value="Đang làm">Đang làm</option>
                    <option value="Nghỉ việc">Nghỉ việc</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Hủy</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving || !form.ho_ten.trim()}>
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
            <p>Bạn có chắc muốn xóa nhân viên này?</p>
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
