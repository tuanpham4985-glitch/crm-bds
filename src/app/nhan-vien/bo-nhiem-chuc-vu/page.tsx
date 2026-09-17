'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Plus, Edit3, Trash2, X, Award, Search, Filter, Eye, Calendar, User,
  FileText, Upload, AlertTriangle, RefreshCw, Loader2, Cloud, AlertCircle,
} from 'lucide-react';
import { BoNhiemChucVu, NhanVien, DanhMuc } from '@/lib/types';
import { formatDate } from '@/lib/utils';
import { TRANG_THAI_BO_NHIEM_COLORS } from '@/lib/constants';
import { useAuth } from '@/hooks/useAuth';
import { getFieldLabel } from '@/config/fieldLabels';
import {
  TENURE_STATUS_ACTIVE, isTenureActive,
  shouldPromptPositionSyncOnAppointment, needsPositionConfirmationAfterTermination,
  needsDismissalReviewWarning, matchesEmployeeStatusFilter,
} from '@/lib/hrm/appointment-lifecycle';
import { isSheetOwnedTenure } from '@/lib/hrm/appointment-sheet-sync';
import { canAccessHrmAppointment } from '@/lib/hrm/appointment-access';
import type { AppointmentSyncSummary } from '@/lib/hrm/appointment-sheet-sync-service';
import Link from 'next/link';

const RECONFIRM_STATUS = 'Chức vụ cần xác nhận';

function getRowStatus(tenure: BoNhiemChucVu, employee?: NhanVien): string {
  if (isTenureActive(tenure)) return TENURE_STATUS_ACTIVE;
  if (employee && needsPositionConfirmationAfterTermination(tenure.chuc_vu_bo_nhiem, employee.employee_type)) {
    return RECONFIRM_STATUS;
  }
  return 'Đã thôi giữ chức vụ';
}

// Trạng thái NHÂN VIÊN (NhanVien.trang_thai) — ĐỘC LẬP với trạng thái CHỨC VỤ
// ở trên (isTenureActive/getRowStatus). Cùng quy ước màu badge đã dùng ở
// nhan-vien/page.tsx (không tạo bảng màu mới) — nhân viên Nghỉ việc rơi vào
// nhánh mặc định 'badge-neutral', cố ý KHÔNG có nhánh riêng để tránh nhấn
// mạnh quá mức (hồ sơ vẫn phải hiển thị bình thường, không "báo lỗi").
function employeeStatusBadgeClass(trangThai: string | undefined): string {
  if (trangThai === 'Đang làm' || trangThai === 'Chính thức') return 'badge-success';
  if (trangThai === 'Học viên' || trangThai === 'Thử việc') return 'badge-info';
  if (trangThai === 'Nghỉ sinh') return 'badge-warning';
  if (trangThai === 'CTV') return '';
  return 'badge-neutral';
}

const emptyForm = {
  id_nhan_vien: '',
  chuc_vu_bo_nhiem: '',
  ngay_bo_nhiem: new Date().toISOString().split('T')[0],
  so_quyet_dinh_bo_nhiem: '',
  nguoi_ky_bo_nhiem: '',
  file_quyet_dinh_bo_nhiem: '',
  ngay_mien_nhiem: '',
  so_quyet_dinh_mien_nhiem: '',
  nguoi_ky_mien_nhiem: '',
  file_quyet_dinh_mien_nhiem: '',
  phong_ban: '',
  du_an: '',
  ghi_chu: '',
};

export default function BoNhiemChucVuPage() {
  return (
    <Suspense fallback={<div className="loading-spinner"><div className="spinner" /></div>}>
      <BoNhiemChucVuContent />
    </Suspense>
  );
}

function BoNhiemChucVuContent() {
  const { user, canEditHRM, isLoading: authLoading } = useAuth();
  const searchParams = useSearchParams();
  const prefilledEmployeeId = searchParams.get('id_nhan_vien') || '';

  const [tenures, setTenures] = useState<BoNhiemChucVu[]>([]);
  const [employees, setEmployees] = useState<NhanVien[]>([]);
  // Trạng thái NHÂN VIÊN (NhanVien.trang_thai) theo id_nhan_vien — lấy từ
  // GET /api/bo-nhiem-chuc-vu (KHÔNG từ /api/nhan-vien: route đó lọc bỏ hẳn
  // nhân viên "Nghỉ việc" cho MỌI người gọi, nên sẽ không có dữ liệu cho đúng
  // trường hợp cần hiển thị nhất — xem appointment-lifecycle.ts).
  const [employeeStatus, setEmployeeStatus] = useState<Record<string, string>>({});
  const [danhMuc, setDanhMuc] = useState<DanhMuc>({
    employee_types: [], khu_vuc: [], gioi_tinh: [], phong_KD: [],
    giai_doan_pipeline: [], trang_thai_kh: [], trang_thai_cong_viec: [], nguon: [],
    trang_thai_nhan_vien: [],
  });
  const [loading, setLoading] = useState(true);

  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<BoNhiemChucVu | null>(null);
  const [form, setForm] = useState({ ...emptyForm, _pendingId: '' });
  const [saving, setSaving] = useState(false);
  const [uploadingField, setUploadingField] = useState<'file_quyet_dinh_bo_nhiem' | 'file_quyet_dinh_mien_nhiem' | null>(null);

  const [viewItem, setViewItem] = useState<BoNhiemChucVu | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [deletingId, setDeletingId] = useState('');

  // Position-sync confirm — hiện sau khi save thành công (approved architecture §6)
  const [positionSync, setPositionSync] = useState<
    | { mode: 'appoint'; employeeId: string; employeeName: string; proposedTitle: string }
    | { mode: 'terminate'; employeeId: string; employeeName: string; vacatedTitle: string; newTitle: string }
    | null
  >(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterEmployeeStatus, setFilterEmployeeStatus] = useState('');
  const [filterEmployee, setFilterEmployee] = useState(prefilledEmployeeId);

  // Đồng bộ từ HR Sheet (THEO DÕI BỔ NHIỆM) — approved architecture HRM_APPOINTMENT_SHEET_SYNC
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<AppointmentSyncSummary | null>(null);

  const safeJson = async (res: Response) => {
    const text = await res.text();
    try { return text ? JSON.parse(text) : { success: false }; } catch { return { success: false }; }
  };

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [tRes, nvRes, dmRes] = await Promise.all([
        fetch('/api/bo-nhiem-chuc-vu'),
        fetch('/api/nhan-vien'),
        fetch('/api/danh-muc'),
      ]);
      const tData = await safeJson(tRes);
      const nvData = await safeJson(nvRes);
      const dmData = await safeJson(dmRes);
      if (tData.success) {
        setTenures(tData.data);
        setEmployeeStatus(tData.employeeStatus || {});
      }
      if (nvData.success) setEmployees(nvData.data);
      if (dmData.success) setDanhMuc(dmData.data);
    } catch (err) {
      console.error('Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    const action = searchParams.get('action');
    if (action === 'create' && prefilledEmployeeId && employees.length > 0) {
      openCreate(prefilledEmployeeId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employees.length]);

  useEffect(() => {
    if (!prefilledEmployeeId) { setFilterEmployee(''); return; }
    if (employees.length === 0) return;
    const exists = employees.some(e => e.id_nhan_vien === prefilledEmployeeId);
    setFilterEmployee(exists ? prefilledEmployeeId : '');
  }, [prefilledEmployeeId, employees]);

  const getEmployee = (id: string) => employees.find(e => e.id_nhan_vien === id);
  const getEmployeeName = (id: string, fallback?: string) => getEmployee(id)?.ho_ten || fallback || `(Không tìm thấy: ${id})`;

  const accessibleTenures = tenures; // API đã tự scope theo quyền (canManageHRM) ở server

  const filteredTenures = accessibleTenures.filter(t => {
    const empName = getEmployeeName(t.id_nhan_vien, t.ten_nhan_vien).toLowerCase();
    const matchSearch = !searchQuery
      || empName.includes(searchQuery.toLowerCase())
      || t.chuc_vu_bo_nhiem.toLowerCase().includes(searchQuery.toLowerCase());
    const matchStatus = !filterStatus || getRowStatus(t, getEmployee(t.id_nhan_vien)) === filterStatus;
    const matchEmployeeStatus = matchesEmployeeStatusFilter(employeeStatus[t.id_nhan_vien], filterEmployeeStatus);
    const matchEmployee = !filterEmployee || t.id_nhan_vien === filterEmployee;
    return matchSearch && matchStatus && matchEmployeeStatus && matchEmployee;
  });

  const openCreate = (employeeId = '') => {
    setEditingItem(null);
    const emp = employees.find(e => e.id_nhan_vien === employeeId);
    const resolvedId = emp ? employeeId : '';
    setForm({
      ...emptyForm,
      id_nhan_vien: resolvedId,
      phong_ban: emp?.phong_KD || '',
      _pendingId: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `tmp${Date.now()}`,
    });
    setShowModal(true);
  };

  const openEdit = (t: BoNhiemChucVu) => {
    setEditingItem(t);
    setForm({
      id_nhan_vien: t.id_nhan_vien,
      chuc_vu_bo_nhiem: t.chuc_vu_bo_nhiem,
      ngay_bo_nhiem: t.ngay_bo_nhiem?.split('T')[0] || '',
      so_quyet_dinh_bo_nhiem: t.so_quyet_dinh_bo_nhiem || '',
      nguoi_ky_bo_nhiem: t.nguoi_ky_bo_nhiem || '',
      file_quyet_dinh_bo_nhiem: t.file_quyet_dinh_bo_nhiem || '',
      ngay_mien_nhiem: t.ngay_mien_nhiem?.split('T')[0] || '',
      so_quyet_dinh_mien_nhiem: t.so_quyet_dinh_mien_nhiem || '',
      nguoi_ky_mien_nhiem: t.nguoi_ky_mien_nhiem || '',
      file_quyet_dinh_mien_nhiem: t.file_quyet_dinh_mien_nhiem || '',
      phong_ban: t.phong_ban || '',
      du_an: t.du_an || '',
      ghi_chu: t.ghi_chu || '',
      _pendingId: t.id,
    });
    setShowModal(true);
  };

  const handleUpload = async (field: 'file_quyet_dinh_bo_nhiem' | 'file_quyet_dinh_mien_nhiem', file: File) => {
    const kind = field === 'file_quyet_dinh_bo_nhiem' ? 'bo-nhiem' : 'mien-nhiem';
    setUploadingField(field);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('tenure_id', editingItem?.id || form._pendingId);
      fd.append('kind', kind);
      const res = await fetch('/api/bo-nhiem-chuc-vu/documents', { method: 'POST', body: fd });
      const result = await safeJson(res);
      if (result.success) {
        setForm(f => ({ ...f, [field]: result.ref }));
      } else {
        alert('Lỗi upload: ' + (result.error || 'Không thể tải file lên'));
      }
    } catch (err) {
      console.error('Upload error:', err);
      alert('Đã xảy ra lỗi khi tải file lên');
    } finally {
      setUploadingField(null);
    }
  };

  const handleSave = async () => {
    if (!form.id_nhan_vien || !form.chuc_vu_bo_nhiem || !form.ngay_bo_nhiem) {
      alert('Vui lòng điền đầy đủ thông tin bắt buộc (Nhân viên, Chức vụ, Ngày bổ nhiệm)');
      return;
    }
    setSaving(true);
    const wasActive = editingItem ? isTenureActive(editingItem) : true;
    const emp = getEmployee(form.id_nhan_vien);
    try {
      const method = editingItem ? 'PUT' : 'POST';
      const url = editingItem ? `/api/bo-nhiem-chuc-vu/${editingItem.id}` : '/api/bo-nhiem-chuc-vu';
      const body = {
        ...(editingItem ? {} : { id: form._pendingId }),
        id_nhan_vien: form.id_nhan_vien,
        ten_nhan_vien: emp?.ho_ten || '',
        chuc_vu_bo_nhiem: form.chuc_vu_bo_nhiem,
        ngay_bo_nhiem: form.ngay_bo_nhiem,
        so_quyet_dinh_bo_nhiem: form.so_quyet_dinh_bo_nhiem,
        nguoi_ky_bo_nhiem: form.nguoi_ky_bo_nhiem,
        file_quyet_dinh_bo_nhiem: form.file_quyet_dinh_bo_nhiem,
        ngay_mien_nhiem: form.ngay_mien_nhiem || null,
        so_quyet_dinh_mien_nhiem: form.so_quyet_dinh_mien_nhiem,
        nguoi_ky_mien_nhiem: form.nguoi_ky_mien_nhiem,
        file_quyet_dinh_mien_nhiem: form.file_quyet_dinh_mien_nhiem,
        phong_ban: form.phong_ban,
        du_an: form.du_an,
        ghi_chu: form.ghi_chu,
      };
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = await safeJson(res);
      if (result.success) {
        setShowModal(false);
        await fetchAll();

        // Position sync — CHỈ hỏi, KHÔNG tự ghi (approved architecture §6)
        const justTerminated = wasActive && !!form.ngay_mien_nhiem;
        if (!editingItem && emp) {
          if (shouldPromptPositionSyncOnAppointment(form.chuc_vu_bo_nhiem, emp.employee_type)) {
            setPositionSync({ mode: 'appoint', employeeId: emp.id_nhan_vien, employeeName: emp.ho_ten, proposedTitle: form.chuc_vu_bo_nhiem });
          }
        } else if (editingItem && emp && justTerminated) {
          if (needsPositionConfirmationAfterTermination(form.chuc_vu_bo_nhiem, emp.employee_type)) {
            setPositionSync({ mode: 'terminate', employeeId: emp.id_nhan_vien, employeeName: emp.ho_ten, vacatedTitle: form.chuc_vu_bo_nhiem, newTitle: '' });
          }
        }
      } else {
        alert('Lỗi: ' + (result.error || 'Không thể lưu'));
      }
    } catch (err) {
      console.error('Save error:', err);
      alert('Đã xảy ra lỗi kết nối khi lưu');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      const res = await fetch(`/api/bo-nhiem-chuc-vu/${deletingId}`, { method: 'DELETE' });
      const result = await safeJson(res);
      if (result.success) {
        setShowConfirm(false);
        fetchAll();
      } else {
        alert('Lỗi: ' + (result.error || 'Không thể xóa'));
      }
    } catch (err) {
      console.error('Delete error:', err);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch('/api/bo-nhiem-chuc-vu/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun: false }),
      });
      const result = await safeJson(res);
      if (result.success) {
        setSyncResult(result.data);
        await fetchAll();
      } else {
        alert('Lỗi đồng bộ: ' + (result.error || 'Không thể đồng bộ'));
      }
    } catch (err) {
      console.error('Sync error:', err);
      alert('Đã xảy ra lỗi khi đồng bộ');
    } finally {
      setSyncing(false);
    }
  };

  const confirmPositionSync = async () => {
    if (!positionSync) return;
    const newEmployeeType = positionSync.mode === 'appoint' ? positionSync.proposedTitle : positionSync.newTitle;
    if (positionSync.mode === 'terminate' && !newEmployeeType.trim()) {
      alert('Vui lòng chọn/nhập chức vụ mới');
      return;
    }
    const emp = getEmployee(positionSync.employeeId);
    if (!emp) { setPositionSync(null); return; }
    try {
      await fetch('/api/nhan-vien', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...emp, employee_type: newEmployeeType }),
      });
      await fetchAll();
    } catch (e) {
      console.warn('[BoNhiemChucVu] Could not sync employee_type:', e);
    } finally {
      setPositionSync(null);
    }
  };

  const totalCount = accessibleTenures.length;
  const activeCount = accessibleTenures.filter(t => isTenureActive(t)).length;
  const needsReconfirmCount = accessibleTenures.filter(t => getRowStatus(t, getEmployee(t.id_nhan_vien)) === RECONFIRM_STATUS).length;

  if (loading || authLoading) {
    return <div className="loading-spinner"><div className="spinner" /></div>;
  }

  // Chặn truy cập trực tiếp qua URL (approved architecture
  // HRM_APPOINTMENT_ACCESS_CONTROL §6) — CHỈ Ban lãnh đạo/HCNS/TKKD/Kế toán
  // (TCKT). Đây là UX phụ trợ — server (mọi route /api/bo-nhiem-chuc-vu/*)
  // đã tự chặn độc lập, page này KHÔNG BAO GIỜ là điểm chặn duy nhất. Cùng
  // convention "access denied" đã dùng ở /tai-chinh (AlertCircle + 2 dòng
  // text), không tạo UX mới.
  if (!canAccessHrmAppointment(user ? { vai_tro: user.vai_tro, employee_type: user.employee_type, phong_KD: user.phong_KD } : null)) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: 12, color: 'var(--text-secondary)' }}>
        <AlertCircle size={40} style={{ color: '#ef4444', opacity: 0.7 }} />
        <p style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Bạn không có quyền truy cập trang này</p>
        <p style={{ fontSize: 13, margin: 0 }}>Chỉ Ban lãnh đạo, Phòng HCNS, Phòng TKKD và Phòng Kế toán mới có thể xem Bổ nhiệm / Miễn nhiệm</p>
      </div>
    );
  }

  const fileUrl = (ref: string) => `/api/bo-nhiem-chuc-vu/documents/${encodeURIComponent(ref)}`;

  return (
    <div>
      <div className="page-header">
        <div className="page-header-left">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 2 }}>
            <Link href="/nhan-vien" style={{ color: 'var(--text-muted)', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: 4 }}>
              ← Nhân viên
            </Link>
          </div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Award size={28} style={{ color: 'var(--primary)' }} />
            Bổ nhiệm / Miễn nhiệm chức vụ
          </h1>
          <p>Lịch sử giữ chức vụ của nhân viên ({totalCount} bản ghi)</p>
        </div>
        {canEditHRM && (
          <div className="flex items-center gap-2">
            <button className="btn btn-secondary" onClick={handleSync} disabled={syncing}
              title="Đồng bộ từ Sheet HR (THEO DÕI BỔ NHIỆM) — Sheet là nguồn dữ liệu, không ghi ngược lại Sheet">
              {syncing ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />} {syncing ? 'Đang đồng bộ...' : 'Đồng bộ bổ nhiệm'}
            </button>
            <button className="btn btn-primary" onClick={() => openCreate()}>
              <Plus size={18} /> Tạo quyết định
            </button>
          </div>
        )}
      </div>

      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: 20 }}>
        <div className="kpi-card">
          <div className="kpi-label">Tổng số</div>
          <div className="kpi-value">{totalCount}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Đang giữ chức vụ</div>
          <div className="kpi-value" style={{ color: 'var(--success-text)' }}>{activeCount}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Chức vụ cần xác nhận</div>
          <div className="kpi-value" style={{ color: needsReconfirmCount > 0 ? '#b45309' : undefined }}>{needsReconfirmCount}</div>
        </div>
      </div>

      <div className="filter-bar">
        <div className="search-wrapper">
          <Search size={16} className="search-icon" />
          <input className="form-input" placeholder="Tìm tên nhân viên hoặc chức vụ..."
            value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
        </div>
        <div className="filter-group">
          <Filter size={14} style={{ color: 'var(--text-label)' }} />
          <select className="form-select" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="">Tất cả trạng thái</option>
            <option value={TENURE_STATUS_ACTIVE}>Đang giữ chức vụ</option>
            <option value="Đã thôi giữ chức vụ">Đã thôi giữ chức vụ</option>
            <option value={RECONFIRM_STATUS}>Chức vụ cần xác nhận</option>
          </select>
          <select className="form-select" value={filterEmployeeStatus} onChange={e => setFilterEmployeeStatus(e.target.value)}>
            <option value="">Tất cả nhân viên (mọi trạng thái)</option>
            <option value="Chính thức">Chính thức</option>
            <option value="Nghỉ việc">Nghỉ việc</option>
          </select>
          {employees.length > 0 && (
            <select className="form-select" value={filterEmployee} onChange={e => setFilterEmployee(e.target.value)} style={{ minWidth: 160 }}>
              <option value="">Tất cả nhân viên</option>
              {employees.map(e => <option key={e.id_nhan_vien} value={e.id_nhan_vien}>{e.ho_ten}</option>)}
            </select>
          )}
        </div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        {filteredTenures.length === 0 ? (
          <div className="empty-state">
            <Award size={40} />
            <h3>Chưa có quyết định bổ nhiệm</h3>
            <p>{accessibleTenures.length > 0 ? 'Không tìm thấy bản ghi phù hợp bộ lọc' : 'Nhấn "Tạo quyết định" để tạo mới'}</p>
          </div>
        ) : (
          <div className="table-wrapper" style={{ overflow: 'visible' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: 50 }}>#</th>
                  <th>Nhân viên</th>
                  <th>Trạng thái NV</th>
                  <th>{getFieldLabel('phong_ban')}</th>
                  <th>{getFieldLabel('du_an')}</th>
                  <th>{getFieldLabel('chuc_vu_bo_nhiem')}</th>
                  <th>{getFieldLabel('ngay_bo_nhiem')}</th>
                  <th>Thôi giữ từ</th>
                  <th>Trạng thái chức vụ</th>
                  <th style={{ textAlign: 'center' }}>Hồ sơ</th>
                  {canEditHRM && <th style={{ width: 130, textAlign: 'center' }}>Thao tác</th>}
                </tr>
              </thead>
              <tbody>
                {filteredTenures.map((t, idx) => {
                  const emp = getEmployee(t.id_nhan_vien);
                  const empTrangThai = employeeStatus[t.id_nhan_vien];
                  const status = getRowStatus(t, emp);
                  const statusColor = TRANG_THAI_BO_NHIEM_COLORS[status] || { bg: '#f1f5f9', text: '#475569' };
                  const dismissalWarning = needsDismissalReviewWarning(empTrangThai, t);
                  return (
                    <tr key={t.id}>
                      <td style={{ color: 'var(--text-label)' }}>{idx + 1}</td>
                      <td>
                        <div className="flex items-center gap-2">
                          <User size={14} style={{ color: 'var(--text-label)' }} />
                          <span style={{ fontWeight: 500, color: 'var(--text-title)' }}>{getEmployeeName(t.id_nhan_vien, t.ten_nhan_vien)}</span>
                        </div>
                      </td>
                      <td>
                        {empTrangThai ? (
                          <span className={`badge ${employeeStatusBadgeClass(empTrangThai)}`}>{empTrangThai}</span>
                        ) : '—'}
                      </td>
                      <td>{t.phong_ban || '—'}</td>
                      <td>{t.du_an || '—'}</td>
                      <td>
                        <span style={{ fontWeight: 600, color: 'var(--primary)' }}>{t.chuc_vu_bo_nhiem}</span>
                        {isSheetOwnedTenure(t) && (
                          <span title="Đồng bộ từ HR" style={{ display: 'inline-flex', verticalAlign: 'middle', marginLeft: 6 }}>
                            <Cloud size={12} style={{ color: 'var(--text-muted)' }} />
                          </span>
                        )}
                      </td>
                      <td><span className="flex items-center gap-2"><Calendar size={13} style={{ color: 'var(--text-label)' }} />{formatDate(t.ngay_bo_nhiem)}</span></td>
                      <td>{t.ngay_mien_nhiem ? formatDate(t.ngay_mien_nhiem) : '—'}</td>
                      <td>
                        <span className="badge" style={{ background: statusColor.bg, color: statusColor.text, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          {status === RECONFIRM_STATUS && <AlertTriangle size={12} />}
                          {status}
                        </span>
                        {dismissalWarning && (
                          <div title="Nhân viên đã nghỉ việc nhưng chưa có thông tin miễn nhiệm cho chức vụ này — cần HR/kế toán rà soát, hệ thống không tự suy đoán."
                            style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4, fontSize: '0.7rem', color: '#b45309' }}>
                            <AlertTriangle size={11} /> Chưa có thông tin miễn nhiệm
                          </div>
                        )}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <div className="flex items-center gap-1" style={{ justifyContent: 'center' }}>
                          {t.file_quyet_dinh_bo_nhiem && (
                            <a href={fileUrl(t.file_quyet_dinh_bo_nhiem)} target="_blank" rel="noopener noreferrer"
                              className="btn btn-ghost btn-icon btn-sm" title="Xem file QĐ bổ nhiệm">
                              <FileText size={14} style={{ color: 'var(--primary)' }} />
                            </a>
                          )}
                          {t.file_quyet_dinh_mien_nhiem && (
                            <a href={fileUrl(t.file_quyet_dinh_mien_nhiem)} target="_blank" rel="noopener noreferrer"
                              className="btn btn-ghost btn-icon btn-sm" title="Xem file QĐ miễn nhiệm">
                              <FileText size={14} style={{ color: 'var(--text-muted)' }} />
                            </a>
                          )}
                          {!t.file_quyet_dinh_bo_nhiem && !t.file_quyet_dinh_mien_nhiem && <span style={{ color: 'var(--text-label)' }}>—</span>}
                        </div>
                      </td>
                      {canEditHRM && (
                        <td>
                          <div className="flex items-center gap-1" style={{ justifyContent: 'center' }}>
                            <button className="btn btn-ghost btn-icon btn-sm" title="Xem chi tiết" onClick={() => setViewItem(t)}>
                              <Eye size={15} />
                            </button>
                            <button className="btn btn-ghost btn-icon btn-sm" title="Chỉnh sửa" onClick={() => openEdit(t)}>
                              <Edit3 size={15} />
                            </button>
                            <button className="btn btn-ghost btn-icon btn-sm" title="Xóa" style={{ color: 'var(--danger-text)' }}
                              onClick={() => { setDeletingId(t.id); setShowConfirm(true); }}>
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {showModal && (() => {
        const sheetOwned = !!editingItem && isSheetOwnedTenure(editingItem);
        return (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 640 }}>
            <div className="modal-header">
              <h3 className="modal-title">{editingItem ? 'Chỉnh sửa quyết định' : 'Tạo quyết định bổ nhiệm'}</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowModal(false)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              {sheetOwned && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', marginBottom: 12,
                  background: 'var(--info-bg)', color: 'var(--info-text)', borderRadius: 'var(--radius-md)', fontSize: '0.8125rem',
                }}>
                  <Cloud size={14} />
                  <span><strong>Đồng bộ từ HR</strong> — các trường hồ sơ (chức vụ, ngày, số QĐ, phòng ban, dự án) do Sheet HR quản lý và sẽ được ghi đè ở lần đồng bộ tiếp theo. Sửa trực tiếp trên Sheet &quot;THEO DÕI BỔ NHIỆM&quot;. File đính kèm, người ký và ghi chú vẫn quản lý trong App.</span>
                </div>
              )}
              <div className="form-group">
                <label className="form-label">Nhân viên *</label>
                <select className="form-select" value={form.id_nhan_vien}
                  disabled={!!editingItem}
                  onChange={e => {
                    const emp = employees.find(x => x.id_nhan_vien === e.target.value);
                    setForm({ ...form, id_nhan_vien: e.target.value, phong_ban: emp?.phong_KD || form.phong_ban });
                  }}>
                  <option value="">— Chọn nhân viên —</option>
                  {employees.map(emp => <option key={emp.id_nhan_vien} value={emp.id_nhan_vien}>{emp.ho_ten}</option>)}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div className="form-group">
                  <label className="form-label">{getFieldLabel('phong_ban')}</label>
                  <select className="form-select" value={form.phong_ban} disabled={sheetOwned} onChange={e => setForm({ ...form, phong_ban: e.target.value })}>
                    <option value="">— Chọn phòng —</option>
                    {danhMuc.phong_KD.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">{getFieldLabel('du_an')}</label>
                  <input className="form-input" value={form.du_an} disabled={sheetOwned} onChange={e => setForm({ ...form, du_an: e.target.value })} placeholder="Tên dự án (nếu có)" />
                </div>
              </div>

              <div style={{ padding: '10px 12px', background: 'var(--bg-page)', borderRadius: 'var(--radius-md)', marginTop: 4, marginBottom: 4 }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-label)', textTransform: 'uppercase', marginBottom: 8 }}>Thông tin bổ nhiệm</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div className="form-group">
                    <label className="form-label">{getFieldLabel('chuc_vu_bo_nhiem')} *</label>
                    <input className="form-input" list="chuc-vu-options" value={form.chuc_vu_bo_nhiem} disabled={sheetOwned}
                      onChange={e => setForm({ ...form, chuc_vu_bo_nhiem: e.target.value })} placeholder="VD: Giám đốc Kinh doanh" />
                    <datalist id="chuc-vu-options">
                      {danhMuc.employee_types.map(cd => <option key={cd} value={cd} />)}
                    </datalist>
                  </div>
                  <div className="form-group">
                    <label className="form-label">{getFieldLabel('ngay_bo_nhiem')} *</label>
                    <input className="form-input" type="date" value={form.ngay_bo_nhiem} disabled={sheetOwned} onChange={e => setForm({ ...form, ngay_bo_nhiem: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">{getFieldLabel('so_quyet_dinh_bo_nhiem')}</label>
                    <input className="form-input" value={form.so_quyet_dinh_bo_nhiem} disabled={sheetOwned} onChange={e => setForm({ ...form, so_quyet_dinh_bo_nhiem: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">{getFieldLabel('nguoi_ky_bo_nhiem')}</label>
                    <input className="form-input" value={form.nguoi_ky_bo_nhiem} onChange={e => setForm({ ...form, nguoi_ky_bo_nhiem: e.target.value })} />
                  </div>
                </div>
                <FileFieldInput
                  label="File QĐ bổ nhiệm"
                  value={form.file_quyet_dinh_bo_nhiem}
                  uploading={uploadingField === 'file_quyet_dinh_bo_nhiem'}
                  onUpload={file => handleUpload('file_quyet_dinh_bo_nhiem', file)}
                  onClear={() => setForm({ ...form, file_quyet_dinh_bo_nhiem: '' })}
                  fileUrl={fileUrl}
                />
              </div>

              <div style={{ padding: '10px 12px', background: 'var(--bg-page)', borderRadius: 'var(--radius-md)' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-label)', textTransform: 'uppercase', marginBottom: 8 }}>
                  Thông tin thôi giữ chức vụ / miễn nhiệm <span style={{ fontWeight: 400, textTransform: 'none' }}>(để trống nếu đang giữ)</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div className="form-group">
                    <label className="form-label">{getFieldLabel('ngay_mien_nhiem')}</label>
                    <input className="form-input" type="date" value={form.ngay_mien_nhiem} disabled={sheetOwned} onChange={e => setForm({ ...form, ngay_mien_nhiem: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">{getFieldLabel('so_quyet_dinh_mien_nhiem')}</label>
                    <input className="form-input" value={form.so_quyet_dinh_mien_nhiem} disabled={sheetOwned} onChange={e => setForm({ ...form, so_quyet_dinh_mien_nhiem: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">{getFieldLabel('nguoi_ky_mien_nhiem')}</label>
                    <input className="form-input" value={form.nguoi_ky_mien_nhiem} onChange={e => setForm({ ...form, nguoi_ky_mien_nhiem: e.target.value })} />
                  </div>
                </div>
                <FileFieldInput
                  label="File QĐ miễn nhiệm"
                  value={form.file_quyet_dinh_mien_nhiem}
                  uploading={uploadingField === 'file_quyet_dinh_mien_nhiem'}
                  onUpload={file => handleUpload('file_quyet_dinh_mien_nhiem', file)}
                  onClear={() => setForm({ ...form, file_quyet_dinh_mien_nhiem: '' })}
                  fileUrl={fileUrl}
                />
              </div>

              <div className="form-group">
                <label className="form-label">{getFieldLabel('ghi_chu')}</label>
                <textarea className="form-textarea" value={form.ghi_chu} onChange={e => setForm({ ...form, ghi_chu: e.target.value })} rows={2} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Hủy</button>
              <button className="btn btn-primary" onClick={handleSave}
                disabled={saving || !form.id_nhan_vien || !form.chuc_vu_bo_nhiem || !form.ngay_bo_nhiem}>
                {saving ? 'Đang lưu...' : (editingItem ? 'Cập nhật' : 'Tạo quyết định')}
              </button>
            </div>
          </div>
        </div>
        );
      })()}

      {/* View Detail Modal */}
      {viewItem && (
        <div className="modal-overlay" onClick={() => setViewItem(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
            <div className="modal-header">
              <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                Chi tiết quyết định
                {isSheetOwnedTenure(viewItem) && (
                  <span className="badge" style={{ background: 'var(--info-bg)', color: 'var(--info-text)', display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 500 }}>
                    <Cloud size={11} /> Đồng bộ từ HR
                  </span>
                )}
              </h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setViewItem(null)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-label)', marginBottom: 4, fontWeight: 500, textTransform: 'uppercase' }}>Nhân viên</div>
                  <div style={{ fontSize: '0.9375rem', fontWeight: 600 }}>{getEmployeeName(viewItem.id_nhan_vien, viewItem.ten_nhan_vien)}</div>
                </div>
                {employeeStatus[viewItem.id_nhan_vien] && (
                  <span className={`badge ${employeeStatusBadgeClass(employeeStatus[viewItem.id_nhan_vien])}`}>
                    {employeeStatus[viewItem.id_nhan_vien]}
                  </span>
                )}
              </div>
              {needsDismissalReviewWarning(employeeStatus[viewItem.id_nhan_vien], viewItem) && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', marginBottom: 12,
                  background: '#fffbeb', color: '#b45309', borderRadius: 'var(--radius-md)', fontSize: '0.8125rem',
                }}>
                  <AlertTriangle size={14} />
                  <span>Nhân viên đã nghỉ việc nhưng chức vụ này chưa có thông tin miễn nhiệm — cần HR/kế toán rà soát.</span>
                </div>
              )}
              <DetailSection title="Thông tin bổ nhiệm" fields={[
                { label: getFieldLabel('chuc_vu_bo_nhiem'), value: viewItem.chuc_vu_bo_nhiem },
                { label: getFieldLabel('ngay_bo_nhiem'), value: formatDate(viewItem.ngay_bo_nhiem) },
                { label: getFieldLabel('so_quyet_dinh_bo_nhiem'), value: viewItem.so_quyet_dinh_bo_nhiem || '—' },
                { label: getFieldLabel('nguoi_ky_bo_nhiem'), value: viewItem.nguoi_ky_bo_nhiem || '—' },
              ]} fileRef={viewItem.file_quyet_dinh_bo_nhiem} fileUrl={fileUrl} />
              <DetailSection title="Thông tin thôi giữ chức vụ / miễn nhiệm" fields={[
                { label: 'Chức vụ thôi giữ', value: viewItem.ngay_mien_nhiem ? viewItem.chuc_vu_bo_nhiem : '—' },
                { label: getFieldLabel('ngay_mien_nhiem'), value: viewItem.ngay_mien_nhiem ? formatDate(viewItem.ngay_mien_nhiem) : '—' },
                { label: getFieldLabel('so_quyet_dinh_mien_nhiem'), value: viewItem.so_quyet_dinh_mien_nhiem || '—' },
                { label: getFieldLabel('nguoi_ky_mien_nhiem'), value: viewItem.nguoi_ky_mien_nhiem || '—' },
              ]} fileRef={viewItem.file_quyet_dinh_mien_nhiem} fileUrl={fileUrl} />
              {viewItem.ghi_chu && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-label)', marginBottom: 4, fontWeight: 500, textTransform: 'uppercase' }}>Ghi chú</div>
                  <div style={{ fontSize: '0.875rem', whiteSpace: 'pre-wrap' }}>{viewItem.ghi_chu}</div>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setViewItem(null)}>Đóng</button>
              {canEditHRM && (
                <button className="btn btn-primary" onClick={() => { setViewItem(null); openEdit(viewItem); }}>
                  <Edit3 size={15} /> Chỉnh sửa
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Position sync confirm */}
      {positionSync && (
        <div className="modal-overlay" onClick={() => setPositionSync(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 460 }}>
            <div className="modal-header">
              <h3 className="modal-title">Cập nhật chức vụ hiện tại?</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setPositionSync(null)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              {positionSync.mode === 'appoint' ? (
                <p>
                  Cập nhật chức vụ hiện tại của <strong>{positionSync.employeeName}</strong> thành{' '}
                  <strong>&quot;{positionSync.proposedTitle}&quot;</strong>?
                </p>
              ) : (
                <>
                  <p style={{ marginBottom: 12 }}>
                    <strong>{positionSync.employeeName}</strong> vừa thôi giữ chức vụ <strong>&quot;{positionSync.vacatedTitle}&quot;</strong> —
                    đây cũng đang là chức vụ hiện tại của nhân viên trong hệ thống. Bạn có muốn cập nhật chức vụ mới ngay bây giờ không?
                  </p>
                  <div className="form-group">
                    <label className="form-label">Chức vụ mới</label>
                    <input className="form-input" list="chuc-vu-options-sync" value={positionSync.newTitle}
                      onChange={e => setPositionSync({ ...positionSync, newTitle: e.target.value })} placeholder="Nhập/chọn chức vụ mới" />
                    <datalist id="chuc-vu-options-sync">
                      {danhMuc.employee_types.map(cd => <option key={cd} value={cd} />)}
                    </datalist>
                  </div>
                </>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setPositionSync(null)}>
                {positionSync.mode === 'appoint' ? 'Không' : 'Chưa cập nhật'}
              </button>
              <button className="btn btn-primary" onClick={confirmPositionSync}>
                {positionSync.mode === 'appoint' ? 'Cập nhật' : 'Xác nhận'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Delete */}
      {showConfirm && (
        <div className="confirm-overlay" onClick={() => setShowConfirm(false)}>
          <div className="confirm-box" onClick={e => e.stopPropagation()}>
            <h3>Xác nhận xóa</h3>
            <p>Bạn có chắc muốn xóa quyết định này? Thao tác không thể hoàn tác.</p>
            <div className="confirm-actions">
              <button className="btn btn-secondary" onClick={() => setShowConfirm(false)}>Hủy</button>
              <button className="btn btn-danger" onClick={handleDelete}>Xóa</button>
            </div>
          </div>
        </div>
      )}

      {/* Sync result summary — approved architecture §9, no stack traces exposed */}
      {syncResult && (
        <div className="modal-overlay" onClick={() => setSyncResult(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
            <div className="modal-header">
              <h3 className="modal-title">Kết quả đồng bộ bổ nhiệm</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setSyncResult(null)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
                {[
                  { label: 'Tổng dòng nghiệp vụ', value: syncResult.totalBusinessRows },
                  { label: 'Tạo mới', value: syncResult.created, color: 'var(--success-text)' },
                  { label: 'Cập nhật', value: syncResult.updated, color: 'var(--primary)' },
                  { label: 'Không thay đổi', value: syncResult.unchanged },
                  { label: 'Bỏ qua', value: syncResult.skipped.length, color: syncResult.skipped.length ? '#b45309' : undefined },
                  { label: 'Lỗi', value: syncResult.errors.length, color: syncResult.errors.length ? 'var(--danger-text)' : undefined },
                ].map((s, i) => (
                  <div key={i} style={{ padding: '10px 12px', background: 'var(--bg-page)', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
                    <div style={{ fontSize: '1.25rem', fontWeight: 700, color: s.color }}>{s.value}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-label)' }}>{s.label}</div>
                  </div>
                ))}
              </div>
              {syncResult.skipped.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-label)', textTransform: 'uppercase', marginBottom: 6 }}>Dòng bị bỏ qua (HR cần bổ sung trên Sheet)</div>
                  {syncResult.skipped.map((s, i) => (
                    <div key={i} style={{ fontSize: '0.8125rem', padding: '6px 10px', background: 'var(--bg-page)', borderRadius: 6, marginBottom: 4 }}>
                      Dòng {s.row} — {s.ho_ten || s.ma_nv || '(không rõ)'}: {s.reason}
                    </div>
                  ))}
                </div>
              )}
              {syncResult.errors.length > 0 && (
                <div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--danger-text)', textTransform: 'uppercase', marginBottom: 6 }}>Lỗi / xung đột cần kiểm tra</div>
                  {syncResult.errors.map((e, i) => (
                    <div key={i} style={{ fontSize: '0.8125rem', padding: '6px 10px', background: 'var(--danger-bg)', color: 'var(--danger-text)', borderRadius: 6, marginBottom: 4 }}>
                      Dòng {e.row} — {e.ho_ten || e.ma_nv || '(không rõ)'}: {e.reason}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-primary" onClick={() => setSyncResult(null)}>Đóng</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FileFieldInput({ label, value, uploading, onUpload, onClear, fileUrl }: {
  label: string; value: string; uploading: boolean;
  onUpload: (file: File) => void; onClear: () => void; fileUrl: (ref: string) => string;
}) {
  return (
    <div className="form-group" style={{ marginTop: 8, marginBottom: 0 }}>
      <label className="form-label">{label}</label>
      <div className="flex items-center gap-2">
        <label className="btn btn-secondary btn-sm" style={{ cursor: uploading ? 'wait' : 'pointer' }}>
          <Upload size={13} /> {uploading ? 'Đang tải...' : 'Chọn file'}
          <input type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: 'none' }} disabled={uploading}
            onChange={e => { const f = e.target.files?.[0]; if (f) onUpload(f); e.target.value = ''; }} />
        </label>
        {value && (
          <>
            <a href={fileUrl(value)} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.8125rem', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <FileText size={13} /> Xem file
            </a>
            <button type="button" className="btn btn-ghost btn-icon btn-sm" title="Bỏ file" onClick={onClear}><X size={13} /></button>
          </>
        )}
      </div>
      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>PDF, JPG, PNG — tối đa 4MB</span>
    </div>
  );
}

function DetailSection({ title, fields, fileRef, fileUrl }: {
  title: string; fields: { label: string; value: string }[]; fileRef?: string; fileUrl: (ref: string) => string;
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-label)', textTransform: 'uppercase', marginBottom: 8 }}>{title}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {fields.map((f, i) => (
          <div key={i} style={{ padding: '10px 12px', background: 'var(--bg-page)', borderRadius: 'var(--radius-md)' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-label)', marginBottom: 2 }}>{f.label}</div>
            <div style={{ fontSize: '0.875rem', fontWeight: 500 }}>{f.value}</div>
          </div>
        ))}
      </div>
      {fileRef && (
        <a href={fileUrl(fileRef)} target="_blank" rel="noopener noreferrer"
          style={{ marginTop: 8, fontSize: '0.8125rem', color: 'var(--primary)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <FileText size={13} /> Xem file đính kèm
        </a>
      )}
    </div>
  );
}
