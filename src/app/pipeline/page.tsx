'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import {
  Plus, Edit3, Trash2, X,
  SlidersHorizontal, ClipboardList,
  CheckCircle2, Circle, Clock, XCircle, Eye,
} from 'lucide-react';
import type { Pipeline, KhachHang, DuAn, NhanVien, CongViec } from '@/lib/types';
import { formatCurrency, formatDate } from '@/lib/utils';
import { GIAI_DOAN_PIPELINE, GIAI_DOAN_ACTIVE, GIAI_DOAN_COLORS, SENIOR_EMPLOYEE_TYPES } from '@/lib/constants';

const TASK_STATUS: Record<string, { bg: string; text: string; border: string }> = {
  'Chưa xử lý': { bg: '#fef3c7', text: '#92400e', border: '#fcd34d' },
  'Đang xử lý':  { bg: '#dbeafe', text: '#1e40af', border: '#93c5fd' },
  'Hoàn thành':  { bg: '#d1fae5', text: '#065f46', border: '#6ee7b7' },
  'Huỷ':         { bg: '#f1f5f9', text: '#64748b', border: '#cbd5e1' },
};

// Chuyển tỷ lệ thập phân (0.04) thành % (4) để hiển thị trong input
function toPercent(v: number | undefined | string): number {
  const n = Number(v) || 0;
  if (n === 0) return 0;
  // Nếu đã ở dạng % (> 1), giữ nguyên; nếu dạng thập phân (≤ 1), nhân 100
  return n > 1 ? +n.toFixed(4) : +(n * 100).toFixed(4);
}

// Chuyển bất kỳ định dạng ngày nào (ISO, DD/MM/YYYY, v.v.) thành chuỗi YYYY-MM-DD cho <input type="date">
function safeToDateInput(raw: string): string {
  if (!raw) return new Date().toISOString().split('T')[0];
  const d = new Date(raw);
  if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
  // Thử DD/MM/YYYY hoặc DD-MM-YYYY
  const m = raw.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/);
  if (m) {
    const d2 = new Date(`${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`);
    if (!isNaN(d2.getTime())) return d2.toISOString().split('T')[0];
  }
  return new Date().toISOString().split('T')[0];
}

function PipelineContent() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const isAllVisible = user && (
    user.vai_tro === 'Admin' ||
    (SENIOR_EMPLOYEE_TYPES as readonly string[]).includes(user.employee_type || '')
  );

  const canViewProfit = isAllVisible;
  const showKhachHang = isAllVisible;

  // Base visibility from primary employee_type — may be extended below after pipelines load
  let showPhiTraSale = isAllVisible || (user?.employee_type === 'NVKD');
  let showPhiTraGDDA = isAllVisible || (user?.employee_type === 'GDDA');
  let showPhiTraGDKD = isAllVisible || (user?.employee_type === 'GĐKD');
  let showThuongNong = isAllVisible || (user?.employee_type === 'NVKD');
  const showPhiTKKD  = isAllVisible || (user?.employee_type === 'TKKD');

  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [customers, setCustomers] = useState<KhachHang[]>([]);
  const [projects, setProjects] = useState<DuAn[]>([]);
  const [employees, setEmployees] = useState<NhanVien[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [filterSale, setFilterSale] = useState('');
  const [filterDuAn, setFilterDuAn] = useState('');
  // filterKH: id_khach_hang — được set từ URL param ?kh=... (điều hướng từ trang Khách hàng)
  const [filterKH, setFilterKH] = useState(() => searchParams.get('kh') || '');

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<Pipeline | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [deletingId, setDeletingId] = useState('');
  const [saving, setSaving] = useState(false);

  // View detail modal
  const [showViewModal, setShowViewModal] = useState(false);
  const [viewingItem, setViewingItem] = useState<Pipeline | null>(null);

  // Task drawer
  const [selectedDeal, setSelectedDeal] = useState<Pipeline | null>(null);
  const [tasks, setTasks] = useState<CongViec[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [taskForm, setTaskForm] = useState({ ghi_chu: '', ngay_hen: '', trang_thai: 'Chưa xử lý' });
  const [savingTask, setSavingTask] = useState(false);
  const [editingTask, setEditingTask] = useState<CongViec | null>(null);
  const [editTaskForm, setEditTaskForm] = useState({ ghi_chu: '', ngay_hen: '', trang_thai: '', ket_qua: '' });

  // Form
  const [form, setForm] = useState({
    id_khach_hang: '', giai_doan: 'Mới', gia_tri_thuc_te: 0,
    sale_phu_trach: '', id_du_an: '', ten_du_an: '', hoa_hong: 0, thang: '',
    thuong_nong: 0, tkkd: '', phi_tkkd: 0, ngay_cap_nhat: '',
    ty_le_tra_sale: 0, ty_le_kh: 0, ty_le_gdda: 0, ty_le_gdkd: 0, ty_le_mkt: 0,
  });

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [plRes, khRes, daRes, nvRes] = await Promise.all([
        fetch('/api/pipeline'), fetch('/api/khach-hang?limit=999'),
        fetch('/api/du-an'), fetch('/api/nhan-vien'),
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

  // Get customer name
  const getCustomerName = (id: string) => {
    const kh = customers.find(k => k.id_khach_hang === id);
    return kh ? kh.ten_KH : id;
  };

  // Filter pipelines — tất cả deals mà nhân viên tham gia dưới bất kỳ vai trò nào
  const filteredPipelines = pipelines.filter(pl => {
    if (filterSale) {
      const participates =
        pl.sale_phu_trach === filterSale ||
        (pl.gdda || '')   === filterSale ||
        (pl.gdkd || '')   === filterSale ||
        (pl.tkkd || '')   === filterSale;
      if (!participates) return false;
    }
    if (filterDuAn && pl.id_du_an !== filterDuAn) return false;
    if (filterKH && pl.id_khach_hang !== filterKH) return false;
    return true;
  });

  // Lấy tên KH đang lọc (nếu có) để hiển thị banner
  const filterKHName = filterKH
    ? customers.find(k => k.id_khach_hang === filterKH)?.ten_KH || filterKH
    : '';

  const openCreate = () => {
    setEditingItem(null);
    setForm({
      id_khach_hang: '', giai_doan: 'Mới', gia_tri_thuc_te: 0,
      sale_phu_trach: '', id_du_an: '', ten_du_an: '', hoa_hong: 0, thang: '',
      thuong_nong: 0,
      tkkd: '',
      phi_tkkd: 0,
      ngay_cap_nhat: new Date().toISOString().split('T')[0],
      ty_le_tra_sale: 0, ty_le_kh: 0, ty_le_gdda: 0, ty_le_gdkd: 0, ty_le_mkt: 0,
    });
    setShowModal(true);
  };

  const openEdit = (pl: Pipeline) => {
    setEditingItem(pl);

    setForm({
      id_khach_hang: pl.id_khach_hang,
      giai_doan: pl.giai_doan,
      gia_tri_thuc_te: Number(pl.gia_tri_thuc_te) || 0,
      sale_phu_trach: pl.sale_phu_trach,
      id_du_an: pl.id_du_an,
      ten_du_an: pl.ten_du_an,
      hoa_hong: toPercent(pl.hoa_hong),
      thang: pl.thang,
      thuong_nong: Number(pl.thuong_nong) || 0,
      tkkd: pl.tkkd || '',
      phi_tkkd: Number(pl.phi_tkkd) || 0,
      ngay_cap_nhat: safeToDateInput(pl.ngay_cap_nhat),
      ty_le_tra_sale: toPercent(pl.ty_le_tra_sale),
      ty_le_kh:       toPercent(pl.ty_le_kh),
      ty_le_gdda:     toPercent(pl.ty_le_gdda),
      ty_le_gdkd:     toPercent(pl.ty_le_gdkd),
      ty_le_mkt:      toPercent(pl.ty_le_mkt),
    });

    setShowModal(true);
  };

  const handleProjectChange = (idDuAn: string) => {
    const project = projects.find(p => p.id_du_an === idDuAn);
    setForm({
      ...form,
      id_du_an: idDuAn,
      ten_du_an: project ? project.ten_du_an : '',
      hoa_hong: project ? project.hoa_hong_mac_dinh : form.hoa_hong,
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const method = editingItem ? 'PUT' : 'POST';
      // Tính trước phi để gửi cùng body (server sẽ tính lại nhưng giữ nhất quán)
      const norm = (v: number) => (v > 1 ? v / 100 : v);
      const hhRate = norm(form.hoa_hong);
      const gttd   = form.gia_tri_thuc_te;
      const tienHH = gttd * hhRate;
      const computedPhi = {
        // phi_tra_sale / kh / mkt dựa trên gia_tri_thuc_te
        phi_tra_sale: norm(form.ty_le_tra_sale || 0) * gttd,
        phi_tra_kh:   norm(form.ty_le_kh       || 0) * gttd,
        phi_tra_mkt:  norm(form.ty_le_mkt      || 0) * gttd,
        // phi_tra_gdda / gdkd dựa trên tien_hoa_hong
        phi_tra_gdda: norm(form.ty_le_gdda || 0) * tienHH,
        phi_tra_gdkd: norm(form.ty_le_gdkd || 0) * tienHH,
      };
      const body = editingItem
        ? { ...editingItem, ...form, ...computedPhi }
        : { ...form, ...computedPhi };
      const res = await fetch('/api/pipeline', {
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
      const res = await fetch('/api/pipeline', {
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

  // ── Task drawer handlers ──────────────────────────────────────
  const fetchTasks = async (id_pipeline: string) => {
    setLoadingTasks(true);
    try {
      const res = await fetch(`/api/cong-viec?pipeline=${id_pipeline}`);
      const data = await res.json();
      if (data.success) setTasks(data.data);
    } catch (err) { console.error('fetchTasks error:', err); }
    finally { setLoadingTasks(false); }
  };

  const openTaskPanel = (pl: Pipeline) => {
    setSelectedDeal(pl);
    setShowTaskForm(false);
    setEditingTask(null);
    setTaskForm({ ghi_chu: '', ngay_hen: '', trang_thai: 'Chưa xử lý' });
    fetchTasks(pl.id_pipeline);
  };

  const closeTaskPanel = () => {
    setSelectedDeal(null);
    setShowTaskForm(false);
    setEditingTask(null);
    setTasks([]);
  };

  const handleAddTask = async () => {
    if (!selectedDeal || !taskForm.ghi_chu.trim()) return;
    setSavingTask(true);
    try {
      await fetch('/api/cong-viec', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...taskForm,
          id_pipeline: selectedDeal.id_pipeline,
          sale_phu_trach: selectedDeal.sale_phu_trach,
          ket_qua: '',
        }),
      });
      setTaskForm({ ghi_chu: '', ngay_hen: '', trang_thai: 'Chưa xử lý' });
      setShowTaskForm(false);
      fetchTasks(selectedDeal.id_pipeline);
    } catch (err) { console.error('addTask error:', err); }
    finally { setSavingTask(false); }
  };

  const handleQuickStatus = async (cv: CongViec, newStatus: string) => {
    await fetch('/api/cong-viec', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...cv, trang_thai: newStatus }),
    });
    if (selectedDeal) fetchTasks(selectedDeal.id_pipeline);
  };

  const handleDeleteTask = async (id: string) => {
    await fetch('/api/cong-viec', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (selectedDeal) fetchTasks(selectedDeal.id_pipeline);
  };

  const handleSaveEditTask = async (cv: CongViec) => {
    await fetch('/api/cong-viec', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...cv, ...editTaskForm }),
    });
    setEditingTask(null);
    if (selectedDeal) fetchTasks(selectedDeal.id_pipeline);
  };
  // ──────────────────────────────────────────────────────────────

  if (loading) {
    return <div className="loading-spinner"><div className="spinner" /></div>;
  }

  // ── Dual-role detection ───────────────────────────────────────────────────
  // Mở rộng column visibility dựa trên vai trò THỰC TẾ trong dữ liệu.
  // Kiểm tra cả toàn bộ pipelines (không lọc) lẫn filteredPipelines để đảm bảo
  // cột hiển thị đúng khi admin lọc theo tên hoặc khi user xem chính mình.
  if (!isAllVisible && user?.ho_ten) {
    const checkIn = (arr: typeof pipelines) => {
      if (arr.some(pl => pl.sale_phu_trach === user.ho_ten)) { showPhiTraSale = true; showThuongNong = true; }
      if (arr.some(pl => (pl.gdda || '') === user.ho_ten)) showPhiTraGDDA = true;
      if (arr.some(pl => (pl.gdkd || '') === user.ho_ten)) showPhiTraGDKD = true;
    };
    checkIn(pipelines);           // toàn bộ dữ liệu
    checkIn(filteredPipelines);   // dữ liệu đang lọc (bao gồm cả vai trò GDDA/GĐKD)
  }

  // Summary stats for active stages
  const activeDeals = filteredPipelines.filter(pl => GIAI_DOAN_ACTIVE.includes(pl.giai_doan as typeof GIAI_DOAN_ACTIVE[number]));
  // Tổng giá trị: chỉ tính deals mà nhân viên là sale chính (sale_phu_trach)
  // Deals có vai trò GDDA/GDKD không cộng vào giá trị giao dịch của nhân viên đó
  const totalValue = activeDeals.reduce((s, pl) => {
    if (isAllVisible) {
      // Admin: lọc theo filterSale nếu có chọn
      if (filterSale && pl.sale_phu_trach !== filterSale) return s;
    } else {
      // Non-admin: chỉ tính deals mà user là sale_phu_trach
      if (pl.sale_phu_trach !== user?.ho_ten) return s;
    }
    return s + pl.gia_tri_thuc_te;
  }, 0);
  const totalProfit = activeDeals.reduce((s, pl) => s + (pl.loi_nhuan || 0), 0);

  // ── Hoa hồng cá nhân: cộng TẤT CẢ phí theo vai trò thực tế trên từng deal ──
  // VD: vừa là Sale vừa là GĐKD → cộng phi_tra_sale + phi_tra_gdkd
  const personalCommission = activeDeals.reduce((s, pl) => {
    if (isAllVisible) return s + (pl.phi_tra_sale || 0);
    let earned = 0;
    if (pl.sale_phu_trach === user?.ho_ten) earned += (pl.phi_tra_sale  || 0);
    if (pl.gdda            === user?.ho_ten) earned += (pl.phi_tra_gdda || 0);
    if (pl.gdkd            === user?.ho_ten) earned += (pl.phi_tra_gdkd || 0);
    return s + earned;
  }, 0);

  const personalHotBonus = activeDeals.reduce((s, pl) => {
    if (isAllVisible) return s + (pl.thuong_nong || 0);
    if (pl.sale_phu_trach === user?.ho_ten) return s + (pl.thuong_nong || 0);
    return s;
  }, 0);

  const personalPhiTKKD = activeDeals.reduce((s, pl) => {
    if (isAllVisible) return s + (pl.phi_tkkd || 0);
    if (user?.employee_type === 'TKKD' && pl.tkkd === user.ho_ten) return s + (pl.phi_tkkd || 0);
    return s;
  }, 0);

  // Admin/CEO totals — chi phí phân bổ
  const totalPhiTraKH   = activeDeals.reduce((s, pl) => s + (pl.phi_tra_kh   || 0), 0);
  const totalPhiTraGDDA = activeDeals.reduce((s, pl) => s + (pl.phi_tra_gdda || 0), 0);
  const totalPhiTraGDKD = activeDeals.reduce((s, pl) => s + (pl.phi_tra_gdkd || 0), 0);
  const totalPhiTraMKT  = activeDeals.reduce((s, pl) => s + (pl.phi_tra_mkt  || 0), 0);

  const openView = (pl: Pipeline) => {
    setViewingItem(pl);
    setShowViewModal(true);
  };

  // Hiển thị % hoa hồng: data có thể lưu dạng thập phân (0.04) hoặc % (4)
  const fmtHH = (v: number) => {
    const pct = v <= 1 ? v * 100 : v;
    return +pct.toFixed(4); // loại bỏ số 0 thừa
  };

  // Cột trong TABLE — Admin/CEO dùng view gọn (chi tiết phí xem qua nút View)
  // TKKD & Phí TKKD đã bỏ khỏi bảng — xem qua nút "Xem chi tiết"
  const tablePhiGDDA  = showPhiTraGDDA && !isAllVisible;
  const tablePhiGDKD  = showPhiTraGDKD && !isAllVisible;
  const tableMaCan    = filteredPipelines.some(pl => pl.ma_can);

  let colSpan = 6; // #, Giai đoạn, Dự án, Giá trị, Sale, Thao tác
  if (showKhachHang) colSpan++;
  if (tableMaCan)    colSpan++;
  if (showPhiTraSale) colSpan++;
  if (tablePhiGDDA)  colSpan++;
  if (tablePhiGDKD)  colSpan++;
  if (showThuongNong) colSpan++;

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div className="page-header-left">
          <h1>Pipeline</h1>
          <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <span style={{ 
              background: '#f1f5f9', 
              color: '#334155', 
              padding: '6px 14px', 
              borderRadius: '14px', 
              fontWeight: 700, 
              fontSize: '0.88rem', 
              display: 'inline-flex', 
              alignItems: 'center', 
              gap: '6px',
              boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
            }}>
              <span style={{ fontSize: '1.15rem', lineHeight: 1 }}>📊</span> {filteredPipelines.length} deal
            </span>
            <span style={{ 
              background: 'rgba(99, 102, 241, 0.08)', 
              color: '#4f46e5', 
              padding: '6px 15px', 
              borderRadius: '14px', 
              fontWeight: 700, 
              fontSize: '0.88rem', 
              display: 'inline-flex', 
              alignItems: 'center', 
              gap: '6px',
              border: '1px solid rgba(99, 102, 241, 0.15)',
              boxShadow: '0 1px 2px rgba(99, 102, 241, 0.05)'
            }}>
              <span style={{ fontSize: '1.15rem', lineHeight: 1 }}>💰</span> Tổng giá trị: <span style={{ color: '#4f46e5', fontWeight: 850 }}>{formatCurrency(totalValue, false)}</span>
            </span>

            {/* Personal or administrative Commission stats */}
            {(showPhiTraSale || showPhiTraGDDA || showPhiTraGDKD) && (
              <span style={{ 
                background: 'rgba(16, 185, 129, 0.08)', 
                color: '#059669', 
                padding: '6px 15px', 
                borderRadius: '14px', 
                fontWeight: 700, 
                fontSize: '0.88rem', 
                display: 'inline-flex', 
                alignItems: 'center', 
                gap: '6px',
                border: '1px solid rgba(16, 185, 129, 0.15)',
                boxShadow: '0 1px 2px rgba(16, 185, 129, 0.05)'
              }}>
                <span style={{ fontSize: '1.15rem', lineHeight: 1 }}>💵</span> {isAllVisible ? 'Tổng hoa hồng' : 'Hoa hồng cá nhân'}: <span style={{ color: '#059669', fontWeight: 850 }}>{formatCurrency(personalCommission, false)}</span>
                {!isAllVisible && (() => {
                  const parts: string[] = [];
                  if (showPhiTraSale) parts.push('MG');
                  if (showPhiTraGDDA) parts.push('GDDA');
                  if (showPhiTraGDKD) parts.push('GĐKD');
                  return parts.length > 1
                    ? <span style={{ fontSize: '0.72rem', fontWeight: 500, opacity: 0.75, marginLeft: 2 }}>({parts.join(' + ')})</span>
                    : null;
                })()}
              </span>
            )}

            {/* Personal or administrative Hot Bonus stats */}
            {showThuongNong && (
              <span style={{ 
                background: 'rgba(239, 68, 68, 0.08)', 
                color: '#dc2626', 
                padding: '6px 15px', 
                borderRadius: '14px', 
                fontWeight: 700, 
                fontSize: '0.88rem', 
                display: 'inline-flex', 
                alignItems: 'center', 
                gap: '6px',
                border: '1px solid rgba(239, 68, 68, 0.15)',
                boxShadow: '0 1px 2px rgba(239, 68, 68, 0.05)'
              }}>
                <span style={{ fontSize: '1.15rem', lineHeight: 1 }}>🔥</span> {isAllVisible ? 'Tổng thưởng nóng' : 'Thưởng nóng cá nhân'}: <span style={{ color: '#dc2626', fontWeight: 850 }}>{formatCurrency(personalHotBonus, false)}</span>
              </span>
            )}

            {/* Phí TKKD stats */}
            {showPhiTKKD && (
              <span style={{ 
                background: 'rgba(139, 92, 246, 0.08)', 
                color: '#7c3aed', 
                padding: '6px 15px', 
                borderRadius: '14px', 
                fontWeight: 700, 
                fontSize: '0.88rem', 
                display: 'inline-flex', 
                alignItems: 'center', 
                gap: '6px',
                border: '1px solid rgba(139, 92, 246, 0.15)',
                boxShadow: '0 1px 2px rgba(139, 92, 246, 0.05)'
              }}>
                <span style={{ fontSize: '1.15rem', lineHeight: 1 }}>💜</span> {isAllVisible ? 'Tổng phí TKKD' : 'Phí TKKD cá nhân'}: <span style={{ color: '#7c3aed', fontWeight: 850 }}>{formatCurrency(personalPhiTKKD, false)}</span>
              </span>
            )}

            {canViewProfit && (
              <span style={{ 
                background: 'rgba(212, 175, 55, 0.15)', 
                color: '#b45309', 
                padding: '6px 16px', 
                borderRadius: '14px', 
                fontWeight: 800, 
                fontSize: '0.88rem',
                border: '1.5px solid rgba(212, 175, 55, 0.45)',
                boxShadow: '0 2px 6px rgba(212,175,55,0.18)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}>
                <span style={{ fontSize: '1.15rem', lineHeight: 1 }}>💎</span> Tổng lợi nhuận: <span style={{ color: '#d97706', fontWeight: 950 }}>{formatCurrency(totalProfit, false)}</span>
              </span>
            )}

            {/* Admin/CEO cost breakdown totals */}
            {canViewProfit && (
              <>
                {totalPhiTraKH > 0 && (
                  <span style={{
                    background: 'rgba(139,92,246,0.08)', color: '#6d28d9',
                    padding: '6px 14px', borderRadius: '14px', fontWeight: 700,
                    fontSize: '0.85rem', display: 'inline-flex', alignItems: 'center', gap: '5px',
                    border: '1px solid rgba(139,92,246,0.18)',
                  }}>
                    🏷️ Phí trả KH: <strong style={{ marginLeft: 3 }}>{formatCurrency(totalPhiTraKH, false)}</strong>
                  </span>
                )}
                {totalPhiTraGDDA > 0 && (
                  <span style={{
                    background: 'rgba(59,130,246,0.08)', color: '#1d4ed8',
                    padding: '6px 14px', borderRadius: '14px', fontWeight: 700,
                    fontSize: '0.85rem', display: 'inline-flex', alignItems: 'center', gap: '5px',
                    border: '1px solid rgba(59,130,246,0.18)',
                  }}>
                    🏗️ Phí GDDA: <strong style={{ marginLeft: 3 }}>{formatCurrency(totalPhiTraGDDA, false)}</strong>
                  </span>
                )}
                {totalPhiTraGDKD > 0 && (
                  <span style={{
                    background: 'rgba(245,158,11,0.08)', color: '#b45309',
                    padding: '6px 14px', borderRadius: '14px', fontWeight: 700,
                    fontSize: '0.85rem', display: 'inline-flex', alignItems: 'center', gap: '5px',
                    border: '1px solid rgba(245,158,11,0.18)',
                  }}>
                    👔 Phí GĐKD: <strong style={{ marginLeft: 3 }}>{formatCurrency(totalPhiTraGDKD, false)}</strong>
                  </span>
                )}
                {totalPhiTraMKT > 0 && (
                  <span style={{
                    background: 'rgba(236,72,153,0.08)', color: '#be185d',
                    padding: '6px 14px', borderRadius: '14px', fontWeight: 700,
                    fontSize: '0.85rem', display: 'inline-flex', alignItems: 'center', gap: '5px',
                    border: '1px solid rgba(236,72,153,0.18)',
                  }}>
                    📣 Phí MKT: <strong style={{ marginLeft: 3 }}>{formatCurrency(totalPhiTraMKT, false)}</strong>
                  </span>
                )}
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button className="btn btn-primary" onClick={openCreate}>
            <Plus size={18} />
            Thêm deal
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="filter-bar">
        <div className="flex items-center gap-2">
          <SlidersHorizontal size={14} style={{ color: 'var(--text-label)' }} />
          <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', fontWeight: 500 }}>Lọc:</span>
        </div>
        {isAllVisible && (
          <select className="form-select" value={filterSale} onChange={(e) => setFilterSale(e.target.value)}>
            <option value="">Tất cả nhân sự</option>
            {employees.map(nv => <option key={nv.id_nhan_vien} value={nv.ho_ten}>{nv.ho_ten}</option>)}
          </select>
        )}
        <select className="form-select" value={filterDuAn} onChange={(e) => setFilterDuAn(e.target.value)}>
          <option value="">Tất cả dự án</option>
          {projects.map(da => <option key={da.id_du_an} value={da.id_du_an}>{da.ten_du_an}</option>)}
        </select>
        {filterKHName && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'rgba(99,102,241,0.1)', color: '#4f46e5',
            border: '1px solid rgba(99,102,241,0.25)',
            borderRadius: 20, padding: '4px 10px 4px 12px',
            fontSize: '0.8125rem', fontWeight: 600,
          }}>
            👤 {filterKHName}
            <button
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1, color: '#4f46e5' }}
              onClick={() => { setFilterKH(''); router.replace('/pipeline'); }}
            >
              <X size={13} />
            </button>
          </span>
        )}
        {(filterSale || filterDuAn || filterKH) && (
          <button className="btn btn-ghost btn-sm" onClick={() => { setFilterSale(''); setFilterDuAn(''); setFilterKH(''); router.replace('/pipeline'); }}>
            <X size={14} />Xóa lọc
          </button>
        )}
      </div>

      {/* Table View */}
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
                <th style={{ width: 110, textAlign: 'center' }}>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {filteredPipelines.map((pl, idx) => {
                const colors = GIAI_DOAN_COLORS[pl.giai_doan] || { bg: '#f1f5f9', text: '#475569' };
                return (
                  <tr key={pl.id_pipeline}>
                    <td style={{ color: 'var(--text-label)' }}>{idx + 1}</td>
                    {showKhachHang && (
                      <td style={{ fontWeight: 500, color: 'var(--text-title)' }}>
                        {pl.ho_ten_kh || getCustomerName(pl.id_khach_hang) || '—'}
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
                        {pl.gdda === user?.ho_ten
                          ? formatCurrency(pl.phi_tra_gdda || 0)
                          : '—'}
                      </td>
                    )}

                    {tablePhiGDKD && (
                      <td style={{ textAlign: 'right', color: '#b45309', fontWeight: 600 }}>
                        {pl.gdkd === user?.ho_ten
                          ? formatCurrency(pl.phi_tra_gdkd || 0)
                          : '—'}
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
                          onClick={() => openView(pl)}
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
                        <button className="btn btn-ghost btn-icon btn-sm" onClick={() => openEdit(pl)}><Edit3 size={15} /></button>
                        <button className="btn btn-ghost btn-icon btn-sm" style={{ color: 'var(--danger-text)' }}
                          onClick={() => { setDeletingId(pl.id_pipeline); setShowConfirm(true); }}><Trash2 size={15} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredPipelines.length === 0 && (
                <tr>
                  <td colSpan={colSpan} className="empty-state">
                    <h3>Chưa có deal nào</h3>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{editingItem ? 'Chỉnh sửa deal' : 'Thêm deal mới'}</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowModal(false)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Khách hàng *</label>
                <select className="form-select" value={form.id_khach_hang}
                  onChange={(e) => setForm({ ...form, id_khach_hang: e.target.value })}>
                  <option value="">Chọn khách hàng</option>
                  {customers.map(kh => (
                    <option key={kh.id_khach_hang} value={kh.id_khach_hang}>{kh.ten_KH}</option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div className="form-group">
                  <label className="form-label">Giai đoạn</label>
                  <select className="form-select" value={form.giai_doan}
                    onChange={(e) => setForm({ ...form, giai_doan: e.target.value })}>
                    {GIAI_DOAN_PIPELINE.map(gd => <option key={gd} value={gd}>{gd}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Dự án</label>
                  <select className="form-select" value={form.id_du_an}
                    onChange={(e) => handleProjectChange(e.target.value)}>
                    <option value="">Chọn dự án</option>
                    {projects.map(da => (
                      <option key={da.id_du_an} value={da.id_du_an}>{da.ten_du_an}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div className="form-group">
                  <label className="form-label">Giá trị thực tế (VNĐ)</label>
                  <input className="form-input" type="number" value={form.gia_tri_thuc_te}
                    onChange={(e) => setForm({ ...form, gia_tri_thuc_te: parseFloat(e.target.value) || 0 })} />
                  {form.gia_tri_thuc_te > 0 && (
                    <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#4f46e5', marginTop: 5 }}>
                      = {form.gia_tri_thuc_te.toLocaleString('vi-VN')} đ
                    </div>
                  )}
                </div>
                <div className="form-group">
                  <label className="form-label">Hoa hồng (%)</label>
                  <input className="form-input" type="number" step="0.01" min="0" max="100" value={form.hoa_hong}
                    onChange={(e) => setForm({ ...form, hoa_hong: parseFloat(e.target.value) || 0 })} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div className="form-group">
                  <label className="form-label">Thưởng nóng (Gồm VAT)</label>
                  <input className="form-input" type="number" value={form.thuong_nong}
                    onChange={(e) => setForm({ ...form, thuong_nong: parseFloat(e.target.value) || 0 })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Sale phụ trách</label>
                  <select className="form-select" value={form.sale_phu_trach}
                    onChange={(e) => setForm({ ...form, sale_phu_trach: e.target.value })}>
                    <option value="">Chọn sale</option>
                    {employees.map(nv => (
                      <option key={nv.id_nhan_vien} value={nv.ho_ten}>{nv.ho_ten}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div className="form-group">
                  <label className="form-label">Thư ký kinh doanh (TKKD)</label>
                  <select className="form-select" value={form.tkkd}
                    onChange={(e) => setForm({ ...form, tkkd: e.target.value })}>
                    <option value="">Chọn TKKD</option>
                    {employees.map(nv => (
                      <option key={nv.id_nhan_vien} value={nv.ho_ten}>{nv.ho_ten}</option>
                    ))}
                  </select>
                </div>
                {showPhiTKKD && (
                  <div className="form-group">
                    <label className="form-label">Phí TKKD (VNĐ)</label>
                    <input className="form-input" type="number" value={form.phi_tkkd}
                      onChange={(e) => setForm({ ...form, phi_tkkd: parseFloat(e.target.value) || 0 })} />
                  </div>
                )}
              </div>
              {/* ── Tỷ lệ & phí hoa hồng ── */}
              {(showPhiTraSale || showPhiTraGDDA || showPhiTraGDKD || !!isAllVisible) && (() => {
                // Chuẩn hoá: người dùng có thể nhập 0.06 hoặc 6 (đều hiểu là 6%)
                const normF = (v: number) => (v > 1 ? v / 100 : v);
                const hhRate = normF(form.hoa_hong);
                const gttd   = form.gia_tri_thuc_te;
                const tienHH = gttd * hhRate;

                // Phí dựa trên gia_tri_thuc_te
                const phiSale = normF(form.ty_le_tra_sale || 0) * gttd;
                const phiKH   = normF(form.ty_le_kh       || 0) * gttd;
                const phiMKT  = normF(form.ty_le_mkt      || 0) * gttd;
                // Phí dựa trên tien_hoa_hong
                const phiGDDA = normF(form.ty_le_gdda || 0) * tienHH;
                const phiGDKD = normF(form.ty_le_gdkd || 0) * tienHH;

                const fmtPhi = (v: number) => v > 0 ? v.toLocaleString('vi-VN') + ' ₫' : '0 ₫';

                // Hàng tỷ lệ: [label %, input, label phi, display]
                type PhiRow = { show: boolean; labelPct: string; field: 'ty_le_tra_sale'|'ty_le_kh'|'ty_le_gdda'|'ty_le_gdkd'|'ty_le_mkt'; labelPhi: string; phi: number; bg: string; color: string; hint: string };
                const rows: PhiRow[] = [
                  { show: showPhiTraSale, labelPct: '% Trả sale', field: 'ty_le_tra_sale', labelPhi: 'Phí trả sale', phi: phiSale, bg: '#ecfdf5', color: '#065f46', hint: '× Giá trị TT' },
                  { show: !!isAllVisible,  labelPct: '% Trả KH',   field: 'ty_le_kh',       labelPhi: 'Phí trả KH',   phi: phiKH,   bg: '#fdf4ff', color: '#7e22ce', hint: '× Giá trị TT' },
                  { show: showPhiTraGDDA, labelPct: '% GDDA',     field: 'ty_le_gdda',     labelPhi: 'Phí trả GDDA', phi: phiGDDA, bg: '#eff6ff', color: '#1d4ed8', hint: '× Tiền HH' },
                  { show: showPhiTraGDKD, labelPct: '% GĐKD',     field: 'ty_le_gdkd',     labelPhi: 'Phí trả GĐKD', phi: phiGDKD, bg: '#fffbeb', color: '#b45309', hint: '× Tiền HH' },
                  { show: !!isAllVisible,  labelPct: '% MKT',      field: 'ty_le_mkt',      labelPhi: 'Phí trả MKT',  phi: phiMKT,  bg: '#fff1f2', color: '#be123c', hint: '× Giá trị TT' },
                ];

                return (
                  <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '12px 14px', marginBottom: 4 }}>
                    <p style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-label)', margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      💵 Tỷ lệ hoa hồng
                      {tienHH > 0 && (
                        <span style={{ fontWeight: 600, color: '#059669', textTransform: 'none', letterSpacing: 0, marginLeft: 8 }}>
                          — Tiền HH: <strong>{tienHH.toLocaleString('vi-VN')} ₫</strong>
                        </span>
                      )}
                    </p>
                    {rows.filter(r => r.show).map((r, i, arr) => (
                      <div key={r.field} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: i < arr.length - 1 ? 10 : 0 }}>
                        <div className="form-group" style={{ margin: 0 }}>
                          <label className="form-label">
                            {r.labelPct}
                            <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: 4 }}>({r.hint})</span>
                          </label>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <input className="form-input" type="number" step="0.01" min="0" max="100"
                              placeholder="0"
                              value={form[r.field] || ''}
                              onChange={(e) => setForm({ ...form, [r.field]: parseFloat(e.target.value) || 0 })}
                              style={{ flex: 1 }} />
                            <span style={{ fontSize: '0.85rem', color: 'var(--text-label)', fontWeight: 600 }}>%</span>
                          </div>
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                          <label className="form-label">{r.labelPhi}</label>
                          <div className="form-input" style={{ background: r.bg, color: r.color, fontWeight: 700, cursor: 'default' }}>
                            {fmtPhi(r.phi)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div className="form-group">
                  <label className="form-label">Ngày ký TTĐC/VBTT</label>
                  <input className="form-input" type="date" value={form.ngay_cap_nhat}
                    onChange={(e) => setForm({ ...form, ngay_cap_nhat: e.target.value })} />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Hủy</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Đang lưu...' : (editingItem ? 'Cập nhật' : 'Thêm mới')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Task Drawer ─────────────────────────────────────────────── */}
      {selectedDeal && (
        <>
          {/* Backdrop */}
          <div
            style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 200 }}
            onClick={closeTaskPanel}
          />

          {/* Panel */}
          <div style={{
            position: 'fixed', top: 0, right: 0, bottom: 0,
            width: 440, maxWidth: '100vw',
            background: '#ffffff',
            borderLeft: '1px solid #e2e8f0',
            boxShadow: '-8px 0 40px rgba(15,23,42,0.18)',
            zIndex: 201,
            display: 'flex', flexDirection: 'column',
          }}>

            {/* Header – deal info */}
            <div style={{ padding: '18px 20px 14px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <ClipboardList size={14} color="var(--primary)" />
                    <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-label)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Công việc theo dõi deal</span>
                  </div>

                  {/* Customer / project title */}
                  <div style={{ fontWeight: 700, fontSize: '0.975rem', color: 'var(--text-title)', marginBottom: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {showKhachHang
                      ? (selectedDeal.ho_ten_kh || getCustomerName(selectedDeal.id_khach_hang) || '—')
                      : (selectedDeal.ten_du_an || selectedDeal.ma_can || selectedDeal.id_pipeline)}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span className="badge" style={{
                      background: GIAI_DOAN_COLORS[selectedDeal.giai_doan]?.bg || '#f1f5f9',
                      color: GIAI_DOAN_COLORS[selectedDeal.giai_doan]?.text || '#475569',
                      fontSize: '0.72rem',
                    }}>
                      {selectedDeal.giai_doan}
                    </span>
                    {selectedDeal.ten_du_an && (
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>📍 {selectedDeal.ten_du_an}</span>
                    )}
                    {selectedDeal.ma_can && (
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>🏠 {selectedDeal.ma_can}</span>
                    )}
                    {selectedDeal.sale_phu_trach && (
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>👤 {selectedDeal.sale_phu_trach}</span>
                    )}
                  </div>
                </div>
                <button className="btn btn-ghost btn-icon btn-sm" onClick={closeTaskPanel} style={{ flexShrink: 0 }}>
                  <X size={17} />
                </button>
              </div>
            </div>

            {/* Body – task list + form */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px', background: '#ffffff' }}>

              {/* Add task toggle */}
              <div style={{ marginBottom: 14 }}>
                {!showTaskForm ? (
                  <button
                    className="btn btn-primary btn-sm"
                    style={{ width: '100%', justifyContent: 'center', gap: 6 }}
                    onClick={() => setShowTaskForm(true)}
                  >
                    <Plus size={14} /> Thêm công việc
                  </button>
                ) : (
                  <div style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 10, padding: 14 }}>
                    <p style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-title)', margin: '0 0 10px' }}>Công việc mới</p>
                    <input
                      className="form-input"
                      style={{ marginBottom: 8 }}
                      placeholder="Mô tả công việc *"
                      value={taskForm.ghi_chu}
                      autoFocus
                      onChange={e => setTaskForm({ ...taskForm, ghi_chu: e.target.value })}
                      onKeyDown={e => e.key === 'Enter' && handleAddTask()}
                    />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                      <div>
                        <label style={{ fontSize: '0.72rem', color: 'var(--text-label)', fontWeight: 600, display: 'block', marginBottom: 4 }}>Ngày hẹn</label>
                        <input className="form-input" type="date" value={taskForm.ngay_hen}
                          onChange={e => setTaskForm({ ...taskForm, ngay_hen: e.target.value })} />
                      </div>
                      <div>
                        <label style={{ fontSize: '0.72rem', color: 'var(--text-label)', fontWeight: 600, display: 'block', marginBottom: 4 }}>Trạng thái</label>
                        <select className="form-select" value={taskForm.trang_thai}
                          onChange={e => setTaskForm({ ...taskForm, trang_thai: e.target.value })}>
                          <option>Chưa xử lý</option>
                          <option>Đang xử lý</option>
                          <option>Hoàn thành</option>
                          <option>Huỷ</option>
                        </select>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn btn-secondary btn-sm" onClick={() => { setShowTaskForm(false); setTaskForm({ ghi_chu: '', ngay_hen: '', trang_thai: 'Chưa xử lý' }); }}>
                        Hủy
                      </button>
                      <button className="btn btn-primary btn-sm" onClick={handleAddTask} disabled={savingTask || !taskForm.ghi_chu.trim()}>
                        {savingTask ? 'Đang lưu...' : 'Thêm'}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Task list */}
              {loadingTasks ? (
                <div style={{ textAlign: 'center', padding: '36px 0', color: 'var(--text-muted)' }}>
                  <div className="spinner" style={{ margin: '0 auto 8px' }} />
                  <span style={{ fontSize: '0.85rem' }}>Đang tải công việc...</span>
                </div>
              ) : tasks.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '44px 0', color: 'var(--text-muted)' }}>
                  <ClipboardList size={38} style={{ margin: '0 auto 10px', opacity: 0.25, display: 'block' }} />
                  <p style={{ fontWeight: 600, margin: '0 0 4px', fontSize: '0.875rem' }}>Chưa có công việc</p>
                  <p style={{ fontSize: '0.8rem', margin: 0 }}>Thêm task để theo dõi tiến độ deal này</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {[...tasks]
                    .sort((a, b) => {
                      const order = ['Chưa xử lý', 'Đang xử lý', 'Hoàn thành', 'Huỷ'];
                      return (order.indexOf(a.trang_thai) ?? 99) - (order.indexOf(b.trang_thai) ?? 99);
                    })
                    .map(cv => {
                      const sc = TASK_STATUS[cv.trang_thai] || TASK_STATUS['Chưa xử lý'];
                      const isDone = cv.trang_thai === 'Hoàn thành' || cv.trang_thai === 'Huỷ';
                      const isEditing = editingTask?.id_cong_viec === cv.id_cong_viec;

                      return (
                        <div key={cv.id_cong_viec} style={{
                          background: isDone ? '#f8fafc' : '#ffffff',
                          border: `1px solid ${isDone ? '#e2e8f0' : sc.border}`,
                          borderRadius: 10,
                          padding: '12px 13px',
                          opacity: cv.trang_thai === 'Huỷ' ? 0.58 : 1,
                          transition: 'opacity 0.15s',
                        }}>
                          {isEditing ? (
                            /* ── Inline edit form ─────────────────────── */
                            <div>
                              <input className="form-input" style={{ marginBottom: 8, fontSize: '0.875rem' }}
                                value={editTaskForm.ghi_chu}
                                onChange={e => setEditTaskForm({ ...editTaskForm, ghi_chu: e.target.value })}
                                placeholder="Mô tả công việc" />
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                                <input className="form-input" type="date"
                                  value={editTaskForm.ngay_hen}
                                  onChange={e => setEditTaskForm({ ...editTaskForm, ngay_hen: e.target.value })} />
                                <select className="form-select"
                                  value={editTaskForm.trang_thai}
                                  onChange={e => setEditTaskForm({ ...editTaskForm, trang_thai: e.target.value })}>
                                  <option>Chưa xử lý</option>
                                  <option>Đang xử lý</option>
                                  <option>Hoàn thành</option>
                                  <option>Huỷ</option>
                                </select>
                              </div>
                              <input className="form-input" style={{ marginBottom: 8, fontSize: '0.875rem' }}
                                value={editTaskForm.ket_qua}
                                onChange={e => setEditTaskForm({ ...editTaskForm, ket_qua: e.target.value })}
                                placeholder="Kết quả (tuỳ chọn)" />
                              <div style={{ display: 'flex', gap: 8 }}>
                                <button className="btn btn-secondary btn-sm" onClick={() => setEditingTask(null)}>Hủy</button>
                                <button className="btn btn-primary btn-sm" onClick={() => handleSaveEditTask(cv)}>Lưu</button>
                              </div>
                            </div>
                          ) : (
                            /* ── View mode ───────────────────────────────── */
                            <div>
                              {/* Row 1: icon + title + actions */}
                              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 7 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 7, flex: 1, minWidth: 0 }}>
                                  {cv.trang_thai === 'Hoàn thành' && <CheckCircle2 size={15} color="#059669" style={{ flexShrink: 0 }} />}
                                  {cv.trang_thai === 'Đang xử lý' && <Clock size={15} color="#2563eb" style={{ flexShrink: 0 }} />}
                                  {cv.trang_thai === 'Huỷ'        && <XCircle   size={15} color="#94a3b8" style={{ flexShrink: 0 }} />}
                                  {cv.trang_thai === 'Chưa xử lý' && <Circle    size={15} color="#d97706" style={{ flexShrink: 0 }} />}
                                  <span style={{
                                    fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-title)',
                                    textDecoration: cv.trang_thai === 'Huỷ' ? 'line-through' : 'none',
                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                  }}>
                                    {cv.ghi_chu}
                                  </span>
                                </div>
                                <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                                  <button className="btn btn-ghost btn-icon btn-sm" title="Chỉnh sửa"
                                    onClick={() => {
                                      setEditingTask(cv);
                                      setEditTaskForm({
                                        ghi_chu: cv.ghi_chu,
                                        ngay_hen: cv.ngay_hen ? cv.ngay_hen.split('T')[0] : '',
                                        trang_thai: cv.trang_thai,
                                        ket_qua: cv.ket_qua || '',
                                      });
                                    }}>
                                    <Edit3 size={13} />
                                  </button>
                                  <button className="btn btn-ghost btn-icon btn-sm" title="Xóa"
                                    style={{ color: 'var(--danger-text)' }}
                                    onClick={() => handleDeleteTask(cv.id_cong_viec)}>
                                    <Trash2 size={13} />
                                  </button>
                                </div>
                              </div>

                              {/* Row 2: date + status badge */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: cv.ket_qua || (!isDone) ? 8 : 0 }}>
                                {cv.ngay_hen && (
                                  <span style={{ fontSize: '0.775rem', color: 'var(--text-label)', display: 'flex', alignItems: 'center', gap: 3 }}>
                                    📅 {formatDate(cv.ngay_hen)}
                                  </span>
                                )}
                                <span className="badge" style={{ background: sc.bg, color: sc.text, fontSize: '0.7rem', padding: '2px 8px' }}>
                                  {cv.trang_thai}
                                </span>
                              </div>

                              {/* Row 3: result note */}
                              {cv.ket_qua && (
                                <div style={{
                                  fontSize: '0.8rem', color: '#64748b',
                                  background: '#f1f5f9', borderRadius: 6,
                                  padding: '5px 9px', borderLeft: '3px solid #cbd5e1',
                                  marginBottom: isDone ? 0 : 8,
                                }}>
                                  💬 {cv.ket_qua}
                                </div>
                              )}

                              {/* Row 4: quick actions */}
                              {cv.trang_thai === 'Chưa xử lý' && (
                                <div style={{ display: 'flex', gap: 6 }}>
                                  <button style={{ fontSize: '0.735rem', padding: '3px 10px', borderRadius: 6, background: '#dbeafe', color: '#1e40af', border: 'none', cursor: 'pointer', fontWeight: 600 }}
                                    onClick={() => handleQuickStatus(cv, 'Đang xử lý')}>
                                    → Đang xử lý
                                  </button>
                                  <button style={{ fontSize: '0.735rem', padding: '3px 10px', borderRadius: 6, background: '#d1fae5', color: '#065f46', border: 'none', cursor: 'pointer', fontWeight: 600 }}
                                    onClick={() => handleQuickStatus(cv, 'Hoàn thành')}>
                                    ✓ Hoàn thành
                                  </button>
                                </div>
                              )}
                              {cv.trang_thai === 'Đang xử lý' && (
                                <button style={{ fontSize: '0.735rem', padding: '3px 10px', borderRadius: 6, background: '#d1fae5', color: '#065f46', border: 'none', cursor: 'pointer', fontWeight: 600 }}
                                  onClick={() => handleQuickStatus(cv, 'Hoàn thành')}>
                                  ✓ Hoàn thành
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              )}
            </div>

            {/* Footer – task count summary */}
            {tasks.length > 0 && (
              <div style={{ padding: '10px 18px', borderTop: '1px solid #e2e8f0', background: '#f8fafc', flexShrink: 0 }}>
                <div style={{ display: 'flex', gap: 14, fontSize: '0.775rem', color: 'var(--text-label)' }}>
                  <span>📋 {tasks.length} task</span>
                  <span style={{ color: '#059669' }}>✓ {tasks.filter(t => t.trang_thai === 'Hoàn thành').length} xong</span>
                  <span style={{ color: '#d97706' }}>⏳ {tasks.filter(t => t.trang_thai === 'Chưa xử lý').length} chờ</span>
                  {tasks.filter(t => t.trang_thai === 'Đang xử lý').length > 0 && (
                    <span style={{ color: '#2563eb' }}>🔄 {tasks.filter(t => t.trang_thai === 'Đang xử lý').length} đang xử lý</span>
                  )}
                </div>
              </div>
            )}
          </div>
        </>
      )}
      {/* ────────────────────────────────────────────────────────────── */}

      {/* ── View Detail Modal ───────────────────────────────────────────── */}
      {showViewModal && viewingItem && (
        <div className="modal-overlay" onClick={() => setShowViewModal(false)}>
          <div className="modal-content" style={{ maxWidth: 580 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3 className="modal-title">Chi tiết deal</h3>
                <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  {viewingItem.ten_du_an || '—'}{viewingItem.ma_can ? ` · ${viewingItem.ma_can}` : ''}
                </p>
              </div>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowViewModal(false)}><X size={18} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* Thông tin cơ bản */}
              <div style={{ background: '#f8fafc', borderRadius: 10, padding: '12px 14px', border: '1px solid #e2e8f0' }}>
                <p style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-label)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 10px' }}>📋 Thông tin cơ bản</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 20px' }}>
                  {showKhachHang && (
                    <div>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Khách hàng</span>
                      <p style={{ margin: '2px 0 0', fontWeight: 600, fontSize: '0.875rem' }}>{viewingItem.ho_ten_kh || getCustomerName(viewingItem.id_khach_hang) || '—'}</p>
                    </div>
                  )}
                  <div>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Giai đoạn</span>
                    <p style={{ margin: '2px 0 0' }}>
                      <span className="badge" style={{ background: (GIAI_DOAN_COLORS[viewingItem.giai_doan] || {}).bg || '#f1f5f9', color: (GIAI_DOAN_COLORS[viewingItem.giai_doan] || {}).text || '#475569', fontSize: '0.78rem' }}>
                        {viewingItem.giai_doan}
                      </span>
                    </p>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Giá trị thực tế</span>
                    <p style={{ margin: '2px 0 0', fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-title)' }}>{formatCurrency(viewingItem.gia_tri_thuc_te)}</p>
                  </div>
                  {canViewProfit && (
                    <div>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Hoa hồng</span>
                      <p style={{ margin: '2px 0 0', fontWeight: 600 }}>
                        {fmtHH(viewingItem.hoa_hong || 0)}% → {formatCurrency(viewingItem.tien_hoa_hong || 0)}
                      </p>
                    </div>
                  )}
                  <div>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Ngày ký TTĐC/VBTT</span>
                    <p style={{ margin: '2px 0 0', fontWeight: 600 }}>{formatDate(viewingItem.ngay_cap_nhat) || '—'}</p>
                  </div>
                  {viewingItem.thang && (
                    <div>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Tháng</span>
                      <p style={{ margin: '2px 0 0', fontWeight: 600 }}>{viewingItem.thang}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Nhân sự */}
              <div style={{ background: '#f8fafc', borderRadius: 10, padding: '12px 14px', border: '1px solid #e2e8f0' }}>
                <p style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-label)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 10px' }}>👥 Nhân sự</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 20px' }}>
                  <div>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Sale phụ trách</span>
                    <p style={{ margin: '2px 0 0', fontWeight: 600, color: 'var(--primary-text)' }}>{viewingItem.sale_phu_trach || '—'}</p>
                  </div>
                  {viewingItem.tkkd && (
                    <div>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>TKKD</span>
                      <p style={{ margin: '2px 0 0', fontWeight: 600, color: 'var(--primary-text)' }}>{viewingItem.tkkd}</p>
                    </div>
                  )}
                  {viewingItem.gdda && (
                    <div>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>GDDA</span>
                      <p style={{ margin: '2px 0 0', fontWeight: 600, color: '#1d4ed8' }}>{viewingItem.gdda}</p>
                    </div>
                  )}
                  {viewingItem.gdkd && (
                    <div>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>GĐKD</span>
                      <p style={{ margin: '2px 0 0', fontWeight: 600, color: '#b45309' }}>{viewingItem.gdkd}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Phân bổ chi phí */}
              {(showPhiTraSale || showPhiTraGDDA || showPhiTraGDKD || isAllVisible) && (
                <div style={{ background: '#f8fafc', borderRadius: 10, padding: '12px 14px', border: '1px solid #e2e8f0' }}>
                  <p style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-label)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 10px' }}>💵 Phân bổ chi phí</p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 20px' }}>
                    {showPhiTraSale && (isAllVisible || viewingItem.sale_phu_trach === user?.ho_ten) && (
                      <div>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Phí trả sale</span>
                        <p style={{ margin: '2px 0 0', fontWeight: 700, color: '#059669' }}>{formatCurrency(viewingItem.phi_tra_sale || 0)}</p>
                      </div>
                    )}
                    {isAllVisible && viewingItem.phi_tra_kh != null && viewingItem.phi_tra_kh > 0 && (
                      <div>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Phí trả KH</span>
                        <p style={{ margin: '2px 0 0', fontWeight: 700, color: '#6d28d9' }}>{formatCurrency(viewingItem.phi_tra_kh || 0)}</p>
                      </div>
                    )}
                    {(isAllVisible || viewingItem.gdda === user?.ho_ten) && (viewingItem.phi_tra_gdda || 0) > 0 && (
                      <div>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Phí trả GDDA</span>
                        <p style={{ margin: '2px 0 0', fontWeight: 700, color: '#1d4ed8' }}>{formatCurrency(viewingItem.phi_tra_gdda || 0)}</p>
                      </div>
                    )}
                    {(isAllVisible || viewingItem.gdkd === user?.ho_ten) && (viewingItem.phi_tra_gdkd || 0) > 0 && (
                      <div>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Phí trả GĐKD</span>
                        <p style={{ margin: '2px 0 0', fontWeight: 700, color: '#b45309' }}>{formatCurrency(viewingItem.phi_tra_gdkd || 0)}</p>
                      </div>
                    )}
                    {isAllVisible && (viewingItem.phi_tra_mkt || 0) > 0 && (
                      <div>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Phí MKT</span>
                        <p style={{ margin: '2px 0 0', fontWeight: 700, color: '#be185d' }}>{formatCurrency(viewingItem.phi_tra_mkt || 0)}</p>
                      </div>
                    )}
                    {(viewingItem.thuong_nong || 0) > 0 && (isAllVisible || viewingItem.sale_phu_trach === user?.ho_ten) && (
                      <div>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Thưởng nóng</span>
                        <p style={{ margin: '2px 0 0', fontWeight: 700, color: '#dc2626' }}>{formatCurrency(viewingItem.thuong_nong || 0)}</p>
                      </div>
                    )}
                    {(viewingItem.phi_tkkd || 0) > 0 && (isAllVisible || viewingItem.tkkd === user?.ho_ten) && (
                      <div>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Phí TKKD</span>
                        <p style={{ margin: '2px 0 0', fontWeight: 700, color: '#7c3aed' }}>{formatCurrency(viewingItem.phi_tkkd || 0)}</p>
                      </div>
                    )}
                    {isAllVisible && (viewingItem.loi_nhuan || 0) > 0 && (
                      <div>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Lợi nhuận</span>
                        <p style={{ margin: '2px 0 0', fontWeight: 800, color: '#d97706' }}>{formatCurrency(viewingItem.loi_nhuan || 0)}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowViewModal(false)}>Đóng</button>
              <button className="btn btn-primary" onClick={() => { setShowViewModal(false); openEdit(viewingItem); }}>
                <Edit3 size={14} /> Chỉnh sửa
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ────────────────────────────────────────────────────────────────── */}

      {/* Confirm Delete */}
      {showConfirm && (
        <div className="confirm-overlay" onClick={() => setShowConfirm(false)}>
          <div className="confirm-box" onClick={(e) => e.stopPropagation()}>
            <h3>Xác nhận xóa</h3>
            <p>Bạn có chắc muốn xóa deal này?</p>
            <div className="confirm-actions">
              <button className="btn btn-secondary" onClick={() => setShowConfirm(false)}>Hủy</button>
              <button className="btn btn-danger" onClick={handleDelete}>Xóa</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Wrapper bắt buộc: useSearchParams() yêu cầu Suspense boundary trong Next.js App Router
export default function PipelinePage() {
  return (
    <Suspense fallback={<div className="loading-spinner"><div className="spinner" /></div>}>
      <PipelineContent />
    </Suspense>
  );
}
