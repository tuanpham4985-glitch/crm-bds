'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Plus, Edit3, Trash2, X, FileText, Download,
  Search, Filter, Eye, Calendar, DollarSign, User
} from 'lucide-react';
import { HopDong, NhanVien, DanhMuc } from '@/lib/types';
import { formatDate, formatCurrency } from '@/lib/utils';
import { TRANG_THAI_HOP_DONG_COLORS } from '@/lib/constants';
import { useAuth } from '@/hooks/useAuth';
import { CONTRACT_TEMPLATES } from '@/config/contractTemplates';
import { detectEmployeeClassification, getContractTemplate } from '@/lib/contractEngine';
import type { Department, ContractCategory } from '@/config/contractTemplates';
import { FIELD_LABELS, getFieldLabel, DEPARTMENT_LABELS } from '@/config/fieldLabels';
import Link from 'next/link';

function getContractStatus(ngay_ket_thuc: string): string {
  if (!ngay_ket_thuc) return 'Còn hiệu lực';
  const endDate = new Date(ngay_ket_thuc);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return endDate < today ? 'Hết hạn' : 'Còn hiệu lực';
}

/**
 * Extract numeric part from id_nhan_vien.
 * "NV00001" → "00001", "NV123" → "123", fallback to raw string
 */
function extractEmployeeNumber(idNhanVien: string): string {
  if (!idNhanVien) return '';
  const match = idNhanVien.match(/\d+/);
  return match ? match[0] : idNhanVien;
}

/**
 * Generate contract number: {employeeNumber}/{suffix}
 * Thử việc  → 00001/VIC_HĐTV
 * Chính thức → 00001/VIC_HĐLĐ
 */
function generateContractNumber(idNhanVien: string, contractType: string): string {
  const empNum = extractEmployeeNumber(idNhanVien);
  if (!empNum) return '';
  const lowerType = contractType?.toLowerCase() || '';
  let suffix = 'VIC_HĐLĐ';
  if (lowerType.includes('thử việc')) suffix = 'VIC_HĐTV';
  else if (lowerType.includes('học viên')) suffix = 'VIC_HĐTN';
  else if (lowerType.includes('cộng tác viên') || lowerType.includes('ctv')) suffix = 'VIC_HĐCTV';
  
  return `${empNum}/${suffix}`;
}

// ---- Mức lương cơ bản mặc định theo chức danh ----
// Tra theo employee_type trước; nếu không khớp và khối là BO → dùng mức BO chung.
const SALARY_DEFAULTS: Record<string, number> = {
  'NVKD':  5_350_000,
  'TPKD':  5_500_000,
  'GĐKD':  6_000_000,
  'GDDA':  6_000_000,
};
// Các chức danh được loại trừ khỏi mức BO mặc định
const BO_SALARY_EXCLUDE = new Set(['NVKD', 'TPKD', 'GĐKD', 'GDDA', 'Chủ tịch', 'CEO']);
const BO_DEFAULT_SALARY = 7_000_000;

/**
 * Trả về mức LCB mặc định (dạng string) dựa theo chức danh + khối.
 * Trả '' nếu không có mức mặc định (VD: Chủ tịch, CEO).
 */
function getDefaultSalary(employee_type: string, department: string): string {
  if (employee_type && SALARY_DEFAULTS[employee_type] !== undefined) {
    return String(SALARY_DEFAULTS[employee_type]);
  }
  // Khối BO: áp dụng mức chung, trừ các chức danh đặc biệt
  if (department === 'BO' && employee_type && !BO_SALARY_EXCLUDE.has(employee_type)) {
    return String(BO_DEFAULT_SALARY);
  }
  return '';
}

/**
 * Safely parse date string to YYYY-MM-DD format for <input type="date">
 * Handles both ISO strings and DD/MM/YYYY
 */
function parseToISODate(dateVal: any): string {
  if (!dateVal) return '';
  try {
    const str = String(dateVal).trim();
    const parts = str.split(/[\/\-]/);
    if (parts.length === 3) {
      const p1 = parseInt(parts[0], 10);
      const p2 = parseInt(parts[1], 10);
      const p3 = parseInt(parts[2], 10);
      
      if (p1 <= 31 && p2 <= 12 && p3 > 1900) {
        return `${p3}-${String(p2).padStart(2, '0')}-${String(p1).padStart(2, '0')}`;
      }
    }
    
    const d = new Date(str);
    if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
  } catch (e) {}
  return '';
}

export default function HopDongPage() {
  return (
    <Suspense fallback={<div className="loading-spinner"><div className="spinner" /></div>}>
      <HopDongContent />
    </Suspense>
  );
}

function HopDongContent() {
  const { isAdmin, isHR, canEditHRM, isLoading: authLoading, user } = useAuth();
  const searchParams = useSearchParams();
  const prefilledEmployeeId = searchParams.get('id_nhan_vien') || '';

  const [contracts, setContracts] = useState<HopDong[]>([]);
  const [employees, setEmployees] = useState<NhanVien[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<HopDong | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [deletingId, setDeletingId] = useState('');
  const [saving, setSaving] = useState(false);

  // View detail modal
  const [viewItem, setViewItem] = useState<HopDong | null>(null);

  // Export modal
  const [exportItem, setExportItem] = useState<HopDong | null>(null);
  const [exportForm, setExportForm] = useState({
    so_cccd: '', dia_chi: '', ngay_thang_nam_cap: '', noi_cap: '',
    ma_so_thue: '', so_tk_ngan_hang: '', ten_ngan_hang_thu_huong: '',
  });
  const [exporting, setExporting] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterEmployee, setFilterEmployee] = useState(prefilledEmployeeId);

  // Form
  const [form, setForm] = useState({
    id_nhan_vien: prefilledEmployeeId,
    so_hop_dong: '',
    contract_type: 'Thử việc',
    ngay_bat_dau: '',
    ngay_ket_thuc: '',
    luong_co_ban: '',
    ghi_chu: '',
    department: 'KD' as Department,
    phong_KD: '',
    employee_type: '',
  });

  const [danhMuc, setDanhMuc] = useState<DanhMuc>({
    employee_types: [], khu_vuc: [], gioi_tinh: [], phong_KD: [],
    giai_doan_pipeline: [], trang_thai_kh: [], trang_thai_cong_viec: [], nguon: [],
    trang_thai_nhan_vien: []
  });

  // Map { [chuc_danh]: cong_viec_phai_lam } from NHIEM_VU sheet
  const [nhiemVu, setNhiemVu] = useState<Record<string, string>>({});

  // Auto-computed contract template based on form selections
  const selectedEmployee = employees.find(e => e.id_nhan_vien === form.id_nhan_vien);
  const classification = detectEmployeeClassification(
    selectedEmployee?.vai_tro || 'Sale',
    form.contract_type,
    selectedEmployee?.employee_type
  );
  // Override department from form if user changed it manually
  const resolvedTemplate = getContractTemplate(classification.contract_category, form.department);

  const safeJson = async (res: Response) => {
    const text = await res.text();
    try {
      return text ? JSON.parse(text) : { success: false };
    } catch {
      return { success: false };
    }
  };

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [hdRes, nvRes, dmRes, nvuRes] = await Promise.all([
        fetch('/api/contracts'),
        fetch('/api/nhan-vien'),
        fetch('/api/danh-muc'),
        fetch('/api/nhiem-vu'),
      ]);
      const hdData = await safeJson(hdRes);
      const nvData = await safeJson(nvRes);
      const dmData = await safeJson(dmRes);
      const nvuData = await safeJson(nvuRes);

      if (hdData.success) setContracts(hdData.data);
      if (nvData.success) setEmployees(nvData.data);
      if (dmData.success) setDanhMuc(dmData.data);
      if (nvuData.success) setNhiemVu(nvuData.data || {});
    } catch (err) {
      console.error('Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Auto-open create modal if id_nhan_vien is in URL with action=create
  useEffect(() => {
    const action = searchParams.get('action');
    if (action === 'create' && prefilledEmployeeId && employees.length > 0) {
      openCreate(prefilledEmployeeId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employees.length]);

  // Sync URL id_nhan_vien to filter — only if the ID exists in current employee list
  useEffect(() => {
    if (!prefilledEmployeeId) {
      setFilterEmployee('');
      return;
    }
    if (employees.length === 0) return; // wait until employees are loaded
    const exists = employees.some(e => e.id_nhan_vien === prefilledEmployeeId);
    setFilterEmployee(exists ? prefilledEmployeeId : '');
  }, [prefilledEmployeeId, employees]);

  const getEmployeeName = (employeeId: string, fallbackName?: string) => {
    if (!employeeId && !fallbackName) return '(Chưa chọn)';
    const emp = employees.find(e => e.id_nhan_vien === employeeId);
    return emp?.ho_ten || fallbackName || `(Không tìm thấy: ${employeeId})`;
  };

  const getActiveContractCount = (employeeId: string) => {
    return contracts.filter(
      c => c.id_nhan_vien === employeeId && getContractStatus(c.ngay_ket_thuc) === 'Còn hiệu lực'
    ).length;
  };

  const accessibleContracts = contracts.filter(c => {
    if (canEditHRM) return true;
    return user && c.id_nhan_vien === user.id_nhan_vien;
  });

  // Filtered contracts
  const filteredContracts = accessibleContracts.filter(hd => {
    const empName = getEmployeeName(hd.id_nhan_vien, hd.ten_nhan_vien).toLowerCase();
    const matchSearch = !searchQuery ||
      hd.so_hop_dong.toLowerCase().includes(searchQuery.toLowerCase()) ||
      empName.includes(searchQuery.toLowerCase());
    const matchType = !filterType || hd.contract_type === filterType;
    const matchStatus = !filterStatus || getContractStatus(hd.ngay_ket_thuc) === filterStatus;
    const matchEmployee = !filterEmployee || hd.id_nhan_vien === filterEmployee;
    return matchSearch && matchType && matchStatus && matchEmployee;
  });

  const openCreate = (employeeId = '') => {
    setEditingItem(null);
    const emp = employees.find(e => e.id_nhan_vien === employeeId);

    // If the prefilled ID from URL doesn't match any current employee, clear it
    // to prevent saving contracts with stale/mismatched id_nhan_vien
    const resolvedId = emp ? employeeId : '';

    // Auto-detect contract type from employee status
    const initialContractType = emp?.trang_thai === 'Học viên' ? 'Học viên' : 'Thử việc';

    const classification = detectEmployeeClassification(emp?.vai_tro || 'Sale', initialContractType, emp?.employee_type);
    const dept: Department = classification.department;
    const soHD = generateContractNumber(resolvedId, initialContractType);

    const empType = emp?.employee_type || '';
    setForm({
      id_nhan_vien: resolvedId,
      so_hop_dong: soHD,
      contract_type: initialContractType,
      ngay_bat_dau: new Date().toISOString().split('T')[0],
      ngay_ket_thuc: '',
      luong_co_ban: getDefaultSalary(empType, dept),
      ghi_chu: '',
      department: dept,
      phong_KD: emp?.phong_KD || '',
      employee_type: empType,
    });
    setShowModal(true);
  };

  const openEdit = (hd: HopDong) => {
    setEditingItem(hd);
    const emp = employees.find(e => e.id_nhan_vien === hd.id_nhan_vien)
      ?? employees.find(e => hd.ten_nhan_vien && e.ho_ten === hd.ten_nhan_vien);
    const classification = detectEmployeeClassification(emp?.vai_tro || 'Sale', hd.contract_type || 'Thử việc', emp?.employee_type);
    const dept: Department = (hd.department as Department) || classification.department;
    // If found by name fallback, use the current employee ID to fix the mismatch
    const resolvedId = emp?.id_nhan_vien || hd.id_nhan_vien;
    setForm({
      id_nhan_vien: resolvedId,
      so_hop_dong: hd.so_hop_dong,
      contract_type: hd.contract_type || 'Thử việc',
      ngay_bat_dau: parseToISODate(hd.ngay_bat_dau),
      ngay_ket_thuc: parseToISODate(hd.ngay_ket_thuc),
      luong_co_ban: String(hd.luong_co_ban || ''),
      ghi_chu: hd.ghi_chu,
      department: dept,
      phong_KD: hd.phong_KD || emp?.phong_KD || '',
      employee_type: hd.employee_type || emp?.employee_type || '',
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.id_nhan_vien || !form.so_hop_dong || !form.ngay_bat_dau) {
      alert('Vui lòng điền đầy đủ thông tin bắt buộc');
      return;
    }
    setSaving(true);
    try {
      const method = editingItem ? 'PUT' : 'POST';
      // Use contract engine to resolve template
      const engineResult = resolvedTemplate;
      // Snapshot employee name at save time so it survives future ID changes
      const empSnap = employees.find(e => e.id_nhan_vien === form.id_nhan_vien);
      const ten_nhan_vien = empSnap?.ho_ten || editingItem?.ten_nhan_vien || '';
      const body = editingItem
        ? {
          ...editingItem, ...form,
          ten_nhan_vien,
          luong_co_ban: Number(form.luong_co_ban) || 0,
          department: form.department,
          contract_type: engineResult?.contract_type || form.contract_type,
          template_file: engineResult?.template_file || '',
        }
        : {
          ...form,
          ten_nhan_vien,
          id: form.so_hop_dong,
          luong_co_ban: Number(form.luong_co_ban) || 0,
          department: form.department,
          contract_type: engineResult?.contract_type || form.contract_type,
          template_file: engineResult?.template_file || '',
          created_at: new Date().toISOString(),
        };
      const res = await fetch('/api/contracts', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = await res.json();
      if (result.success) {
        alert(editingItem ? 'Cập nhật hợp đồng thành công!' : 'Tạo hợp đồng thành công!');
        setShowModal(false);
        fetchAll();
      } else {
        alert('Lỗi: ' + (result.error || 'Không thể lưu hợp đồng'));
      }
    } catch (err) {
      console.error('Save error:', err);
      alert('Đã xảy ra lỗi kết nối khi lưu hợp đồng');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      const res = await fetch('/api/contracts', {
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

  const handleExport = async () => {
    if (!exportItem) return;
    setExporting(true);
    try {
      const emp = employees.find(e => e.id_nhan_vien === exportItem.id_nhan_vien)
        ?? employees.find(e => exportItem.ten_nhan_vien && e.ho_ten === exportItem.ten_nhan_vien);
      const now = new Date();
      // Resolve template_file from stored data or re-compute via engine
      const exportClassification = detectEmployeeClassification(emp?.vai_tro || 'Sale', exportItem.contract_type, emp?.employee_type);
      const exportDept = (exportItem.department || exportClassification.department) as Department;
      const exportTemplate = getContractTemplate(exportClassification.contract_category, exportDept);
      const templateFile = exportItem.template_file || exportTemplate?.template_file || '';
      // Merge: exportForm (user input) overrides employee defaults for shared fields
      // Resolve cong_viec_phai_lam from NHIEM_VU sheet based on employee's chuc_danh
      const chucDanh = emp?.employee_type || exportItem.employee_type || '';
      const congViecPhaiLam = (chucDanh && nhiemVu[chucDanh]) ? nhiemVu[chucDanh] : '';

      const mergedData = {
        // Template file
        template_file: templateFile,
        // Contract fields
        so_hop_dong: exportItem.so_hop_dong,
        contract_type: exportItem.contract_type,
        ngay_bat_dau: formatDate(exportItem.ngay_bat_dau),
        ngay_ket_thuc: formatDate(exportItem.ngay_ket_thuc),
        luong_co_ban: new Intl.NumberFormat('vi-VN').format(exportItem.luong_co_ban),
        department: exportDept,
        phong_KD: exportItem.phong_KD || '',
        // Employee fields from NHAN_VIEN (defaults)
        ho_ten: emp?.ho_ten || '',
        ten_nhan_vien: emp?.ho_ten || '',
        ten_ctv: emp?.ho_ten || '',
        ngay_sinh: emp?.ngay_sinh || '',
        gioi_tinh: emp?.gioi_tinh || '',
        so_cccd: emp?.so_cccd || '',
        ngay_cap: emp?.ngay_cap || '',
        noi_cap: emp?.noi_cap || '',
        HKTT: emp?.HKTT || '',
        ma_so_thue: emp?.ma_so_thue || '',
        employee_type: chucDanh,
        email: emp?.email || '',
        so_dien_thoai: emp?.so_dien_thoai || '',
        // Signing date
        ngay_ky: String(now.getDate()),
        thang_ky: String(now.getMonth() + 1),
        nam_ky: String(now.getFullYear()),
        // Nhiệm vụ / công việc phải làm (tự động từ NHIEM_VU theo chức danh)
        cong_viec_phai_lam: congViecPhaiLam,
      };
      // Export form user input overrides (so_cccd, noi_cap, ma_so_thue, bank info, etc.)
      const finalData = { ...mergedData };
      for (const [key, val] of Object.entries(exportForm)) {
        if (val) (finalData as Record<string, string>)[key] = val;
      }
      console.log('[Export] Final data to generate:', finalData);
      const res = await fetch('/api/contracts/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(finalData),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || 'Export failed');
      }

      // Detect response type: ZIP (multiple docs) or single .docx
      const contentType = res.headers.get('Content-Type') || '';
      const fileCount = res.headers.get('X-File-Count');
      const isZip = contentType.includes('application/zip');

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;

      if (isZip) {
        a.download = `ho-so-${exportItem.so_hop_dong}.zip`;
      } else {
        a.download = `hop-dong-${exportItem.so_hop_dong}.docx`;
      }

      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      setExportItem(null);

      // Show info about what was downloaded
      if (isZip && fileCount) {
        alert(`✅ Đã tải xuống ${fileCount} tài liệu trong file ho-so-${exportItem.so_hop_dong}.zip\n\nBao gồm:\n• Hợp đồng chính\n• Cam kết bảo mật thông tin${exportDept === 'KD' ? '\n• Cam kết ứng xử NVKD' : ''}`);
      }
    } catch (err: any) {
      console.error('Export error:', err);
      alert('Lỗi xuất hợp đồng: ' + (err.message || 'Vui lòng thử lại.'));
    } finally {
      setExporting(false);
    }
  };

  // KPI stats
  const totalContracts = accessibleContracts.length;
  const activeContracts = accessibleContracts.filter(c => getContractStatus(c.ngay_ket_thuc) === 'Còn hiệu lực').length;
  const expiredContracts = totalContracts - activeContracts;

  if (loading || authLoading) {
    return <div className="loading-spinner"><div className="spinner" /></div>;
  }

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div className="page-header-left">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 2 }}>
            <Link href="/nhan-vien" style={{
              color: 'var(--text-muted)', fontSize: '0.875rem',
              display: 'flex', alignItems: 'center', gap: 4,
              transition: 'color 0.15s',
            }}>
              ← Nhân viên
            </Link>
          </div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <FileText size={28} style={{ color: 'var(--primary)' }} />
            Quản lý hợp đồng
          </h1>
          <p>Quản lý hợp đồng lao động ({totalContracts} hợp đồng)</p>
        </div>
        {canEditHRM && (
          <button className="btn btn-primary" onClick={() => openCreate()}>
            <Plus size={18} />
            Tạo hợp đồng
          </button>
        )}
      </div>

      {/* KPI Cards */}
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: 20 }}>
        <div className="kpi-card">
          <div className="kpi-label">Tổng hợp đồng</div>
          <div className="kpi-value">{totalContracts}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Còn hiệu lực</div>
          <div className="kpi-value" style={{ color: 'var(--success-text)' }}>{activeContracts}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Hết hạn</div>
          <div className="kpi-value" style={{ color: 'var(--danger-text)' }}>{expiredContracts}</div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="filter-bar">
        <div className="search-wrapper">
          <Search size={16} className="search-icon" />
          <input
            className="form-input"
            placeholder="Tìm số hợp đồng hoặc tên nhân viên..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="filter-group">
          <Filter size={14} style={{ color: 'var(--text-label)' }} />
          <select className="form-select" value={filterType}
            onChange={e => setFilterType(e.target.value)}>
            <option value="">Tất cả loại</option>
            {CONTRACT_TEMPLATES.map(t => (
              <option key={t.contract_type} value={t.contract_type}>{t.contract_type}</option>
            ))}
            <option value="Thử việc">Thử việc (cũ)</option>
            <option value="Chính thức">Chính thức (cũ)</option>
            <option value="CTV">CTV</option>
          </select>
          <select className="form-select" value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}>
            <option value="">Tất cả trạng thái</option>
            <option value="Còn hiệu lực">Còn hiệu lực</option>
            <option value="Hết hạn">Hết hạn</option>
          </select>
          {employees.length > 0 && (
            <select className="form-select" value={filterEmployee}
              onChange={e => setFilterEmployee(e.target.value)}
              style={{ minWidth: 160 }}>
              <option value="">Tất cả nhân viên</option>
              {employees.map(e => (
                <option key={e.id_nhan_vien} value={e.id_nhan_vien}>
                  {e.ho_ten}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Contract Table */}
      <div className="card" style={{ padding: 0 }}>
        {filteredContracts.length === 0 ? (
          <div className="empty-state">
            <FileText size={40} />
            <h3>Chưa có hợp đồng</h3>
            <p>{accessibleContracts.length > 0 ? 'Không tìm thấy hợp đồng phù hợp bộ lọc' : 'Nhấn "Tạo hợp đồng" để tạo mới'}</p>
          </div>
        ) : (
          <div className="table-wrapper" style={{ overflow: 'visible' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: 50 }}>#</th>
                  <th>{getFieldLabel('so_hop_dong')}</th>
                  <th>Nhân viên</th>
                  <th>{getFieldLabel('contract_type')}</th>
                  <th>{getFieldLabel('ngay_bat_dau')}</th>
                  <th>{getFieldLabel('ngay_ket_thuc')}</th>
                  <th>Trạng thái</th>
                  <th style={{ textAlign: 'right' }}>{getFieldLabel('luong_co_ban')}</th>
                  {canEditHRM && <th style={{ width: 150, textAlign: 'center' }}>Thao tác</th>}
                </tr>
              </thead>
              <tbody>
                {filteredContracts.map((hd, idx) => {
                  const status = getContractStatus(hd.ngay_ket_thuc);
                  const statusColor = TRANG_THAI_HOP_DONG_COLORS[status] || { bg: '#f1f5f9', text: '#475569' };
                  return (
                    <tr key={hd.id}>
                      <td style={{ color: 'var(--text-label)' }}>{idx + 1}</td>
                      <td>
                        <span style={{ fontWeight: 600, color: 'var(--primary)' }}>
                          {hd.so_hop_dong}
                        </span>
                      </td>
                      <td>
                        <div className="flex items-center gap-2">
                          <User size={14} style={{ color: 'var(--text-label)' }} />
                          <span style={{ fontWeight: 500, color: 'var(--text-title)' }}>
                            {getEmployeeName(hd.id_nhan_vien, hd.ten_nhan_vien)}
                          </span>
                        </div>
                      </td>
                      <td>
                        <span className={`badge ${
                            hd.contract_type.includes('Chính thức') ? 'badge-info' :
                            hd.contract_type.includes('Thử việc') ? 'badge-warning' :
                            hd.contract_type.includes('Học viên') ? 'badge-success' : 'badge-neutral'
                          }`}>
                          {hd.contract_type}
                        </span>
                      </td>
                      <td>
                        <span className="flex items-center gap-2">
                          <Calendar size={13} style={{ color: 'var(--text-label)' }} />
                          {formatDate(hd.ngay_bat_dau)}
                        </span>
                      </td>
                      <td>
                        <span className="flex items-center gap-2">
                          <Calendar size={13} style={{ color: 'var(--text-label)' }} />
                          {hd.ngay_ket_thuc ? formatDate(hd.ngay_ket_thuc) : 'Không thời hạn'}
                        </span>
                      </td>
                      <td>
                        <span className="badge" style={{
                          background: statusColor.bg,
                          color: statusColor.text,
                        }}>
                          {status}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>
                        <div style={{ color: 'var(--success-text)' }}>
                          {formatCurrency(hd.luong_co_ban)}
                        </div>
                      </td>
                      {canEditHRM && (
                        <td>
                          <div className="flex items-center gap-1" style={{ justifyContent: 'center' }}>
                            <button className="btn btn-ghost btn-icon btn-sm"
                              title="Xem chi tiết"
                              onClick={() => setViewItem(hd)}>
                              <Eye size={15} />
                            </button>
                            <button className="btn btn-ghost btn-icon btn-sm"
                              title="Xuất hồ sơ (.zip: HĐ + Cam kết bảo mật + Cam kết ứng xử)"
                              onClick={() => {
                                const emp = employees.find(e => e.id_nhan_vien === hd.id_nhan_vien);
                                console.log('[Export] Employee data loaded:', emp);
                                setExportItem(hd);
                                setExportForm({
                                  so_cccd: emp?.so_cccd || '',
                                  dia_chi: emp?.HKTT || '',
                                  ngay_thang_nam_cap: emp?.ngay_cap || '',
                                  noi_cap: emp?.noi_cap || '',
                                  ma_so_thue: emp?.ma_so_thue || '',
                                  so_tk_ngan_hang: emp?.so_tk_ngan_hang || '',
                                  ten_ngan_hang_thu_huong: emp?.ten_ngan_hang_thu_huong || '',
                                });
                              }}
                              style={{ color: 'var(--primary)' }}>
                              <Download size={15} />
                            </button>
                            <button className="btn btn-ghost btn-icon btn-sm"
                              title="Chỉnh sửa"
                              onClick={() => openEdit(hd)}>
                              <Edit3 size={15} />
                            </button>
                            <button className="btn btn-ghost btn-icon btn-sm"
                              title="Xóa"
                              style={{ color: 'var(--danger-text)' }}
                              onClick={() => { setDeletingId(hd.id); setShowConfirm(true); }}>
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
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 620 }}>
            <div className="modal-header">
              <h3 className="modal-title">
                {editingItem ? 'Chỉnh sửa hợp đồng' : 'Tạo hợp đồng mới'}
              </h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowModal(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Nhân viên *</label>
                <select className="form-select" value={form.id_nhan_vien}
                  onChange={e => {
                    const empId = e.target.value;
                    const emp = employees.find(x => x.id_nhan_vien === empId);
                    const classification = detectEmployeeClassification(emp?.vai_tro || 'Sale', form.contract_type, emp?.employee_type);
                    const newEmpType = emp?.employee_type || '';
                    const newDept = classification.department;
                    setForm({
                      ...form,
                      id_nhan_vien: empId,
                      so_hop_dong: generateContractNumber(empId, form.contract_type),
                      department: newDept,
                      phong_KD: emp?.phong_KD || '',
                      employee_type: newEmpType,
                      luong_co_ban: getDefaultSalary(newEmpType, newDept),
                    });
                  }}>
                  <option value="">— Chọn nhân viên —</option>
                  {employees.map(emp => (
                    <option key={emp.id_nhan_vien} value={emp.id_nhan_vien}>
                      {emp.ho_ten}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div className="form-group">
                  <label className="form-label">Số hợp đồng *</label>
                  <input className="form-input" value={form.so_hop_dong}
                    onChange={e => setForm({ ...form, so_hop_dong: e.target.value })}
                    placeholder="HD-202604-0001" />
                </div>
                <div className="form-group">
                  <label className="form-label">Loại hợp đồng</label>
                  <select className="form-select" value={form.contract_type}
                    onChange={e => {
                      const newType = e.target.value;
                      setForm({
                        ...form,
                        contract_type: newType,
                        so_hop_dong: generateContractNumber(form.id_nhan_vien, newType),
                      });
                    }}>
                    <option value="Thử việc">Thử việc</option>
                    <option value="Chính thức">Chính thức</option>
                    <option value="Học viên">Học viên</option>
                    <option value="Cộng tác viên (CTV)">Cộng tác viên (CTV)</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div className="form-group">
                  <label className="form-label">{getFieldLabel('department')}</label>
                  <select className="form-select" value={form.department}
                    onChange={e => {
                      const newDept = e.target.value as Department;
                      setForm({
                        ...form,
                        department: newDept,
                        luong_co_ban: getDefaultSalary(form.employee_type, newDept) || form.luong_co_ban,
                      });
                    }}>
                    <option value="KD">{DEPARTMENT_LABELS.KD}</option>
                    <option value="BO">{DEPARTMENT_LABELS.BO}</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Mẫu hợp đồng</label>
                  <div style={{
                    padding: '8px 12px', borderRadius: 'var(--radius-md)',
                    background: resolvedTemplate ? 'var(--success-bg)' : 'var(--bg-page)',
                    color: resolvedTemplate ? 'var(--success-text)' : 'var(--text-muted)',
                    fontSize: '0.8125rem', fontWeight: 500,
                    border: '1px solid var(--border)',
                    display: 'flex', alignItems: 'center', gap: 6, minHeight: 38,
                  }}>
                    <FileText size={14} />
                    {resolvedTemplate ? resolvedTemplate.contract_type : 'Chọn nhân viên & loại HĐ'}
                  </div>
                  {resolvedTemplate && (
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 2, display: 'block' }}>
                      📄 {resolvedTemplate.template_file}
                    </span>
                  )}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div className="form-group">
                  <label className="form-label">Chức danh</label>
                  <select className="form-select" value={form.employee_type}
                    onChange={e => {
                      const newType = e.target.value;
                      setForm({
                        ...form,
                        employee_type: newType,
                        luong_co_ban: getDefaultSalary(newType, form.department) || form.luong_co_ban,
                      });
                    }}>
                    <option value="">— Chọn chức danh —</option>
                    {danhMuc.employee_types.map(cd => <option key={cd} value={cd}>{cd}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">{getFieldLabel('phong_KD')}</label>
                  <select className="form-select" value={form.phong_KD}
                    onChange={e => setForm({ ...form, phong_KD: e.target.value })}>
                    <option value="">— Chọn phòng —</option>
                    {danhMuc.phong_KD.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div className="form-group">
                  <label className="form-label">Ngày bắt đầu *</label>
                  <input className="form-input" type="date" value={form.ngay_bat_dau}
                    onChange={e => setForm({ ...form, ngay_bat_dau: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Ngày kết thúc</label>
                  <input className="form-input" type="date" value={form.ngay_ket_thuc}
                    onChange={e => setForm({ ...form, ngay_ket_thuc: e.target.value })} />
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                    Để trống nếu không thời hạn
                  </span>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Lương cơ bản (VNĐ)</label>
                <input className="form-input" type="number" value={form.luong_co_ban}
                  onChange={e => setForm({ ...form, luong_co_ban: e.target.value })}
                  placeholder="10000000" />
              </div>

              <div className="form-group">
                <label className="form-label">Ghi chú</label>
                <textarea className="form-textarea" value={form.ghi_chu}
                  onChange={e => setForm({ ...form, ghi_chu: e.target.value })}
                  placeholder="Ghi chú hợp đồng..." rows={3} />
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Hủy</button>
              <button className="btn btn-primary" onClick={handleSave}
                disabled={saving || !form.id_nhan_vien || !form.so_hop_dong || !form.ngay_bat_dau}>
                {saving ? 'Đang lưu...' : (editingItem ? 'Cập nhật' : 'Tạo hợp đồng')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Detail Modal */}
      {viewItem && (
        <div className="modal-overlay" onClick={() => setViewItem(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 540 }}>
            <div className="modal-header">
              <h3 className="modal-title">Chi tiết hợp đồng</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setViewItem(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16,
              }}>
                {[
                  { label: getFieldLabel('so_hop_dong'), value: viewItem.so_hop_dong },
                  { label: 'Nhân viên', value: getEmployeeName(viewItem.id_nhan_vien, viewItem.ten_nhan_vien) },
                  { label: 'Chức danh', value: viewItem.employee_type || '—' },
                  { label: getFieldLabel('phong_KD'), value: viewItem.phong_KD || '—' },
                  { label: getFieldLabel('contract_type'), value: viewItem.contract_type },
                  { label: 'Trạng thái', value: getContractStatus(viewItem.ngay_ket_thuc), isBadge: true },
                  { label: getFieldLabel('ngay_bat_dau'), value: formatDate(viewItem.ngay_bat_dau) },
                  { label: getFieldLabel('ngay_ket_thuc'), value: viewItem.ngay_ket_thuc ? formatDate(viewItem.ngay_ket_thuc) : 'Không thời hạn' },
                  { label: getFieldLabel('luong_co_ban'), value: formatCurrency(viewItem.luong_co_ban) },
                  { label: getFieldLabel('created_at'), value: formatDate(viewItem.created_at) },
                ].map((item, i) => (
                  <div key={i} style={{
                    padding: '12px 14px',
                    background: 'var(--bg-page)',
                    borderRadius: 'var(--radius-md)',
                  }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-label)', marginBottom: 4, fontWeight: 500, textTransform: 'uppercase' }}>
                      {item.label}
                    </div>
                    {item.isBadge ? (
                      <span className="badge" style={{
                        background: TRANG_THAI_HOP_DONG_COLORS[item.value]?.bg || '#f1f5f9',
                        color: TRANG_THAI_HOP_DONG_COLORS[item.value]?.text || '#475569',
                      }}>
                        {item.value}
                      </span>
                    ) : (
                      <div style={{ fontSize: '0.9375rem', fontWeight: 600, color: 'var(--text-title)' }}>
                        {item.value || '—'}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {viewItem.ghi_chu && (
                <div style={{
                  marginTop: 16, padding: '12px 14px',
                  background: 'var(--bg-page)', borderRadius: 'var(--radius-md)',
                }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-label)', marginBottom: 4, fontWeight: 500, textTransform: 'uppercase' }}>
                    Ghi chú
                  </div>
                  <div style={{ fontSize: '0.875rem', color: 'var(--text-body)', whiteSpace: 'pre-wrap' }}>
                    {viewItem.ghi_chu}
                  </div>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setViewItem(null)}>Đóng</button>
              {canEditHRM && (
                <button className="btn btn-primary" onClick={() => {
                  setViewItem(null);
                  openEdit(viewItem);
                }}>
                  <Edit3 size={15} /> Chỉnh sửa
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Export DOCX Modal */}
      {exportItem && (
        <div className="modal-overlay" onClick={() => setExportItem(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
            <div className="modal-header">
              <h3 className="modal-title">
                <Download size={20} style={{ marginRight: 8, color: 'var(--primary)' }} />
                Xuất hợp đồng .docx
              </h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setExportItem(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              <div style={{
                padding: '10px 14px', background: 'var(--info-bg)',
                borderRadius: 'var(--radius-md)', fontSize: '0.8rem',
                color: 'var(--info-text)', marginBottom: 8,
              }}>
                <strong>HĐ:</strong> {exportItem.so_hop_dong} — <strong>{getEmployeeName(exportItem.id_nhan_vien, exportItem.ten_nhan_vien)}</strong>
              </div>
              <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: 12 }}>
                Bổ sung thông tin cá nhân để điền vào mẫu hợp đồng:
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label className="form-label">Số CCCD</label>
                  <input className="form-input" value={exportForm.so_cccd}
                    onChange={e => setExportForm({ ...exportForm, so_cccd: e.target.value })}
                    placeholder="012345678901" />
                </div>
                <div className="form-group">
                  <label className="form-label">Ngày cấp</label>
                  <input className="form-input" value={exportForm.ngay_thang_nam_cap}
                    onChange={e => setExportForm({ ...exportForm, ngay_thang_nam_cap: e.target.value })}
                    placeholder="01/01/2020" />
                </div>
                <div className="form-group">
                  <label className="form-label">Nơi cấp</label>
                  <input className="form-input" value={exportForm.noi_cap}
                    onChange={e => setExportForm({ ...exportForm, noi_cap: e.target.value })}
                    placeholder="CA TP.HCM" />
                </div>
                <div className="form-group">
                  <label className="form-label">Mã số thuế</label>
                  <input className="form-input" value={exportForm.ma_so_thue}
                    onChange={e => setExportForm({ ...exportForm, ma_so_thue: e.target.value })}
                    placeholder="" />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Địa chỉ / Hộ khẩu</label>
                <input className="form-input" value={exportForm.dia_chi}
                  onChange={e => setExportForm({ ...exportForm, dia_chi: e.target.value })}
                  placeholder="123 Nguyễn Huệ, Q.1, TP.HCM" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label className="form-label">Số TK ngân hàng</label>
                  <input className="form-input" value={exportForm.so_tk_ngan_hang}
                    onChange={e => setExportForm({ ...exportForm, so_tk_ngan_hang: e.target.value })}
                    placeholder="" />
                </div>
                <div className="form-group">
                  <label className="form-label">Ngân hàng thụ hưởng</label>
                  <input className="form-input" value={exportForm.ten_ngan_hang_thu_huong}
                    onChange={e => setExportForm({ ...exportForm, ten_ngan_hang_thu_huong: e.target.value })}
                    placeholder="Vietcombank" />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setExportItem(null)}>Hủy</button>
              <button className="btn btn-primary" onClick={handleExport} disabled={exporting}>
                <Download size={15} />
                {exporting ? 'Đang xuất...' : 'Xuất file .docx'}
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
            <p>Bạn có chắc muốn xóa hợp đồng này? Thao tác không thể hoàn tác.</p>
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
