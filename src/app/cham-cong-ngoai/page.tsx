'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  MapPin, Clock, Building2, CheckCircle, XCircle,
  Loader2, Trash2, Plus, RefreshCw, Camera, Download, Image as ImageIcon, X,
  Navigation, User,
} from 'lucide-react';
import type { ChamCongNgoai } from '@/lib/types';
import { useAuth } from '@/hooks/useAuth';

const STATUS_LABEL: Record<string, { text: string; color: string }> = {
  cho_duyet: { text: 'Chờ duyệt', color: '#f59e0b' },
  da_duyet:  { text: 'Đã duyệt',  color: '#10b981' },
  tu_choi:   { text: 'Từ chối',   color: '#ef4444' },
};

const STATUS_VI: Record<string, string> = {
  cho_duyet: 'Chờ duyệt',
  da_duyet:  'Đã duyệt',
  tu_choi:   'Từ chối',
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(d: string): string {
  if (!d) return '';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

function compressImage(file: File, maxPx = 480, targetKB = 20): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > height) {
          if (width > maxPx) { height = Math.round(height * maxPx / width); width = maxPx; }
        } else {
          if (height > maxPx) { width = Math.round(width * maxPx / height); height = maxPx; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
        const attempt = (q: number) => {
          canvas.toBlob((blob) => {
            if (!blob) { reject(new Error('Lỗi tạo blob')); return; }
            if (blob.size > targetKB * 1024 && q > 0.2) { attempt(parseFloat((q - 0.1).toFixed(1))); return; }
            const fr = new FileReader();
            fr.onloadend = () => resolve(fr.result as string);
            fr.readAsDataURL(blob);
          }, 'image/jpeg', q);
        };
        attempt(0.75);
      };
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function ChamCongNgoaiPage() {
  const { user, canEditHRM } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Form ──────────────────────────────────────────────────────
  const [form, setForm] = useState({
    ngay: today(), gio_bat_dau: '08:00', gio_ket_thuc: '17:00',
    du_an_khach_hang: '', dia_diem: '', ghi_chu: '',
  });
  const [photo, setPhoto]           = useState('');
  const [photoLoading, setPhotoLoading] = useState(false);
  const [gps, setGps]               = useState('');
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError]     = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formMsg, setFormMsg]       = useState<{ ok: boolean; text: string } | null>(null);

  // ── Data ──────────────────────────────────────────────────────
  const [records, setRecords] = useState<ChamCongNgoai[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Export filter ─────────────────────────────────────────────
  const now = new Date();
  const [exportMonth, setExportMonth] = useState(now.getMonth() + 1);
  const [exportYear, setExportYear]   = useState(now.getFullYear());
  const [exporting, setExporting]     = useState(false);

  // ── Sync manager ──────────────────────────────────────────────
  const [syncingManager, setSyncingManager] = useState(false);
  const [syncResult, setSyncResult] = useState<{ ok: boolean; text: string } | null>(null);

  // ── Approve modal ─────────────────────────────────────────────
  const [approving, setApproving] = useState<{ id: string; action: 'da_duyet' | 'tu_choi' } | null>(null);
  const [ghiChuDuyet, setGhiChuDuyet] = useState('');
  const [approveLoading, setApproveLoading] = useState(false);

  // ── Lightbox ──────────────────────────────────────────────────
  const [lightbox, setLightbox] = useState('');

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/cham-cong-ngoai');
      const json = await res.json();
      if (json.success) setRecords(json.data || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRecords(); }, [fetchRecords]);

  // ── GPS ───────────────────────────────────────────────────────
  const handleGetGps = () => {
    if (!navigator.geolocation) {
      setGpsError('Thiết bị không hỗ trợ định vị GPS');
      return;
    }
    setGpsLoading(true);
    setGpsError('');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude.toFixed(6);
        const lng = pos.coords.longitude.toFixed(6);
        const acc = Math.round(pos.coords.accuracy);
        setGps(`${lat},${lng} (±${acc}m)`);
        setGpsLoading(false);
      },
      (err) => {
        setGpsError(err.code === 1 ? 'Cần cấp quyền vị trí cho trình duyệt' : 'Không lấy được vị trí: ' + err.message);
        setGpsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  };

  // ── Photo ─────────────────────────────────────────────────────
  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoLoading(true);
    try {
      setPhoto(await compressImage(file, 480, 20));
    } catch { alert('Không đọc được ảnh'); }
    finally { setPhotoLoading(false); if (fileInputRef.current) fileInputRef.current.value = ''; }
  };

  // ── Submit ────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormMsg(null);
    try {
      const res = await fetch('/api/cham-cong-ngoai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, hinh_anh: photo, vi_tri_gps: gps }),
      });
      const json = await res.json();
      if (json.success) {
        setFormMsg({ ok: true, text: 'Đã gửi đơn, chờ phê duyệt' });
        setForm({ ngay: today(), gio_bat_dau: '08:00', gio_ket_thuc: '17:00', du_an_khach_hang: '', dia_diem: '', ghi_chu: '' });
        setPhoto(''); setGps('');
        fetchRecords();
      } else {
        setFormMsg({ ok: false, text: json.error || 'Gửi thất bại' });
      }
    } catch { setFormMsg({ ok: false, text: 'Lỗi kết nối server' }); }
    finally { setSubmitting(false); }
  };

  // ── Delete ────────────────────────────────────────────────────
  const handleDelete = async (id: string) => {
    if (!confirm('Xóa đơn này?')) return;
    try {
      const res = await fetch(`/api/cham-cong-ngoai?id=${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) fetchRecords();
      else alert(json.error || 'Xóa thất bại');
    } catch { alert('Lỗi kết nối server'); }
  };

  // ── Sync manager ─────────────────────────────────────────────
  const handleSyncManager = async () => {
    setSyncingManager(true);
    setSyncResult(null);
    try {
      const res = await fetch('/api/nhan-vien/sync-manager', { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        setSyncResult({ ok: true, text: `Đồng bộ xong: ${json.updated} cập nhật, ${json.skipped} bỏ qua${json.errors?.length ? `, ${json.errors.length} lỗi` : ''}` });
        fetchRecords();
      } else {
        setSyncResult({ ok: false, text: json.error || 'Đồng bộ thất bại' });
      }
    } catch {
      setSyncResult({ ok: false, text: 'Lỗi kết nối server' });
    } finally {
      setSyncingManager(false);
    }
  };

  // ── Approve ───────────────────────────────────────────────────
  const handleApprove = async () => {
    if (!approving) return;
    setApproveLoading(true);
    try {
      const res = await fetch('/api/cham-cong-ngoai', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: approving.id, trang_thai: approving.action, ghi_chu_duyet: ghiChuDuyet }),
      });
      const json = await res.json();
      if (json.success) { setApproving(null); setGhiChuDuyet(''); fetchRecords(); }
      else alert(json.error || 'Thao tác thất bại');
    } catch { alert('Lỗi kết nối server'); }
    finally { setApproveLoading(false); }
  };

  // ── Export Excel ──────────────────────────────────────────────
  const handleExport = async () => {
    setExporting(true);
    try {
      const XLSX = await import('xlsx');
      const filtered = records
        .filter(r => {
          if (!r.ngay) return false;
          const [y, m] = r.ngay.split('-').map(Number);
          return m === exportMonth && y === exportYear;
        })
        .sort((a, b) => a.ngay.localeCompare(b.ngay) || a.gio_bat_dau.localeCompare(b.gio_bat_dau));

      const header = ['STT', 'Họ và tên', 'Mã NV', 'Quản lý trực tiếp', 'Ngày', 'Từ giờ', 'Đến giờ',
        'Dự án / Khách hàng', 'Địa điểm', 'Ghi chú', 'GPS', 'Có ảnh',
        'Trạng thái', 'Người phê duyệt', 'Ghi chú phê duyệt'];

      const rows = filtered.map((r, i) => [
        i + 1, r.ho_ten || '', r.id_nhan_vien, r.ql_truc_tiep || '',
        formatDate(r.ngay), r.gio_bat_dau, r.gio_ket_thuc,
        r.du_an_khach_hang, r.dia_diem, r.ghi_chu || '',
        r.vi_tri_gps || '', r.hinh_anh ? 'Có' : 'Không',
        STATUS_VI[r.trang_thai] || r.trang_thai,
        r.nguoi_duyet || '', r.ghi_chu_duyet || '',
      ]);

      const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
      ws['!cols'] = [
        { wch: 5 }, { wch: 22 }, { wch: 10 }, { wch: 20 }, { wch: 12 }, { wch: 9 }, { wch: 9 },
        { wch: 28 }, { wch: 24 }, { wch: 24 }, { wch: 26 }, { wch: 8 },
        { wch: 12 }, { wch: 18 }, { wch: 24 },
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Chi tiết');

      // Summary by person
      const byPerson: Record<string, { ho_ten: string; ql: string; total: number; approved: number }> = {};
      for (const r of filtered) {
        if (!byPerson[r.id_nhan_vien]) byPerson[r.id_nhan_vien] = { ho_ten: r.ho_ten || r.id_nhan_vien, ql: r.ql_truc_tiep || '', total: 0, approved: 0 };
        byPerson[r.id_nhan_vien].total++;
        if (r.trang_thai === 'da_duyet') byPerson[r.id_nhan_vien].approved++;
      }
      const ws2 = XLSX.utils.aoa_to_sheet([
        ['Mã NV', 'Họ và tên', 'Quản lý trực tiếp', 'Tổng đơn', 'Đã duyệt', 'Chờ/Từ chối'],
        ...Object.entries(byPerson).map(([id, v]) => [id, v.ho_ten, v.ql, v.total, v.approved, v.total - v.approved]),
      ]);
      ws2['!cols'] = [{ wch: 10 }, { wch: 22 }, { wch: 20 }, { wch: 10 }, { wch: 10 }, { wch: 12 }];
      XLSX.utils.book_append_sheet(wb, ws2, 'Tổng hợp');

      XLSX.writeFile(wb, `ChamCongNgoai_T${String(exportMonth).padStart(2, '0')}_${exportYear}.xlsx`);
    } catch (err) {
      alert('Xuất Excel thất bại: ' + String(err));
    } finally {
      setExporting(false);
    }
  };

  const myRecords = records.filter(r => r.id_nhan_vien === user?.id_nhan_vien);

  // Đơn của nhóm mình (là quản lý trực tiếp) — không tính đơn của chính mình
  const managedRecords = records.filter(
    r => r.ql_truc_tiep === user?.ho_ten && r.id_nhan_vien !== user?.id_nhan_vien,
  );
  const pendingManaged = managedRecords.filter(r => r.trang_thai === 'cho_duyet');
  const isManager = managedRecords.length > 0;

  const pendingAll = canEditHRM ? records.filter(r => r.trang_thai === 'cho_duyet') : [];
  const filteredAll = canEditHRM
    ? records.filter(r => {
        if (!r.ngay) return false;
        const [y, m] = r.ngay.split('-').map(Number);
        return m === exportMonth && y === exportYear;
      })
    : [];

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '16px 12px 80px' }}>

      {/* HEADER */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <MapPin size={22} style={{ color: 'var(--primary)' }} />
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Chấm công ngoài</h1>
        <button onClick={fetchRecords} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: 4 }} title="Làm mới">
          <RefreshCw size={16} />
        </button>
      </div>

      {/* FORM */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ fontWeight: 600, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Plus size={16} style={{ color: 'var(--primary)' }} />
          Đăng ký vắng mặt
        </div>
        <form onSubmit={handleSubmit}>
          {/* Ngày + giờ */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Ngày</label>
              <input type="date" className="form-input" value={form.ngay} onChange={e => setForm(f => ({ ...f, ngay: e.target.value }))} required />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Từ giờ</label>
              <input type="time" className="form-input" value={form.gio_bat_dau} onChange={e => setForm(f => ({ ...f, gio_bat_dau: e.target.value }))} required />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Đến giờ</label>
              <input type="time" className="form-input" value={form.gio_ket_thuc} onChange={e => setForm(f => ({ ...f, gio_ket_thuc: e.target.value }))} required />
            </div>
          </div>

          {/* Dự án */}
          <div className="form-group" style={{ marginBottom: 10 }}>
            <label className="form-label">Dự án / Khách hàng <span style={{ color: 'var(--danger)' }}>*</span></label>
            <input type="text" className="form-input" placeholder="Tên dự án hoặc tên khách hàng" value={form.du_an_khach_hang} onChange={e => setForm(f => ({ ...f, du_an_khach_hang: e.target.value }))} required />
          </div>

          {/* Địa điểm */}
          <div className="form-group" style={{ marginBottom: 10 }}>
            <label className="form-label">Địa điểm <span style={{ color: 'var(--danger)' }}>*</span></label>
            <input type="text" className="form-input" placeholder="Địa chỉ / tên địa điểm" value={form.dia_diem} onChange={e => setForm(f => ({ ...f, dia_diem: e.target.value }))} required />
          </div>

          {/* Ghi chú */}
          <div className="form-group" style={{ marginBottom: 10 }}>
            <label className="form-label">Ghi chú</label>
            <textarea className="form-input" placeholder="Nội dung công việc, mục đích..." rows={2} style={{ resize: 'vertical' }} value={form.ghi_chu} onChange={e => setForm(f => ({ ...f, ghi_chu: e.target.value }))} />
          </div>

          {/* GPS + Photo side by side */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
            {/* GPS */}
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Vị trí GPS</label>
              {gps ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <a
                    href={`https://maps.google.com/?q=${gps.split(' ')[0]}`}
                    target="_blank" rel="noopener noreferrer"
                    style={{ fontSize: 12, color: '#10b981', display: 'flex', alignItems: 'center', gap: 4, textDecoration: 'none', fontWeight: 600 }}
                  >
                    <CheckCircle size={13} />
                    {gps.split('(')[1]?.replace(')', '') || 'Đã lấy vị trí'}
                  </a>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)', wordBreak: 'break-all' }}>{gps.split(' ')[0]}</span>
                  <button type="button" onClick={() => setGps('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 11, textAlign: 'left', padding: 0 }}>
                    Xóa vị trí
                  </button>
                </div>
              ) : (
                <div>
                  <button
                    type="button"
                    onClick={handleGetGps}
                    disabled={gpsLoading}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', border: '1.5px dashed var(--border)', borderRadius: 8, background: 'none', cursor: gpsLoading ? 'wait' : 'pointer', color: 'var(--text-secondary)', fontSize: 13, width: '100%', justifyContent: 'center' }}
                  >
                    {gpsLoading
                      ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} />
                      : <Navigation size={15} />}
                    {gpsLoading ? 'Đang định vị...' : 'Lấy GPS'}
                  </button>
                  {gpsError && <div style={{ fontSize: 11, color: '#ef4444', marginTop: 4 }}>{gpsError}</div>}
                </div>
              )}
            </div>

            {/* Photo */}
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Ảnh tại dự án</label>
              <input ref={fileInputRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handlePhotoChange} />
              {photo ? (
                <div style={{ position: 'relative', display: 'inline-block' }}>
                  <img src={photo} alt="preview" onClick={() => setLightbox(photo)}
                    style={{ height: 68, borderRadius: 8, cursor: 'zoom-in', objectFit: 'cover', border: '2px solid var(--primary)' }} />
                  <button type="button" onClick={() => setPhoto('')}
                    style={{ position: 'absolute', top: -8, right: -8, background: '#ef4444', border: 'none', borderRadius: '50%', width: 20, height: 20, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                    <X size={11} />
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => fileInputRef.current?.click()} disabled={photoLoading}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', border: '1.5px dashed var(--border)', borderRadius: 8, background: 'none', cursor: photoLoading ? 'wait' : 'pointer', color: 'var(--text-secondary)', fontSize: 13, width: '100%', justifyContent: 'center' }}>
                  {photoLoading ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <Camera size={15} />}
                  {photoLoading ? 'Đang xử lý...' : 'Chụp / chọn'}
                </button>
              )}
            </div>
          </div>

          {formMsg && (
            <div style={{ padding: '8px 12px', borderRadius: 8, marginBottom: 12, background: formMsg.ok ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', color: formMsg.ok ? '#10b981' : '#ef4444', fontSize: 14 }}>
              {formMsg.ok ? <CheckCircle size={14} style={{ display: 'inline', marginRight: 6 }} /> : <XCircle size={14} style={{ display: 'inline', marginRight: 6 }} />}
              {formMsg.text}
            </div>
          )}

          <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={submitting || photoLoading || gpsLoading}>
            {submitting ? <><Loader2 size={15} style={{ display: 'inline', marginRight: 6, animation: 'spin 1s linear infinite' }} />Đang gửi...</> : 'Gửi đơn'}
          </button>
        </form>
      </div>

      {/* DUYỆT ĐƠN — Admin/HR thấy tất cả chờ duyệt */}
      {canEditHRM && pendingAll.length > 0 && (
        <div className="card" style={{ marginBottom: 24, borderLeft: '3px solid #f59e0b' }}>
          <div style={{ fontWeight: 600, marginBottom: 14, color: '#f59e0b', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Clock size={16} />
            Chờ phê duyệt ({pendingAll.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {pendingAll.map(r => (
              <ApproveCard
                key={r.id} record={r}
                onPhoto={r.hinh_anh ? () => setLightbox(r.hinh_anh!) : undefined}
                onApprove={() => { setApproving({ id: r.id, action: 'da_duyet' }); setGhiChuDuyet(''); }}
                onReject={() => { setApproving({ id: r.id, action: 'tu_choi' }); setGhiChuDuyet(''); }}
              />
            ))}
          </div>
        </div>
      )}

      {/* DUYỆT ĐƠN — Quản lý trực tiếp thấy đơn của nhóm mình */}
      {!canEditHRM && isManager && pendingManaged.length > 0 && (
        <div className="card" style={{ marginBottom: 24, borderLeft: '3px solid #f59e0b' }}>
          <div style={{ fontWeight: 600, marginBottom: 14, color: '#f59e0b', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Clock size={16} />
            Đơn nhóm chờ duyệt ({pendingManaged.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {pendingManaged.map(r => (
              <ApproveCard
                key={r.id} record={r}
                onPhoto={r.hinh_anh ? () => setLightbox(r.hinh_anh!) : undefined}
                onApprove={() => { setApproving({ id: r.id, action: 'da_duyet' }); setGhiChuDuyet(''); }}
                onReject={() => { setApproving({ id: r.id, action: 'tu_choi' }); setGhiChuDuyet(''); }}
              />
            ))}
          </div>
        </div>
      )}

      {/* LỊCH SỬ NHÓM — Quản lý xem tất cả đơn (đã/từ chối) của nhóm */}
      {!canEditHRM && isManager && managedRecords.filter(r => r.trang_thai !== 'cho_duyet').length > 0 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ fontWeight: 600, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
            <User size={15} style={{ color: 'var(--primary)' }} />
            Đơn nhóm đã xử lý
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {managedRecords
              .filter(r => r.trang_thai !== 'cho_duyet')
              .map(r => (
                <RecordCard key={r.id} record={r} showName
                  onPhoto={r.hinh_anh ? () => setLightbox(r.hinh_anh!) : undefined}
                />
              ))}
          </div>
        </div>
      )}

      {/* ĐƠN CỦA TÔI */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 600, marginBottom: 14 }}>Đơn của tôi</div>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 24 }}><Loader2 size={20} style={{ animation: 'spin 1s linear infinite', color: 'var(--text-secondary)' }} /></div>
        ) : myRecords.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-secondary)', fontSize: 14 }}>Chưa có đơn nào</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {myRecords.map(r => (
              <RecordCard key={r.id} record={r}
                showDelete={r.trang_thai === 'cho_duyet'}
                onDelete={() => handleDelete(r.id)}
                onPhoto={r.hinh_anh ? () => setLightbox(r.hinh_anh!) : undefined}
              />
            ))}
          </div>
        )}
      </div>

      {/* TẤT CẢ ĐƠN (Admin/HR) */}
      {canEditHRM && (
        <div className="card">
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginBottom: syncResult ? 8 : 16 }}>
            <span style={{ fontWeight: 600 }}>Tất cả đơn</span>
            <div style={{ display: 'flex', gap: 6, marginLeft: 'auto', flexWrap: 'wrap' }}>
              <button onClick={handleSyncManager} disabled={syncingManager}
                className="btn btn-secondary"
                style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '6px 12px' }}
                title="Đồng bộ tên quản lý trực tiếp từ file nhân sự">
                {syncingManager ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <User size={14} />}
                Đồng bộ QLTT
              </button>
              <select value={exportMonth} onChange={e => setExportMonth(Number(e.target.value))}
                className="form-input" style={{ width: 90, padding: '4px 8px', fontSize: 13 }}>
                {Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m} value={m}>Tháng {m}</option>)}
              </select>
              <select value={exportYear} onChange={e => setExportYear(Number(e.target.value))}
                className="form-input" style={{ width: 80, padding: '4px 8px', fontSize: 13 }}>
                {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              <button onClick={handleExport} disabled={exporting || filteredAll.length === 0}
                className="btn btn-secondary"
                style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '6px 12px' }}
                title={filteredAll.length === 0 ? 'Không có dữ liệu trong tháng này' : 'Xuất Excel'}>
                {exporting ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Download size={14} />}
                Xuất .xlsx {filteredAll.length > 0 && `(${filteredAll.length})`}
              </button>
            </div>
          </div>
          {syncResult && (
            <div style={{ padding: '7px 12px', borderRadius: 8, marginBottom: 14, fontSize: 13, background: syncResult.ok ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', color: syncResult.ok ? '#10b981' : '#ef4444', display: 'flex', alignItems: 'center', gap: 8 }}>
              {syncResult.ok ? <CheckCircle size={14} /> : <XCircle size={14} />}
              {syncResult.text}
              <button onClick={() => setSyncResult(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0 }}><X size={13} /></button>
            </div>
          )}
          {loading ? (
            <div style={{ textAlign: 'center', padding: 24 }}><Loader2 size={20} style={{ animation: 'spin 1s linear infinite', color: 'var(--text-secondary)' }} /></div>
          ) : filteredAll.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-secondary)', fontSize: 14 }}>
              Không có đơn nào trong tháng {exportMonth}/{exportYear}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {filteredAll.map(r => (
                <RecordCard key={r.id} record={r} showName onPhoto={r.hinh_anh ? () => setLightbox(r.hinh_anh!) : undefined} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* APPROVE MODAL */}
      {approving && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <h3 className="modal-title">{approving.action === 'da_duyet' ? 'Phê duyệt đơn' : 'Từ chối đơn'}</h3>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Ghi chú (tùy chọn)</label>
                <textarea className="form-input" rows={3}
                  placeholder={approving.action === 'tu_choi' ? 'Lý do từ chối...' : 'Ghi chú thêm...'}
                  value={ghiChuDuyet} onChange={e => setGhiChuDuyet(e.target.value)} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setApproving(null)} disabled={approveLoading}>Hủy</button>
              <button className="btn btn-primary" onClick={handleApprove} disabled={approveLoading}
                style={approving.action === 'tu_choi' ? { background: '#ef4444' } : {}}>
                {approveLoading ? 'Đang xử lý...' : approving.action === 'da_duyet' ? 'Phê duyệt' : 'Từ chối'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* LIGHTBOX */}
      {lightbox && (
        <div onClick={() => setLightbox('')}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <img src={lightbox} alt="ảnh tại dự án"
            style={{ maxWidth: '100%', maxHeight: '90vh', borderRadius: 10, objectFit: 'contain' }} />
          <button onClick={() => setLightbox('')}
            style={{ position: 'absolute', top: 16, right: 16, background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%', width: 36, height: 36, cursor: 'pointer', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={20} />
          </button>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_LABEL[status] || { text: status, color: '#6b7280' };
  return (
    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: s.color + '20', color: s.color, whiteSpace: 'nowrap' }}>
      {s.text}
    </span>
  );
}

function GpsChip({ gps }: { gps: string }) {
  const coords = gps.split(' ')[0];
  const acc    = gps.match(/±(.+)\)/)?.[1];
  return (
    <a href={`https://maps.google.com/?q=${coords}`} target="_blank" rel="noopener noreferrer"
      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--primary)', textDecoration: 'none', fontWeight: 500, background: 'rgba(99,102,241,0.08)', padding: '2px 7px', borderRadius: 20, whiteSpace: 'nowrap' }}>
      <Navigation size={10} />
      {acc ? `±${acc}` : 'Xem bản đồ'}
    </a>
  );
}

function RecordCard({ record, showDelete, onDelete, showName, onPhoto }: {
  record: ChamCongNgoai;
  showDelete?: boolean;
  onDelete?: () => void;
  showName?: boolean;
  onPhoto?: () => void;
}) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', background: 'var(--bg-card)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
        <div style={{ fontWeight: 600, fontSize: 14, flex: 1 }}>
          {showName && record.ho_ten && <span style={{ color: 'var(--text-secondary)', fontWeight: 400, marginRight: 6 }}>{record.ho_ten} —</span>}
          <Building2 size={13} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle', color: 'var(--primary)' }} />
          {record.du_an_khach_hang}
        </div>
        <StatusBadge status={record.trang_thai} />
      </div>

      <div style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'flex', flexWrap: 'wrap', gap: '4px 14px', marginBottom: 4 }}>
        <span><Clock size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />{formatDate(record.ngay)} | {record.gio_bat_dau}–{record.gio_ket_thuc}</span>
        <span><MapPin size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />{record.dia_diem}</span>
      </div>

      {/* GPS + photo row */}
      {(record.vi_tri_gps || record.hinh_anh) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
          {record.vi_tri_gps && <GpsChip gps={record.vi_tri_gps} />}
          {record.hinh_anh && onPhoto && (
            <img src={record.hinh_anh} alt="ảnh" onClick={onPhoto}
              style={{ height: 48, borderRadius: 6, cursor: 'zoom-in', objectFit: 'cover', border: '1px solid var(--border)' }} />
          )}
        </div>
      )}

      {record.ghi_chu && <div style={{ fontSize: 12, marginTop: 6, color: 'var(--text-secondary)', fontStyle: 'italic' }}>{record.ghi_chu}</div>}

      {(record.nguoi_duyet || record.ghi_chu_duyet) && (
        <div style={{ fontSize: 12, marginTop: 6, borderTop: '1px solid var(--border)', paddingTop: 6, color: 'var(--text-secondary)' }}>
          {record.nguoi_duyet && <span>Duyệt bởi: <b>{record.nguoi_duyet}</b></span>}
          {record.ghi_chu_duyet && <span style={{ marginLeft: 8 }}>— {record.ghi_chu_duyet}</span>}
        </div>
      )}

      {showDelete && onDelete && (
        <button onClick={onDelete}
          style={{ marginTop: 8, background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, padding: '2px 0' }}>
          <Trash2 size={12} /> Xóa đơn
        </button>
      )}
    </div>
  );
}

function ApproveCard({ record, onApprove, onReject, onPhoto }: {
  record: ChamCongNgoai;
  onApprove: () => void;
  onReject: () => void;
  onPhoto?: () => void;
}) {
  return (
    <div style={{ border: '1px solid #f59e0b40', borderRadius: 10, padding: '12px 14px', background: 'rgba(245,158,11,0.04)' }}>
      {/* Top row: info + photo */}
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Employee + manager */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>{record.ho_ten || record.id_nhan_vien}</span>
            {record.ql_truc_tiep && (
              <span style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4, background: 'rgba(99,102,241,0.1)', color: 'var(--primary)', padding: '2px 8px', borderRadius: 20, fontWeight: 500, whiteSpace: 'nowrap' }}>
                <User size={10} />
                QL: {record.ql_truc_tiep}
              </span>
            )}
          </div>

          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 2 }}>
            <Building2 size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
            {record.du_an_khach_hang}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>
            <Clock size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
            {formatDate(record.ngay)} | {record.gio_bat_dau}–{record.gio_ket_thuc}
            <MapPin size={12} style={{ display: 'inline', marginLeft: 10, marginRight: 4, verticalAlign: 'middle' }} />
            {record.dia_diem}
          </div>

          {/* GPS chip */}
          {record.vi_tri_gps && (
            <div style={{ marginBottom: 4 }}>
              <GpsChip gps={record.vi_tri_gps} />
            </div>
          )}

          {record.ghi_chu && <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontStyle: 'italic' }}>{record.ghi_chu}</div>}
        </div>

        {/* Photo or placeholder */}
        {record.hinh_anh ? (
          <img src={record.hinh_anh} alt="ảnh" onClick={onPhoto} title="Xem ảnh"
            style={{ width: 72, height: 72, borderRadius: 8, objectFit: 'cover', cursor: 'zoom-in', flexShrink: 0, border: '1px solid var(--border)' }} />
        ) : (
          <div style={{ width: 72, height: 72, borderRadius: 8, background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <ImageIcon size={22} style={{ color: 'var(--text-secondary)', opacity: 0.35 }} />
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button onClick={onApprove} className="btn btn-primary"
          style={{ flex: 1, fontSize: 13, padding: '7px 12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <CheckCircle size={14} /> Duyệt
        </button>
        <button onClick={onReject} className="btn btn-secondary"
          style={{ flex: 1, fontSize: 13, padding: '7px 12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, color: '#ef4444' }}>
          <XCircle size={14} /> Từ chối
        </button>
      </div>
    </div>
  );
}
