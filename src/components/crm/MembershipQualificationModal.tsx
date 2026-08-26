'use client';

// Campaign CSKH (M1B.1) — bản membership-scoped của QualificationModal (Customer-
// global). Cố ý là component RIÊNG, không sửa QualificationModal.tsx: input
// field ở đây map thẳng vào CampaignMembership (KHÔNG có "Dự án"/"Nguồn data" —
// Dự án đã có sẵn từ Campaign, Nguồn data là provenance Customer-level, không
// thuộc CSKH theo Campaign).
import { useState } from 'react';
import { BadgeCheck, Save, X } from 'lucide-react';
import type { CampaignMembershipWithCustomer, MucDoQuanTam } from '@/lib/types';

export function MembershipQualificationModal({ campaignId, membership, onClose, onSaved }: {
  campaignId: string;
  membership: CampaignMembershipWithCustomer;
  onClose: () => void;
  onSaved: (membership: CampaignMembershipWithCustomer, message: string) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    san_pham_quan_tam: membership.san_pham_quan_tam || '', nhu_cau: membership.nhu_cau || '',
    ngan_sach_min: membership.ngan_sach_min ?? '', ngan_sach_max: membership.ngan_sach_max ?? '',
    muc_dich: membership.muc_dich || '', thoi_gian_du_kien: membership.thoi_gian_du_kien || 'Chưa xác định',
    phuong_an_tai_chinh: membership.phuong_an_tai_chinh || '', khu_vuc_yeu_cau: membership.khu_vuc_yeu_cau || '',
    muc_do_quan_tam: membership.muc_do_quan_tam || 'Chưa xác định' as MucDoQuanTam,
    hanh_dong_tiep_theo: membership.hanh_dong_tiep_theo || '',
  });
  const set = (key: keyof typeof form, value: string | number) => setForm(current => ({ ...current, [key]: value }));

  async function save() {
    setSaving(true); setError('');
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/members/${membership.id}/qualification`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, idempotency_key: crypto.randomUUID() }),
      });
      const result = await response.json();
      if (!result.success) throw new Error(result.error);
      onSaved({ ...result.data, customer: membership.customer }, `Lead Score ${result.score.score}/100 · ${result.score.rank}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không thể lưu qualification'); }
    finally { setSaving(false); }
  }

  return <div className="modal-overlay" onClick={onClose}><div className="modal-content" style={{ maxWidth: 760 }} onClick={event => event.stopPropagation()}><div className="modal-header"><h3 className="modal-title"><BadgeCheck size={18} /> Đánh giá: {membership.customer?.ten_KH || membership.customer_id}</h3><button className="btn btn-ghost btn-icon" onClick={onClose}><X size={18} /></button></div><div className="modal-body">
    {error && <div style={{ background: '#fef2f2', color: '#b91c1c', borderRadius: 7, padding: 10, marginBottom: 12 }}>{error}</div>}
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      <Field label="Sản phẩm quan tâm"><input className="form-input" value={form.san_pham_quan_tam} onChange={event => set('san_pham_quan_tam', event.target.value)} /></Field>
      <Field label="Nhu cầu"><textarea className="form-textarea" rows={2} value={form.nhu_cau} onChange={event => set('nhu_cau', event.target.value)} /></Field>
      <Field label="Khu vực / yêu cầu"><textarea className="form-textarea" rows={2} value={form.khu_vuc_yeu_cau} onChange={event => set('khu_vuc_yeu_cau', event.target.value)} /></Field>
      <Field label="Ngân sách từ"><input className="form-input" type="number" min="0" value={form.ngan_sach_min} onChange={event => set('ngan_sach_min', event.target.value)} /></Field>
      <Field label="Ngân sách đến"><input className="form-input" type="number" min="0" value={form.ngan_sach_max} onChange={event => set('ngan_sach_max', event.target.value)} /></Field>
      <Field label="Mục đích"><select className="form-select" value={form.muc_dich} onChange={event => set('muc_dich', event.target.value)}><option value="">Chưa xác định</option>{['Để ở', 'Đầu tư', 'Cho thuê', 'Khác'].map(item => <option key={item}>{item}</option>)}</select></Field>
      <Field label="Thời gian dự kiến"><select className="form-select" value={form.thoi_gian_du_kien} onChange={event => set('thoi_gian_du_kien', event.target.value)}>{['Chưa xác định', 'Trong 1 tháng', '1-3 tháng', '3-6 tháng', '6-12 tháng', 'Trên 12 tháng'].map(item => <option key={item}>{item}</option>)}</select></Field>
      <Field label="Phương án tài chính"><input className="form-input" value={form.phuong_an_tai_chinh} onChange={event => set('phuong_an_tai_chinh', event.target.value)} placeholder="Tiền mặt / vay ngân hàng / tỷ lệ vay..." /></Field>
      <Field label="Mức độ quan tâm"><select className="form-select" value={form.muc_do_quan_tam} onChange={event => set('muc_do_quan_tam', event.target.value)}>{['Chưa xác định', 'Thấp', 'Trung bình', 'Cao', 'Rất cao'].map(item => <option key={item}>{item}</option>)}</select></Field>
      <Field label="Hành động tiếp theo"><input className="form-input" value={form.hanh_dong_tiep_theo} onChange={event => set('hanh_dong_tiep_theo', event.target.value)} placeholder="Gửi bảng giá, hẹn xem, gọi lại..." /></Field>
    </div>
    <div style={{ background: '#eff6ff', color: '#1d4ed8', padding: 10, borderRadius: 7, fontSize: 12, marginTop: 12 }}>Lead Score và Lead Rank do server tự tính, riêng cho Campaign này. Telesale không thể nhập hoặc sửa điểm trực tiếp.</div>
  </div><div className="modal-footer"><button className="btn btn-secondary" onClick={onClose}>Hủy</button><button className="btn btn-primary" onClick={() => void save()} disabled={saving}><Save size={15} /> {saving ? 'Đang tính điểm...' : 'Lưu & tính điểm'}</button></div></div></div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="form-group"><span className="form-label">{label}</span>{children}</label>; }
