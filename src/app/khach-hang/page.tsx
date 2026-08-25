'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search, Plus, Edit3, Trash2, X, ChevronLeft, ChevronRight,
  Users, Phone, Mail, GitBranch, RefreshCw, CheckCircle, AlertCircle,
  Database, Loader2, Copy, FileSpreadsheet, History, Eye,
} from 'lucide-react';
import type { KhachHang, NhanVien, Pipeline, DuAn, PhanKhachConfig, CrmImportBatch } from '@/lib/types';
import { formatDate, formatPhone } from '@/lib/utils';
import { NGUON, GIAI_DOAN_COLORS } from '@/lib/constants';
import { useAuth } from '@/hooks/useAuth';
import { isAllVisibleSelected, toggleSelectAllVisible, toggleSelection } from '@/lib/khach-hang-selection';

export default function KhachHangPage() {
  const router = useRouter();
  const { isAdmin, isLoading: authLoading } = useAuth();
  const [data, setData] = useState<KhachHang[]>([]);
  const [employees, setEmployees] = useState<NhanVien[]>([]);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [duAnList, setDuAnList] = useState<DuAn[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const limit = 20;

  // Filters
  const [search, setSearch] = useState('');
  const [nguon, setNguon] = useState('');
  const [sale, setSale] = useState(() =>
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('sale') || ''
      : ''
  );
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<KhachHang | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [deletingId, setDeletingId] = useState('');
  const [saving, setSaving] = useState(false);

  // Chọn nhiều + xóa hàng loạt
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkConfirm, setShowBulkConfirm] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkResult, setBulkResult] = useState<{
    deleted: number; blocked: number;
    results: { id: string; ten_KH: string; status: string; reason?: string }[];
  } | null>(null);

  // Lịch sử Import (Import Batch)
  const [showImportHistory, setShowImportHistory] = useState(false);
  const [importBatches, setImportBatches] = useState<CrmImportBatch[]>([]);
  const [loadingBatches, setLoadingBatches] = useState(false);
  const [importHistoryError, setImportHistoryError] = useState('');
  type BatchCustomerPreview = { id_khach_hang: string; ten_KH: string; so_dien_thoai: string; email: string; eligible: boolean; blockReason: string | null };
  const [selectedBatch, setSelectedBatch] = useState<{
    batch: CrmImportBatch; customers: BatchCustomerPreview[]; eligibleCount: number; protectedCount: number;
  } | null>(null);
  const [loadingBatchDetail, setLoadingBatchDetail] = useState(false);
  const [showBatchDeleteConfirm, setShowBatchDeleteConfirm] = useState(false);
  const [deletingBatch, setDeletingBatch] = useState(false);
  const [batchDeleteResult, setBatchDeleteResult] = useState<{
    deleted: number; blocked: number;
    results: { id: string; ten_KH: string; status: string; reason?: string }[];
  } | null>(null);

  // Quản lý Sheet nguồn
  const [showPanel, setShowPanel] = useState(false);
  const [configs, setConfigs] = useState<PhanKhachConfig[]>([]);
  const [loadingConfigs, setLoadingConfigs] = useState(false);
  const [addForm, setAddForm] = useState({ ten_hien_thi: '', sheet_id: '' });
  const [probing, setProbing] = useState(false);
  const [probeResult, setProbeResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [savingConfig, setSavingConfig] = useState(false);
  const [deletingConfigId, setDeletingConfigId] = useState<string | null>(null);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<Record<string, { imported: number; duplicates: number; updated: number }>>({});
  const [importDuAn, setImportDuAn] = useState('');;
  const [saEmail, setSaEmail] = useState('');
  const [copied, setCopied] = useState(false);

  // Sync từ phễu
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{
    imported: number; duplicates: number; errors: number;
    duplicateList: { ten_KH: string; so_dien_thoai: string; nguon: string }[];
    errorList: { ten_KH: string; nguon: string; error: string }[];
    bySource: Record<string, { imported: number; duplicates: number }>;
  } | null>(null);

  // Import Excel
  const excelInputRef = useRef<HTMLInputElement>(null);
  const [importingExcel, setImportingExcel] = useState(false);
  const [excelResult, setExcelResult] = useState<{
    totalRows: number; imported: number; duplicateInFile: number; alreadyExists: number; invalid: number; errors: number;
    duplicateInFileList: { ten_KH: string; so_dien_thoai: string }[];
    alreadyExistsList: { ten_KH: string; so_dien_thoai: string }[];
    invalidList: { row: number; reason: string }[];
    errorList: { ten_KH: string; error: string }[];
    duplicateNameWarnings: string[];
  } | null>(null);

  // Form
  const [form, setForm] = useState({
    ten_KH: '', so_dien_thoai: '', email: '',
    nguon: '', nhu_cau: '', ghi_chu: '', sale_phu_trach: '', du_an: '',
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (search) params.set('search', search);
      if (nguon) params.set('nguon', nguon);
      if (sale) params.set('sale', sale);
      if (fromDate) params.set('from', fromDate);
      if (toDate) params.set('to', toDate);
      const res = await fetch(`/api/khach-hang?${params}`);
      const result = await res.json();
      if (result.success) {
        setData(result.data);
        setTotal(result.total);
        setSelectedIds(new Set()); // danh sách hiển thị đổi -> reset lựa chọn cho khớp
      }
    } catch (err) {
      console.error('Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [page, search, nguon, sale, fromDate, toDate]);

  const fetchEmployees = useCallback(async () => {
    try {
      const res = await fetch('/api/nhan-vien');
      const result = await res.json();
      if (result.success) setEmployees(result.data);
    } catch (err) {
      console.error('Fetch employees error:', err);
    }
  }, []);

  const fetchDuAn = useCallback(async () => {
    try {
      const res = await fetch('/api/du-an');
      const result = await res.json();
      if (result.success) setDuAnList(result.data);
    } catch (err) {
      console.error('Fetch du-an error:', err);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { fetchEmployees(); }, [fetchEmployees]);
  useEffect(() => { fetchDuAn(); }, [fetchDuAn]);

  // Load pipeline data in background để hiển thị trạng thái deal của mỗi KH
  useEffect(() => {
    fetch('/api/pipeline')
      .then(r => r.json())
      .then(d => { if (d.success) setPipelines(d.data); })
      .catch(() => {});
  }, []);

  // Lấy deal mới nhất của 1 khách hàng
  const getDealOfKH = (id_khach_hang: string): Pipeline | undefined =>
    pipelines
      .filter(p => p.id_khach_hang === id_khach_hang)
      .sort((a, b) => new Date(b.ngay_cap_nhat).getTime() - new Date(a.ngay_cap_nhat).getTime())[0];

  // Debounced search
  const [searchInput, setSearchInput] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const handleSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch('/api/khach-hang/sync-leads', { method: 'POST' });
      const result = await res.json();
      if (result.success) {
        setSyncResult(result);
        if (result.imported > 0) fetchData();
      } else {
        alert('Sync thất bại: ' + result.error);
      }
    } catch (err) {
      console.error('Sync error:', err);
      alert('Lỗi kết nối khi sync');
    } finally {
      setSyncing(false);
    }
  };

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // cho phép chọn lại cùng 1 file nếu cần import lại
    if (!file) return;
    setImportingExcel(true);
    setExcelResult(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/khach-hang/import-excel', { method: 'POST', body: formData });
      const result = await res.json();
      if (result.success) {
        setExcelResult(result);
        if (result.imported > 0) fetchData();
      } else {
        alert('Import Excel thất bại: ' + result.error);
      }
    } catch (err) {
      console.error('Excel import error:', err);
      alert('Lỗi kết nối khi import Excel');
    } finally {
      setImportingExcel(false);
    }
  };

  // ── ManagePanel handlers ──────────────────────────────────────

  const openPanel = async () => {
    setShowPanel(true);
    setLoadingConfigs(true);
    try {
      const [cfgRes, infoRes] = await Promise.all([
        fetch('/api/phan-khach/configs').then(r => r.json()),
        fetch('/api/stacking/info').then(r => r.json()),
      ]);
      if (cfgRes.success) setConfigs(cfgRes.data);
      if (infoRes.success) setSaEmail(infoRes.sa_email ?? '');
    } catch (err) { console.error(err); }
    finally { setLoadingConfigs(false); }
  };

  const handleProbe = async () => {
    if (!addForm.sheet_id) return;
    setProbing(true);
    setProbeResult(null);
    try {
      const res = await fetch('/api/phan-khach/probe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sheet_id: addForm.sheet_id }),
      });
      const data = await res.json();
      setProbeResult({ ok: data.ok, msg: data.msg });
    } catch { setProbeResult({ ok: false, msg: 'Lỗi kết nối server' }); }
    finally { setProbing(false); }
  };

  const handleAddConfig = async () => {
    if (!addForm.ten_hien_thi || !addForm.sheet_id) return;
    setSavingConfig(true);
    try {
      const res = await fetch('/api/phan-khach/configs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(addForm),
      });
      const data = await res.json();
      if (data.success) {
        setConfigs(prev => [data.data, ...prev]);
        setAddForm({ ten_hien_thi: '', sheet_id: '' });
        setProbeResult(null);
      }
    } catch (err) { console.error(err); }
    finally { setSavingConfig(false); }
  };

  const handleDeleteConfig = async (id: string) => {
    setDeletingConfigId(id);
    try {
      await fetch('/api/phan-khach/configs', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      setConfigs(prev => prev.filter(c => c.id !== id));
    } catch (err) { console.error(err); }
    finally { setDeletingConfigId(null); }
  };

  const handleImport = async (config: PhanKhachConfig) => {
    setImportingId(config.id);
    try {
      const res = await fetch('/api/phan-khach/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config_id: config.id, du_an: importDuAn }),
      });
      const data = await res.json();
      if (data.success) {
        setImportResult(prev => ({ ...prev, [config.id]: { imported: data.imported ?? 0, duplicates: data.duplicates ?? 0, updated: data.updated ?? 0 } }));
        if (data.imported > 0) fetchData();
      } else {
        alert(`Import thất bại: ${data.error ?? 'Lỗi không xác định'}`);
      }
    } catch (err) {
      console.error(err);
      alert(`Lỗi kết nối: ${err instanceof Error ? err.message : String(err)}`);
    }
    finally { setImportingId(null); }
  };

  const copyEmail = () => {
    navigator.clipboard.writeText(saEmail).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const openCreate = () => {
    setEditingItem(null);
    setForm({ ten_KH: '', so_dien_thoai: '', email: '', nguon: '', nhu_cau: '', ghi_chu: '', sale_phu_trach: '', du_an: '' });
    setShowModal(true);
  };

  const openEdit = (kh: KhachHang) => {
    setEditingItem(kh);
    setForm({
      ten_KH:         kh.ten_KH,
      so_dien_thoai:  kh.so_dien_thoai,
      email:          kh.email,
      nguon:          kh.nguon,
      nhu_cau:        kh.nhu_cau,
      ghi_chu:        kh.ghi_chu,
      sale_phu_trach: kh.sale_phu_trach,
      du_an:          kh.du_an || '',
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.ten_KH.trim()) return;
    setSaving(true);
    try {
      const method = editingItem ? 'PUT' : 'POST';
      const body = editingItem ? { ...editingItem, ...form } : form;
      const res = await fetch('/api/khach-hang', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = await res.json();
      if (result.success) {
        setShowModal(false);
        fetchData();
      }
    } catch (err) {
      console.error('Save error:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      const res = await fetch('/api/khach-hang', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: deletingId }),
      });
      const result = await res.json();
      if (result.success) {
        setShowConfirm(false);
        fetchData();
      }
    } catch (err) {
      console.error('Delete error:', err);
    }
  };

  const visibleIds = data.map(kh => kh.id_khach_hang);
  const allVisibleSelected = isAllVisibleSelected(selectedIds, visibleIds);
  const toggleSelect = (id: string) => setSelectedIds(prev => toggleSelection(prev, id));
  const toggleSelectAll = () => setSelectedIds(prev => toggleSelectAllVisible(prev, visibleIds));

  const handleBulkDelete = async () => {
    setBulkDeleting(true);
    try {
      const res = await fetch('/api/khach-hang/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [...selectedIds] }),
      });
      const result = await res.json();
      if (result.success) {
        setShowBulkConfirm(false);
        setBulkResult(result);
        fetchData();
      } else {
        alert('Xóa hàng loạt thất bại: ' + result.error);
      }
    } catch (err) {
      console.error('Bulk delete error:', err);
      alert('Lỗi kết nối khi xóa hàng loạt');
    } finally {
      setBulkDeleting(false);
    }
  };

  const openImportHistory = async () => {
    setShowImportHistory(true);
    setImportHistoryError('');
    setLoadingBatches(true);
    try {
      const res = await fetch('/api/khach-hang/import-batches');
      const result = await res.json();
      if (result.success) setImportBatches(result.data);
      else setImportHistoryError(result.error || 'Không thể tải lịch sử import');
    } catch (err) {
      console.error('Load import batches error:', err);
      setImportHistoryError('Lỗi kết nối khi tải lịch sử import');
    } finally {
      setLoadingBatches(false);
    }
  };

  const openBatchDetail = async (batchId: string) => {
    setLoadingBatchDetail(true);
    setBatchDeleteResult(null);
    try {
      const res = await fetch(`/api/khach-hang/import-batches/${batchId}`);
      const result = await res.json();
      if (result.success) setSelectedBatch(result.data);
      else alert('Không tải được chi tiết đợt import: ' + result.error);
    } catch (err) {
      console.error('Load batch detail error:', err);
      alert('Lỗi kết nối khi tải chi tiết đợt import');
    } finally {
      setLoadingBatchDetail(false);
    }
  };

  const handleDeleteBatch = async () => {
    if (!selectedBatch) return;
    setDeletingBatch(true);
    try {
      const res = await fetch(`/api/khach-hang/import-batches/${selectedBatch.batch.id}/delete`, { method: 'POST' });
      const result = await res.json();
      if (result.success) {
        setShowBatchDeleteConfirm(false);
        setBatchDeleteResult(result);
        openImportHistory(); // refresh danh sách batch
        fetchData(); // refresh danh sách khách hàng
      } else {
        alert('Xóa đợt import thất bại: ' + result.error);
      }
    } catch (err) {
      console.error('Delete batch error:', err);
      alert('Lỗi kết nối khi xóa đợt import');
    } finally {
      setDeletingBatch(false);
    }
  };

  const totalPages = Math.ceil(total / limit);

  const clearFilters = () => {
    setSearchInput('');
    setNguon('');
    setSale('');
    setFromDate('');
    setToDate('');
    setPage(1);
  };

  const hasFilters = searchInput || nguon || sale || fromDate || toDate;

  if (authLoading) return null;

  if (!isAdmin) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: 12, color: 'var(--text-secondary)' }}>
      <AlertCircle size={40} style={{ color: '#ef4444', opacity: 0.7 }} />
      <p style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Bạn không có quyền truy cập trang này</p>
      <p style={{ fontSize: 13, margin: 0 }}>CRM đang trong giai đoạn setup, tạm thời chỉ Admin/Chủ tịch mới có thể xem</p>
    </div>
  );

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div className="page-header-left">
          <h1>Khách hàng</h1>
          <p>Quản lý thông tin khách hàng ({total} khách hàng)</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={openPanel}>
            <Database size={15} />
            Quản lý Sheet
          </button>
          <button className="btn btn-secondary" onClick={openImportHistory}>
            <History size={15} />
            Lịch sử Import
          </button>
          <button
            className="btn btn-secondary"
            onClick={handleSync}
            disabled={syncing}
          >
            <RefreshCw size={16} style={syncing ? { animation: 'spin 1s linear infinite' } : {}} />
            {syncing ? 'Đang sync...' : 'Sync từ phễu'}
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => excelInputRef.current?.click()}
            disabled={importingExcel}
          >
            {importingExcel ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <FileSpreadsheet size={16} />}
            {importingExcel ? 'Đang import...' : 'Import Excel'}
          </button>
          <input
            type="file"
            accept=".xlsx,.xls"
            ref={excelInputRef}
            style={{ display: 'none' }}
            onChange={handleImportExcel}
          />
          {selectedIds.size > 0 && (
            <button className="btn btn-danger" onClick={() => setShowBulkConfirm(true)}>
              <Trash2 size={16} />
              Xóa đã chọn ({selectedIds.size})
            </button>
          )}
          <button className="btn btn-primary" onClick={openCreate}>
            <Plus size={18} />
            Thêm khách hàng
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="filter-bar" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div className="search-wrapper" style={{ flex: '1 1 100%', minWidth: 0 }}>
          <Search size={16} className="search-icon" />
          <input
            className="form-input"
            placeholder="Tìm kiếm theo tên, SĐT, email..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', width: '100%' }}>
          <select className="form-select" style={{ width: 'auto', minWidth: 140, flex: '0 0 auto' }} value={nguon} onChange={(e) => { setNguon(e.target.value); setPage(1); }}>
            <option value="">Tất cả nguồn</option>
            {NGUON.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          <select className="form-select" style={{ width: 'auto', minWidth: 130, flex: '0 0 auto' }} value={sale} onChange={(e) => { setSale(e.target.value); setPage(1); }}>
            <option value="">Tất cả sale</option>
            <option value="__none__">Chưa assign sale</option>
            {employees.map(nv => <option key={nv.id_nhan_vien} value={nv.ho_ten}>{nv.ho_ten}</option>)}
          </select>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: '0 0 auto' }}>
            <span style={{ fontSize: '0.8125rem', color: 'var(--text-label)', whiteSpace: 'nowrap' }}>Từ</span>
            <input type="date" className="form-input" style={{ width: 'auto', minWidth: 140 }}
              value={fromDate} onChange={(e) => { setFromDate(e.target.value); setPage(1); }}
            />
            <span style={{ fontSize: '0.8125rem', color: 'var(--text-label)', whiteSpace: 'nowrap' }}>đến</span>
            <input type="date" className="form-input" style={{ width: 'auto', minWidth: 140 }}
              value={toDate} onChange={(e) => { setToDate(e.target.value); setPage(1); }}
            />
          </div>
          {hasFilters && (
            <button className="btn btn-ghost btn-sm" style={{ flex: '0 0 auto', whiteSpace: 'nowrap' }} onClick={clearFilters}>
              <X size={14} />
              Xóa lọc
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div className="loading-spinner">
            <div className="spinner" />
          </div>
        ) : data.length === 0 ? (
          <div className="empty-state">
            <Users size={40} />
            <h3>Chưa có khách hàng</h3>
            <p>Nhấn &quot;Thêm khách hàng&quot; để tạo mới</p>
          </div>
        ) : (
          <>
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ width: 36 }}>
                      <input type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAll} aria-label="Chọn tất cả khách hàng đang hiển thị" />
                    </th>
                    <th style={{ width: 50 }}>#</th>
                    <th>Tên KH</th>
                    <th>SĐT</th>
                    <th>Email</th>
                    <th>Dự án</th>
                    <th>Nguồn</th>
                    <th>Nhu cầu</th>
                    <th>Deal</th>
                    <th>Sale</th>
                    <th>Ngày tạo</th>
                    <th style={{ width: 140, textAlign: 'center' }}>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((kh, idx) => (
                    <tr key={kh.id_khach_hang}>
                      <td>
                        <input type="checkbox" checked={selectedIds.has(kh.id_khach_hang)} onChange={() => toggleSelect(kh.id_khach_hang)} aria-label={`Chọn ${kh.ten_KH}`} />
                      </td>
                      <td style={{ color: 'var(--text-label)', fontWeight: 500 }}>
                        {(page - 1) * limit + idx + 1}
                      </td>
                      <td style={{ fontWeight: 500, color: 'var(--text-title)' }}>{kh.ten_KH}</td>
                      <td>
                        <span className="flex items-center gap-2">
                          <Phone size={13} style={{ color: 'var(--text-label)' }} />
                          {formatPhone(kh.so_dien_thoai)}
                        </span>
                      </td>
                      <td>
                        <span className="flex items-center gap-2">
                          <Mail size={13} style={{ color: 'var(--text-label)' }} />
                          {kh.email || '—'}
                        </span>
                      </td>
                      <td style={{ maxWidth: 160 }}>
                        {kh.du_an ? (
                          <span className="badge" style={{ background: '#ede9fe', color: '#5b21b6', fontSize: '0.72rem' }}>
                            {kh.du_an}
                          </span>
                        ) : '—'}
                      </td>
                      <td>
                        {kh.nguon ? (
                          <span className="badge badge-info">{kh.nguon}</span>
                        ) : '—'}
                      </td>
                      <td className="truncate" style={{ maxWidth: 200 }}>{kh.nhu_cau || '—'}</td>
                      <td>
                        {(() => {
                          const deal = getDealOfKH(kh.id_khach_hang);
                          if (!deal) return <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>—</span>;
                          const colors = GIAI_DOAN_COLORS[deal.giai_doan] || { bg: '#f1f5f9', text: '#475569' };
                          return (
                            <span className="badge" style={{ background: colors.bg, color: colors.text, fontSize: '0.72rem', cursor: 'pointer' }}
                              onClick={() => router.push(`/pipeline?kh=${kh.id_khach_hang}`)}>
                              {deal.giai_doan}
                            </span>
                          );
                        })()}
                      </td>
                      <td style={{ fontWeight: 500, color: 'var(--primary-text)' }}>{kh.sale_phu_trach || '—'}</td>
                      <td>{formatDate(kh.ngay_tao)}</td>
                      <td>
                        <div className="flex items-center gap-2" style={{ justifyContent: 'center' }}>
                          <button
                            className="btn btn-ghost btn-icon btn-sm"
                            title="Xem deal trong Pipeline"
                            style={{ color: getDealOfKH(kh.id_khach_hang) ? 'var(--primary)' : 'var(--text-muted)' }}
                            onClick={() => router.push(`/pipeline?kh=${kh.id_khach_hang}`)}
                          >
                            <GitBranch size={15} />
                          </button>
                          <button className="btn btn-ghost btn-icon btn-sm" onClick={() => openEdit(kh)} title="Sửa">
                            <Edit3 size={15} />
                          </button>
                          <button className="btn btn-ghost btn-icon btn-sm" onClick={() => { setDeletingId(kh.id_khach_hang); setShowConfirm(true); }} title="Xóa"
                            style={{ color: 'var(--danger-text)' }}>
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="pagination" style={{ padding: '12px 20px' }}>
                <span className="pagination-info">
                  Hiển thị {(page - 1) * limit + 1}–{Math.min(page * limit, total)} / {total}
                </span>
                <div className="pagination-buttons">
                  <button className="pagination-btn" disabled={page === 1} onClick={() => setPage(page - 1)}>
                    <ChevronLeft size={16} />
                  </button>
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pg: number;
                    if (totalPages <= 5) {
                      pg = i + 1;
                    } else if (page <= 3) {
                      pg = i + 1;
                    } else if (page >= totalPages - 2) {
                      pg = totalPages - 4 + i;
                    } else {
                      pg = page - 2 + i;
                    }
                    return (
                      <button key={pg} className={`pagination-btn ${page === pg ? 'active' : ''}`}
                        onClick={() => setPage(pg)}>
                        {pg}
                      </button>
                    );
                  })}
                  <button className="pagination-btn" disabled={page === totalPages} onClick={() => setPage(page + 1)}>
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">
                {editingItem ? 'Chỉnh sửa khách hàng' : 'Thêm khách hàng mới'}
              </h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowModal(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Tên khách hàng *</label>
                <input className="form-input" value={form.ten_KH}
                  onChange={(e) => setForm({ ...form, ten_KH: e.target.value })} placeholder="Nhập tên khách hàng" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div className="form-group">
                  <label className="form-label">Số điện thoại</label>
                  <input className="form-input" value={form.so_dien_thoai}
                    onChange={(e) => setForm({ ...form, so_dien_thoai: e.target.value })} placeholder="0901234567" />
                </div>
                <div className="form-group">
                  <label className="form-label">Email</label>
                  <input className="form-input" type="email" value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="email@example.com" />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Dự án</label>
                <select className="form-select" value={form.du_an}
                  onChange={(e) => setForm({ ...form, du_an: e.target.value })}>
                  <option value="">Chọn dự án</option>
                  {duAnList.filter(d => d.hien_thi !== 0).map(d => (
                    <option key={d.id_du_an} value={d.ten_du_an}>{d.ten_du_an}</option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div className="form-group">
                  <label className="form-label">Nguồn</label>
                  <select className="form-select" value={form.nguon}
                    onChange={(e) => setForm({ ...form, nguon: e.target.value })}>
                    <option value="">Chọn nguồn</option>
                    {NGUON.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Sale phụ trách</label>
                  <select className="form-select" value={form.sale_phu_trach}
                    onChange={(e) => setForm({ ...form, sale_phu_trach: e.target.value })}>
                    <option value="">Chọn sale</option>
                    {employees.map(nv => <option key={nv.id_nhan_vien} value={nv.ho_ten}>{nv.ho_ten}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Nhu cầu</label>
                <textarea className="form-textarea" value={form.nhu_cau}
                  onChange={(e) => setForm({ ...form, nhu_cau: e.target.value })} placeholder="Mô tả nhu cầu" />
              </div>
              <div className="form-group">
                <label className="form-label">Ghi chú</label>
                <textarea className="form-textarea" value={form.ghi_chu}
                  onChange={(e) => setForm({ ...form, ghi_chu: e.target.value })} placeholder="Ghi chú thêm" />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Hủy</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving || !form.ten_KH.trim()}>
                {saving ? 'Đang lưu...' : (editingItem ? 'Cập nhật' : 'Thêm mới')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sync Result Modal */}
      {syncResult && (
        <div className="modal-overlay" onClick={() => setSyncResult(null)}>
          <div className="modal-content" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Kết quả Sync từ phễu</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setSyncResult(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Tổng kết */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <div style={{ textAlign: 'center', padding: '12px 8px', background: '#f0fdf4', borderRadius: 8 }}>
                  <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#16a34a' }}>{syncResult.imported}</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-label)', marginTop: 2 }}>Đã thêm mới</div>
                </div>
                <div style={{ textAlign: 'center', padding: '12px 8px', background: '#fffbeb', borderRadius: 8 }}>
                  <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#d97706' }}>{syncResult.duplicates}</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-label)', marginTop: 2 }}>Trùng SĐT</div>
                </div>
                <div style={{ textAlign: 'center', padding: '12px 8px', background: '#fef2f2', borderRadius: 8 }}>
                  <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#dc2626' }}>{syncResult.errors}</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-label)', marginTop: 2 }}>Lỗi</div>
                </div>
              </div>

              {/* Breakdown theo nguồn */}
              {syncResult.bySource && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {Object.entries(syncResult.bySource).map(([src, stat]) => (
                    <div key={src} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', background: 'var(--bg-subtle, #f8fafc)', border: '1px solid var(--border)', borderRadius: 20, fontSize: '0.82rem' }}>
                      <span style={{ fontWeight: 600 }}>{src}</span>
                      <span style={{ color: '#16a34a' }}>+{stat.imported}</span>
                      {stat.duplicates > 0 && <span style={{ color: '#d97706' }}>/ {stat.duplicates} trùng</span>}
                    </div>
                  ))}
                </div>
              )}

              {syncResult.duplicateList.length > 0 && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, color: '#d97706', fontWeight: 600, fontSize: '0.85rem' }}>
                    <AlertCircle size={15} />
                    Bỏ qua (đã tồn tại trong CRM)
                  </div>
                  <div style={{ maxHeight: 140, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 6 }}>
                    {syncResult.duplicateList.map((d, i) => (
                      <div key={i} style={{ padding: '6px 12px', fontSize: '0.82rem', borderBottom: i < syncResult.duplicateList.length - 1 ? '1px solid var(--border)' : 'none', display: 'flex', justifyContent: 'space-between' }}>
                        <span>{d.ten_KH}</span>
                        <span style={{ color: 'var(--text-label)' }}>{d.so_dien_thoai}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {syncResult.errorList.length > 0 && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, color: '#dc2626', fontWeight: 600, fontSize: '0.85rem' }}>
                    <AlertCircle size={15} />
                    Lỗi khi ghi dữ liệu
                  </div>
                  <div style={{ maxHeight: 120, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 6 }}>
                    {syncResult.errorList.map((e, i) => (
                      <div key={i} style={{ padding: '6px 12px', fontSize: '0.82rem', borderBottom: i < syncResult.errorList.length - 1 ? '1px solid var(--border)' : 'none' }}>
                        <span style={{ fontWeight: 500 }}>{e.ten_KH}</span>
                        <span style={{ color: 'var(--text-label)', marginLeft: 8 }}>{e.error}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {syncResult.imported > 0 && syncResult.errors === 0 && syncResult.duplicates === 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#16a34a', fontSize: '0.9rem' }}>
                  <CheckCircle size={18} />
                  Sync thành công {syncResult.imported} khách hàng mới!
                </div>
              )}

              {syncResult.imported === 0 && syncResult.errors === 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-label)', fontSize: '0.9rem' }}>
                  <CheckCircle size={18} />
                  Tất cả lead trong phễu đã có trong CRM.
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-primary" onClick={() => setSyncResult(null)}>Đóng</button>
            </div>
          </div>
        </div>
      )}

      {/* Import Excel Result Modal */}
      {excelResult && (
        <div className="modal-overlay" onClick={() => setExcelResult(null)}>
          <div className="modal-content" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Kết quả Import Excel</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setExcelResult(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-label)' }}>Tổng số dòng dữ liệu: <strong style={{ color: 'var(--text-title)' }}>{excelResult.totalRows}</strong></div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(90px,1fr))', gap: 10 }}>
                <div style={{ textAlign: 'center', padding: '12px 8px', background: '#f0fdf4', borderRadius: 8 }}>
                  <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#16a34a' }}>{excelResult.imported}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-label)', marginTop: 2 }}>Đã thêm mới</div>
                </div>
                <div style={{ textAlign: 'center', padding: '12px 8px', background: '#fffbeb', borderRadius: 8 }}>
                  <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#d97706' }}>{excelResult.duplicateInFile}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-label)', marginTop: 2 }}>Trùng trong file</div>
                </div>
                <div style={{ textAlign: 'center', padding: '12px 8px', background: '#eff6ff', borderRadius: 8 }}>
                  <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#1d4ed8' }}>{excelResult.alreadyExists}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-label)', marginTop: 2 }}>Đã có trong CRM</div>
                </div>
                <div style={{ textAlign: 'center', padding: '12px 8px', background: '#fff7ed', borderRadius: 8 }}>
                  <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#c2410c' }}>{excelResult.invalid}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-label)', marginTop: 2 }}>Thiếu dữ liệu</div>
                </div>
                <div style={{ textAlign: 'center', padding: '12px 8px', background: '#fef2f2', borderRadius: 8 }}>
                  <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#dc2626' }}>{excelResult.errors}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-label)', marginTop: 2 }}>Lỗi</div>
                </div>
              </div>

              {excelResult.duplicateNameWarnings.length > 0 && (
                <div style={{ padding: '10px 12px', background: '#fffbeb', borderRadius: 8, fontSize: '0.82rem', color: '#a16207' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, marginBottom: 4 }}>
                    <AlertCircle size={15} />
                    Cảnh báo trùng tên (SĐT khác nhau — vẫn giữ là các khách riêng biệt)
                  </div>
                  {excelResult.duplicateNameWarnings.join(', ')}
                </div>
              )}

              {excelResult.invalidList.length > 0 && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, color: '#c2410c', fontWeight: 600, fontSize: '0.85rem' }}>
                    <AlertCircle size={15} />
                    Bỏ qua (thiếu Tên KH hoặc SĐT)
                  </div>
                  <div style={{ maxHeight: 140, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 6 }}>
                    {excelResult.invalidList.map((item, i) => (
                      <div key={i} style={{ padding: '6px 12px', fontSize: '0.82rem', borderBottom: i < excelResult.invalidList.length - 1 ? '1px solid var(--border)' : 'none', display: 'flex', justifyContent: 'space-between' }}>
                        <span>Dòng {item.row}</span>
                        <span style={{ color: 'var(--text-label)' }}>{item.reason}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {excelResult.duplicateInFileList.length > 0 && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, color: '#d97706', fontWeight: 600, fontSize: '0.85rem' }}>
                    <AlertCircle size={15} />
                    Bỏ qua (trùng SĐT với dòng khác trong cùng file)
                  </div>
                  <div style={{ maxHeight: 140, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 6 }}>
                    {excelResult.duplicateInFileList.map((d, i) => (
                      <div key={i} style={{ padding: '6px 12px', fontSize: '0.82rem', borderBottom: i < excelResult.duplicateInFileList.length - 1 ? '1px solid var(--border)' : 'none', display: 'flex', justifyContent: 'space-between' }}>
                        <span>{d.ten_KH}</span>
                        <span style={{ color: 'var(--text-label)' }}>{d.so_dien_thoai}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {excelResult.alreadyExistsList.length > 0 && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, color: '#1d4ed8', fontWeight: 600, fontSize: '0.85rem' }}>
                    <AlertCircle size={15} />
                    Bỏ qua (SĐT đã có sẵn trong CRM)
                  </div>
                  <div style={{ maxHeight: 140, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 6 }}>
                    {excelResult.alreadyExistsList.map((d, i) => (
                      <div key={i} style={{ padding: '6px 12px', fontSize: '0.82rem', borderBottom: i < excelResult.alreadyExistsList.length - 1 ? '1px solid var(--border)' : 'none', display: 'flex', justifyContent: 'space-between' }}>
                        <span>{d.ten_KH}</span>
                        <span style={{ color: 'var(--text-label)' }}>{d.so_dien_thoai}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {excelResult.errorList.length > 0 && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, color: '#dc2626', fontWeight: 600, fontSize: '0.85rem' }}>
                    <AlertCircle size={15} />
                    Lỗi khi ghi dữ liệu
                  </div>
                  <div style={{ maxHeight: 120, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 6 }}>
                    {excelResult.errorList.map((e, i) => (
                      <div key={i} style={{ padding: '6px 12px', fontSize: '0.82rem', borderBottom: i < excelResult.errorList.length - 1 ? '1px solid var(--border)' : 'none' }}>
                        <span style={{ fontWeight: 500 }}>{e.ten_KH}</span>
                        <span style={{ color: 'var(--text-label)', marginLeft: 8 }}>{e.error}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {excelResult.imported > 0 && excelResult.errors === 0 && excelResult.duplicateInFile === 0 && excelResult.alreadyExists === 0 && excelResult.invalid === 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#16a34a', fontSize: '0.9rem' }}>
                  <CheckCircle size={18} />
                  Import thành công {excelResult.imported} khách hàng mới!
                </div>
              )}

              {excelResult.imported === 0 && excelResult.errors === 0 && excelResult.duplicateInFile === 0 && excelResult.alreadyExists === 0 && excelResult.invalid === 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-label)', fontSize: '0.9rem' }}>
                  <CheckCircle size={18} />
                  File không có dòng dữ liệu hợp lệ.
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-primary" onClick={() => setExcelResult(null)}>Đóng</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Manage Sheet Panel ── */}
      {showPanel && (
        <>
          <div onClick={() => setShowPanel(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.25)', zIndex: 1000 }} />
          <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 440, background: 'var(--bg-card)', borderLeft: '1px solid var(--border)', zIndex: 1001, display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '-4px 0 24px rgba(0,0,0,0.10)' }}>
            {/* Header */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Database size={18} color="var(--primary)" />
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.975rem', color: 'var(--text-title)' }}>Quản lý Sheet nguồn</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Kết nối Google Sheet để import khách hàng</div>
                </div>
              </div>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowPanel(false)}><X size={18} /></button>
            </div>

            {/* Body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 20 }}>

              {/* Service Account email */}
              {saEmail && (
                <div style={{ background: 'var(--bg-subtle, #f8fafc)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px' }}>
                  <p style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-label)', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Service Account Email</p>
                  <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', margin: '0 0 8px' }}>Chia sẻ Google Sheet với email này (quyền Viewer) để hệ thống đọc dữ liệu.</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <code style={{ flex: 1, fontSize: '0.72rem', background: '#fff', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', wordBreak: 'break-all', color: 'var(--text-body)' }}>{saEmail}</code>
                    <button onClick={copyEmail} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', cursor: 'pointer', color: copied ? '#16a34a' : 'var(--text-muted)', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.72rem' }}>
                      {copied ? <><CheckCircle size={13} /> Đã copy</> : <><Copy size={13} /> Copy</>}
                    </button>
                  </div>
                </div>
              )}

              {/* Add form */}
              <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px' }}>
                <p style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--text-title)', margin: '0 0 12px' }}>Thêm nguồn mới</p>
                <div style={{ marginBottom: 10 }}>
                  <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 4 }}>Tên hiển thị</p>
                  <input className="form-input" placeholder="VD: Facebook Lead Tháng 6" value={addForm.ten_hien_thi} onChange={e => setAddForm(prev => ({ ...prev, ten_hien_thi: e.target.value }))} style={{ fontSize: '0.875rem' }} />
                </div>
                <div style={{ marginBottom: 10 }}>
                  <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 4 }}>Link hoặc Sheet ID</p>
                  <input className="form-input" placeholder="https://docs.google.com/spreadsheets/d/..." value={addForm.sheet_id} onChange={e => { setAddForm(prev => ({ ...prev, sheet_id: e.target.value })); setProbeResult(null); }} style={{ fontSize: '0.82rem', fontFamily: 'monospace' }} />
                </div>
                <button onClick={handleProbe} disabled={!addForm.sheet_id || probing} style={{ width: '100%', padding: '7px 0', borderRadius: 7, fontWeight: 600, fontSize: '0.8rem', border: '1px solid var(--border)', background: 'var(--bg-secondary, #f1f5f9)', color: 'var(--text-body)', cursor: 'pointer', marginBottom: 8, opacity: !addForm.sheet_id || probing ? 0.6 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  {probing ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Đang kiểm tra...</> : <>Kiểm tra kết nối</>}
                </button>
                {probeResult && (
                  <div style={{ marginBottom: 10, padding: '8px 10px', borderRadius: 6, background: probeResult.ok ? '#dcfce7' : '#fee2e2', color: probeResult.ok ? '#15803d' : '#dc2626', fontSize: '0.78rem', display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                    {probeResult.ok ? <CheckCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} /> : <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />}
                    <span>{probeResult.msg}</span>
                  </div>
                )}
                <button onClick={handleAddConfig} disabled={!addForm.ten_hien_thi || !addForm.sheet_id || savingConfig} style={{ width: '100%', padding: '9px 0', borderRadius: 8, fontWeight: 700, fontSize: '0.875rem', border: 'none', cursor: 'pointer', background: 'var(--primary)', color: '#fff', opacity: !addForm.ten_hien_thi || !addForm.sheet_id || savingConfig ? 0.6 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  {savingConfig ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Đang lưu...</> : <><Plus size={15} /> Thêm nguồn</>}
                </button>
              </div>

              {/* Source list */}
              <div>
                <p style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: 10, color: 'var(--text-title)' }}>
                  Nguồn đã đăng ký ({loadingConfigs ? '…' : configs.length})
                </p>
                {/* Project selector for import */}
                <div style={{ marginBottom: 10 }}>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Gán vào dự án khi import</label>
                  <select
                    value={importDuAn}
                    onChange={e => setImportDuAn(e.target.value)}
                    style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1.5px solid var(--border)', fontSize: '0.8rem', background: 'var(--bg-card)', color: 'var(--text-title)' }}
                  >
                    <option value=''>-- Chưa chọn dự án --</option>
                    {duAnList.filter(d => d.hien_thi !== 0).map(d => (
                      <option key={d.id_du_an} value={d.ten_du_an}>{d.ten_du_an}</option>
                    ))}
                  </select>
                </div>

                {loadingConfigs ? (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: 20 }}>
                    <Loader2 size={20} style={{ animation: 'spin 1s linear infinite', color: 'var(--primary)' }} />
                  </div>
                ) : configs.length === 0 ? (
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textAlign: 'center', padding: '20px 0' }}>Chưa có nguồn nào</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {configs.map(c => {
                      const result = importResult[c.id];
                      const isImporting = importingId === c.id;
                      return (
                        <div key={c.id} style={{ borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--bg-card)', overflow: 'hidden' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px' }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-title)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.ten_hien_thi}</div>
                              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: 'monospace', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.sheet_id.substring(0, 30)}…</div>
                            </div>
                            <button onClick={() => handleImport(c)} disabled={isImporting} title="Import khách từ sheet này" style={{ background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, opacity: isImporting ? 0.7 : 1 }}>
                              {isImporting ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <RefreshCw size={12} />}
                              Import
                            </button>
                            <button onClick={() => handleDeleteConfig(c.id)} disabled={deletingConfigId === c.id} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#ef4444', flexShrink: 0 }}>
                              {deletingConfigId === c.id ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <Trash2 size={15} />}
                            </button>
                          </div>
                          {result && (
                            <div style={{ padding: '6px 12px 8px', borderTop: '1px solid var(--border)', background: '#f0fdf4', fontSize: '0.75rem', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                              <span style={{ color: '#15803d' }}><strong>{result.imported}</strong> khách mới</span>
                              {result.updated > 0 && <span style={{ color: '#1d4ed8' }}><strong>{result.updated}</strong> đã gán dự án</span>}
                              <span style={{ color: '#92400e' }}><strong>{result.duplicates}</strong> trùng (bỏ qua)</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

            </div>
          </div>
        </>
      )}

      {/* ── Import History Panel ── */}
      {showImportHistory && (
        <>
          <div onClick={() => setShowImportHistory(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.25)', zIndex: 1000 }} />
          <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 560, background: 'var(--bg-card)', borderLeft: '1px solid var(--border)', zIndex: 1001, display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '-4px 0 24px rgba(0,0,0,0.10)' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <History size={18} color="var(--primary)" />
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.975rem', color: 'var(--text-title)' }}>Lịch sử Import</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Xem và xóa cả đợt Import Excel</div>
                </div>
              </div>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowImportHistory(false)}><X size={18} /></button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
              {importHistoryError && <div style={{ background: '#fef2f2', color: '#b91c1c', borderRadius: 8, padding: 12, marginBottom: 14, fontSize: '0.85rem' }}>{importHistoryError}</div>}
              {loadingBatches ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: 30 }}>
                  <Loader2 size={22} style={{ animation: 'spin 1s linear infinite', color: 'var(--primary)' }} />
                </div>
              ) : importBatches.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: '30px 0' }}>Chưa có đợt import Excel nào.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {importBatches.map(batch => (
                    <div key={batch.id} style={{ border: '1.5px solid var(--border)', borderRadius: 10, padding: '12px 14px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 650, fontSize: '0.9rem', color: 'var(--text-title)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{batch.filename}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 3 }}>{formatDate(batch.imported_at)} · {batch.imported_by_name}</div>
                        </div>
                        <span className="badge" style={{
                          background: batch.status === 'completed' ? '#f0fdf4' : batch.status === 'processing' ? '#fffbeb' : '#f1f5f9',
                          color: batch.status === 'completed' ? '#16a34a' : batch.status === 'processing' ? '#b45309' : '#475569',
                          fontSize: '0.68rem', flexShrink: 0,
                        }}>
                          {batch.status === 'completed' ? 'Hoàn tất' : batch.status === 'processing' ? 'Đang xử lý…' : batch.status}
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: 14, marginTop: 10, fontSize: '0.78rem' }}>
                        <span>Tổng: <strong>{batch.total_rows}</strong></span>
                        <span style={{ color: '#16a34a' }}>Tạo mới: <strong>{batch.created_count}</strong></span>
                        <span style={{ color: '#d97706' }}>Trùng: <strong>{batch.duplicate_count}</strong></span>
                        <span style={{ color: '#c2410c' }}>Thiếu dữ liệu: <strong>{batch.invalid_count}</strong></span>
                      </div>
                      <button className="btn btn-secondary btn-sm" style={{ marginTop: 10 }} onClick={() => openBatchDetail(batch.id)}>
                        <Eye size={13} /> Xem chi tiết &amp; Xóa
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Import Batch Detail / Delete */}
      {(loadingBatchDetail || selectedBatch) && (
        <div className="modal-overlay" onClick={() => { setSelectedBatch(null); setBatchDeleteResult(null); }}>
          <div className="modal-content" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Chi tiết đợt import{selectedBatch ? `: ${selectedBatch.batch.filename}` : ''}</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => { setSelectedBatch(null); setBatchDeleteResult(null); }}><X size={18} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {loadingBatchDetail ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: 30 }}>
                  <Loader2 size={22} style={{ animation: 'spin 1s linear infinite', color: 'var(--primary)' }} />
                </div>
              ) : selectedBatch && (
                <>
                  {!batchDeleteResult && (
                    <>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <div style={{ textAlign: 'center', padding: '12px 8px', background: '#f0fdf4', borderRadius: 8 }}>
                          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#16a34a' }}>{selectedBatch.eligibleCount}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-label)', marginTop: 2 }}>Có thể xóa</div>
                        </div>
                        <div style={{ textAlign: 'center', padding: '12px 8px', background: '#fef2f2', borderRadius: 8 }}>
                          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#dc2626' }}>{selectedBatch.protectedCount}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-label)', marginTop: 2 }}>Được bảo vệ</div>
                        </div>
                      </div>

                      <div style={{ maxHeight: 260, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 6 }}>
                        {selectedBatch.customers.length === 0 ? (
                          <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', textAlign: 'center', padding: 16 }}>
                            Đợt import này hiện không còn khách hàng nào (đã bị xóa trước đó).
                          </p>
                        ) : selectedBatch.customers.map((c, i, arr) => (
                          <div key={c.id_khach_hang} style={{ padding: '8px 12px', fontSize: '0.82rem', borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none', display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontWeight: 500 }}>{c.ten_KH}</div>
                              <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{formatPhone(c.so_dien_thoai)}</div>
                            </div>
                            {c.eligible
                              ? <span style={{ color: '#16a34a', fontSize: '0.72rem', fontWeight: 600, flexShrink: 0 }}>Có thể xóa</span>
                              : <span style={{ color: '#dc2626', fontSize: '0.72rem', fontWeight: 600, flexShrink: 0, textAlign: 'right', maxWidth: 180 }}>{c.blockReason}</span>}
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  {batchDeleteResult && (
                    <>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <div style={{ textAlign: 'center', padding: '12px 8px', background: '#f0fdf4', borderRadius: 8 }}>
                          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#16a34a' }}>{batchDeleteResult.deleted}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-label)', marginTop: 2 }}>Đã xóa</div>
                        </div>
                        <div style={{ textAlign: 'center', padding: '12px 8px', background: '#fef2f2', borderRadius: 8 }}>
                          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#dc2626' }}>{batchDeleteResult.blocked}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-label)', marginTop: 2 }}>Không thể xóa</div>
                        </div>
                      </div>
                      {batchDeleteResult.results.some(item => item.status !== 'deleted') && (
                        <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 6 }}>
                          {batchDeleteResult.results.filter(item => item.status !== 'deleted').map((item, i, arr) => (
                            <div key={item.id} style={{ padding: '6px 12px', fontSize: '0.82rem', borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none' }}>
                              <span style={{ fontWeight: 500 }}>{item.ten_KH || item.id}</span>
                              <span style={{ color: 'var(--text-label)', marginLeft: 8 }}>{item.reason}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </>
              )}
            </div>
            {selectedBatch && !loadingBatchDetail && (
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => { setSelectedBatch(null); setBatchDeleteResult(null); }}>Đóng</button>
                {!batchDeleteResult && selectedBatch.eligibleCount > 0 && (
                  <button className="btn btn-danger" onClick={() => setShowBatchDeleteConfirm(true)}>
                    <Trash2 size={15} /> Xóa đợt import ({selectedBatch.eligibleCount})
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Confirm Delete Import Batch */}
      {showBatchDeleteConfirm && selectedBatch && (
        <div className="confirm-overlay" onClick={() => !deletingBatch && setShowBatchDeleteConfirm(false)}>
          <div className="confirm-box" onClick={(e) => e.stopPropagation()}>
            <h3>Xác nhận xóa đợt import</h3>
            <p>
              Đợt import <strong>{selectedBatch.batch.filename}</strong> có <strong>{selectedBatch.eligibleCount}</strong> khách hàng có thể xóa.
              {selectedBatch.protectedCount > 0 && <> <strong>{selectedBatch.protectedCount}</strong> khách đã có lịch sử CRM/handoff/Pipeline sẽ được giữ lại.</>}
              {' '}Hành động này không thể hoàn tác.
            </p>
            <div className="confirm-actions">
              <button className="btn btn-secondary" onClick={() => setShowBatchDeleteConfirm(false)} disabled={deletingBatch}>Hủy</button>
              <button className="btn btn-danger" onClick={handleDeleteBatch} disabled={deletingBatch}>
                {deletingBatch ? 'Đang xóa...' : `Xóa ${selectedBatch.eligibleCount} khách hàng`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Delete */}
      {showConfirm && (
        <div className="confirm-overlay" onClick={() => setShowConfirm(false)}>
          <div className="confirm-box" onClick={(e) => e.stopPropagation()}>
            <h3>Xác nhận xóa</h3>
            <p>Bạn có chắc muốn xóa khách hàng này? Hành động này không thể hoàn tác.</p>
            <div className="confirm-actions">
              <button className="btn btn-secondary" onClick={() => setShowConfirm(false)}>Hủy</button>
              <button className="btn btn-danger" onClick={handleDelete}>Xóa</button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Bulk Delete */}
      {showBulkConfirm && (
        <div className="confirm-overlay" onClick={() => !bulkDeleting && setShowBulkConfirm(false)}>
          <div className="confirm-box" onClick={(e) => e.stopPropagation()}>
            <h3>Xác nhận xóa hàng loạt</h3>
            <p>
              Bạn có chắc muốn xóa <strong>{selectedIds.size}</strong> khách hàng đã chọn? Khách đã có lịch sử chăm sóc,
              handoff hoặc Pipeline sẽ được tự động giữ lại. Hành động này không thể hoàn tác.
            </p>
            <div className="confirm-actions">
              <button className="btn btn-secondary" onClick={() => setShowBulkConfirm(false)} disabled={bulkDeleting}>Hủy</button>
              <button className="btn btn-danger" onClick={handleBulkDelete} disabled={bulkDeleting}>
                {bulkDeleting ? 'Đang xóa...' : `Xóa ${selectedIds.size} khách hàng`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Delete Result */}
      {bulkResult && (
        <div className="modal-overlay" onClick={() => setBulkResult(null)}>
          <div className="modal-content" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Kết quả xóa hàng loạt</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setBulkResult(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div style={{ textAlign: 'center', padding: '12px 8px', background: '#f0fdf4', borderRadius: 8 }}>
                  <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#16a34a' }}>{bulkResult.deleted}</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-label)', marginTop: 2 }}>Đã xóa</div>
                </div>
                <div style={{ textAlign: 'center', padding: '12px 8px', background: '#fef2f2', borderRadius: 8 }}>
                  <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#dc2626' }}>{bulkResult.blocked}</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-label)', marginTop: 2 }}>Không thể xóa</div>
                </div>
              </div>

              {bulkResult.results.some(item => item.status !== 'deleted') && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, color: '#dc2626', fontWeight: 600, fontSize: '0.85rem' }}>
                    <AlertCircle size={15} />
                    Không thể xóa — lý do
                  </div>
                  <div style={{ maxHeight: 180, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 6 }}>
                    {bulkResult.results.filter(item => item.status !== 'deleted').map((item, i, arr) => (
                      <div key={item.id} style={{ padding: '6px 12px', fontSize: '0.82rem', borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none' }}>
                        <span style={{ fontWeight: 500 }}>{item.ten_KH || item.id}</span>
                        <span style={{ color: 'var(--text-label)', marginLeft: 8 }}>{item.reason}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {bulkResult.blocked === 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#16a34a', fontSize: '0.9rem' }}>
                  <CheckCircle size={18} />
                  Đã xóa thành công {bulkResult.deleted} khách hàng.
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-primary" onClick={() => setBulkResult(null)}>Đóng</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
