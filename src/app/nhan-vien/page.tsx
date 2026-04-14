'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Plus, Edit3, Trash2, X, UserCog, Phone, Mail,
  Shield, ShieldCheck, TrendingUp, Upload, Loader2
} from 'lucide-react';
import type { NhanVien, Pipeline, KhachHang } from '@/lib/types';
import { formatDate, formatCurrency } from '@/lib/utils';
import { VAI_TRO } from '@/lib/constants';
import { useAuth } from '@/hooks/useAuth';

export default function NhanVienPage() {
  const { isAdmin, isLoading: authLoading } = useAuth();
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

  // Avatar upload state
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      ho_ten: '', so_dien_thoai: '', email: '',
      vai_tro: 'Sale', trang_thai: 'Đang làm',
      avatar_url: '',
    });
    setUploadError('');
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
    setUploadError('');
    setShowModal(true);
  };

  // Image compression helper
  const compressImage = (file: File): Promise<File> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          const MAX_DIMENSION = 200; // max width/height

          if (width > height) {
            if (width > MAX_DIMENSION) {
              height = Math.round((height * MAX_DIMENSION) / width);
              width = MAX_DIMENSION;
            }
          } else {
            if (height > MAX_DIMENSION) {
              width = Math.round((width * MAX_DIMENSION) / height);
              height = MAX_DIMENSION;
            }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) return reject(new Error('No canvas context'));
          ctx.drawImage(img, 0, 0, width, height);

          let quality = 0.9;
          const attemptCompress = () => {
            canvas.toBlob((blob) => {
              if (!blob) return reject(new Error('Canvas toBlob failed'));
              // Target < 35KB to be safe for Google Sheets 50,000 character limit
              if (blob.size > 35 * 1024 && quality > 0.1) {
                quality -= 0.1;
                attemptCompress();
              } else {
                const resizedFile = new File([blob], file.name.replace(/\.[^/.]+$/, "") + ".webp", {
                  type: 'image/webp',
                  lastModified: Date.now(),
                });
                resolve(resizedFile);
              }
            }, 'image/webp', quality);
          };
          attemptCompress();
        };
        img.onerror = () => reject(new Error('Image load failed'));
      };
      reader.onerror = () => reject(new Error('File read failed'));
    });
  };

  // Avatar upload handler
  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Client-side validation
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
      setUploadError('Chỉ chấp nhận ảnh JPG, PNG, WebP hoặc GIF');
      return;
    }

    setUploading(true);
    setUploadError('');

    try {
      // Auto resize to fit Google Sheets cell limit (< 35KB) and use webp
      let finalFile = file;
      if (file.size > 35 * 1024 || file.type !== 'image/webp') {
        try {
          finalFile = await compressImage(file);
        } catch (err) {
          console.error('Compression error:', err);
          setUploadError('Không thể xử lý ảnh. Vui lòng thử ảnh khác.');
          setUploading(false);
          return;
        }
      }

      const formData = new FormData();
      formData.append('file', finalFile);

      const res = await fetch('/api/upload-avatar', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        setUploadError(data.error || 'Upload thất bại');
        return;
      }

      if (data.url) {
        setForm(prev => ({ ...prev, avatar_url: data.url }));
        setUploadError('');
      } else {
        setUploadError('Upload thất bại: không nhận được URL');
      }
    } catch (err) {
      console.error('Upload error:', err);
      setUploadError('Lỗi kết nối. Vui lòng thử lại.');
    } finally {
      setUploading(false);
      // Reset file input so same file can be re-selected
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleSave = async () => {
    if (!form.ho_ten.trim()) return;
    if (!form.email.trim()) {
      alert('Email là bắt buộc (dùng để đăng nhập)');
      return;
    }
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

  // Render avatar from URL or fallback to initials
  const renderAvatar = (nv: NhanVien, size = 36) => {
    if (nv.avatar_url) {
      return (
        <img
          src={nv.avatar_url}
          alt={nv.ho_ten}
          style={{
            width: size,
            height: size,
            borderRadius: '50%',
            objectFit: 'cover',
            flexShrink: 0,
          }}
          // If Google Drive image fails, fallback to initials
          onError={(e) => {
            const target = e.target as HTMLImageElement;
            target.style.display = 'none';
            const fallback = target.nextElementSibling as HTMLElement;
            if (fallback) fallback.style.display = 'flex';
          }}
        />
      );
    }
    return null;
  };

  const renderAvatarFallback = (nv: NhanVien, size = 36) => {
    return (
      <div style={{
        width: size, height: size, borderRadius: '50%',
        background: nv.vai_tro === 'Admin'
          ? 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)'
          : 'linear-gradient(135deg, #10b981 0%, #34d399 100%)',
        display: nv.avatar_url ? 'none' : 'flex',
        alignItems: 'center', justifyContent: 'center',
        color: '#fff', fontSize: size * 0.38, fontWeight: 600,
        flexShrink: 0,
      }}>
        {nv.ho_ten.split(' ').pop()?.charAt(0).toUpperCase()}
      </div>
    );
  };

  if (loading || authLoading) {
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
        {isAdmin && (
          <button className="btn btn-primary" onClick={openCreate}>
            <Plus size={18} />
            Thêm nhân viên
          </button>
        )}
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
                  {isAdmin && <th style={{ width: 90, textAlign: 'center' }}>Thao tác</th>}
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
                          {renderAvatar(nv)}
                          {renderAvatarFallback(nv)}
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
                      {isAdmin && (
                        <td>
                          <div className="flex items-center gap-2" style={{ justifyContent: 'center' }}>
                            <button className="btn btn-ghost btn-icon btn-sm" onClick={() => openEdit(nv)}><Edit3 size={15} /></button>
                            <button className="btn btn-ghost btn-icon btn-sm" style={{ color: 'var(--danger-text)' }}
                              onClick={() => { setDeletingId(nv.id_nhan_vien); setShowConfirm(true); }}><Trash2 size={15} /></button>
                          </div>
                        </td>
                      )}
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
              {/* Avatar Upload Section */}
              <div className="form-group" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 24 }}>
                <div style={{ position: 'relative', marginBottom: 12 }}>
                  {/* Avatar preview */}
                  {form.avatar_url ? (
                    <img
                      src={form.avatar_url}
                      alt="Avatar preview"
                      style={{
                        width: 80, height: 80, borderRadius: '50%',
                        objectFit: 'cover', border: '3px solid var(--border)',
                      }}
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.style.display = 'none';
                      }}
                    />
                  ) : (
                    <div style={{
                      width: 80, height: 80, borderRadius: '50%',
                      background: 'linear-gradient(135deg, #e0e7ff 0%, #c7d2fe 100%)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      border: '3px dashed var(--border)',
                      color: 'var(--text-label)', fontSize: 28,
                    }}>
                      <Upload size={28} />
                    </div>
                  )}

                  {/* Upload spinner overlay */}
                  {uploading && (
                    <div style={{
                      position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                      borderRadius: '50%',
                      background: 'rgba(0,0,0,0.5)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Loader2 size={24} color="#fff" style={{ animation: 'spin 1s linear infinite' }} />
                    </div>
                  )}
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  onChange={handleAvatarUpload}
                  style={{ display: 'none' }}
                  id="avatar-upload-input"
                />

                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  style={{ fontSize: '0.8rem', padding: '6px 16px' }}
                >
                  {uploading ? 'Đang tải...' : (form.avatar_url ? 'Đổi ảnh' : 'Chọn ảnh đại diện')}
                </button>

                {/* Remove avatar button */}
                {form.avatar_url && !uploading && (
                  <button
                    type="button"
                    onClick={() => setForm(prev => ({ ...prev, avatar_url: '' }))}
                    style={{
                      marginTop: 4, background: 'none', border: 'none',
                      color: 'var(--danger-text)', cursor: 'pointer',
                      fontSize: '0.75rem', textDecoration: 'underline',
                    }}
                  >
                    Xóa ảnh
                  </button>
                )}

                {/* Upload error */}
                {uploadError && (
                  <p style={{ color: 'var(--danger-text)', fontSize: '0.8rem', marginTop: 8, textAlign: 'center' }}>
                    {uploadError}
                  </p>
                )}
              </div>

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
                  <label className="form-label">Email * <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 400 }}>(dùng để đăng nhập)</span></label>
                  <input className="form-input" type="email" value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="email@example.com" required />
                </div>
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

            {/* Password info note */}
            <div style={{
              padding: '10px 14px', margin: '0 20px',
              background: 'var(--info-bg)', borderRadius: 'var(--radius-md)',
              fontSize: '0.75rem', color: 'var(--info-text)', lineHeight: 1.5,
            }}>
              <strong>Thông tin đăng nhập:</strong><br/>
              • Tài khoản: Email nhân viên<br/>
              • Mật khẩu mặc định: <code style={{ background: 'rgba(0,0,0,0.08)', padding: '1px 5px', borderRadius: 4 }}>123456</code> hoặc Số điện thoại
            </div>

            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Hủy</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving || uploading || !form.ho_ten.trim() || !form.email.trim()}>
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

      {/* Spin animation for upload loading */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
