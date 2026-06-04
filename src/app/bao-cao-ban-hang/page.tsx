'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import {
  SlidersHorizontal, X, Eye, ClipboardList,
  CheckCircle2, Circle, Clock, XCircle,
} from 'lucide-react';
import type { Pipeline, KhachHang, DuAn, NhanVien, CongViec } from '@/lib/types';
import { formatCurrency, formatDate } from '@/lib/utils';
import { GIAI_DOAN_COLORS, SENIOR_EMPLOYEE_TYPES } from '@/lib/constants';

const TASK_STATUS: Record<string, { bg: string; text: string; border: string }> = {
  'Chưa xử lý': { bg: '#fef3c7', text: '#92400e', border: '#fcd34d' },
  'Đang xử lý':  { bg: '#dbeafe', text: '#1e40af', border: '#93c5fd' },
  'Hoàn thành':  { bg: '#d1fae5', text: '#065f46', border: '#6ee7b7' },
  'Huỷ':         { bg: '#f1f5f9', text: '#64748b', border: '#cbd5e1' },
};

export default function BaoCaoBanHangPage() {
  const { user } = useAuth();
  const isAllVisible = user && (
    user.vai_tro === 'Admin' ||
    (SENIOR_EMPLOYEE_TYPES as readonly string[]).includes(user.employee_type || '')
  );

  let showPhiTraSale = isAllVisible || user?.employee_type === 'NVKD';
  let showPhiTraGDDA = isAllVisible || user?.employee_type === 'GDDA';
  let showPhiTraGDKD = isAllVisible || user?.employee_type === 'GĐKD';
  let showThuongNong = isAllVisible || user?.employee_type === 'NVKD';
  const canViewProfit = isAllVisible;
  const showKhachHang = isAllVisible;

  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [customers, setCustomers] = useState<KhachHang[]>([]);
  const [projects, setProjects] = useState<DuAn[]>([]);
  const [employees, setEmployees] = useState<NhanVien[]>([]);
  const [loading, setLoading] = useState(true);

  const [filterSale, setFilterSale] = useState('');
  const [filterDuAn, setFilterDuAn] = useState('');

  // View detail modal
  const [showViewModal, setShowViewModal] = useState(false);
  const [viewingItem, setViewingItem] = useState<Pipeline | null>(null);

  // Task drawer
  const [selectedDeal, setSelectedDeal] = useState<Pipeline | null>(null);
  const [tasks, setTasks] = useState<CongViec[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [plRes, khRes, daRes, nvRes] = await Promise.all([
        fetch('/api/pipeline?' + new URLSearchParams({ giai_doan: 'Ký HĐ' })),
        fetch('/api/khach-hang?limit=999'),
        fetch('/api/du-an'),
        fetch('/api/nhan-vien'),
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

  const getCustomerName = (pl: Pipeline) => {
    if (pl.ho_ten_kh) return pl.ho_ten_kh;
    const kh = customers.find(k => k.id_khach_hang === pl.id_khach_hang);
    return kh?.ten_KH || '—';
  };

  const filtered = pipelines.filter(pl => {
    if (filterSale) {
      const participates =
        pl.sale_phu_trach === filterSale ||
        (pl.gdda || '') === filterSale ||
        (pl.gdkd || '') === filterSale ||
        (pl.tkkd || '') === filterSale;
      if (!participates) return false;
    }
    if (filterDuAn && pl.id_du_an !== filterDuAn) return false;
    return true;
  });

  // Dual-role detection — mở rộng cột dựa trên vai trò thực tế trong data
  if (!isAllVisible && user?.ho_ten) {
    if (pipelines.some(pl => pl.sale_phu_trach === user.ho_ten)) { showPhiTraSale = true; showThuongNong = true; }
    if (pipelines.some(pl => (pl.gdda || '') === user.ho_ten)) showPhiTraGDDA = true;
    if (pipelines.some(pl => (pl.gdkd || '') === user.ho_ten)) showPhiTraGDKD = true;
  }

  // ── KPI chips ──
  const totalValue = filtered.reduce((s, pl) => {
    if (isAllVisible) { if (filterSale && pl.sale_phu_trach !== filterSale) return s; }
    else { if (pl.sale_phu_trach !== user?.ho_ten) return s; }
    return s + (pl.gia_tri_thuc_te || 0);
  }, 0);

  const personalCommission = filtered.reduce((s, pl) => {
    if (isAllVisible) return s + (pl.phi_tra_sale || 0);
    let earned = 0;
    if (pl.sale_phu_trach === user?.ho_ten) earned += (pl.phi_tra_sale || 0);
    if (pl.gdda            === user?.ho_ten) earned += (pl.phi_tra_gdda || 0);
    if (pl.gdkd            === user?.ho_ten) earned += (pl.phi_tra_gdkd || 0);
    return s + earned;
  }, 0);

  const personalHotBonus = filtered.reduce((s, pl) => {
    if (isAllVisible) return s + (pl.thuong_nong || 0);
    if (pl.sale_phu_trach === user?.ho_ten) return s + (pl.thuong_nong || 0);
    return s;
  }, 0);

  const personalPhiTKKD = filtered.reduce((s, pl) => {
    if (isAllVisible) return s + (pl.phi_tkkd || 0);
    if (user?.employee_type === 'TKKD' && pl.tkkd === user.ho_ten) return s + (pl.phi_tkkd || 0);
    return s;
  }, 0);

  const totalProfit    = filtered.reduce((s, pl) => s + (pl.loi_nhuan    || 0), 0);
  const totalPhiTraKH  = filtered.reduce((s, pl) => s + (pl.phi_tra_kh  || 0), 0);
  const totalPhiTraGDDA = filtered.reduce((s, pl) => s + (pl.phi_tra_gdda || 0), 0);
  const totalPhiTraGDKD = filtered.reduce((s, pl) => s + (pl.phi_tra_gdkd || 0), 0);
  const totalPhiTraMKT  = filtered.reduce((s, pl) => s + (pl.phi_tra_mkt  || 0), 0);

  const tableMaCan    = filtered.some(pl => pl.ma_can);
  const tablePhiGDDA  = showPhiTraGDDA && !isAllVisible;
  const tablePhiGDKD  = showPhiTraGDKD && !isAllVisible;
  const showPhiTKKD   = isAllVisible || user?.employee_type === 'TKKD';

  // Task drawer
  const fetchTasks = async (id_pipeline: string) => {
    setLoadingTasks(true);
    try {
      const res = await fetch(`/api/cong-viec?pipeline=${id_pipeline}`);
      const data = await res.json();
      if (data.success) setTasks(data.data);
    } catch (err) { console.error(err); }
    finally { setLoadingTasks(false); }
  };

  const openTaskPanel = (pl: Pipeline) => {
    setSelectedDeal(pl);
    fetchTasks(pl.id_pipeline);
  };

  const closeTaskPanel = () => { setSelectedDeal(null); setTasks([]); };

  const handleQuickStatus = async (cv: CongViec, newStatus: string) => {
    await fetch('/api/cong-viec', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...cv, trang_thai: newStatus }),
    });
    if (selectedDeal) fetchTasks(selectedDeal.id_pipeline);
  };

  if (loading) return <div className="loading-spinner"><div className="spinner" /></div>;

  const chipStyle = (bg: string, color: string, border?: string) => ({
    background: bg, color,
    padding: '6px 15px', borderRadius: '14px',
    fontWeight: 700, fontSize: '0.88rem',
    display: 'inline-flex', alignItems: 'center', gap: '6px',
    border: `1px solid ${border || 'transparent'}`,
    boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
  });

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div className="page-header-left">
          <h1>Báo cáo bán hàng</h1>
          <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: 2, marginBottom: 8 }}>
            Tổng hợp các căn đã ký hợp đồng
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            {/* Số deal */}
            <span style={chipStyle('#f1f5f9', '#334155')}>
              <span style={{ fontSize: '1.15rem' }}>📊</span> {filtered.length} căn đã ký
            </span>

            {/* Tổng giá trị */}
            <span style={chipStyle('rgba(99,102,241,0.08)', '#4f46e5', 'rgba(99,102,241,0.15)')}>
              <span style={{ fontSize: '1.15rem' }}>💰</span>
              Tổng giá trị: <strong>{formatCurrency(totalValue, false)}</strong>
            </span>

            {/* Hoa hồng */}
            {(showPhiTraSale || showPhiTraGDDA || showPhiTraGDKD) && (
              <span style={chipStyle('rgba(16,185,129,0.08)', '#059669', 'rgba(16,185,129,0.15)')}>
                <span style={{ fontSize: '1.15rem' }}>💵</span>
                {isAllVisible ? 'Tổng hoa hồng' : 'Hoa hồng cá nhân'}: <strong>{formatCurrency(personalCommission, false)}</strong>
              </span>
            )}

            {/* Thưởng nóng */}
            {showThuongNong && (
              <span style={chipStyle('rgba(239,68,68,0.08)', '#dc2626', 'rgba(239,68,68,0.15)')}>
                <span style={{ fontSize: '1.15rem' }}>🔥</span>
                {isAllVisible ? 'Tổng thưởng nóng' : 'Thưởng nóng cá nhân'}: <strong>{formatCurrency(personalHotBonus, false)}</strong>
              </span>
            )}

            {/* Phí TKKD */}
            {showPhiTKKD && (
              <span style={chipStyle('rgba(139,92,246,0.08)', '#7c3aed', 'rgba(139,92,246,0.15)')}>
                <span style={{ fontSize: '1.15rem' }}>💜</span>
                {isAllVisible ? 'Tổng phí TKKD' : 'Phí TKKD cá nhân'}: <strong>{formatCurrency(personalPhiTKKD, false)}</strong>
              </span>
            )}

            {/* Lợi nhuận & chi phí — Admin only */}
            {canViewProfit && (
              <>
                <span style={chipStyle('rgba(212,175,55,0.15)', '#b45309', 'rgba(212,175,55,0.45)')}>
                  <span style={{ fontSize: '1.15rem' }}>💎</span>
                  Tổng lợi nhuận: <strong style={{ color: '#d97706' }}>{formatCurrency(totalProfit, false)}</strong>
                </span>
                {totalPhiTraKH > 0 && (
                  <span style={chipStyle('rgba(139,92,246,0.08)', '#6d28d9', 'rgba(139,92,246,0.18)')}>
                    🏷️ Phí trả KH: <strong>{formatCurrency(totalPhiTraKH, false)}</strong>
                  </span>
                )}
                {totalPhiTraGDDA > 0 && (
                  <span style={chipStyle('rgba(59,130,246,0.08)', '#1d4ed8', 'rgba(59,130,246,0.18)')}>
                    🏗️ Phí GDDA: <strong>{formatCurrency(totalPhiTraGDDA, false)}</strong>
                  </span>
                )}
                {totalPhiTraGDKD > 0 && (
                  <span style={chipStyle('rgba(245,158,11,0.08)', '#b45309', 'rgba(245,158,11,0.18)')}>
                    👔 Phí GĐKD: <strong>{formatCurrency(totalPhiTraGDKD, false)}</strong>
                  </span>
                )}
                {totalPhiTraMKT > 0 && (
                  <span style={chipStyle('rgba(236,72,153,0.08)', '#be185d', 'rgba(236,72,153,0.18)')}>
                    📣 Phí MKT: <strong>{formatCurrency(totalPhiTraMKT, false)}</strong>
                  </span>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="filter-bar">
        <div className="flex items-center gap-2">
          <SlidersHorizontal size={14} style={{ color: 'var(--text-label)' }} />
          <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', fontWeight: 500 }}>Lọc:</span>
        </div>
        {isAllVisible && (
          <select className="form-select" value={filterSale} onChange={e => setFilterSale(e.target.value)}>
            <option value="">Tất cả nhân sự</option>
            {employees.map(nv => <option key={nv.id_nhan_vien} value={nv.ho_ten}>{nv.ho_ten}</option>)}
          </select>
        )}
        <select className="form-select" value={filterDuAn} onChange={e => setFilterDuAn(e.target.value)}>
          <option value="">Tất cả dự án</option>
          {projects.map(da => <option key={da.id_du_an} value={da.id_du_an}>{da.ten_du_an}</option>)}
        </select>
        {(filterSale || filterDuAn) && (
          <button className="btn btn-ghost btn-sm" onClick={() => { setFilterSale(''); setFilterDuAn(''); }}>
            <X size={14} /> Xóa lọc
          </button>
        )}
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrapper" style={{ borderRadius: 'var(--radius-xl)', overflow: 'visible' }}>
          <table className="data-table" style={{ minWidth: '850px' }}>
            <thead>
              <tr>
                <th>#</th>
                {showKhachHang && <th>Khách hàng</th>}
                {tableMaCan && <th>Mã căn</th>}
                <th>Giai đoạn</th>
                <th>Dự án</th>
                <th style={{ textAlign: 'right' }}>Giá trị</th>
                {showPhiTraSale && <th style={{ textAlign: 'right' }}>Phí trả sale</th>}
                {tablePhiGDDA  && <th style={{ textAlign: 'right' }}>Phí trả GDDA</th>}
                {tablePhiGDKD  && <th style={{ textAlign: 'right' }}>Phí trả GĐKD</th>}
                {showThuongNong && <th style={{ textAlign: 'right' }}>Thưởng nóng</th>}
                <th>Sale</th>
                <th style={{ width: 80, textAlign: 'center' }}>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((pl, idx) => {
                const colors = GIAI_DOAN_COLORS[pl.giai_doan] || { bg: '#f1f5f9', text: '#475569' };
                return (
                  <tr key={pl.id_pipeline}>
                    <td style={{ color: 'var(--text-label)' }}>{idx + 1}</td>
                    {showKhachHang && (
                      <td style={{ fontWeight: 500, color: 'var(--text-title)' }}>
                        {getCustomerName(pl)}
                      </td>
                    )}
                    {tableMaCan && (
                      <td style={{ color: 'var(--text-label)', fontSize: '0.82rem', fontWeight: 500 }}>
                        {pl.ma_can || '—'}
                      </td>
                    )}
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
                    {tablePhiGDDA && (
                      <td style={{ textAlign: 'right', color: 'var(--primary-text)', fontWeight: 600 }}>
                        {pl.gdda === user?.ho_ten ? formatCurrency(pl.phi_tra_gdda || 0) : '—'}
                      </td>
                    )}
                    {tablePhiGDKD && (
                      <td style={{ textAlign: 'right', color: '#b45309', fontWeight: 600 }}>
                        {pl.gdkd === user?.ho_ten ? formatCurrency(pl.phi_tra_gdkd || 0) : '—'}
                      </td>
                    )}
                    {showThuongNong && (
                      <td style={{ textAlign: 'right', color: '#dc2626', fontWeight: 600 }}>
                        {isAllVisible || pl.sale_phu_trach === user?.ho_ten
                          ? formatCurrency(pl.thuong_nong || 0)
                          : '—'}
                      </td>
                    )}

                    <td style={{ color: 'var(--primary-text)', fontWeight: 500 }}>{pl.sale_phu_trach || '—'}</td>
                    <td>
                      <div className="flex items-center gap-2" style={{ justifyContent: 'center' }}>
                        <button
                          className="btn btn-ghost btn-icon btn-sm"
                          title="Xem chi tiết"
                          style={{ color: 'var(--primary)' }}
                          onClick={() => { setViewingItem(pl); setShowViewModal(true); }}
                        >
                          <Eye size={15} />
                        </button>
                        <button
                          className="btn btn-ghost btn-icon btn-sm"
                          title="Công việc"
                          style={{ color: selectedDeal?.id_pipeline === pl.id_pipeline ? 'var(--primary)' : undefined }}
                          onClick={() => selectedDeal?.id_pipeline === pl.id_pipeline ? closeTaskPanel() : openTaskPanel(pl)}
                        >
                          <ClipboardList size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={20} className="empty-state">
                    <h3>Chưa có căn nào ký hợp đồng</h3>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* View Detail Modal */}
      {showViewModal && viewingItem && (
        <div className="modal-overlay" onClick={() => setShowViewModal(false)}>
          <div className="modal-content" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Chi tiết deal — {viewingItem.ma_can || viewingItem.id_pipeline}</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowViewModal(false)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              {([
                ['Khách hàng',    getCustomerName(viewingItem)],
                ['Mã căn',        viewingItem.ma_can],
                ['Loại căn',      viewingItem.loai_can],
                ['Dự án',         viewingItem.ten_du_an],
                ['Giai đoạn',     viewingItem.giai_doan],
                ['Giá trị TT',    formatCurrency(viewingItem.gia_tri_thuc_te)],
                ['Hoa hồng',      viewingItem.hoa_hong ? `${(viewingItem.hoa_hong * 100).toFixed(2)}%` : '—'],
                ['Tiền HH',       formatCurrency(viewingItem.tien_hoa_hong || 0)],
                ['Thưởng nóng',   formatCurrency(viewingItem.thuong_nong || 0)],
                ['Phí trả sale',  formatCurrency(viewingItem.phi_tra_sale || 0)],
                ['Phí trả KH',    formatCurrency(viewingItem.phi_tra_kh || 0)],
                ['Phí GDDA',      formatCurrency(viewingItem.phi_tra_gdda || 0)],
                ['Phí GĐKD',      formatCurrency(viewingItem.phi_tra_gdkd || 0)],
                ['Lợi nhuận',     formatCurrency(viewingItem.loi_nhuan || 0)],
                ['Sale phụ trách',viewingItem.sale_phu_trach],
                ['GDDA',          viewingItem.gdda],
                ['GĐKD',          viewingItem.gdkd],
                ['TKKD',          viewingItem.tkkd],
                ['Ngày ký',       viewingItem.ngay_cap_nhat ? formatDate(viewingItem.ngay_cap_nhat) : '—'],
                ['Tháng',         viewingItem.thang],
              ] as [string, string | undefined][]).filter(([, v]) => v && v !== '0' && v !== '0 ₫').map(([label, value]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border-lighter)', gap: 12 }}>
                  <span style={{ fontSize: '0.8125rem', color: 'var(--text-label)', fontWeight: 500, flexShrink: 0 }}>{label}</span>
                  <span style={{ fontSize: '0.8125rem', color: 'var(--text-title)', fontWeight: 600, textAlign: 'right' }}>{value || '—'}</span>
                </div>
              ))}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowViewModal(false)}>Đóng</button>
            </div>
          </div>
        </div>
      )}

      {/* Task Drawer */}
      {selectedDeal && (
        <>
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 200 }} onClick={closeTaskPanel} />
          <div style={{
            position: 'fixed', top: 0, right: 0, bottom: 0, width: 420, maxWidth: '100vw',
            background: '#ffffff', borderLeft: '1px solid #e2e8f0',
            boxShadow: '-8px 0 40px rgba(15,23,42,0.18)', zIndex: 201,
            display: 'flex', flexDirection: 'column',
          }}>
            <div style={{ padding: '18px 20px 14px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <ClipboardList size={14} color="var(--primary)" />
                    <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-label)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Công việc theo dõi deal</span>
                  </div>
                  <div style={{ fontWeight: 700, fontSize: '0.975rem', color: 'var(--text-title)', marginBottom: 8 }}>
                    {getCustomerName(selectedDeal)}
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {selectedDeal.ten_du_an && <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>📍 {selectedDeal.ten_du_an}</span>}
                    {selectedDeal.ma_can && <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>🏠 {selectedDeal.ma_can}</span>}
                    {selectedDeal.sale_phu_trach && <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>👤 {selectedDeal.sale_phu_trach}</span>}
                  </div>
                </div>
                <button className="btn btn-ghost btn-icon btn-sm" onClick={closeTaskPanel}><X size={17} /></button>
              </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px' }}>
              {loadingTasks ? (
                <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>Đang tải...</div>
              ) : tasks.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                  Chưa có công việc nào
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {tasks.map(cv => {
                    const st = TASK_STATUS[cv.trang_thai] || TASK_STATUS['Chưa xử lý'];
                    const isDone = cv.trang_thai === 'Hoàn thành';
                    const isCancel = cv.trang_thai === 'Huỷ';
                    return (
                      <div key={cv.id_cong_viec} style={{
                        border: `1px solid ${st.border}`,
                        borderRadius: 10, padding: '12px 14px',
                        background: isDone || isCancel ? '#fafafa' : '#fff',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                          <button
                            onClick={() => handleQuickStatus(cv, isDone ? 'Chưa xử lý' : 'Hoàn thành')}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginTop: 1, flexShrink: 0 }}
                          >
                            {isDone ? <CheckCircle2 size={18} color="#059669" /> :
                             isCancel ? <XCircle size={18} color="#94a3b8" /> :
                             <Circle size={18} color="#94a3b8" />}
                          </button>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '0.875rem', fontWeight: 600, color: isDone || isCancel ? 'var(--text-muted)' : 'var(--text-title)', textDecoration: isDone ? 'line-through' : 'none' }}>
                              {cv.ghi_chu || '(Không có mô tả)'}
                            </div>
                            <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                              <span style={{ fontSize: '0.72rem', background: st.bg, color: st.text, borderRadius: 6, padding: '1px 7px', fontWeight: 600 }}>
                                {cv.trang_thai}
                              </span>
                              {cv.ngay_hen && (
                                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 3 }}>
                                  <Clock size={10} /> {formatDate(cv.ngay_hen)}
                                </span>
                              )}
                            </div>
                            {cv.ket_qua && (
                              <div style={{ marginTop: 6, fontSize: '0.78rem', color: 'var(--text-body)', background: '#f8fafc', borderRadius: 6, padding: '4px 8px' }}>
                                {cv.ket_qua}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
