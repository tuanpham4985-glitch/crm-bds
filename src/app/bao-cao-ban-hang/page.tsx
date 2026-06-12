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

interface TinhTrangGiaoDichRow {
  du_an: string;
  ma_can: string;
  ngay_coc: string;
  ngay_ky_ttdc: string;
  ngay_ky_hdmb: string;
  lai_phat: number;           // % rate stored as decimal (0.0041 = 0.41%)
  lai_phat_phat_sinh: number; // monetary amount (VNĐ)
}

interface TonCocRow {
  du_an: string;
  ma_can: string;
  ngay_coc: string;
  so_tien: number;
  ngay_ky_thu_tuc: string;
  phuong_an_tt: string;
  tinh_trang: string;
  ghi_chu: string;
}

const PAGE_SIZE = 10;

// Normalize Vietnamese text to plain ASCII for comparison (mirrors normVi on server)
const normStr = (s: string) => (s || '').toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/\s+/g, '');

// Find the closest project name in external-sheet data for the given main-sheet project name.
// Tokenizes mainName and checks each token appears in the candidate (handles "Vinhomes Cần Giờ" → "Vinhomes Green Paradise Cần Giờ").
const findBestProjectMatch = (items: { du_an: string }[], mainName: string): string => {
  if (!mainName) return '';
  const tokens = mainName.split(/\s+/).map(normStr).filter(t => t.length > 2);
  if (tokens.length === 0) return mainName;
  const uniqueNames = [...new Set(items.map(r => r.du_an).filter(Boolean))];
  return uniqueNames.find(name => tokens.every(t => normStr(name).includes(t))) || mainName;
};

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

  // Tình trạng giao dịch
  const [tinhTrangGiaoDich, setTinhTrangGiaoDich] = useState<TinhTrangGiaoDichRow[]>([]);
  const [filterDuAnTTGD, setFilterDuAnTTGD] = useState('');

  // Tồn cọc
  const [tonCoc, setTonCoc] = useState<TonCocRow[]>([]);
  const [filterDuAnTonCoc, setFilterDuAnTonCoc] = useState('');

  const [secondaryLoaded, setSecondaryLoaded] = useState(false);

  // Pagination
  const [pagePipeline, setPagePipeline] = useState(1);
  const [pageTTGD, setPageTTGD] = useState(1);
  const [pageTonCoc, setPageTonCoc] = useState(1);

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
    // Load secondary data (don't block main table)
    try {
      const [ttgdRes, tcRes] = await Promise.all([
        fetch('/api/tinh-trang-giao-dich'),
        fetch('/api/ton-coc'),
      ]);
      const [ttgdData, tcData] = await Promise.all([ttgdRes.json(), tcRes.json()]);
      if (ttgdData.success) setTinhTrangGiaoDich(ttgdData.data);
      if (tcData.success) setTonCoc(tcData.data);
    } catch (err) {
      console.error('Secondary fetch error:', err);
    } finally {
      setSecondaryLoaded(true);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Reset pages on filter change
  useEffect(() => { setPagePipeline(1); }, [filterSale, filterDuAn]);
  useEffect(() => { setPageTTGD(1); }, [filterDuAnTTGD]);
  useEffect(() => { setPageTonCoc(1); }, [filterDuAnTonCoc]);

  // Sync new card filters when main project filter or secondary data changes.
  // Uses fuzzy token matching to handle name differences between sheets
  // (e.g. main sheet "Vinhomes Cần Giờ" → external sheet "Vinhomes Green Paradise Cần Giờ").
  useEffect(() => {
    if (filterDuAn && projects.length > 0) {
      const proj = projects.find(p => p.id_du_an === filterDuAn);
      if (proj) {
        setFilterDuAnTTGD(findBestProjectMatch(tinhTrangGiaoDich, proj.ten_du_an));
        setFilterDuAnTonCoc(findBestProjectMatch(tonCoc, proj.ten_du_an));
      }
    } else if (!filterDuAn) {
      setFilterDuAnTTGD('');
      setFilterDuAnTonCoc('');
    }
  }, [filterDuAn, projects, tinhTrangGiaoDich, tonCoc]);

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

  const renderPagination = (page: number, total: number, onPage: (p: number) => void) => {
    const totalPages = Math.ceil(total / PAGE_SIZE);
    if (totalPages <= 1) return null;
    const pages: (number | 'e')[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (page > 3) pages.push('e');
      for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i);
      if (page < totalPages - 2) pages.push('e');
      pages.push(totalPages);
    }
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 4, padding: '10px 16px', borderTop: '1px solid var(--border-lighter)', flexWrap: 'wrap' }}>
        <button className="btn btn-ghost btn-sm" disabled={page === 1} onClick={() => onPage(page - 1)} style={{ padding: '0 10px' }}>‹ Trước</button>
        {pages.map((p, i) => p === 'e' ? (
          <span key={`e${i}`} style={{ color: 'var(--text-muted)', padding: '0 2px' }}>…</span>
        ) : (
          <button key={p} onClick={() => onPage(p as number)} style={{
            minWidth: 30, height: 28, borderRadius: 6, border: p === page ? 'none' : '1px solid var(--border-light)',
            cursor: 'pointer', background: p === page ? 'var(--primary)' : 'transparent',
            color: p === page ? '#fff' : 'var(--text-body)', fontWeight: p === page ? 700 : 400, fontSize: '0.85rem',
          }}>{p}</button>
        ))}
        <button className="btn btn-ghost btn-sm" disabled={page === totalPages} onClick={() => onPage(page + 1)} style={{ padding: '0 10px' }}>Tiếp ›</button>
        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginLeft: 4 }}>
          {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} / {total}
        </span>
      </div>
    );
  };

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
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>

            {/* ══ 3 MỤC CHÍNH NỔI BẬT ══ */}
            <div style={{ display: 'flex', gap: 10, alignItems: 'stretch', flexWrap: 'wrap' }}>

              {/* 1. Số căn đã ký */}
              <div style={{
                background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                color: '#fff', borderRadius: 12, padding: '10px 18px',
                display: 'flex', alignItems: 'center', gap: 10,
                boxShadow: '0 4px 14px rgba(59,130,246,0.35)',
                minWidth: 0,
              }}>
                <span style={{ fontSize: '1.5rem', lineHeight: 1 }}>📊</span>
                <div style={{ lineHeight: 1.2 }}>
                  <div style={{ fontSize: '1.35rem', fontWeight: 800 }}>{filtered.length}</div>
                  <div style={{ fontSize: '0.72rem', opacity: 0.88, fontWeight: 500 }}>căn đã ký</div>
                </div>
              </div>

              {/* 2. Tổng giá trị */}
              <div style={{
                background: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)',
                color: '#fff', borderRadius: 12, padding: '10px 18px',
                display: 'flex', alignItems: 'center', gap: 10,
                boxShadow: '0 4px 14px rgba(109,40,217,0.32)',
                minWidth: 0,
              }}>
                <span style={{ fontSize: '1.5rem', lineHeight: 1 }}>💰</span>
                <div style={{ lineHeight: 1.2 }}>
                  <div style={{ fontSize: '1.1rem', fontWeight: 800 }}>{formatCurrency(totalValue, false)}</div>
                  <div style={{ fontSize: '0.72rem', opacity: 0.88, fontWeight: 500 }}>Tổng giá trị</div>
                </div>
              </div>

              {/* 3. Tổng lợi nhuận — Admin only */}
              {canViewProfit && (
                <div style={{
                  background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                  color: '#fff', borderRadius: 12, padding: '10px 18px',
                  display: 'flex', alignItems: 'center', gap: 10,
                  boxShadow: '0 4px 14px rgba(217,119,6,0.35)',
                  minWidth: 0,
                }}>
                  <span style={{ fontSize: '1.5rem', lineHeight: 1 }}>💎</span>
                  <div style={{ lineHeight: 1.2 }}>
                    <div style={{ fontSize: '1.1rem', fontWeight: 800 }}>{formatCurrency(totalProfit, false)}</div>
                    <div style={{ fontSize: '0.72rem', opacity: 0.88, fontWeight: 500 }}>Tổng lợi nhuận</div>
                  </div>
                </div>
              )}
            </div>

            {/* Divider */}
            <div style={{ width: 1, height: 36, background: 'var(--border-light)', flexShrink: 0 }} />

            {/* ══ CÁC MỤC PHỤ (nhỏ hơn) ══ */}

            {/* Hoa hồng */}
            {(showPhiTraSale || showPhiTraGDDA || showPhiTraGDKD) && (
              <span style={chipStyle('rgba(16,185,129,0.08)', '#059669', 'rgba(16,185,129,0.18)')}>
                <span style={{ fontSize: '1rem' }}>💵</span>
                {isAllVisible ? 'Tổng hoa hồng' : 'Hoa hồng'}: <strong>{formatCurrency(personalCommission, false)}</strong>
              </span>
            )}

            {/* Thưởng nóng */}
            {showThuongNong && (
              <span style={chipStyle('rgba(239,68,68,0.08)', '#dc2626', 'rgba(239,68,68,0.18)')}>
                <span style={{ fontSize: '1rem' }}>🔥</span>
                {isAllVisible ? 'Tổng thưởng nóng' : 'Thưởng nóng'}: <strong>{formatCurrency(personalHotBonus, false)}</strong>
              </span>
            )}

            {/* Phí TKKD */}
            {showPhiTKKD && (
              <span style={chipStyle('rgba(139,92,246,0.08)', '#7c3aed', 'rgba(139,92,246,0.18)')}>
                <span style={{ fontSize: '1rem' }}>💜</span>
                {isAllVisible ? 'Tổng phí TKKD' : 'Phí TKKD'}: <strong>{formatCurrency(personalPhiTKKD, false)}</strong>
              </span>
            )}

            {/* Admin-only cost chips */}
            {canViewProfit && (
              <>
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
              {filtered.slice((pagePipeline - 1) * PAGE_SIZE, pagePipeline * PAGE_SIZE).map((pl, idx) => {
                const idx_display = (pagePipeline - 1) * PAGE_SIZE + idx;
                const colors = GIAI_DOAN_COLORS[pl.giai_doan] || { bg: '#f1f5f9', text: '#475569' };
                return (
                  <tr key={pl.id_pipeline}>
                    <td style={{ color: 'var(--text-label)' }}>{idx_display + 1}</td>
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
        {renderPagination(pagePipeline, filtered.length, setPagePipeline)}
      </div>

      {/* ── Tình trạng giao dịch ── */}
      {(() => {
        const ttgdProjects = [...new Set(tinhTrangGiaoDich.map(r => r.du_an).filter(Boolean))].sort();
        const filteredTTGD = filterDuAnTTGD
          ? tinhTrangGiaoDich.filter(r => r.du_an === filterDuAnTTGD)
          : tinhTrangGiaoDich;
        const pagedTTGD = filteredTTGD.slice((pageTTGD - 1) * PAGE_SIZE, pageTTGD * PAGE_SIZE);
        return (
          <div style={{ marginTop: 28 }}>
            <div className="card" style={{ padding: 0 }}>
              <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-title)', margin: 0 }}>
                    Tình trạng giao dịch
                  </h2>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '2px 0 0' }}>
                    Ngày cọc · Ngày ký TTĐC/VBTT · Ngày ký HĐMB · % Lãi phạt · Lãi phạt phát sinh
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <select
                    className="form-select"
                    value={filterDuAnTTGD}
                    onChange={e => setFilterDuAnTTGD(e.target.value)}
                    style={{ minWidth: 200 }}
                  >
                    <option value="">Tất cả dự án ({tinhTrangGiaoDich.length} giao dịch)</option>
                    {ttgdProjects.map(da => {
                      const count = tinhTrangGiaoDich.filter(r => r.du_an === da).length;
                      return <option key={da} value={da}>{da} ({count})</option>;
                    })}
                  </select>
                  {filterDuAnTTGD && (
                    <button className="btn btn-ghost btn-sm" onClick={() => setFilterDuAnTTGD('')}>
                      <X size={13} /> Xóa
                    </button>
                  )}
                </div>
              </div>
              <div className="table-wrapper">
                <table className="data-table" style={{ minWidth: 680 }}>
                  <thead>
                    <tr>
                      <th>#</th>
                      {!filterDuAnTTGD && <th>Dự án</th>}
                      <th>Mã căn</th>
                      <th>Ngày cọc</th>
                      <th>Ngày ký TTĐC/VBTT</th>
                      <th>Ngày ký HĐMB</th>
                      <th style={{ textAlign: 'right' }}>% Lãi phạt</th>
                      <th style={{ textAlign: 'right' }}>Lãi phạt phát sinh</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTTGD.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="empty-state">
                          <h3>{!secondaryLoaded ? 'Đang tải dữ liệu...' : 'Không có giao dịch nào'}</h3>
                        </td>
                      </tr>
                    ) : pagedTTGD.map((r, idx) => {
                      const displayIdx = (pageTTGD - 1) * PAGE_SIZE + idx;
                      return (
                      <tr key={`${r.du_an}-${r.ma_can}-${displayIdx}`}>
                        <td style={{ color: 'var(--text-label)' }}>{displayIdx + 1}</td>
                        {!filterDuAnTTGD && <td style={{ fontWeight: 500 }}>{r.du_an || '—'}</td>}
                        <td style={{ fontWeight: 600, color: 'var(--text-title)' }}>{r.ma_can || '—'}</td>
                        <td>{r.ngay_coc ? formatDate(r.ngay_coc) : '—'}</td>
                        <td>{r.ngay_ky_ttdc ? formatDate(r.ngay_ky_ttdc) : <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                        <td>{r.ngay_ky_hdmb ? formatDate(r.ngay_ky_hdmb) : <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                        <td style={{ textAlign: 'right', color: r.lai_phat > 0 ? '#dc2626' : 'var(--text-muted)', fontWeight: r.lai_phat > 0 ? 600 : 400 }}>
                          {r.lai_phat > 0 ? (r.lai_phat * 100).toFixed(2).replace(/\.?0+$/, '') + '%' : '—'}
                        </td>
                        <td style={{ textAlign: 'right', color: r.lai_phat_phat_sinh > 0 ? '#dc2626' : 'var(--text-muted)', fontWeight: r.lai_phat_phat_sinh > 0 ? 600 : 400 }}>
                          {r.lai_phat_phat_sinh > 0 ? formatCurrency(r.lai_phat_phat_sinh) : '—'}
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {renderPagination(pageTTGD, filteredTTGD.length, setPageTTGD)}
            </div>
          </div>
        );
      })()}

      {/* ── Tồn cọc ── */}
      {(() => {
        const tonCocProjects = [...new Set(tonCoc.map(r => r.du_an).filter(Boolean))].sort();
        const filteredTonCoc = filterDuAnTonCoc
          ? tonCoc.filter(r => r.du_an === filterDuAnTonCoc)
          : tonCoc;
        const pagedTonCoc = filteredTonCoc.slice((pageTonCoc - 1) * PAGE_SIZE, pageTonCoc * PAGE_SIZE);
        const totalTonCoc = filteredTonCoc.reduce((s, r) => s + (r.so_tien || 0), 0);
        return (
          <div style={{ marginTop: 28, marginBottom: 32 }}>
            <div className="card" style={{ padding: 0 }}>
              <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-title)', margin: 0 }}>
                    Tồn cọc
                  </h2>
                  <div style={{ display: 'flex', gap: 10, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={chipStyle('rgba(239,68,68,0.08)', '#dc2626', 'rgba(239,68,68,0.2)')}>
                      💰 Tổng tồn: <strong>{formatCurrency(totalTonCoc, false)}</strong>
                    </span>
                    <span style={chipStyle('#f1f5f9', '#475569')}>
                      {filteredTonCoc.length} căn
                    </span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <select
                    className="form-select"
                    value={filterDuAnTonCoc}
                    onChange={e => setFilterDuAnTonCoc(e.target.value)}
                    style={{ minWidth: 200 }}
                  >
                    <option value="">Tất cả dự án ({tonCoc.length} căn)</option>
                    {tonCocProjects.map(da => {
                      const count = tonCoc.filter(r => r.du_an === da).length;
                      const total = tonCoc.filter(r => r.du_an === da).reduce((s, r) => s + r.so_tien, 0);
                      return (
                        <option key={da} value={da}>
                          {da} ({count} căn · {formatCurrency(total, false)})
                        </option>
                      );
                    })}
                  </select>
                  {filterDuAnTonCoc && (
                    <button className="btn btn-ghost btn-sm" onClick={() => setFilterDuAnTonCoc('')}>
                      <X size={13} /> Xóa
                    </button>
                  )}
                </div>
              </div>
              <div className="table-wrapper">
                <table className="data-table" style={{ minWidth: 820 }}>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Mã căn</th>
                      {!filterDuAnTonCoc && <th>Dự án</th>}
                      <th>Ngày cọc</th>
                      <th style={{ textAlign: 'right' }}>Số tiền cọc</th>
                      <th>Ngày ký thủ tục</th>
                      <th>Phương án TT</th>
                      <th>Tình trạng</th>
                      <th>Ghi chú</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTonCoc.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="empty-state">
                          <h3>{!secondaryLoaded ? 'Đang tải dữ liệu...' : 'Không có căn nào tồn cọc'}</h3>
                        </td>
                      </tr>
                    ) : pagedTonCoc.map((r, idx) => {
                      const displayIdx = (pageTonCoc - 1) * PAGE_SIZE + idx;
                      return (
                      <tr key={`${r.du_an}-${r.ma_can}-${displayIdx}`}>
                        <td style={{ color: 'var(--text-label)' }}>{displayIdx + 1}</td>
                        <td style={{ fontWeight: 600, color: 'var(--text-title)' }}>{r.ma_can || '—'}</td>
                        {!filterDuAnTonCoc && <td style={{ fontWeight: 500 }}>{r.du_an || '—'}</td>}
                        <td>{r.ngay_coc ? formatDate(r.ngay_coc) : '—'}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--primary)' }}>
                          {formatCurrency(r.so_tien)}
                        </td>
                        <td>{r.ngay_ky_thu_tuc ? formatDate(r.ngay_ky_thu_tuc) : <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                        <td style={{ fontSize: '0.82rem', color: 'var(--text-body)' }}>{r.phuong_an_tt || '—'}</td>
                        <td>
                          {r.tinh_trang ? (
                            <span className="badge" style={{ background: 'rgba(251,191,36,0.12)', color: '#b45309' }}>
                              {r.tinh_trang}
                            </span>
                          ) : '—'}
                        </td>
                        <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)', maxWidth: 180 }}>{r.ghi_chu || ''}</td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {renderPagination(pageTonCoc, filteredTonCoc.length, setPageTonCoc)}
            </div>
          </div>
        );
      })()}

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
