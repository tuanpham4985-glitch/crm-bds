'use client';

import { useState, useEffect, useCallback } from 'react';
import { MapPin, Clock, Building2, CheckCircle, XCircle, Loader2, Trash2, Plus, RefreshCw } from 'lucide-react';
import type { ChamCongNgoai } from '@/lib/types';
import { useAuth } from '@/hooks/useAuth';

const STATUS_LABEL: Record<string, { text: string; color: string }> = {
  cho_duyet: { text: 'Chờ duyệt', color: '#f59e0b' },
  da_duyet:  { text: 'Đã duyệt',  color: '#10b981' },
  tu_choi:   { text: 'Từ chối',   color: '#ef4444' },
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(d: string): string {
  if (!d) return '';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

export default function ChamCongNgoaiPage() {
  const { user, canEditHRM } = useAuth();

  // ── Form state ────────────────────────────────────────────────
  const [form, setForm] = useState({
    ngay: today(),
    gio_bat_dau: '08:00',
    gio_ket_thuc: '17:00',
    du_an_khach_hang: '',
    dia_diem: '',
    ghi_chu: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [formMsg, setFormMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // ── Data ─────────────────────────────────────────────────────
  const [records, setRecords] = useState<ChamCongNgoai[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Approve modal ────────────────────────────────────────────
  const [approving, setApproving] = useState<{ id: string; action: 'da_duyet' | 'tu_choi' } | null>(null);
  const [ghiChuDuyet, setGhiChuDuyet] = useState('');
  const [approveLoading, setApproveLoading] = useState(false);

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/cham-cong-ngoai');
      const json = await res.json();
      if (json.success) setRecords(json.data || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRecords(); }, [fetchRecords]);

  // ── Submit new record ─────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormMsg(null);
    try {
      const res = await fetch('/api/cham-cong-ngoai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (json.success) {
        setFormMsg({ ok: true, text: 'Đã gửi đơn, chờ phê duyệt' });
        setForm({ ngay: today(), gio_bat_dau: '08:00', gio_ket_thuc: '17:00', du_an_khach_hang: '', dia_diem: '', ghi_chu: '' });
        fetchRecords();
      } else {
        setFormMsg({ ok: false, text: json.error || 'Gửi thất bại' });
      }
    } catch {
      setFormMsg({ ok: false, text: 'Lỗi kết nối server' });
    } finally {
      setSubmitting(false);
    }
  };

  // ── Delete ────────────────────────────────────────────────────
  const handleDelete = async (id: string) => {
    if (!confirm('Xóa đơn này?')) return;
    try {
      const res = await fetch(`/api/cham-cong-ngoai?id=${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) fetchRecords();
      else alert(json.error || 'Xóa thất bại');
    } catch {
      alert('Lỗi kết nối server');
    }
  };

  // ── Approve / Reject ──────────────────────────────────────────
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
      if (json.success) {
        setApproving(null);
        setGhiChuDuyet('');
        fetchRecords();
      } else {
        alert(json.error || 'Thao tác thất bại');
      }
    } catch {
      alert('Lỗi kết nối server');
    } finally {
      setApproveLoading(false);
    }
  };

  const myRecords = records.filter(r => r.id_nhan_vien === user?.id_nhan_vien);
  const pendingForMe = canEditHRM ? records.filter(r => r.trang_thai === 'cho_duyet') : [];

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '16px 12px 80px' }}>

      {/* ── HEADER ───────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <MapPin size={22} style={{ color: 'var(--primary)' }} />
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Chấm công ngoài</h1>
        <button
          onClick={fetchRecords}
          style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: 4 }}
          title="Làm mới"
        >
          <RefreshCw size={16} />
        </button>
      </div>

      {/* ── FORM TẠO ĐƠN ─────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ fontWeight: 600, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Plus size={16} style={{ color: 'var(--primary)' }} />
          Đăng ký vắng mặt
        </div>
        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Ngày</label>
              <input
                type="date"
                className="form-input"
                value={form.ngay}
                onChange={e => setForm(f => ({ ...f, ngay: e.target.value }))}
                required
              />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Từ giờ</label>
              <input
                type="time"
                className="form-input"
                value={form.gio_bat_dau}
                onChange={e => setForm(f => ({ ...f, gio_bat_dau: e.target.value }))}
                required
              />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Đến giờ</label>
              <input
                type="time"
                className="form-input"
                value={form.gio_ket_thuc}
                onChange={e => setForm(f => ({ ...f, gio_ket_thuc: e.target.value }))}
                required
              />
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: 10 }}>
            <label className="form-label">Dự án / Khách hàng <span style={{ color: 'var(--danger)' }}>*</span></label>
            <input
              type="text"
              className="form-input"
              placeholder="Tên dự án hoặc tên khách hàng"
              value={form.du_an_khach_hang}
              onChange={e => setForm(f => ({ ...f, du_an_khach_hang: e.target.value }))}
              required
            />
          </div>

          <div className="form-group" style={{ marginBottom: 10 }}>
            <label className="form-label">Địa điểm <span style={{ color: 'var(--danger)' }}>*</span></label>
            <input
              type="text"
              className="form-input"
              placeholder="Địa chỉ / tên địa điểm"
              value={form.dia_diem}
              onChange={e => setForm(f => ({ ...f, dia_diem: e.target.value }))}
              required
            />
          </div>

          <div className="form-group" style={{ marginBottom: 14 }}>
            <label className="form-label">Ghi chú</label>
            <textarea
              className="form-input"
              placeholder="Nội dung công việc, mục đích chuyến đi..."
              rows={2}
              style={{ resize: 'vertical' }}
              value={form.ghi_chu}
              onChange={e => setForm(f => ({ ...f, ghi_chu: e.target.value }))}
            />
          </div>

          {formMsg && (
            <div style={{
              padding: '8px 12px',
              borderRadius: 8,
              marginBottom: 12,
              background: formMsg.ok ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
              color: formMsg.ok ? '#10b981' : '#ef4444',
              fontSize: 14,
            }}>
              {formMsg.ok ? <CheckCircle size={14} style={{ display: 'inline', marginRight: 6 }} /> : <XCircle size={14} style={{ display: 'inline', marginRight: 6 }} />}
              {formMsg.text}
            </div>
          )}

          <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={submitting}>
            {submitting ? <><Loader2 size={15} style={{ display: 'inline', marginRight: 6, animation: 'spin 1s linear infinite' }} />Đang gửi...</> : 'Gửi đơn'}
          </button>
        </form>
      </div>

      {/* ── DUYỆT ĐƠN (Admin/HR) ─────────────────────────── */}
      {canEditHRM && pendingForMe.length > 0 && (
        <div className="card" style={{ marginBottom: 24, borderLeft: '3px solid #f59e0b' }}>
          <div style={{ fontWeight: 600, marginBottom: 14, color: '#f59e0b', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Clock size={16} />
            Chờ phê duyệt ({pendingForMe.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {pendingForMe.map(r => (
              <ApproveCard
                key={r.id}
                record={r}
                onApprove={() => { setApproving({ id: r.id, action: 'da_duyet' }); setGhiChuDuyet(''); }}
                onReject={() => { setApproving({ id: r.id, action: 'tu_choi' }); setGhiChuDuyet(''); }}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── ĐƠN CỦA TÔI ─────────────────────────────────── */}
      <div className="card">
        <div style={{ fontWeight: 600, marginBottom: 14 }}>Đơn của tôi</div>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-secondary)' }}>
            <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
          </div>
        ) : myRecords.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-secondary)', fontSize: 14 }}>
            Chưa có đơn nào
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {myRecords.map(r => (
              <RecordCard
                key={r.id}
                record={r}
                showDelete={r.trang_thai === 'cho_duyet'}
                onDelete={() => handleDelete(r.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── TẤT CẢ ĐƠN (Admin/HR only) ──────────────────── */}
      {canEditHRM && (
        <div className="card" style={{ marginTop: 20 }}>
          <div style={{ fontWeight: 600, marginBottom: 14 }}>Tất cả đơn</div>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 24 }}>
              <Loader2 size={20} style={{ animation: 'spin 1s linear infinite', color: 'var(--text-secondary)' }} />
            </div>
          ) : records.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-secondary)', fontSize: 14 }}>Chưa có đơn nào</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {records.map(r => (
                <RecordCard key={r.id} record={r} showName />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── APPROVE MODAL ─────────────────────────────────── */}
      {approving && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <h3 className="modal-title">
                {approving.action === 'da_duyet' ? 'Phê duyệt đơn' : 'Từ chối đơn'}
              </h3>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Ghi chú (tùy chọn)</label>
                <textarea
                  className="form-input"
                  rows={3}
                  placeholder={approving.action === 'tu_choi' ? 'Lý do từ chối...' : 'Ghi chú thêm...'}
                  value={ghiChuDuyet}
                  onChange={e => setGhiChuDuyet(e.target.value)}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setApproving(null)} disabled={approveLoading}>Hủy</button>
              <button
                className={`btn ${approving.action === 'da_duyet' ? 'btn-primary' : 'btn-danger'}`}
                onClick={handleApprove}
                disabled={approveLoading}
                style={approving.action === 'tu_choi' ? { background: '#ef4444', color: '#fff' } : {}}
              >
                {approveLoading ? 'Đang xử lý...' : approving.action === 'da_duyet' ? 'Phê duyệt' : 'Từ chối'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_LABEL[status] || { text: status, color: '#6b7280' };
  return (
    <span style={{
      fontSize: 11,
      fontWeight: 600,
      padding: '2px 8px',
      borderRadius: 20,
      background: s.color + '20',
      color: s.color,
      whiteSpace: 'nowrap',
    }}>
      {s.text}
    </span>
  );
}

function RecordCard({ record, showDelete, onDelete, showName }: {
  record: ChamCongNgoai;
  showDelete?: boolean;
  onDelete?: () => void;
  showName?: boolean;
}) {
  return (
    <div style={{
      border: '1px solid var(--border)',
      borderRadius: 10,
      padding: '12px 14px',
      background: 'var(--bg-card)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
        <div style={{ fontWeight: 600, fontSize: 14, flex: 1 }}>
          {showName && record.ho_ten && <span style={{ color: 'var(--text-secondary)', fontWeight: 400, marginRight: 6 }}>{record.ho_ten} —</span>}
          <Building2 size={13} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle', color: 'var(--primary)' }} />
          {record.du_an_khach_hang}
        </div>
        <StatusBadge status={record.trang_thai} />
      </div>

      <div style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'flex', flexWrap: 'wrap', gap: '4px 16px' }}>
        <span><Clock size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />{formatDate(record.ngay)} | {record.gio_bat_dau} – {record.gio_ket_thuc}</span>
        <span><MapPin size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />{record.dia_diem}</span>
      </div>

      {record.ghi_chu && (
        <div style={{ fontSize: 12, marginTop: 6, color: 'var(--text-secondary)', fontStyle: 'italic' }}>
          {record.ghi_chu}
        </div>
      )}

      {(record.nguoi_duyet || record.ghi_chu_duyet) && (
        <div style={{ fontSize: 12, marginTop: 6, borderTop: '1px solid var(--border)', paddingTop: 6, color: 'var(--text-secondary)' }}>
          {record.nguoi_duyet && <span>Duyệt bởi: <b>{record.nguoi_duyet}</b></span>}
          {record.ghi_chu_duyet && <span style={{ marginLeft: 8 }}>— {record.ghi_chu_duyet}</span>}
        </div>
      )}

      {showDelete && onDelete && (
        <button
          onClick={onDelete}
          style={{ marginTop: 8, background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, padding: '2px 0' }}
        >
          <Trash2 size={12} />
          Xóa đơn
        </button>
      )}
    </div>
  );
}

function ApproveCard({ record, onApprove, onReject }: {
  record: ChamCongNgoai;
  onApprove: () => void;
  onReject: () => void;
}) {
  return (
    <div style={{
      border: '1px solid #f59e0b40',
      borderRadius: 10,
      padding: '12px 14px',
      background: 'rgba(245,158,11,0.04)',
    }}>
      <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>
        {record.ho_ten || record.id_nhan_vien}
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>
        <Building2 size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
        {record.du_an_khach_hang}
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>
        <Clock size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
        {formatDate(record.ngay)} | {record.gio_bat_dau} – {record.gio_ket_thuc}
        <MapPin size={12} style={{ display: 'inline', marginLeft: 12, marginRight: 4, verticalAlign: 'middle' }} />
        {record.dia_diem}
      </div>
      {record.ghi_chu && (
        <div style={{ fontSize: 12, marginBottom: 8, color: 'var(--text-secondary)', fontStyle: 'italic' }}>{record.ghi_chu}</div>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={onApprove}
          className="btn btn-primary"
          style={{ flex: 1, fontSize: 13, padding: '6px 12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
        >
          <CheckCircle size={14} />
          Duyệt
        </button>
        <button
          onClick={onReject}
          className="btn btn-secondary"
          style={{ flex: 1, fontSize: 13, padding: '6px 12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, color: '#ef4444' }}
        >
          <XCircle size={14} />
          Từ chối
        </button>
      </div>
    </div>
  );
}
