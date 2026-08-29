'use client';

// Campaign CSKH work queue (M1B.1 + M1B.2) — chế độ CSKH theo Campaign, cộng
// thêm vào /phan-khach (chế độ Project cũ giữ nguyên, không đụng). Nguồn sự
// thật ở đây là CampaignMembership (qua membership-workflow.ts), KHÔNG phải
// KhachHang — khách hàng chỉ được join read-only để hiển thị Tên/SĐT/Email.
//
// M1B.2: membership đạt Quan tâm (INTERESTED/QUALIFIED/HOT) chỉ là HANDOFF
// CANDIDATE — không tự tạo CrmHandoff. Leader/Admin phải bấm "Bàn giao"
// explicit, chọn Sale trong đúng phạm vi (eligibleCampaignSales — Leader bị
// thu hẹp theo Project.ds_sale, Admin không giới hạn). Server
// (POST .../handoff) là authority thật — UI chỉ prefilter cho UX, không tự
// quyết định. Sale CSKH hiện tại được gợi ý nhưng KHÔNG auto-select.
// Accept/Reject của Sale tái dùng nguyên POST /api/crm/telesale/handoff hiện
// có — không tạo endpoint/API riêng.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BadgeCheck, CalendarClock, Check, ChevronDown, ChevronLeft, ChevronRight, Clock3, History, Layers, Loader2, Phone, RefreshCw, Save, Search, Send, UserCheck, Users, X } from 'lucide-react';
import type { CampaignMembershipWithCustomer, Campaign as CampaignType, CrmChamSocEntry, DuAn, MucDoQuanTam, NhanVien, TrangThaiChamSoc } from '@/lib/types';
import { formatPhone } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { bucketOf, CSKH_BUCKETS, isOverdue, type MembershipBucket } from '@/lib/campaign-cskh-bucket';
import {
  isMembershipAssigned, matchesMembershipQueueFilter, membershipAssignmentBreakdown, resolveMembershipRange,
  type MembershipAssignmentFilter,
} from '@/lib/campaign-cskh-range';
import { canActOnMembership } from '@/lib/campaign-cskh-authority';
import { eligibleCampaignSales } from '@/lib/campaign-sale-eligibility';
import { qualificationStatusLabel, leadQualityRankLabel } from '@/lib/crm-funnel/quality-labels';
import { paginate } from '@/lib/table-pagination';
import { CampaignDistributeModal } from './CampaignDistributeModal';
import { MembershipQualificationModal } from './MembershipQualificationModal';

// CSKH TABLE UX — 50 CampaignMembership/trang, thuần presentation (windowing
// qua paginate(), xem table-pagination.ts). "filtered" (toàn tập đã lọc) VẪN
// là nguồn cho stats/assignmentSummary/rangeResult/rangeBreakdown — pagination
// KHÔNG được cắt bớt các tính toán đó, chỉ cắt bớt SỐ DÒNG RENDER.
const MEMBERS_PAGE_SIZE = 50;

const HANDOFF_CANDIDATE_STATUSES = new Set(['INTERESTED', 'QUALIFIED', 'HOT']);
function isHandoffCandidate(member: CampaignMembershipWithCustomer): boolean {
  return HANDOFF_CANDIDATE_STATUSES.has(member.qualification_status)
    && member.outcome !== 'HANDOFF_INITIATED' && member.outcome !== 'HANDOFF_ACCEPTED';
}

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

export function CampaignCskhWorkQueue({ employees, projects, initialCampaignId }: { employees: NhanVien[]; projects: DuAn[]; initialCampaignId?: string }) {
  const { user, isAdmin } = useAuth();
  const [campaigns, setCampaigns] = useState<CampaignType[]>([]);
  // initialCampaignId (từ ?campaignId= trên /phan-khach — link "đi thẳng" sau
  // khi tạo Campaign ở /khach-hang): nếu có, effect auto-select bên dưới
  // (`if (!campaignId && campaigns.length > 0)`) sẽ tự bỏ qua vì campaignId
  // đã có giá trị sẵn — không cần sửa effect đó.
  const [campaignId, setCampaignId] = useState(initialCampaignId || '');
  const [members, setMembers] = useState<CampaignMembershipWithCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [search, setSearch] = useState('');
  const [bucketFilter, setBucketFilter] = useState<MembershipBucket | ''>('');
  // Addendum — "Tất cả | Chưa chia | Đã chia": lọc thêm theo CampaignMembership.telesale_id.
  const [assignmentFilter, setAssignmentFilter] = useState<MembershipAssignmentFilter>('all');
  const [notice, setNotice] = useState<{ type: 'ok' | 'error' | 'warn'; text: string } | null>(null);
  const [interactionMember, setInteractionMember] = useState<CampaignMembershipWithCustomer | null>(null);
  const [qualificationMember, setQualificationMember] = useState<CampaignMembershipWithCustomer | null>(null);
  const [historyMember, setHistoryMember] = useState<CampaignMembershipWithCustomer | null>(null);
  const [showDistribute, setShowDistribute] = useState(false);
  const [interaction, setInteraction] = useState<InteractionForm>({ ket_qua: 'Đã liên hệ', muc_do_quan_tam: 'Chưa xác định', ghi_chu: '', ngay_lien_he_tiep: '' });
  const [showLeaderEdit, setShowLeaderEdit] = useState(false);
  const [handoffMember, setHandoffMember] = useState<CampaignMembershipWithCustomer | null>(null);
  const [acceptRejectBusyId, setAcceptRejectBusyId] = useState('');
  // "Chọn khách: Từ [x] đến [y]" -> "Chia đều cho Sale" — string (không phải
  // number) để input rỗng không tự nhảy về 0 khi Admin đang gõ.
  const [rangeFrom, setRangeFrom] = useState('');
  const [rangeTo, setRangeTo] = useState('');
  const [rangeSubmitting, setRangeSubmitting] = useState(false);

  const loadCampaigns = useCallback(async () => {
    // Phải tự set/clear loading ở đây — nếu không, khi campaigns rỗng (tài
    // khoản chưa gắn Campaign nào, hoặc fetch lỗi) thì loadMembers('') (gọi
    // lúc mount vì campaignId ban đầu rỗng) chỉ return sớm mà không đụng
    // loading, khiến "loading" mắc kẹt ở giá trị khởi tạo true mãi mãi ->
    // spinner ở dòng "if (loading && campaigns.length === 0)" quay vô hạn.
    setLoading(true);
    try {
      const response = await fetch('/api/campaigns');
      const data = await response.json();
      if (data.success) setCampaigns(data.data);
      else setNotice({ type: 'error', text: data.error || 'Không tải được danh sách Campaign.' });
    } catch { setNotice({ type: 'error', text: 'Không tải được danh sách Campaign.' }); } finally { setLoading(false); }
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

  // Cùng 1 hàm với server (resolveCampaignMembershipCustomerIdsByRange,
  // campaign.ts) — bắt buộc để "Từ x đến y" trên UI luôn khớp đúng với id
  // server thật sự resolve khi bấm "Chia đều" (không có 2 định nghĩa filter
  // lệch nhau). "members" đã sort created_at asc từ server (getCampaignMembersWithCustomers) — đây là thứ tự "Từ/Đến" tham chiếu.
  const filtered = useMemo(
    () => members.filter(member => matchesMembershipQueueFilter(member, { search, bucket: bucketFilter, assignment: assignmentFilter })),
    [members, search, bucketFilter, assignmentFilter],
  );

  // CSKH TABLE UX — 50/trang, reset về trang 1 khi Campaign/search/bucket/
  // assignment đổi (tập filtered đổi -> trang cũ không còn chắc đúng nghĩa).
  // KHÔNG reset theo "page" của chính nó (tránh vòng lặp) — chỉ theo các input
  // làm đổi "filtered". pageWindow (paginate) chỉ cắt để RENDER, hoàn toàn
  // tách biệt khỏi rangeResult/rangeBreakdown/stats/assignmentSummary bên dưới
  // (những cái đó vẫn phải tính trên "members"/"filtered" toàn bộ).
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [campaignId, search, bucketFilter, assignmentFilter]);
  const pageWindow = useMemo(() => paginate(filtered, page, MEMBERS_PAGE_SIZE), [filtered, page]);

  const stats = useMemo(() => {
    const counts = new Map<MembershipBucket, number>();
    for (const bucket of CSKH_BUCKETS) counts.set(bucket, 0);
    for (const member of members) counts.set(bucketOf(member), (counts.get(bucketOf(member)) || 0) + 1);
    return counts;
  }, [members]);

  // Addendum — summary "Tổng X · Đã chia Y · Chưa chia Z" tính trên TOÀN
  // Campaign (không phụ thuộc search/bucket/assignment filter) để Admin luôn
  // thấy đúng bức tranh tổng, độc lập với việc đang lọc gì.
  const assignmentSummary = useMemo(() => membershipAssignmentBreakdown(members), [members]);

  const replaceMember = (updated: CampaignMembershipWithCustomer) => {
    setMembers(current => current.map(item => item.id === updated.id ? updated : item));
    setHistoryMember(current => current?.id === updated.id ? updated : current);
  };

  function canActOn(member: CampaignMembershipWithCustomer): boolean {
    return canActOnMembership(user, isAdmin, member, selectedCampaign, employees);
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

  // M1B.2 — Accept/Reject tái dùng nguyên POST /api/crm/telesale/handoff hiện
  // có (transitionHandoffTransactional tự phản ánh outcome về đúng
  // CampaignMembership qua CrmHandoff.campaign_membership_id) — không tạo
  // endpoint riêng. Refresh cả danh sách sau khi xong vì response trả về
  // Customer/Handoff, không phải membership đã cập nhật.
  async function handleAcceptReject(member: CampaignMembershipWithCustomer, action: 'accept' | 'reject') {
    const reason = action === 'reject' ? window.prompt('Nhập lý do từ chối bàn giao (bắt buộc):') : undefined;
    if (action === 'reject' && (!reason || reason.trim().length < 3)) return;
    setAcceptRejectBusyId(member.id);
    try {
      const response = await fetch('/api/crm/telesale/handoff', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_id: member.customer_id, idempotency_key: crypto.randomUUID(), action, ghi_chu: reason }),
      });
      const data = await response.json();
      if (!data.success) throw new Error(data.error);
      setNotice({ type: 'ok', text: action === 'accept' ? 'Đã xác nhận nhận khách.' : 'Đã từ chối bàn giao.' });
      void loadMembers(campaignId);
    } catch (error) {
      setNotice({ type: 'error', text: error instanceof Error ? error.message : 'Không thể xử lý bàn giao.' });
    } finally {
      setAcceptRejectBusyId('');
    }
  }

  const selectedCampaign = campaigns.find(item => item.id === campaignId);
  // Leader phụ trách (canManageCampaign, server-side) HOẶC Admin mới được phân
  // Sale cho membership CHƯA PHÂN của Campaign này — cùng authority với
  // canManageMembership's Campaign-owner nhánh, không suy diễn theo Customer.du_an.
  const canManageThisCampaign = Boolean(user && (isAdmin || selectedCampaign?.owner_name === user.ho_ten));
  const unassignedMembers = useMemo(() => members.filter(member => member.assignment_status === 'UNASSIGNED'), [members]);

  // "Chọn khách: Từ x đến y" — preview client-side (non-authoritative, chỉ để
  // hiển thị ngay khi Admin gõ số) trên "filtered" (đã áp search/bucket/
  // assignment hiện tại) bằng ĐÚNG hàm resolveMembershipRange server cũng
  // dùng. Số thật đưa vào request luôn được server resolve lại từ DB lúc
  // submit (xem distributeRange).
  const rangeFromNum = Number(rangeFrom);
  const rangeToNum = Number(rangeTo);
  const rangeResult = rangeFrom.trim() !== '' && rangeTo.trim() !== ''
    ? resolveMembershipRange(filtered, { from: rangeFromNum, to: rangeToNum })
    : null;
  // Addendum — preview PHẢI tách rõ: tổng trong range / đã chia / chưa chia /
  // số THỰC TẾ sẽ được chia (= chưa chia, vì Chia đều luôn bỏ qua khách đã
  // có telesale_id — xem bulkAddAndDistribute/planBulkDistribution, KHÔNG đổi).
  const rangeBreakdown = rangeResult?.ok ? membershipAssignmentBreakdown(rangeResult.ids) : null;
  const rangeEligibility = selectedCampaign ? eligibleCampaignSales(isAdmin, selectedCampaign, projects, employees) : null;

  async function distributeRange() {
    if (!selectedCampaign || !rangeResult?.ok || !rangeBreakdown || !rangeEligibility) return;
    if (rangeBreakdown.unassigned === 0) { setNotice({ type: 'error', text: 'Toàn bộ khách trong khoảng đã chọn đều đã được phân Sale — không còn ai để chia.' }); return; }
    if (rangeEligibility.blocked) { setNotice({ type: 'error', text: rangeEligibility.reason }); return; }
    const saleNames = rangeEligibility.sales.map(item => item.ho_ten);
    if (saleNames.length === 0) { setNotice({ type: 'error', text: 'Không có Sale nào đang hoạt động trong phạm vi Campaign này.' }); return; }
    const toDistribute = rangeBreakdown.unassigned;
    const skipNote = rangeBreakdown.assigned > 0 ? ` (${rangeBreakdown.assigned} khách trong khoảng đã có Sale từ trước sẽ được GIỮ NGUYÊN, không đụng tới.)` : '';
    if (!window.confirm(`Chia đều ${toDistribute} khách (chưa phân) cho ${saleNames.length} Sale?${skipNote}`)) return;
    setRangeSubmitting(true);
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/distribute`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          membership_range: { from: rangeFromNum, to: rangeToNum, search, bucket: bucketFilter || undefined, assignment: assignmentFilter },
          telesale_names: saleNames, mode: 'round_robin',
        }),
      });
      const data = await response.json();
      if (!data.success) throw new Error(data.error);
      setNotice({ type: 'ok', text: `Đã chia ${data.data.newlyAssigned} khách cho ${saleNames.length} Sale.${skipNote}` });
      setRangeFrom(''); setRangeTo('');
      void loadMembers(campaignId);
    } catch (error) {
      setNotice({ type: 'error', text: error instanceof Error ? error.message : 'Không thể chia đều.' });
    } finally {
      setRangeSubmitting(false);
    }
  }

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
        {selectedCampaign && <div style={{ fontSize: 13, color: 'var(--text-label)', paddingBottom: 9, display: 'flex', alignItems: 'center', gap: 8 }}>
          Leader phụ trách: <strong style={{ color: 'var(--text-title)' }}>{selectedCampaign.owner_name || 'Chưa cấu hình'}</strong>
          {isAdmin && <button className="btn btn-ghost btn-sm" onClick={() => setShowLeaderEdit(true)}>{selectedCampaign.owner_name ? 'Sửa Leader' : 'Gán Leader'}</button>}
        </div>}
        {canManageThisCampaign && selectedCampaign && unassignedMembers.length > 0 && (
          <button className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={() => setShowDistribute(true)}>
            <Users size={15} /> Phân Sale ({unassignedMembers.length} chưa phân)
          </button>
        )}
        <button className="btn btn-secondary" style={canManageThisCampaign && selectedCampaign && unassignedMembers.length > 0 ? undefined : { marginLeft: 'auto' }} onClick={() => loadMembers(campaignId)} disabled={!campaignId || loading}><RefreshCw size={15} /> Làm mới</button>
      </div>
      {canManageThisCampaign && selectedCampaign && members.length > 0 && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 10 }}>
            Tổng {assignmentSummary.total} · Đã chia {assignmentSummary.assigned} · Chưa chia {assignmentSummary.unassigned}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, color: 'var(--text-label)' }}>Hiển thị:</span>
            <select className="form-select" style={{ width: 140, fontSize: 12 }} value={assignmentFilter} onChange={event => setAssignmentFilter(event.target.value as MembershipAssignmentFilter)}>
              <option value="all">Tất cả</option>
              <option value="unassigned">Chưa chia</option>
              <option value="assigned">Đã chia</option>
            </select>
            <span style={{ fontSize: 13, color: 'var(--text-label)', marginLeft: 8 }}>Chọn khách:</span>
            <span style={{ fontSize: 13 }}>Từ</span>
            <input type="number" min={1} className="form-input" style={{ width: 80 }} value={rangeFrom} onChange={event => setRangeFrom(event.target.value)} />
            <span style={{ fontSize: 13 }}>đến</span>
            <input type="number" min={1} className="form-input" style={{ width: 80 }} value={rangeTo} onChange={event => setRangeTo(event.target.value)} />
            {rangeResult && (
              rangeResult.ok && rangeBreakdown
                ? <span style={{ fontSize: 13, fontWeight: 650, color: 'var(--primary)' }}>
                    → Tổng {rangeBreakdown.total} · Đã chia {rangeBreakdown.assigned} · Chưa chia {rangeBreakdown.unassigned} · Sẽ chia {rangeBreakdown.unassigned} khách
                    {(search || bucketFilter || assignmentFilter !== 'all') ? ` (trong ${rangeResult.total} khách đang lọc theo bộ lọc/tìm kiếm hiện tại)` : ''}
                  </span>
                : !rangeResult.ok ? <span style={{ fontSize: 12, color: '#b91c1c' }}>{rangeResult.error}</span> : null
            )}
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => void distributeRange()}
              disabled={!rangeResult?.ok || !rangeBreakdown || rangeBreakdown.unassigned === 0 || rangeSubmitting || Boolean(rangeEligibility?.blocked)}
            >
              {rangeSubmitting ? <Loader2 size={14} className="spin" /> : <Users size={14} />} Chia đều cho Sale
            </button>
          </div>
          {rangeEligibility?.blocked && <div style={{ fontSize: 12, color: '#9a3412', marginTop: 6 }}>{rangeEligibility.reason}</div>}
        </div>
      )}
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
          <div className="search-wrapper" style={{ flex: 1, minWidth: 240 }}><Search size={15} className="search-icon" /><input className="form-input" value={search} onChange={event => setSearch(event.target.value)} placeholder="Tìm tên, số điện thoại hoặc Sale..." /></div>
        </div>
      </div>
      <MembershipTable
        members={pageWindow.items} loading={loading} canActOn={canActOn}
        onInteraction={openInteraction} onQualification={setQualificationMember} onHistory={setHistoryMember}
        canManageThisCampaign={canManageThisCampaign} currentUserName={user?.ho_ten}
        onHandoff={setHandoffMember} onAcceptReject={handleAcceptReject} acceptRejectBusyId={acceptRejectBusyId}
        startIndex={pageWindow.startIndex} page={pageWindow.page} totalPages={pageWindow.totalPages}
        totalCount={pageWindow.total} pageSize={MEMBERS_PAGE_SIZE}
        onPrevPage={() => setPage(current => Math.max(1, current - 1))}
        onNextPage={() => setPage(current => Math.min(pageWindow.totalPages, current + 1))}
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

    {showLeaderEdit && selectedCampaign && (
      <CampaignLeaderEditModal
        campaign={selectedCampaign}
        employees={employees}
        onClose={() => setShowLeaderEdit(false)}
        onSaved={updated => {
          setCampaigns(current => current.map(item => item.id === updated.id ? updated : item));
          setShowLeaderEdit(false);
          setNotice({ type: 'ok', text: 'Đã cập nhật Leader phụ trách.' });
        }}
      />
    )}

    {handoffMember && selectedCampaign && (
      <MembershipHandoffModal
        campaignId={campaignId}
        campaign={selectedCampaign}
        membership={handoffMember}
        employees={employees}
        projects={projects}
        isAdmin={isAdmin}
        onClose={() => setHandoffMember(null)}
        onDone={message => { setHandoffMember(null); setNotice({ type: 'ok', text: message }); void loadMembers(campaignId); }}
      />
    )}

    {showDistribute && selectedCampaign && (
      <CampaignDistributeModal
        customerIds={unassignedMembers.map(member => member.customer_id)}
        employees={employees}
        projects={projects}
        isAdmin={isAdmin}
        fixedCampaign={{ id: selectedCampaign.id, name: selectedCampaign.name, id_du_an: selectedCampaign.id_du_an }}
        onClose={() => setShowDistribute(false)}
        onDone={() => { setShowDistribute(false); void loadMembers(campaignId); }}
      />
    )}
  </div>;
}

function MembershipTable({
  members, loading, canActOn, onInteraction, onQualification, onHistory, canManageThisCampaign, currentUserName, onHandoff, onAcceptReject, acceptRejectBusyId,
  startIndex, page, totalPages, totalCount, pageSize, onPrevPage, onNextPage,
}: {
  members: CampaignMembershipWithCustomer[]; loading: boolean; canActOn: (member: CampaignMembershipWithCustomer) => boolean;
  onInteraction: (member: CampaignMembershipWithCustomer) => void; onQualification: (member: CampaignMembershipWithCustomer) => void; onHistory: (member: CampaignMembershipWithCustomer) => void;
  canManageThisCampaign: boolean; currentUserName?: string;
  onHandoff: (member: CampaignMembershipWithCustomer) => void; onAcceptReject: (member: CampaignMembershipWithCustomer, action: 'accept' | 'reject') => void; acceptRejectBusyId: string;
  // CSKH TABLE UX — "trang 50 dòng" thuần presentation (xem table-pagination.ts).
  startIndex: number; page: number; totalPages: number; totalCount: number; pageSize: number;
  onPrevPage: () => void; onNextPage: () => void;
}) {
  if (loading) return <div className="card"><div className="loading-spinner"><div className="spinner" /></div></div>;
  if (members.length === 0) return <div className="card"><div className="empty-state"><Layers size={38} /><h3>Không có khách hàng phù hợp</h3></div></div>;
  return <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
    {/* CSKH TABLE UX — bounded overflowY + maxHeight khiến horizontal
        scrollbar (overflowX) luôn nằm ở đáy MỘT KHUNG cố định trong viewport
        (~62% chiều cao màn hình), thay vì đáy của cả bảng (có thể cao hàng
        nghìn px khi chưa phân trang) — không cần scroll xuống hết trang mới
        thấy. Chỉ đổi inline style của riêng bảng này, KHÔNG đụng class dùng
        chung .table-wrapper/.data-table (nơi khác trong app không bị ảnh
        hưởng). thead th đã sẵn position:sticky;top:0 (globals.css) — trong
        khung bounded này nó tự dính vào đúng khung, không cần đổi CSS. */}
    {/* REMEDIATION (Compact CSKH table columns) — className "cskh-compact"
        (globals.css) co padding th/td cho riêng bảng này + cho phép header
        wrap 2 dòng thay vì ép cột rộng theo nowrap mặc định. Width hint theo
        đúng thứ tự ưu tiên: STT/Bàn giao rất hẹp, Trạng thái/Mức độ tiềm
        năng/Điểm-Xếp hạng/Lịch tiếp theo hẹp, Khách hàng/Sale CSKH vừa, Thao
        tác không set width cứng — dựa vào flexWrap có sẵn trong cell để tự
        xuống dòng thay vì ép cột "Thao tác" rộng ra (cột ưu tiên hiển thị đủ
        trong viewport, không phải cột chiếm nhiều không gian nhất). */}
    <div className="table-wrapper" style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: '62vh' }}><table className="data-table cskh-compact" style={{ minWidth: 980 }}>
    <thead><tr>
      <th style={{ width: 40 }}>STT</th>
      <th style={{ width: 190 }}>Khách hàng</th><th style={{ width: 110 }}>Sale CSKH</th><th style={{ width: 120 }}>Trạng thái</th>
      <th style={{ width: 100 }}>Mức độ tiềm năng</th><th style={{ width: 90 }}>Điểm / Xếp hạng</th>
      <th style={{ width: 100 }}>Lịch tiếp theo</th><th style={{ width: 76 }}>Bàn giao</th>
      <th style={{ textAlign: 'right', width: 150 }}>Thao tác</th>
    </tr></thead>
    <tbody>{members.map((member, idx) => {
      const status = member.trang_thai_cham_soc || 'Chưa gọi'; const palette = statusColors[status] || statusColors['Chưa gọi'];
      const actionable = canActOn(member);
      const isReceiver = Boolean(currentUserName && member.handoff?.sale_name === currentUserName);
      // Addendum — Assigned Customer Visibility: authority là ĐÚNG
      // CampaignMembership.telesale_id (isMembershipAssigned), không phải
      // assignment_status hay field riêng nào khác — dùng để hiện badge "Đã
      // chia"/"Chưa chia" ở cột Sale CSKH bên dưới. KHÔNG còn làm mờ
      // (opacity) cả dòng nữa — REMEDIATION theo yêu cầu: khi phần lớn/toàn
      // bộ Campaign đã được chia Sale, làm mờ mọi dòng khiến cả bảng khó đọc
      // (chữ xám nhạt). Badge màu ở cột Sale CSKH đã đủ để phân biệt trực
      // quan Đã chia/Chưa chia mà không cần giảm độ rõ của cả dòng.
      const assigned = isMembershipAssigned(member);
      return <tr key={member.id} style={isOverdue(member.ngay_lien_he_tiep) ? { background: '#fff7f7' } : undefined}>
        <td style={{ color: 'var(--text-label)', fontWeight: 500 }}>{startIndex + idx + 1}</td>
        <td><div style={{ fontWeight: 700 }}>{member.customer?.ten_KH || member.customer_id}</div>{member.customer?.so_dien_thoai && <a href={`tel:${member.customer.so_dien_thoai}`} style={{ display: 'inline-flex', gap: 5, alignItems: 'center', marginTop: 5, color: 'var(--primary)', fontSize: 13 }}><Phone size={13} />{formatPhone(member.customer.so_dien_thoai)}</a>}</td>
        <td>
          {assigned
            ? <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                <span style={{ background: '#ecfdf5', color: '#047857', borderRadius: 20, padding: '2px 6px', fontSize: 11, fontWeight: 650 }}>Đã chia</span>
                <span style={{ fontWeight: 600, fontSize: 12 }}>{member.telesale_name}</span>
              </div>
            : <span style={{ background: '#f1f5f9', color: '#64748b', borderRadius: 20, padding: '2px 6px', fontSize: 11, fontWeight: 650 }}>Chưa chia</span>}
        </td>
        <td><span style={{ background: palette.bg, color: palette.color, borderRadius: 20, padding: '3px 7px', fontSize: 11, fontWeight: 650 }}>{status}</span><div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 5 }}>{member.so_lan_lien_he || 0} lần · {member.muc_do_quan_tam || 'Chưa xác định'}</div></td>
        <td><span style={{ fontSize: 12, fontWeight: 600 }}>{qualificationStatusLabel(member.qualification_status)}</span></td>
        <td><span style={{ fontSize: 12 }}>{member.lead_quality_score}/100 · {leadQualityRankLabel(member.lead_quality_rank)}</span></td>
        {/* REMEDIATION — Lịch tiếp theo giữ nguyên field/dữ liệu, chỉ compact
            hiển thị: flexWrap để icon+giờ tự xuống dòng thay vì ép cột rộng;
            localDate() đã tự trả "—" khi ngay_lien_he_tiep rỗng (không đổi). */}
        <td><div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap', color: isOverdue(member.ngay_lien_he_tiep) ? '#dc2626' : 'var(--text-body)', fontSize: 12 }}><CalendarClock size={14} />{localDate(member.ngay_lien_he_tiep)}</div>{member.ngay_lien_he_cuoi && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Gần nhất: {localDate(member.ngay_lien_he_cuoi)}</div>}</td>
        {/* REMEDIATION — Bàn giao giữ nguyên business information (Handoff
            status + Sale nhận), chỉ compact hiển thị: badge ngắn "Chờ nhận"/
            "Đã nhận"/"Từ chối" thay vì "Chờ xác nhận · {tên}"/"Đã nhận · {tên}"
            dài, tên Sale chuyển vào title (tooltip) thay vì render trực tiếp
            trong cell — KHÔNG đổi outcome/handoff.status/authority nào, chỉ
            đổi cách trình bày. */}
        <td>
          {member.outcome === 'HANDOFF_ACCEPTED' && <span title={member.handoff?.sale_name ? `Đã nhận · ${member.handoff.sale_name}` : undefined} style={{ background: '#ecfdf5', color: '#047857', borderRadius: 20, padding: '3px 7px', fontSize: 11, fontWeight: 650 }}>Đã nhận</span>}
          {member.outcome === 'HANDOFF_REJECTED' && <span style={{ background: '#fef2f2', color: '#b91c1c', borderRadius: 20, padding: '3px 7px', fontSize: 11, fontWeight: 650 }}>Từ chối</span>}
          {member.outcome === 'HANDOFF_INITIATED' && <>
            <span title={member.handoff?.sale_name ? `Chờ nhận · ${member.handoff.sale_name}` : undefined} style={{ background: '#fffbeb', color: '#a16207', borderRadius: 20, padding: '3px 7px', fontSize: 11, fontWeight: 650 }}>Chờ nhận</span>
            {isReceiver && member.handoff?.status === 'WAITING_ACCEPTANCE' && <div style={{ display: 'flex', gap: 4, marginTop: 5, flexWrap: 'wrap' }}>
              <button className="btn btn-primary btn-sm" disabled={acceptRejectBusyId === member.id} onClick={() => onAcceptReject(member, 'accept')}><UserCheck size={12} /> Nhận</button>
              <button className="btn btn-secondary btn-sm" disabled={acceptRejectBusyId === member.id} onClick={() => onAcceptReject(member, 'reject')}><X size={12} /> Từ chối</button>
            </div>}
          </>}
          {!member.outcome && <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>}
        </td>
        <td><div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4, flexWrap: 'wrap' }}>
          {actionable && <button className="btn btn-primary btn-sm" onClick={() => onInteraction(member)}><Phone size={13} /> Chăm sóc</button>}
          {actionable && <button className="btn btn-secondary btn-sm" onClick={() => onQualification(member)}><BadgeCheck size={13} /> Đánh giá</button>}
          {canManageThisCampaign && isHandoffCandidate(member) && <button className="btn btn-secondary btn-sm" onClick={() => onHandoff(member)}><Send size={13} /> Bàn giao</button>}
          <button className="btn btn-secondary btn-sm" onClick={() => onHistory(member)}><History size={13} /> Lịch sử</button>
        </div></td>
      </tr>;
    })}</tbody>
  </table></div>
    {/* CSKH TABLE UX — 50 CampaignMembership/trang. totalCount/totalPages đến
        từ pageWindow (paginate trên "filtered" toàn tập, KHÔNG phải trên
        "members" — vốn đã là 1 trang — nên số liệu này luôn đúng bức tranh
        toàn filtered dataset, không lệch theo trang đang xem). */}
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

// Admin-only: gán/sửa Leader phụ trách Campaign (owner_id/owner_name). Chỉ
// render khi isAdmin (gate thật ở server — PUT /api/campaigns/[id] chặn
// non-admin đụng owner_id/owner_name, xem crm-auth.ts#campaignOwnerFieldsTouched).
// Active employee eligibility giống hệt Leader picker trong
// CampaignDistributeModal.tsx (employees.filter trang_thai !== 'Nghỉ việc') —
// không phát minh rule mới.
function CampaignLeaderEditModal({ campaign, employees, onClose, onSaved }: {
  campaign: CampaignType; employees: NhanVien[]; onClose: () => void; onSaved: (updated: CampaignType) => void;
}) {
  const [leaderName, setLeaderName] = useState(campaign.owner_name || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const activeEmployees = employees.filter(item => item.trang_thai !== 'Nghỉ việc');

  async function save() {
    setSaving(true);
    setError('');
    try {
      const leader = activeEmployees.find(item => item.ho_ten === leaderName);
      const response = await fetch(`/api/campaigns/${campaign.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner_id: leader?.id_nhan_vien || null, owner_name: leader?.ho_ten || null }),
      });
      const data = await response.json();
      if (!data.success) throw new Error(data.error || 'Không thể cập nhật Leader.');
      onSaved(data.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể cập nhật Leader.');
    } finally {
      setSaving(false);
    }
  }

  return <div className="modal-overlay" onClick={onClose}><div className="modal-content" style={{ maxWidth: 460 }} onClick={event => event.stopPropagation()}>
    <div className="modal-header"><h3 className="modal-title">Leader phụ trách — {campaign.name}</h3><button className="btn btn-ghost btn-icon" onClick={onClose}><X size={18} /></button></div>
    <div style={{ padding: 20 }}>
      {error && <div style={{ background: '#fef2f2', color: '#b91c1c', borderRadius: 7, padding: 10, marginBottom: 12 }}>{error}</div>}
      <div className="form-group">
        <label className="form-label">Leader phụ trách</label>
        <select className="form-select" value={leaderName} onChange={event => setLeaderName(event.target.value)}>
          <option value="">— Chưa cấu hình —</option>
          {activeEmployees.map(item => <option key={item.id_nhan_vien} value={item.ho_ten}>{item.ho_ten} · {item.employee_type}</option>)}
        </select>
      </div>
    </div>
    <div className="modal-footer">
      <button className="btn btn-secondary" onClick={onClose} disabled={saving}>Hủy</button>
      <button className="btn btn-primary" onClick={() => void save()} disabled={saving}>{saving ? <Loader2 size={15} className="spin" /> : <Save size={15} />} Lưu</button>
    </div>
  </div></div>;
}

// M1B.2 — Leader/Admin explicit "Bàn giao": chọn Sale nhận ownership trong
// đúng phạm vi (eligibleCampaignSales, cùng hàm dùng cho CSKH distribution —
// Leader bị thu hẹp theo Project.ds_sale, Admin không giới hạn). Đây CHỈ là
// UX prefilter — server (POST .../handoff) re-validate toàn bộ authority
// trong transaction, không tin lựa chọn của client. Sale CSKH hiện tại
// (membership.telesale_name) được gắn nhãn gợi ý trong option nhưng KHÔNG
// auto-select — Leader/Admin phải tự chọn rồi bấm Xác nhận.
function MembershipHandoffModal({ campaignId, campaign, membership, employees, projects, isAdmin, onClose, onDone }: {
  campaignId: string; campaign: CampaignType; membership: CampaignMembershipWithCustomer;
  employees: NhanVien[]; projects: DuAn[]; isAdmin: boolean;
  onClose: () => void; onDone: (message: string) => void;
}) {
  const [saleId, setSaleId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const eligibility = eligibleCampaignSales(isAdmin, campaign, projects, employees);
  const eligibleSales = eligibility.blocked ? [] : eligibility.sales;
  const suggestedName = membership.telesale_name;

  async function submit() {
    if (!saleId) { setError('Chọn Sale nhận bàn giao.'); return; }
    setSubmitting(true);
    setError('');
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/members/${membership.id}/handoff`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idempotency_key: crypto.randomUUID(), sale_id: saleId }),
      });
      const data = await response.json();
      if (!data.success) throw new Error(data.error || 'Không thể bàn giao khách hàng.');
      const saleName = eligibleSales.find(item => item.id_nhan_vien === saleId)?.ho_ten || '';
      onDone(`Đã bàn giao cho ${saleName}, đang chờ xác nhận.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể bàn giao khách hàng.');
    } finally {
      setSubmitting(false);
    }
  }

  return <div className="modal-overlay" onClick={onClose}><div className="modal-content" style={{ maxWidth: 480 }} onClick={event => event.stopPropagation()}>
    <div className="modal-header"><h3 className="modal-title"><Send size={17} /> Bàn giao — {membership.customer?.ten_KH || membership.customer_id}</h3><button className="btn btn-ghost btn-icon" onClick={onClose}><X size={18} /></button></div>
    <div style={{ padding: 20 }}>
      {error && <div style={{ background: '#fef2f2', color: '#b91c1c', borderRadius: 7, padding: 10, marginBottom: 12 }}>{error}</div>}
      <div style={{ padding: 12, background: '#f8fafc', borderRadius: 8, marginBottom: 14, fontSize: 13 }}>
        <div><strong>{membership.customer?.ten_KH}</strong> · {formatPhone(membership.customer?.so_dien_thoai || '')}</div>
        <div style={{ marginTop: 4, color: 'var(--text-label)' }}>Mức độ tiềm năng: <strong>{qualificationStatusLabel(membership.qualification_status)}</strong> · {membership.lead_quality_score}/100</div>
      </div>
      {eligibility.blocked && <div style={{ padding: 12, background: '#fff7ed', color: '#9a3412', borderRadius: 8, fontSize: 13, marginBottom: 14 }}>{eligibility.reason}</div>}
      {!eligibility.blocked && (
        <div className="form-group">
          <label className="form-label">Sale nhận bàn giao *</label>
          <select className="form-select" value={saleId} onChange={event => setSaleId(event.target.value)}>
            <option value="">— Chọn Sale —</option>
            {eligibleSales.map(item => (
              <option key={item.id_nhan_vien} value={item.id_nhan_vien}>
                {item.ho_ten}{item.ho_ten === suggestedName ? ' · Sale CSKH hiện tại' : ''}
              </option>
            ))}
          </select>
          {eligibleSales.length === 0 && <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>Không có Sale nào đang hoạt động trong phạm vi Campaign này.</p>}
        </div>
      )}
    </div>
    <div className="modal-footer">
      <button className="btn btn-secondary" onClick={onClose} disabled={submitting}>Hủy</button>
      <button className="btn btn-primary" onClick={() => void submit()} disabled={submitting || eligibility.blocked || !saleId}>
        {submitting ? <Loader2 size={15} className="spin" /> : <Send size={15} />} Xác nhận bàn giao
      </button>
    </div>
  </div></div>;
}
