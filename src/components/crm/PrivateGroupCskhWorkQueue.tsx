'use client';

// Private Group CSKH work queue (task hiện tại) — chế độ CSKH theo Nhóm riêng,
// cộng thêm vào /phan-khach cạnh Campaign (CampaignCskhWorkQueue.tsx, KHÔNG
// đụng). Nguồn sự thật ở đây là PrivateGroupCustomer (qua private-group.ts),
// KHÔNG phải CampaignMembership hay KhachHang — khách hàng chỉ được join
// read-only để hiển thị Tên/SĐT.
//
// CỐ Ý KHÔNG copy nguyên CampaignCskhWorkQueue: Nhóm riêng không có Handoff/
// Pipeline/Distribute/Leader-Project-edit (locked business decision, xem
// private-group.ts) — feature surface nhỏ hơn nhiều, component riêng ngắn
// gọn hơn thay vì mang theo toàn bộ độ phức tạp không dùng tới. Phần LOGIC
// (bucket/label/pagination/scoring) tái dùng NGUYÊN VẸN từ Campaign CSKH —
// xem import bên dưới.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BadgeCheck, CalendarClock, Check, ChevronDown, ChevronLeft, ChevronRight, Clock3, History, Layers, Loader2, Phone, RefreshCw, Save, Search, Users, X } from 'lucide-react';
import type { PrivateGroup, PrivateGroupCustomer, CrmChamSocEntry, MucDoQuanTam, TrangThaiChamSoc } from '@/lib/types';
import { formatPhone } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { bucketOf, CSKH_BUCKETS, isOverdue, type MembershipBucket } from '@/lib/campaign-cskh-bucket';
import { matchesPrivateGroupCustomerQueueFilter } from '@/lib/private-group-cskh-queue';
import { canActOnPrivateGroupCustomer } from '@/lib/private-group-cskh-authority';
import { qualificationStatusLabel, leadQualityRankLabel } from '@/lib/crm-funnel/quality-labels';
import { paginate } from '@/lib/table-pagination';
import { PrivateGroupQualificationModal } from './PrivateGroupQualificationModal';

const MEMBERS_PAGE_SIZE = 50;

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

export function PrivateGroupCskhWorkQueue() {
  const { user, isAdmin } = useAuth();
  const [groups, setGroups] = useState<PrivateGroup[]>([]);
  const [groupId, setGroupId] = useState('');
  const [group, setGroup] = useState<PrivateGroup | null>(null);
  const [relations, setRelations] = useState<PrivateGroupCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [search, setSearch] = useState('');
  const [bucketFilter, setBucketFilter] = useState<MembershipBucket | ''>('');
  const [notice, setNotice] = useState<{ type: 'ok' | 'error' | 'warn'; text: string } | null>(null);
  const [interactionRelation, setInteractionRelation] = useState<PrivateGroupCustomer | null>(null);
  const [qualificationRelation, setQualificationRelation] = useState<PrivateGroupCustomer | null>(null);
  const [historyRelation, setHistoryRelation] = useState<PrivateGroupCustomer | null>(null);
  const [interaction, setInteraction] = useState<InteractionForm>({ ket_qua: 'Đã liên hệ', muc_do_quan_tam: 'Chưa xác định', ghi_chu: '', ngay_lien_he_tiep: '' });

  const loadGroups = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/private-groups');
      const data = await response.json();
      if (data.success) setGroups(data.data);
      else setNotice({ type: 'error', text: data.error || 'Không tải được danh sách Nhóm riêng.' });
    } catch { setNotice({ type: 'error', text: 'Không tải được danh sách Nhóm riêng.' }); } finally { setLoading(false); }
  }, []);

  const loadRelations = useCallback(async (id: string) => {
    if (!id) { setGroup(null); setRelations([]); return; }
    setLoading(true);
    try {
      const [detailRes, customersRes] = await Promise.all([
        fetch(`/api/private-groups/${id}`), fetch(`/api/private-groups/${id}/customers`),
      ]);
      const [detail, customers] = await Promise.all([detailRes.json(), customersRes.json()]);
      if (!detail.success) throw new Error(detail.error || 'Không tải được thông tin Nhóm riêng');
      setGroup(detail.data.group);
      if (!customers.success) throw new Error(customers.error || 'Không tải được danh sách khách hàng');
      setRelations(customers.data);
    } catch (error) { setNotice({ type: 'error', text: error instanceof Error ? error.message : 'Không tải được danh sách.' }); } finally { setLoading(false); }
  }, []);

  useEffect(() => { void loadGroups(); }, [loadGroups]);
  useEffect(() => { void loadRelations(groupId); }, [groupId, loadRelations]);
  useEffect(() => { if (!groupId && groups.length > 0) setGroupId(groups[0].id); }, [groups, groupId]);

  const filtered = useMemo(
    () => relations.filter(relation => matchesPrivateGroupCustomerQueueFilter(relation, { search, bucket: bucketFilter })),
    [relations, search, bucketFilter],
  );

  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [groupId, search, bucketFilter]);
  const pageWindow = useMemo(() => paginate(filtered, page, MEMBERS_PAGE_SIZE), [filtered, page]);

  const stats = useMemo(() => {
    const counts = new Map<MembershipBucket, number>();
    for (const bucket of CSKH_BUCKETS) counts.set(bucket, 0);
    for (const relation of relations) counts.set(bucketOf(relation), (counts.get(bucketOf(relation)) || 0) + 1);
    return counts;
  }, [relations]);

  const replaceRelation = (updated: PrivateGroupCustomer) => {
    setRelations(current => current.map(item => item.id === updated.id ? updated : item));
    setHistoryRelation(current => current?.id === updated.id ? updated : current);
  };

  function canActOn(relation: PrivateGroupCustomer): boolean {
    return canActOnPrivateGroupCustomer(user, isAdmin, group ?? undefined, relation);
  }

  function openInteraction(relation: PrivateGroupCustomer) {
    setInteractionRelation(relation);
    setInteraction({
      ket_qua: relation.trang_thai_cham_soc === 'Chưa gọi' || !relation.trang_thai_cham_soc ? 'Đã liên hệ' : relation.trang_thai_cham_soc,
      muc_do_quan_tam: relation.muc_do_quan_tam || 'Chưa xác định', ghi_chu: '', ngay_lien_he_tiep: '',
    });
  }

  async function saveInteraction() {
    if (!interactionRelation) return;
    setBusyId(interactionRelation.id);
    try {
      const response = await fetch(`/api/private-groups/${groupId}/customers/${interactionRelation.id}/interaction`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idempotency_key: crypto.randomUUID(), ...interaction }),
      });
      const data = await response.json(); if (!data.success) throw new Error(data.error);
      replaceRelation({ ...data.data, customer: interactionRelation.customer }); setInteractionRelation(null);
      setNotice({ type: 'ok', text: 'Đã lưu kết quả chăm sóc.' });
    } catch (error) { setNotice({ type: 'error', text: error instanceof Error ? error.message : 'Không thể lưu chăm sóc.' }); } finally { setBusyId(''); }
  }

  if (loading && groups.length === 0) return <div className="loading-spinner"><div className="spinner" /></div>;

  return <div>
    <div className="card" style={{ padding: 16, marginBottom: 16 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'end', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 280 }}>
          <label className="form-label">Nhóm riêng</label>
          <div style={{ position: 'relative' }}>
            <select className="form-select" value={groupId} onChange={event => setGroupId(event.target.value)}>
              <option value="">— Chọn Nhóm riêng —</option>
              {groups.map(item => <option key={item.id} value={item.id}>{item.name} · {item.leader_name}</option>)}
            </select>
            <ChevronDown size={15} style={{ position: 'absolute', right: 10, top: 11, pointerEvents: 'none' }} />
          </div>
        </div>
        <button className="btn btn-secondary" style={{ marginLeft: 'auto' }} onClick={() => loadRelations(groupId)} disabled={!groupId || loading}><RefreshCw size={15} /> Làm mới</button>
      </div>
      {group && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 18, fontSize: 13 }}>
          <span style={{ color: 'var(--text-label)' }}>Leader: <strong style={{ color: 'var(--text-title)' }}>{group.leader_name}</strong></span>
        </div>
      )}
    </div>

    {notice && <div style={{ padding: '11px 14px', marginBottom: 16, borderRadius: 8, display: 'flex', gap: 8, alignItems: 'center', background: notice.type === 'ok' ? '#ecfdf5' : notice.type === 'warn' ? '#fffbeb' : '#fef2f2', color: notice.type === 'ok' ? '#047857' : notice.type === 'warn' ? '#a16207' : '#b91c1c' }}>{notice.type === 'ok' ? <Check size={16} /> : <AlertTriangle size={16} />}<span style={{ flex: 1 }}>{notice.text}</span><button className="btn btn-ghost btn-icon" onClick={() => setNotice(null)}><X size={14} /></button></div>}

    {!groupId && groups.length === 0 && !loading && <div className="card"><div className="empty-state"><Layers size={40} /><h3>Bạn chưa thuộc Nhóm riêng nào</h3></div></div>}
    {!groupId && groups.length > 0 && <div className="card"><div className="empty-state"><Layers size={40} /><h3>Chọn Nhóm riêng để bắt đầu</h3></div></div>}

    {groupId && <>
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
          <div className="search-wrapper" style={{ flex: 1, minWidth: 240 }}><Search size={15} className="search-icon" /><input className="form-input" value={search} onChange={event => setSearch(event.target.value)} placeholder="Tìm tên, số điện thoại hoặc Sale CSKH..." /></div>
        </div>
      </div>
      <RelationTable
        relations={pageWindow.items} loading={loading} canActOn={canActOn}
        onInteraction={openInteraction} onQualification={setQualificationRelation} onHistory={setHistoryRelation}
        startIndex={pageWindow.startIndex} page={pageWindow.page} totalPages={pageWindow.totalPages}
        totalCount={pageWindow.total} pageSize={MEMBERS_PAGE_SIZE}
        onPrevPage={() => setPage(current => Math.max(1, current - 1))}
        onNextPage={() => setPage(current => Math.min(pageWindow.totalPages, current + 1))}
      />
    </>}

    {interactionRelation && <div className="modal-overlay" onClick={() => setInteractionRelation(null)}>
      <div className="modal-content" style={{ maxWidth: 620 }} onClick={event => event.stopPropagation()}>
        <div className="modal-header"><h3 className="modal-title">Chăm sóc: {interactionRelation.customer?.ten_KH || interactionRelation.customer_id}</h3><button className="btn btn-ghost btn-icon" onClick={() => setInteractionRelation(null)}><X size={18} /></button></div>
        <div style={{ padding: 20 }}>
          <div style={{ padding: 12, background: '#f8fafc', borderRadius: 8, marginBottom: 16 }}>
            <strong>{formatPhone(interactionRelation.customer?.so_dien_thoai || '')}</strong>
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
        </div>
        <div className="modal-footer"><button className="btn btn-secondary" onClick={() => setInteractionRelation(null)}>Hủy</button><button className="btn btn-primary" disabled={busyId === interactionRelation.id} onClick={() => void saveInteraction()}><Save size={15} /> Lưu chăm sóc</button></div>
      </div>
    </div>}

    {qualificationRelation && <PrivateGroupQualificationModal groupId={groupId} relation={qualificationRelation} onClose={() => setQualificationRelation(null)} onSaved={(updated, message) => { replaceRelation(updated); setQualificationRelation(null); setNotice({ type: 'ok', text: message }); }} />}
    {historyRelation && <RelationHistoryModal relation={historyRelation} onClose={() => setHistoryRelation(null)} />}
  </div>;
}

function RelationTable({
  relations, loading, canActOn, onInteraction, onQualification, onHistory,
  startIndex, page, totalPages, totalCount, pageSize, onPrevPage, onNextPage,
}: {
  relations: PrivateGroupCustomer[]; loading: boolean; canActOn: (relation: PrivateGroupCustomer) => boolean;
  onInteraction: (relation: PrivateGroupCustomer) => void; onQualification: (relation: PrivateGroupCustomer) => void; onHistory: (relation: PrivateGroupCustomer) => void;
  startIndex: number; page: number; totalPages: number; totalCount: number; pageSize: number;
  onPrevPage: () => void; onNextPage: () => void;
}) {
  if (loading) return <div className="card"><div className="loading-spinner"><div className="spinner" /></div></div>;
  if (relations.length === 0) return <div className="card"><div className="empty-state"><Layers size={38} /><h3>Không có khách hàng phù hợp</h3></div></div>;
  return <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
    <div className="table-wrapper" style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: '62vh' }}><table className="data-table cskh-compact" style={{ minWidth: 900 }}>
    <thead><tr>
      <th style={{ width: 40 }}>STT</th>
      <th style={{ width: 190 }}>Khách hàng</th><th style={{ width: 110 }}>Sale CSKH</th><th style={{ width: 120 }}>Trạng thái</th>
      <th style={{ width: 100 }}>Mức độ tiềm năng</th><th style={{ width: 90 }}>Điểm / Xếp hạng</th>
      <th style={{ width: 100 }}>Lịch tiếp theo</th>
      <th style={{ textAlign: 'right', width: 150 }}>Thao tác</th>
    </tr></thead>
    <tbody>{relations.map((relation, idx) => {
      const status = relation.trang_thai_cham_soc || 'Chưa gọi'; const palette = statusColors[status] || statusColors['Chưa gọi'];
      const actionable = canActOn(relation);
      return <tr key={relation.id} style={isOverdue(relation.ngay_lien_he_tiep) ? { background: '#fff7f7' } : undefined}>
        <td style={{ color: 'var(--text-label)', fontWeight: 500 }}>{startIndex + idx + 1}</td>
        <td><div style={{ fontWeight: 700 }}>{relation.customer?.ten_KH || relation.customer_id}</div>{relation.customer?.so_dien_thoai && <a href={`tel:${relation.customer.so_dien_thoai}`} style={{ display: 'inline-flex', gap: 5, alignItems: 'center', marginTop: 5, color: 'var(--primary)', fontSize: 13 }}><Phone size={13} />{formatPhone(relation.customer.so_dien_thoai)}</a>}</td>
        <td><span style={{ fontWeight: 600, fontSize: 12.5 }}>{relation.assigned_to_name}</span></td>
        <td><span style={{ background: palette.bg, color: palette.color, borderRadius: 20, padding: '3px 7px', fontSize: 11, fontWeight: 650 }}>{status}</span><div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 5 }}>{relation.so_lan_lien_he || 0} lần · {relation.muc_do_quan_tam || 'Chưa xác định'}</div></td>
        <td><span style={{ fontSize: 12, fontWeight: 600 }}>{qualificationStatusLabel(relation.qualification_status)}</span></td>
        <td><span style={{ fontSize: 12 }}>{relation.lead_quality_score}/100 · {leadQualityRankLabel(relation.lead_quality_rank)}</span></td>
        <td><div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap', color: isOverdue(relation.ngay_lien_he_tiep) ? '#dc2626' : 'var(--text-body)', fontSize: 12 }}><CalendarClock size={14} />{localDate(relation.ngay_lien_he_tiep)}</div>{relation.ngay_lien_he_cuoi && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Gần nhất: {localDate(relation.ngay_lien_he_cuoi)}</div>}</td>
        <td><div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4, flexWrap: 'wrap' }}>
          {actionable && <button className="btn btn-primary btn-sm" onClick={() => onInteraction(relation)}><Phone size={13} /> Chăm sóc</button>}
          {actionable && <button className="btn btn-secondary btn-sm" onClick={() => onQualification(relation)}><BadgeCheck size={13} /> Đánh giá</button>}
          <button className="btn btn-secondary btn-sm" onClick={() => onHistory(relation)}><History size={13} /> Lịch sử</button>
        </div></td>
      </tr>;
    })}</tbody>
  </table></div>
    {totalCount > 0 && <div className="pagination" style={{ padding: '12px 20px' }}>
      <span className="pagination-info">{startIndex + 1}–{Math.min(startIndex + pageSize, totalCount)} / {totalCount} khách</span>
      <div className="pagination-buttons" style={{ alignItems: 'center', gap: 10 }}>
        <button className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={onPrevPage}><ChevronLeft size={14} /> Trước</button>
        <span style={{ fontSize: 13, color: 'var(--text-label)' }}>Trang {page} / {totalPages}</span>
        <button className="btn btn-secondary btn-sm" disabled={page >= totalPages} onClick={onNextPage}>Sau <ChevronRight size={14} /></button>
      </div>
    </div>}
  </div>;
}

function RelationHistoryModal({ relation, onClose }: { relation: PrivateGroupCustomer; onClose: () => void }) {
  const interactions = parseList<CrmChamSocEntry>(relation.lich_su_cham_soc).slice().reverse();
  return <div className="modal-overlay" onClick={onClose}><div className="modal-content" style={{ maxWidth: 620 }} onClick={event => event.stopPropagation()}>
    <div className="modal-header"><h3 className="modal-title">Lịch sử: {relation.customer?.ten_KH || relation.customer_id}</h3><button className="btn btn-ghost btn-icon" onClick={onClose}><X size={18} /></button></div>
    <div style={{ padding: 20, maxHeight: '70vh', overflowY: 'auto' }}>
      <h4 style={{ margin: '0 0 10px', display: 'flex', gap: 7, alignItems: 'center' }}><Clock3 size={16} /> Chăm sóc trong Nhóm riêng này ({interactions.length})</h4>
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
