'use client';

// Campaign CSKH work queue (M1B.1) — chế độ CSKH theo Campaign, cộng thêm vào
// /phan-khach (chế độ Project cũ giữ nguyên, không đụng). Nguồn sự thật ở đây
// là CampaignMembership (qua membership-workflow.ts), KHÔNG phải KhachHang —
// khách hàng chỉ được join read-only để hiển thị Tên/SĐT/Email.
//
// KHÔNG có cột/action "Bàn giao Sale" — CampaignMembership đạt Quan tâm/
// Qualified/Hot chỉ hiển thị đúng trạng thái, KHÔNG tạo CrmHandoff/Pipeline/
// đổi Sale ownership (phạm vi M1B.2).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BadgeCheck, CalendarClock, Check, ChevronDown, Clock3, History, Layers, Phone, RefreshCw, Save, Search, X } from 'lucide-react';
import type { CampaignMembershipWithCustomer, Campaign as CampaignType, CrmChamSocEntry, MucDoQuanTam, NhanVien, TrangThaiChamSoc } from '@/lib/types';
import { formatPhone } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { bucketOf, CSKH_BUCKETS, isOverdue, type MembershipBucket } from '@/lib/campaign-cskh-bucket';
import { MembershipQualificationModal } from './MembershipQualificationModal';

const STATUSES: TrangThaiChamSoc[] = ['Chưa gọi', 'Không nghe máy', 'Gọi lại', 'Đã liên hệ', 'Quan tâm', 'Không phù hợp', 'Sai số'];
const INTERESTS: MucDoQuanTam[] = ['Chưa xác định', 'Thấp', 'Trung bình', 'Cao', 'Rất cao'];
const statusColors: Record<string, { bg: string; color: string }> = {
  'Chưa gọi': { bg: '#f1f5f9', color: '#475569' }, 'Không nghe máy': { bg: '#fff7ed', color: '#c2410c' },
  'Gọi lại': { bg: '#fffbeb', color: '#a16207' }, 'Đã liên hệ': { bg: '#eff6ff', color: '#1d4ed8' },
  'Quan tâm': { bg: '#ecfdf5', color: '#047857' }, 'Không phù hợp': { bg: '#fef2f2', color: '#b91c1c' },
  'Sai số': { bg: '#fdf2f8', color: '#be185d' },
};

function parseList<T>(raw?: string | null): T[] {
  if (!raw) return [];
  try { const value: unknown = JSON.parse(raw); return Array.isArray(value) ? value as T[] : []; } catch { return []; }
}
function localDate(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });
}

type InteractionForm = { ket_qua: TrangThaiChamSoc; muc_do_quan_tam: MucDoQuanTam; ghi_chu: string; ngay_lien_he_tiep: string };

export function CampaignCskhWorkQueue({ employees }: { employees: NhanVien[] }) {
  const { user } = useAuth();
  const [campaigns, setCampaigns] = useState<CampaignType[]>([]);
  const [campaignId, setCampaignId] = useState('');
  const [members, setMembers] = useState<CampaignMembershipWithCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [search, setSearch] = useState('');
  const [bucketFilter, setBucketFilter] = useState<MembershipBucket | ''>('');
  const [notice, setNotice] = useState<{ type: 'ok' | 'error' | 'warn'; text: string } | null>(null);
  const [interactionMember, setInteractionMember] = useState<CampaignMembershipWithCustomer | null>(null);
  const [qualificationMember, setQualificationMember] = useState<CampaignMembershipWithCustomer | null>(null);
  const [historyMember, setHistoryMember] = useState<CampaignMembershipWithCustomer | null>(null);
  const [interaction, setInteraction] = useState<InteractionForm>({ ket_qua: 'Đã liên hệ', muc_do_quan_tam: 'Chưa xác định', ghi_chu: '', ngay_lien_he_tiep: '' });

  const activeEmployeeById = useMemo(() => new Map(employees.map(item => [item.id_nhan_vien, item])), [employees]);

  const loadCampaigns = useCallback(async () => {
    try {
      const response = await fetch('/api/campaigns');
      const data = await response.json();
      if (data.success) setCampaigns(data.data);
    } catch { setNotice({ type: 'error', text: 'Không tải được danh sách Campaign.' }); }
  }, []);

  const loadMembers = useCallback(async (id: string) => {
    if (!id) { setMembers([]); return; }
    setLoading(true);
    try {
      const response = await fetch(`/api/campaigns/${id}/members`);
      const data = await response.json();
      if (!data.success) throw new Error(data.error || 'Không tải được danh sách khách hàng');
      setMembers(data.data.members);
    } catch (error) { setNotice({ type: 'error', text: error instanceof Error ? error.message : 'Không tải được danh sách.' }); } finally { setLoading(false); }
  }, []);

  useEffect(() => { void loadCampaigns(); }, [loadCampaigns]);
  useEffect(() => { void loadMembers(campaignId); }, [campaignId, loadMembers]);
  useEffect(() => { if (!campaignId && campaigns.length > 0) setCampaignId(campaigns[0].id); }, [campaigns, campaignId]);

  const filtered = useMemo(() => members.filter(member => {
    const q = search.trim().toLowerCase();
    const matchesSearch = !q || [member.customer?.ten_KH, member.customer?.so_dien_thoai, member.telesale_name]
      .some(value => (value || '').toLowerCase().includes(q));
    return matchesSearch && (!bucketFilter || bucketOf(member) === bucketFilter);
  }), [members, search, bucketFilter]);

  const stats = useMemo(() => {
    const counts = new Map<MembershipBucket, number>();
    for (const bucket of CSKH_BUCKETS) counts.set(bucket, 0);
    for (const member of members) counts.set(bucketOf(member), (counts.get(bucketOf(member)) || 0) + 1);
    return counts;
  }, [members]);

  const replaceMember = (updated: CampaignMembershipWithCustomer) => {
    setMembers(current => current.map(item => item.id === updated.id ? updated : item));
    setHistoryMember(current => current?.id === updated.id ? updated : current);
  };

  function canActOn(member: CampaignMembershipWithCustomer): boolean {
    if (!user) return false;
    if (member.telesale_id === user.id_nhan_vien) return true;
    const telesale = member.telesale_id ? activeEmployeeById.get(member.telesale_id) : undefined;
    return Boolean(telesale && telesale.ql_truc_tiep === user.ho_ten);
  }

  function openInteraction(member: CampaignMembershipWithCustomer) {
    setInteractionMember(member);
    setInteraction({
      ket_qua: member.trang_thai_cham_soc === 'Chưa gọi' || !member.trang_thai_cham_soc ? 'Đã liên hệ' : member.trang_thai_cham_soc,
      muc_do_quan_tam: member.muc_do_quan_tam || 'Chưa xác định', ghi_chu: '', ngay_lien_he_tiep: '',
    });
  }

  async function saveInteraction() {
    if (!interactionMember) return;
    setBusyId(interactionMember.id);
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/members/${interactionMember.id}/interaction`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idempotency_key: crypto.randomUUID(), ...interaction }),
      });
      const data = await response.json(); if (!data.success) throw new Error(data.error);
      replaceMember({ ...data.data, customer: interactionMember.customer }); setInteractionMember(null);
      setNotice({ type: 'ok', text: 'Đã lưu kết quả chăm sóc.' });
    } catch (error) { setNotice({ type: 'error', text: error instanceof Error ? error.message : 'Không thể lưu chăm sóc.' }); } finally { setBusyId(''); }
  }

  const selectedCampaign = campaigns.find(item => item.id === campaignId);

  if (loading && campaigns.length === 0) return <div className="loading-spinner"><div className="spinner" /></div>;

  return <div>
    <div className="card" style={{ padding: 16, marginBottom: 16 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'end', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 280 }}>
          <label className="form-label">Campaign</label>
          <div style={{ position: 'relative' }}>
            <select className="form-select" value={campaignId} onChange={event => setCampaignId(event.target.value)}>
              <option value="">— Chọn Campaign —</option>
              {campaigns.map(item => <option key={item.id} value={item.id}>{item.name}{item.ten_du_an ? ` · ${item.ten_du_an}` : ''}</option>)}
            </select>
            <ChevronDown size={15} style={{ position: 'absolute', right: 10, top: 11, pointerEvents: 'none' }} />
          </div>
        </div>
        {selectedCampaign && <div style={{ fontSize: 13, color: 'var(--text-label)', paddingBottom: 9 }}>Owner: <strong style={{ color: 'var(--text-title)' }}>{selectedCampaign.owner_name || 'Chưa cấu hình'}</strong></div>}
        <button className="btn btn-secondary" style={{ marginLeft: 'auto' }} onClick={() => loadMembers(campaignId)} disabled={!campaignId || loading}><RefreshCw size={15} /> Làm mới</button>
      </div>
    </div>

    {notice && <div style={{ padding: '11px 14px', marginBottom: 16, borderRadius: 8, display: 'flex', gap: 8, alignItems: 'center', background: notice.type === 'ok' ? '#ecfdf5' : notice.type === 'warn' ? '#fffbeb' : '#fef2f2', color: notice.type === 'ok' ? '#047857' : notice.type === 'warn' ? '#a16207' : '#b91c1c' }}>{notice.type === 'ok' ? <Check size={16} /> : <AlertTriangle size={16} />}<span style={{ flex: 1 }}>{notice.text}</span><button className="btn btn-ghost btn-icon" onClick={() => setNotice(null)}><X size={14} /></button></div>}

    {!campaignId && <div className="card"><div className="empty-state"><Layers size={40} /><h3>Chọn Campaign để bắt đầu</h3></div></div>}

    {campaignId && <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 10, marginBottom: 16 }}>
        {CSKH_BUCKETS.map(bucket => (
          <button key={bucket} className="card" style={{ padding: '12px 14px', textAlign: 'left', cursor: 'pointer', border: bucketFilter === bucket ? '2px solid var(--primary)' : undefined }}
            onClick={() => setBucketFilter(current => current === bucket ? '' : bucket)}>
            <div style={{ fontSize: 12, color: 'var(--text-label)' }}>{bucket}</div>
            <div style={{ fontSize: 22, fontWeight: 750, marginTop: 3 }}>{stats.get(bucket) || 0}</div>
          </button>
        ))}
      </div>
      <div className="card" style={{ padding: 12, marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <div className="search-wrapper" style={{ flex: 1, minWidth: 240 }}><Search size={15} className="search-icon" /><input className="form-input" value={search} onChange={event => setSearch(event.target.value)} placeholder="Tìm tên, số điện thoại hoặc Telesale..." /></div>
        </div>
      </div>
      <MembershipTable
        members={filtered} loading={loading} canActOn={canActOn}
        onInteraction={openInteraction} onQualification={setQualificationMember} onHistory={setHistoryMember}
      />
    </>}

    {interactionMember && <div className="modal-overlay" onClick={() => setInteractionMember(null)}>
      <div className="modal-content" style={{ maxWidth: 620 }} onClick={event => event.stopPropagation()}>
        <div className="modal-header"><h3 className="modal-title">Chăm sóc: {interactionMember.customer?.ten_KH || interactionMember.customer_id}</h3><button className="btn btn-ghost btn-icon" onClick={() => setInteractionMember(null)}><X size={18} /></button></div>
        <div style={{ padding: 20 }}>
          <div style={{ padding: 12, background: '#f8fafc', borderRadius: 8, marginBottom: 16 }}>
            <strong>{formatPhone(interactionMember.customer?.so_dien_thoai || '')}</strong>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group"><label className="form-label">Kết quả cuộc gọi *</label>
              <select className="form-select" value={interaction.ket_qua} onChange={event => setInteraction(current => ({ ...current, ket_qua: event.target.value as TrangThaiChamSoc }))}>
                {STATUSES.filter(item => item !== 'Chưa gọi').map(item => <option key={item}>{item}</option>)}
              </select>
            </div>
            <div className="form-group"><label className="form-label">Mức độ quan tâm</label>
              <select className="form-select" value={interaction.muc_do_quan_tam} onChange={event => setInteraction(current => ({ ...current, muc_do_quan_tam: event.target.value as MucDoQuanTam }))}>
                {INTERESTS.map(item => <option key={item}>{item}</option>)}
              </select>
            </div>
          </div>
          <div className="form-group"><label className="form-label">Ghi chú cuộc gọi</label><textarea className="form-textarea" rows={4} value={interaction.ghi_chu} onChange={event => setInteraction(current => ({ ...current, ghi_chu: event.target.value }))} /></div>
          <div className="form-group"><label className="form-label">Lịch liên hệ tiếp theo</label><input type="datetime-local" className="form-input" value={interaction.ngay_lien_he_tiep} onChange={event => setInteraction(current => ({ ...current, ngay_lien_he_tiep: event.target.value }))} /></div>
          {interaction.ket_qua === 'Quan tâm' && <div style={{ padding: 12, background: '#eff6ff', color: '#1d4ed8', borderRadius: 8, fontSize: 13, display: 'flex', gap: 8 }}><BadgeCheck size={16} /> Membership sẽ chuyển sang trạng thái Quan tâm trong Campaign này — chưa bàn giao Sale (M1B.2).</div>}
        </div>
        <div className="modal-footer"><button className="btn btn-secondary" onClick={() => setInteractionMember(null)}>Hủy</button><button className="btn btn-primary" disabled={busyId === interactionMember.id} onClick={() => void saveInteraction()}><Save size={15} /> Lưu chăm sóc</button></div>
      </div>
    </div>}

    {qualificationMember && <MembershipQualificationModal campaignId={campaignId} membership={qualificationMember} onClose={() => setQualificationMember(null)} onSaved={(updated, message) => { replaceMember(updated); setQualificationMember(null); setNotice({ type: 'ok', text: message }); }} />}
    {historyMember && <MembershipHistoryModal member={historyMember} onClose={() => setHistoryMember(null)} />}
  </div>;
}

function MembershipTable({ members, loading, canActOn, onInteraction, onQualification, onHistory }: {
  members: CampaignMembershipWithCustomer[]; loading: boolean; canActOn: (member: CampaignMembershipWithCustomer) => boolean;
  onInteraction: (member: CampaignMembershipWithCustomer) => void; onQualification: (member: CampaignMembershipWithCustomer) => void; onHistory: (member: CampaignMembershipWithCustomer) => void;
}) {
  if (loading) return <div className="card"><div className="loading-spinner"><div className="spinner" /></div></div>;
  if (members.length === 0) return <div className="card"><div className="empty-state"><Layers size={38} /><h3>Không có khách hàng phù hợp</h3></div></div>;
  return <div className="card" style={{ padding: 0, overflow: 'hidden' }}><div className="table-wrapper" style={{ overflowX: 'auto' }}><table className="data-table" style={{ minWidth: 1300 }}>
    <thead><tr><th>Khách hàng</th><th>Telesale</th><th>Trạng thái</th><th>Qualification</th><th>Score/Rank</th><th>Lịch tiếp theo</th><th style={{ textAlign: 'right' }}>Thao tác</th></tr></thead>
    <tbody>{members.map(member => {
      const status = member.trang_thai_cham_soc || 'Chưa gọi'; const palette = statusColors[status] || statusColors['Chưa gọi'];
      const actionable = canActOn(member);
      return <tr key={member.id} style={isOverdue(member.ngay_lien_he_tiep) ? { background: '#fff7f7' } : undefined}>
        <td><div style={{ fontWeight: 700 }}>{member.customer?.ten_KH || member.customer_id}</div>{member.customer?.so_dien_thoai && <a href={`tel:${member.customer.so_dien_thoai}`} style={{ display: 'inline-flex', gap: 5, alignItems: 'center', marginTop: 5, color: 'var(--primary)', fontSize: 13 }}><Phone size={13} />{formatPhone(member.customer.so_dien_thoai)}</a>}</td>
        <td><div style={{ fontWeight: 600, fontSize: 13 }}>{member.telesale_name || 'Chưa phân'}</div></td>
        <td><span style={{ background: palette.bg, color: palette.color, borderRadius: 20, padding: '4px 9px', fontSize: 12, fontWeight: 650 }}>{status}</span><div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 7 }}>{member.so_lan_lien_he || 0} lần · {member.muc_do_quan_tam || 'Chưa xác định'}</div></td>
        <td><span style={{ fontSize: 12, fontWeight: 600 }}>{member.qualification_status}</span></td>
        <td><span style={{ fontSize: 12 }}>{member.lead_quality_score}/100 · {member.lead_quality_rank}</span></td>
        <td><div style={{ display: 'flex', gap: 5, alignItems: 'center', color: isOverdue(member.ngay_lien_he_tiep) ? '#dc2626' : 'var(--text-body)', fontSize: 12 }}><CalendarClock size={14} />{localDate(member.ngay_lien_he_tiep)}</div>{member.ngay_lien_he_cuoi && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 5 }}>Gần nhất: {localDate(member.ngay_lien_he_cuoi)}</div>}</td>
        <td><div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, flexWrap: 'wrap' }}>
          {actionable && <button className="btn btn-primary btn-sm" onClick={() => onInteraction(member)}><Phone size={13} /> Chăm sóc</button>}
          {actionable && <button className="btn btn-secondary btn-sm" onClick={() => onQualification(member)}><BadgeCheck size={13} /> Đánh giá</button>}
          <button className="btn btn-secondary btn-sm" onClick={() => onHistory(member)}><History size={13} /> Lịch sử</button>
        </div></td>
      </tr>;
    })}</tbody>
  </table></div></div>;
}

function MembershipHistoryModal({ member, onClose }: { member: CampaignMembershipWithCustomer; onClose: () => void }) {
  const interactions = parseList<CrmChamSocEntry>(member.lich_su_cham_soc).slice().reverse();
  return <div className="modal-overlay" onClick={onClose}><div className="modal-content" style={{ maxWidth: 620 }} onClick={event => event.stopPropagation()}>
    <div className="modal-header"><h3 className="modal-title">Lịch sử: {member.customer?.ten_KH || member.customer_id}</h3><button className="btn btn-ghost btn-icon" onClick={onClose}><X size={18} /></button></div>
    <div style={{ padding: 20, maxHeight: '70vh', overflowY: 'auto' }}>
      <h4 style={{ margin: '0 0 10px', display: 'flex', gap: 7, alignItems: 'center' }}><Clock3 size={16} /> Chăm sóc trong Campaign này ({interactions.length})</h4>
      {interactions.length === 0 ? <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Chưa có lần chăm sóc nào.</p> : interactions.map(item => <div key={item.id} style={{ borderLeft: '3px solid #60a5fa', padding: '2px 0 12px 12px', marginBottom: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}><strong style={{ fontSize: 13 }}>{item.ket_qua} · {item.muc_do_quan_tam}</strong><span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{localDate(item.thoi_gian)}</span></div>
        <div style={{ fontSize: 12, color: 'var(--text-label)', marginTop: 3 }}>{item.nguoi_thuc_hien}</div>
        {item.ghi_chu && <div style={{ fontSize: 13, marginTop: 6, whiteSpace: 'pre-wrap' }}>{item.ghi_chu}</div>}
        {item.ngay_lien_he_tiep && <div style={{ fontSize: 11, color: '#a16207', marginTop: 5 }}>Hẹn lại: {localDate(item.ngay_lien_he_tiep)}</div>}
      </div>)}
    </div>
    <div className="modal-footer"><button className="btn btn-primary" onClick={onClose}>Đóng</button></div>
  </div></div>;
}
