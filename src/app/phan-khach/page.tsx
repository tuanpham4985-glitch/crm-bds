'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BadgeCheck, CalendarClock, Check, ChevronDown, Clock3, Eye, History, Phone, RefreshCw, Save, Search, Send, Settings, UserCheck, Users, X } from 'lucide-react';
import type { CrmBanGiaoEntry, CrmChamSocEntry, DuAn, KhachHang, MucDoQuanTam, NhanVien, TrangThaiChamSoc } from '@/lib/types';
import { formatPhone } from '@/lib/utils';
import { useCrmAccess } from '@/hooks/useCrmAccess';
import { useAuth } from '@/hooks/useAuth';
import { QualificationModal } from '@/components/crm/QualificationModal';

const STATUSES: TrangThaiChamSoc[] = ['Chưa gọi', 'Không nghe máy', 'Gọi lại', 'Đã liên hệ', 'Quan tâm', 'Không phù hợp', 'Sai số'];
const INTERESTS: MucDoQuanTam[] = ['Chưa xác định', 'Thấp', 'Trung bình', 'Cao', 'Rất cao'];
const statusColors: Record<string, { bg: string; color: string }> = {
  'Chưa gọi': { bg: '#f1f5f9', color: '#475569' }, 'Không nghe máy': { bg: '#fff7ed', color: '#c2410c' },
  'Gọi lại': { bg: '#fffbeb', color: '#a16207' }, 'Đã liên hệ': { bg: '#eff6ff', color: '#1d4ed8' },
  'Quan tâm': { bg: '#ecfdf5', color: '#047857' }, 'Không phù hợp': { bg: '#fef2f2', color: '#b91c1c' },
  'Sai số': { bg: '#fdf2f8', color: '#be185d' },
};

function parseList<T>(raw?: string): T[] {
  if (!raw) return [];
  try { const value: unknown = JSON.parse(raw); return Array.isArray(value) ? value as T[] : []; } catch { return []; }
}
function isTelesale(employee: NhanVien): boolean {
  return `${employee.employee_type || ''} ${employee.vai_tro || ''}`.toLowerCase().match(/telesale|cskh/) !== null;
}
function localDate(value?: string): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });
}
function isOverdue(value?: string): boolean { return Boolean(value && new Date(value).getTime() < Date.now()); }

type InteractionForm = { ket_qua: TrangThaiChamSoc; muc_do_quan_tam: MucDoQuanTam; ghi_chu: string; ngay_lien_he_tiep: string };

export default function PhanKhachPage() {
  const { phanKhachIds } = useCrmAccess();
  const { user, isAdmin } = useAuth();
  const [projects, setProjects] = useState<DuAn[]>([]);
  const [employees, setEmployees] = useState<NhanVien[]>([]);
  const [customers, setCustomers] = useState<KhachHang[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [notice, setNotice] = useState<{ type: 'ok' | 'error' | 'warn'; text: string } | null>(null);
  const [interactionCustomer, setInteractionCustomer] = useState<KhachHang | null>(null);
  const [historyCustomer, setHistoryCustomer] = useState<KhachHang | null>(null);
  const [qualificationCustomer, setQualificationCustomer] = useState<KhachHang | null>(null);
  const [showTeam, setShowTeam] = useState(false);
  const [teamForm, setTeamForm] = useState({ truong_nhom: '', ds_sale: [] as string[] });
  const [interaction, setInteraction] = useState<InteractionForm>({ ket_qua: 'Đã liên hệ', muc_do_quan_tam: 'Chưa xác định', ghi_chu: '', ngay_lien_he_tiep: '' });

  const selectedProject = projects.find(project => project.id_du_an === selectedProjectId);
  const managesAssignedTelesale = customers.some(customer => employees.some(employee =>
    employee.ho_ten === customer.telesale_phu_trach && employee.ql_truc_tiep === user?.ho_ten));
  const canManage = Boolean(isAdmin || (selectedProject && selectedProject.truong_nhom === user?.ho_ten) || managesAssignedTelesale);
  const activeEmployees = employees.filter(employee => employee.trang_thai !== 'Nghỉ việc');
  const telesales = activeEmployees.filter(isTelesale);
  const sales = activeEmployees.filter(employee => !isTelesale(employee) && employee.vai_tro !== 'HR');

  const loadBase = useCallback(async () => {
    setLoading(true);
    try {
      const [projectRes, employeeRes] = await Promise.all([fetch('/api/du-an'), fetch('/api/nhan-vien')]);
      const [projectData, employeeData] = await Promise.all([projectRes.json(), employeeRes.json()]);
      if (projectData.success) setProjects(projectData.data.filter((item: DuAn) => item.hien_thi !== 0));
      if (employeeData.success) setEmployees(employeeData.data);
    } catch { setNotice({ type: 'error', text: 'Không tải được danh mục CRM.' }); } finally { setLoading(false); }
  }, []);

  const loadCustomers = useCallback(async (project?: DuAn) => {
    if (!project) { setCustomers([]); return; }
    setLoading(true);
    try {
      const response = await fetch(`/api/khach-hang?du_an=${encodeURIComponent(project.ten_du_an)}&limit=999`);
      const data = await response.json();
      if (!data.success) throw new Error(data.error || 'Không tải được khách hàng');
      setCustomers(data.data);
    } catch (error) { setNotice({ type: 'error', text: error instanceof Error ? error.message : 'Không tải được khách hàng.' }); } finally { setLoading(false); }
  }, []);

  useEffect(() => { void loadBase(); }, [loadBase]);
  useEffect(() => { void loadCustomers(selectedProject); }, [selectedProjectId, selectedProject?.ten_du_an, loadCustomers]);

  const accessibleProjects = useMemo(() => projects.filter(project =>
    phanKhachIds === null || (Array.isArray(phanKhachIds) && phanKhachIds.includes(project.id_du_an))), [projects, phanKhachIds]);
  useEffect(() => { if (!selectedProjectId && accessibleProjects.length === 1) setSelectedProjectId(accessibleProjects[0].id_du_an); }, [accessibleProjects, selectedProjectId]);

  const filtered = useMemo(() => customers.filter(customer => {
    const q = search.trim().toLowerCase();
    const matchesSearch = !q || [customer.ten_KH, customer.so_dien_thoai, customer.telesale_phu_trach, customer.sale_nhan_khach]
      .some(value => (value || '').toLowerCase().includes(q));
    return matchesSearch && (!statusFilter || (customer.trang_thai_cham_soc || 'Chưa gọi') === statusFilter);
  }), [customers, search, statusFilter]);

  const stats = useMemo(() => ({
    total: customers.length, unassigned: customers.filter(item => !item.telesale_phu_trach).length,
    pending: customers.filter(item => ['Chưa gọi', 'Gọi lại', 'Không nghe máy'].includes(item.trang_thai_cham_soc || 'Chưa gọi')).length,
    overdue: customers.filter(item => isOverdue(item.ngay_lien_he_tiep) && item.trang_thai_cham_soc !== 'Quan tâm').length,
    interested: customers.filter(item => item.trang_thai_cham_soc === 'Quan tâm').length,
    handoff: customers.filter(item => item.trang_thai_ban_giao === 'Chờ xác nhận').length,
    accepted: customers.filter(item => item.trang_thai_ban_giao === 'Đã nhận').length,
  }), [customers]);

  const replaceCustomer = (updated: KhachHang) => {
    setCustomers(current => current.map(item => item.id_khach_hang === updated.id_khach_hang ? updated : item));
    setHistoryCustomer(current => current?.id_khach_hang === updated.id_khach_hang ? updated : current);
  };

  async function assign(customer: KhachHang, telesale: string) {
    setBusyId(customer.id_khach_hang);
    try {
      const response = await fetch('/api/crm/telesale/assign', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ customer_id: customer.id_khach_hang, telesale }) });
      const data = await response.json(); if (!data.success) throw new Error(data.error); replaceCustomer(data.data);
      setNotice({ type: 'ok', text: telesale ? `Đã giao ${customer.ten_KH} cho ${telesale}.` : 'Đã thu hồi phân công.' });
    } catch (error) { setNotice({ type: 'error', text: error instanceof Error ? error.message : 'Không thể phân data.' }); } finally { setBusyId(''); }
  }

  function openInteraction(customer: KhachHang) {
    setInteractionCustomer(customer);
    setInteraction({ ket_qua: customer.trang_thai_cham_soc === 'Chưa gọi' ? 'Đã liên hệ' : customer.trang_thai_cham_soc || 'Đã liên hệ', muc_do_quan_tam: customer.muc_do_quan_tam || 'Chưa xác định', ghi_chu: '', ngay_lien_he_tiep: '' });
  }

  async function saveInteraction() {
    if (!interactionCustomer) return;
    setBusyId(interactionCustomer.id_khach_hang);
    try {
      const response = await fetch('/api/crm/telesale/interaction', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ customer_id: interactionCustomer.id_khach_hang, idempotency_key: crypto.randomUUID(), ...interaction }) });
      const data = await response.json(); if (!data.success) throw new Error(data.error); replaceCustomer(data.data); setInteractionCustomer(null);
      setNotice({ type: data.warning ? 'warn' : 'ok', text: data.warning || (data.handoff ? `Lead đạt chuẩn, đã chuyển cho ${data.data.sale_nhan_khach || 'hàng chờ quản lý'}.` : 'Đã lưu kết quả chăm sóc và cập nhật funnel.') });
    } catch (error) { setNotice({ type: 'error', text: error instanceof Error ? error.message : 'Không thể lưu chăm sóc.' }); } finally { setBusyId(''); }
  }

  async function handoff(customer: KhachHang, action: 'handoff' | 'accept' | 'reject', saleName?: string) {
    const reason = action === 'reject' ? window.prompt('Nhập lý do từ chối bàn giao (bắt buộc):') : undefined;
    if (action === 'reject' && (!reason || reason.trim().length < 3)) return;
    setBusyId(customer.id_khach_hang);
    try {
      const response = await fetch('/api/crm/telesale/handoff', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ customer_id: customer.id_khach_hang, idempotency_key: crypto.randomUUID(), action, sale_nhan: saleName, ghi_chu: reason }) });
      const data = await response.json(); if (!data.success) throw new Error(data.error); replaceCustomer(data.data);
      setNotice({ type: 'ok', text: action === 'accept' ? 'Đã xác nhận nhận khách.' : action === 'reject' ? 'Đã từ chối bàn giao.' : `Đã bàn giao cho ${saleName}.` });
    } catch (error) { setNotice({ type: 'error', text: error instanceof Error ? error.message : 'Không thể xử lý bàn giao.' }); } finally { setBusyId(''); }
  }

  function openTeam() {
    if (!selectedProject) return;
    setTeamForm({ truong_nhom: selectedProject.truong_nhom || '', ds_sale: parseList<string>(selectedProject.ds_sale) }); setShowTeam(true);
  }
  async function saveTeam() {
    if (!selectedProject) return; setBusyId('team');
    try {
      const response = await fetch('/api/du-an', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...selectedProject, truong_nhom: teamForm.truong_nhom, ds_sale: JSON.stringify(teamForm.ds_sale) }) });
      const data = await response.json(); if (!data.success) throw new Error(data.error);
      setProjects(current => current.map(item => item.id_du_an === selectedProject.id_du_an ? data.data : item)); setShowTeam(false); setNotice({ type: 'ok', text: 'Đã lưu cấu hình team.' });
    } catch (error) { setNotice({ type: 'error', text: error instanceof Error ? error.message : 'Không thể lưu team.' }); } finally { setBusyId(''); }
  }

  if (loading && projects.length === 0) return <div className="loading-spinner"><div className="spinner" /></div>;
  return <div>
    <div className="page-header"><div className="page-header-left"><h1>Vận hành Telesale</h1><p>Phân data, theo dõi chăm sóc và bàn giao khách quan tâm cho Sale</p></div><button className="btn btn-secondary" onClick={() => loadCustomers(selectedProject)} disabled={!selectedProject || loading}><RefreshCw size={15} /> Làm mới</button></div>
    {notice && <div style={{ padding: '11px 14px', marginBottom: 16, borderRadius: 8, display: 'flex', gap: 8, alignItems: 'center', background: notice.type === 'ok' ? '#ecfdf5' : notice.type === 'warn' ? '#fffbeb' : '#fef2f2', color: notice.type === 'ok' ? '#047857' : notice.type === 'warn' ? '#a16207' : '#b91c1c' }}>{notice.type === 'ok' ? <Check size={16} /> : <AlertTriangle size={16} />}<span style={{ flex: 1 }}>{notice.text}</span><button className="btn btn-ghost btn-icon" onClick={() => setNotice(null)}><X size={14} /></button></div>}
    <div className="card" style={{ padding: 16, marginBottom: 16 }}><div style={{ display: 'flex', gap: 12, alignItems: 'end', flexWrap: 'wrap' }}><div style={{ minWidth: 280 }}><label className="form-label">Dự án</label><div style={{ position: 'relative' }}><select className="form-select" value={selectedProjectId} onChange={event => setSelectedProjectId(event.target.value)}><option value="">— Chọn dự án —</option>{accessibleProjects.map(project => <option key={project.id_du_an} value={project.id_du_an}>{project.ten_du_an}</option>)}</select><ChevronDown size={15} style={{ position: 'absolute', right: 10, top: 11, pointerEvents: 'none' }} /></div></div>{selectedProject && <><div style={{ fontSize: 13, color: 'var(--text-label)', paddingBottom: 9 }}>Trưởng nhóm: <strong style={{ color: 'var(--text-title)' }}>{selectedProject.truong_nhom || 'Chưa cấu hình'}</strong></div>{canManage && <button className="btn btn-secondary btn-sm" style={{ marginLeft: 'auto', marginBottom: 3 }} onClick={openTeam}><Settings size={14} /> Cấu hình team</button>}</>}</div></div>

    {selectedProject && <><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 10, marginBottom: 16 }}>{[
      ['Tổng data', stats.total, '#334155'], ['Chưa phân', stats.unassigned, '#7c3aed'], ['Cần chăm sóc', stats.pending, '#2563eb'], ['Quá lịch', stats.overdue, '#dc2626'], ['Quan tâm', stats.interested, '#059669'], ['Chờ Sale nhận', stats.handoff, '#d97706'], ['Đã nhận', stats.accepted, '#16a34a'],
    ].map(([label, value, color]) => <div className="card" key={String(label)} style={{ padding: '12px 14px' }}><div style={{ fontSize: 12, color: 'var(--text-label)' }}>{label}</div><div style={{ fontSize: 24, fontWeight: 750, color: String(color), marginTop: 3 }}>{value}</div></div>)}</div>
      <div className="card" style={{ padding: 12, marginBottom: 12 }}><div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}><div className="search-wrapper" style={{ flex: 1, minWidth: 240 }}><Search size={15} className="search-icon" /><input className="form-input" value={search} onChange={event => setSearch(event.target.value)} placeholder="Tìm tên, số điện thoại, Telesale hoặc Sale..." /></div><select className="form-select" style={{ width: 180 }} value={statusFilter} onChange={event => setStatusFilter(event.target.value)}><option value="">Tất cả trạng thái</option>{STATUSES.map(status => <option key={status}>{status}</option>)}</select></div></div>
      <CustomerTable customers={filtered} loading={loading} busyId={busyId} canManage={canManage} userName={user?.ho_ten || ''} telesales={telesales} sales={sales} onAssign={assign} onInteraction={openInteraction} onQualification={setQualificationCustomer} onHandoff={handoff} onHistory={setHistoryCustomer} />
    </>}
    {!selectedProject && <div className="card"><div className="empty-state"><Users size={40} /><h3>Chọn dự án để bắt đầu</h3><p>Danh sách dự án được giới hạn theo quyền của tài khoản.</p></div></div>}

    {interactionCustomer && <Modal title={`Chăm sóc: ${interactionCustomer.ten_KH}`} onClose={() => setInteractionCustomer(null)}><div style={{ padding: 20 }}><div style={{ padding: 12, background: '#f8fafc', borderRadius: 8, marginBottom: 16 }}><strong>{formatPhone(interactionCustomer.so_dien_thoai)}</strong><div style={{ fontSize: 12, color: 'var(--text-label)', marginTop: 4 }}>{interactionCustomer.du_an} · {interactionCustomer.nhu_cau || 'Chưa có nhu cầu'}</div></div><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}><div className="form-group"><label className="form-label">Kết quả cuộc gọi *</label><select className="form-select" value={interaction.ket_qua} onChange={event => setInteraction(current => ({ ...current, ket_qua: event.target.value as TrangThaiChamSoc }))}>{STATUSES.filter(item => item !== 'Chưa gọi').map(item => <option key={item}>{item}</option>)}</select></div><div className="form-group"><label className="form-label">Mức độ quan tâm</label><select className="form-select" value={interaction.muc_do_quan_tam} onChange={event => setInteraction(current => ({ ...current, muc_do_quan_tam: event.target.value as MucDoQuanTam }))}>{INTERESTS.map(item => <option key={item}>{item}</option>)}</select></div></div><div className="form-group"><label className="form-label">Ghi chú cuộc gọi</label><textarea className="form-textarea" rows={4} value={interaction.ghi_chu} onChange={event => setInteraction(current => ({ ...current, ghi_chu: event.target.value }))} placeholder="Nhu cầu, ngân sách, sản phẩm quan tâm, phản hồi của khách..." /></div><div className="form-group"><label className="form-label">Lịch liên hệ tiếp theo</label><input type="datetime-local" className="form-input" value={interaction.ngay_lien_he_tiep} onChange={event => setInteraction(current => ({ ...current, ngay_lien_he_tiep: event.target.value }))} /></div>{interaction.ket_qua === 'Quan tâm' && <div style={{ padding: 12, background: '#eff6ff', color: '#1d4ed8', borderRadius: 8, fontSize: 13, display: 'flex', gap: 8 }}><BadgeCheck size={16} /> “Quan tâm” đưa lead vào bước Interested; chỉ lead đạt score ≥60 mới được handoff cho Sale.</div>}</div><div className="modal-footer"><button className="btn btn-secondary" onClick={() => setInteractionCustomer(null)}>Hủy</button><button className="btn btn-primary" disabled={busyId === interactionCustomer.id_khach_hang} onClick={() => void saveInteraction()}><Save size={15} /> Lưu chăm sóc</button></div></Modal>}
    {qualificationCustomer && <QualificationModal customer={qualificationCustomer} onClose={() => setQualificationCustomer(null)} onSaved={(updated, message) => { replaceCustomer(updated); setQualificationCustomer(null); setNotice({ type: 'ok', text: message }); }} />}
    {historyCustomer && <HistoryModal customer={historyCustomer} onClose={() => setHistoryCustomer(null)} />}
    {showTeam && selectedProject && <Modal title="Cấu hình team dự án" onClose={() => setShowTeam(false)}><div style={{ padding: 20 }}><div className="form-group"><label className="form-label">Trưởng nhóm</label><select className="form-select" disabled={!isAdmin} value={teamForm.truong_nhom} onChange={event => setTeamForm(current => ({ ...current, truong_nhom: event.target.value }))}><option value="">— Chọn trưởng nhóm —</option>{activeEmployees.map(item => <option key={item.id_nhan_vien} value={item.ho_ten}>{item.ho_ten} · {item.employee_type}</option>)}</select></div><div className="form-group"><label className="form-label">Thành viên được truy cập dự án</label><div style={{ maxHeight: 280, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>{activeEmployees.map(item => <label key={item.id_nhan_vien} style={{ display: 'flex', padding: '9px 12px', gap: 9, alignItems: 'center', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}><input type="checkbox" checked={teamForm.ds_sale.includes(item.ho_ten)} onChange={() => setTeamForm(current => ({ ...current, ds_sale: current.ds_sale.includes(item.ho_ten) ? current.ds_sale.filter(name => name !== item.ho_ten) : [...current.ds_sale, item.ho_ten] }))} /><span style={{ flex: 1 }}>{item.ho_ten}</span><span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{item.employee_type}</span></label>)}</div></div></div><div className="modal-footer"><button className="btn btn-secondary" onClick={() => setShowTeam(false)}>Hủy</button><button className="btn btn-primary" disabled={busyId === 'team'} onClick={() => void saveTeam()}><Save size={15} /> Lưu cấu hình</button></div></Modal>}
  </div>;
}

function CustomerTable({ customers, loading, busyId, canManage, userName, telesales, sales, onAssign, onInteraction, onQualification, onHandoff, onHistory }: {
  customers: KhachHang[]; loading: boolean; busyId: string; canManage: boolean; userName: string; telesales: NhanVien[]; sales: NhanVien[];
  onAssign: (customer: KhachHang, telesale: string) => Promise<void>; onInteraction: (customer: KhachHang) => void; onQualification: (customer: KhachHang) => void;
  onHandoff: (customer: KhachHang, action: 'handoff' | 'accept' | 'reject', saleName?: string) => Promise<void>; onHistory: (customer: KhachHang) => void;
}) {
  if (loading) return <div className="card"><div className="loading-spinner"><div className="spinner" /></div></div>;
  if (customers.length === 0) return <div className="card"><div className="empty-state"><Users size={38} /><h3>Không có khách hàng phù hợp</h3></div></div>;
  return <div className="card" style={{ padding: 0, overflow: 'hidden' }}><div className="table-wrapper" style={{ overflowX: 'auto' }}><table className="data-table" style={{ minWidth: 1380 }}><thead><tr><th>Khách hàng</th><th>Dự án / nhu cầu</th><th>Telesale phụ trách</th><th>Tiến độ</th><th>Lịch tiếp theo</th><th>Bàn giao Sale</th><th style={{ textAlign: 'right' }}>Thao tác</th></tr></thead><tbody>{customers.map(customer => {
    const status = customer.trang_thai_cham_soc || 'Chưa gọi'; const palette = statusColors[status] || statusColors['Chưa gọi'];
    const assignee = customer.telesale_phu_trach === userName; const receiver = customer.sale_nhan_khach === userName;
    return <tr key={customer.id_khach_hang} style={isOverdue(customer.ngay_lien_he_tiep) ? { background: '#fff7f7' } : undefined}>
      <td><div style={{ fontWeight: 700 }}>{customer.ten_KH}</div><a href={`tel:${customer.so_dien_thoai}`} style={{ display: 'inline-flex', gap: 5, alignItems: 'center', marginTop: 5, color: 'var(--primary)', fontSize: 13 }}><Phone size={13} />{formatPhone(customer.so_dien_thoai)}</a><div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>{customer.nguon || 'Không rõ nguồn'}</div></td>
      <td><div style={{ fontWeight: 600, fontSize: 13 }}>{customer.du_an || '—'}</div><div style={{ maxWidth: 220, fontSize: 12, color: 'var(--text-label)', marginTop: 5, whiteSpace: 'normal' }}>{customer.nhu_cau || 'Chưa có nhu cầu'}</div></td>
      <td>{canManage ? <select className="form-select" style={{ minWidth: 165, fontSize: 12 }} disabled={busyId === customer.id_khach_hang} value={customer.telesale_phu_trach || ''} onChange={event => void onAssign(customer, event.target.value)}><option value="">— Chưa phân —</option>{telesales.map(item => <option key={item.id_nhan_vien} value={item.ho_ten}>{item.ho_ten}</option>)}</select> : <><div style={{ fontWeight: 600, fontSize: 13 }}>{customer.telesale_phu_trach || 'Chưa phân'}</div>{assignee && <span style={{ fontSize: 11, color: '#047857' }}>Data của bạn</span>}</>}</td>
      <td><span style={{ background: palette.bg, color: palette.color, borderRadius: 20, padding: '4px 9px', fontSize: 12, fontWeight: 650 }}>{status}</span><div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 7 }}>{customer.so_lan_lien_he || 0} lần · {customer.muc_do_quan_tam || 'Chưa xác định'}</div></td>
      <td><div style={{ display: 'flex', gap: 5, alignItems: 'center', color: isOverdue(customer.ngay_lien_he_tiep) ? '#dc2626' : 'var(--text-body)', fontSize: 12 }}><CalendarClock size={14} />{localDate(customer.ngay_lien_he_tiep)}</div>{customer.ngay_lien_he_cuoi && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 5 }}>Gần nhất: {localDate(customer.ngay_lien_he_cuoi)}</div>}</td>
      <td><div style={{ fontWeight: 650, fontSize: 13 }}>{customer.sale_nhan_khach || 'Chưa bàn giao'}</div><div style={{ fontSize: 11, marginTop: 4, color: customer.trang_thai_ban_giao === 'Đã nhận' ? '#15803d' : customer.trang_thai_ban_giao === 'Thiếu người nhận' || customer.trang_thai_ban_giao === 'Từ chối' ? '#dc2626' : '#a16207' }}>{customer.trang_thai_ban_giao || 'Chưa bàn giao'}</div>{canManage && status === 'Quan tâm' && customer.trang_thai_ban_giao !== 'Đã nhận' && <select className="form-select" style={{ marginTop: 6, minWidth: 160, fontSize: 11 }} value="" onChange={event => { if (event.target.value) void onHandoff(customer, 'handoff', event.target.value); }}><option value="">Chuyển cho Sale…</option>{sales.map(item => <option key={item.id_nhan_vien} value={item.ho_ten}>{item.ho_ten}</option>)}</select>}</td>
      <td><div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, flexWrap: 'wrap' }}>{(assignee || canManage) && customer.trang_thai_ban_giao !== 'Đã nhận' && <button className="btn btn-primary btn-sm" onClick={() => onInteraction(customer)}><Phone size={13} /> Cập nhật</button>}{(assignee || canManage) && <button className="btn btn-secondary btn-sm" onClick={() => onQualification(customer)}><BadgeCheck size={13} /> Qualification</button>}{receiver && customer.trang_thai_ban_giao === 'Chờ xác nhận' && <><button className="btn btn-primary btn-sm" onClick={() => void onHandoff(customer, 'accept')}><UserCheck size={13} /> Nhận khách</button><button className="btn btn-secondary btn-sm" onClick={() => void onHandoff(customer, 'reject')}><X size={13} /> Từ chối</button></>}<button className="btn btn-secondary btn-sm" onClick={() => onHistory(customer)}><History size={13} /> Lịch sử</button></div></td>
    </tr>;
  })}</tbody></table></div></div>;
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return <div className="modal-overlay" onClick={onClose}><div className="modal-content" style={{ maxWidth: 620 }} onClick={event => event.stopPropagation()}><div className="modal-header"><h3 className="modal-title">{title}</h3><button className="btn btn-ghost btn-icon" onClick={onClose}><X size={18} /></button></div>{children}</div></div>;
}
function HistoryModal({ customer, onClose }: { customer: KhachHang; onClose: () => void }) {
  const interactions = parseList<CrmChamSocEntry>(customer.lich_su_cham_soc).slice().reverse();
  const handoffs = parseList<CrmBanGiaoEntry>(customer.lich_su_ban_giao).slice().reverse();
  return <Modal title={`Lịch sử: ${customer.ten_KH}`} onClose={onClose}><div style={{ padding: 20, maxHeight: '70vh', overflowY: 'auto' }}><h4 style={{ margin: '0 0 10px', display: 'flex', gap: 7, alignItems: 'center' }}><Clock3 size={16} /> Chăm sóc ({interactions.length})</h4>{interactions.length === 0 ? <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Chưa có lần chăm sóc nào.</p> : interactions.map(item => <div key={item.id} style={{ borderLeft: '3px solid #60a5fa', padding: '2px 0 12px 12px', marginBottom: 8 }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}><strong style={{ fontSize: 13 }}>{item.ket_qua} · {item.muc_do_quan_tam}</strong><span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{localDate(item.thoi_gian)}</span></div><div style={{ fontSize: 12, color: 'var(--text-label)', marginTop: 3 }}>{item.nguoi_thuc_hien}</div>{item.ghi_chu && <div style={{ fontSize: 13, marginTop: 6, whiteSpace: 'pre-wrap' }}>{item.ghi_chu}</div>}{item.ngay_lien_he_tiep && <div style={{ fontSize: 11, color: '#a16207', marginTop: 5 }}>Hẹn lại: {localDate(item.ngay_lien_he_tiep)}</div>}</div>)}<h4 style={{ margin: '20px 0 10px', display: 'flex', gap: 7, alignItems: 'center' }}><Send size={16} /> Bàn giao ({handoffs.length})</h4>{handoffs.length === 0 ? <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Chưa có bàn giao.</p> : handoffs.map(item => <div key={item.id} style={{ borderLeft: '3px solid #34d399', padding: '2px 0 12px 12px', marginBottom: 8 }}><div style={{ display: 'flex', justifyContent: 'space-between' }}><strong style={{ fontSize: 13 }}>{item.hanh_dong}: {item.sale_nhan}</strong><span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{localDate(item.thoi_gian)}</span></div><div style={{ fontSize: 12, color: 'var(--text-label)', marginTop: 3 }}>Thực hiện bởi {item.nguoi_thuc_hien}</div>{item.ghi_chu && <div style={{ fontSize: 13, marginTop: 5 }}>{item.ghi_chu}</div>}</div>)}</div><div className="modal-footer"><button className="btn btn-primary" onClick={onClose}><Eye size={14} /> Đóng</button></div></Modal>;
}
