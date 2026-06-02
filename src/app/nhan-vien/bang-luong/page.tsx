'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import * as XLSX from 'xlsx';
import {
  BadgeDollarSign, Calculator, Save, RefreshCw,
  AlertCircle, CheckCircle2, Clock, Banknote, FileText, X, Eye, Upload, Trash2
} from 'lucide-react';
import type { BangLuong, NhanVien, SalaryImportRow } from '@/lib/types';
import type { PayrollEntry } from '@/lib/payroll';
import { useAuth } from '@/hooks/useAuth';
import { calculateTaxMonthly, TAX_CONFIG } from '@/lib/tax';

// ── Hằng số cột Excel (0-indexed) ──
const COL_MA_NV  = 1;   // Cột B
const COL_HO_TEN = 2;   // Cột C
const COL_KD     = 38;  // Cột AM — Thực Lĩnh KD
const COL_BO     = 62;  // Cột BK — Lương Thực lĩnh BO

function normalizeEmpId(raw: unknown): string {
  const s = String(raw ?? '').trim();
  if (!s || s === '0') return '';
  if (/^VIC-/i.test(s)) return '';
  if (/^\d+$/.test(s)) return s.padStart(4, '0');
  return s;
}

function parseExcelFile(file: File, loai: 'KD' | 'BO'): Promise<SalaryImportRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });

        // Tìm sheet BẢNG LƯƠNG (linh hoạt)
        const sheetName =
          wb.SheetNames.find(n => n === 'BẢNG LƯƠNG') ||
          wb.SheetNames.find(n => n.toLowerCase().includes('lương') || n.toLowerCase().includes('luong'));

        if (!sheetName) {
          reject(new Error(`Không tìm thấy sheet "BẢNG LƯƠNG". Các sheet: ${wb.SheetNames.join(', ')}`));
          return;
        }

        const ws = wb.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as unknown[][];
        const col = loai === 'BO' ? COL_BO : COL_KD;
        const results: SalaryImportRow[] = [];

        for (const row of rows as unknown[][]) {
          const id = normalizeEmpId(row[COL_MA_NV]);
          if (!id) continue;
          const ho_ten = String(row[COL_HO_TEN] ?? '').trim();
          if (!ho_ten || /^tổng$/i.test(ho_ten)) continue;
          const raw = row[col];
          const thuc_linh = typeof raw === 'number' ? raw : (Number(raw) || 0);
          results.push({ id_nhan_vien: id, ho_ten, thuc_linh, loai });
        }

        if (results.length === 0) {
          reject(new Error(`Không đọc được dữ liệu. Kiểm tra cột B (Mã NV), cột C (Họ tên), ${loai === 'BO' ? 'cột BK' : 'cột AM'} (Thực Lĩnh).`));
        } else {
          resolve(results);
        }
      } catch (err: any) {
        reject(new Error('Lỗi parse Excel: ' + (err?.message ?? err)));
      }
    };
    reader.onerror = () => reject(new Error('Không đọc được file'));
    reader.readAsArrayBuffer(file);
  });
}

// ---- helpers ----
function fmt(n: number) {
  if (!n) return '0';
  return Math.round(n).toLocaleString('vi-VN');
}
function fmtCurrency(n: number) {
  if (!n) return '0 ₫';
  return Math.round(n).toLocaleString('vi-VN') + ' ₫';
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  draft:            { label: 'Nháp',       cls: 'badge-neutral'  },
  pending_approval: { label: 'Chờ duyệt',  cls: 'badge-warning'  },
  approved:         { label: 'Đã duyệt',   cls: 'badge-info'     },
  paid:             { label: 'Đã trả',     cls: 'badge-success'  },
  locked:           { label: 'Đã khóa',    cls: 'badge-error'    },
};

// ================================================================
export default function BangLuongPage() {
  const { user, isAdmin, isHR, canEditHRM, isLoading: authLoading } = useAuth();

  const now = new Date();
  const [thang, setThang] = useState(now.getMonth() + 1);
  const [nam,   setNam]   = useState(now.getFullYear());

  // Tab: 'import' | 'preview' | 'saved'
  const [tab, setTab] = useState<'import' | 'preview' | 'saved'>('import');

  // Preview state
  const [preview,   setPreview]   = useState<PayrollEntry[]>([]);
  const [calcLoading, setCalcLoading] = useState(false);

  // Saved state
  const [saved,     setSaved]     = useState<BangLuong[]>([]);
  const [savedLoading, setSavedLoading] = useState(false);

  // Status
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [toast,  setToast]  = useState<{ msg: string; ok: boolean } | null>(null);

  // Import Excel state
  const [importedKD, setImportedKD] = useState<SalaryImportRow[]>([]);
  const [importedBO, setImportedBO] = useState<SalaryImportRow[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Drawer state
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const openDrawer = (id: string) => {
    setSelectedId(id);
    setIsDrawerOpen(true);
  };

  // Employee maps
  const [empMap, setEmpMap] = useState<Map<string, string>>(new Map());
  const [depMap, setDepMap] = useState<Map<string, number>>(new Map());

  // --- Tính ngày công chuẩn (Trừ T7 nửa buổi, CN nghỉ, Trừ Lễ VN) ---
  const getVietnameseHolidays = (year: number) => {
    return [
      `${year}-01-01`, // Tết Dương lịch
      `${year}-04-30`, // Giải phóng miền Nam
      `${year}-05-01`, // Quốc tế Lao động
      `${year}-09-02`, // Quốc khánh
    ];
  };

  const calculateWorkdays = (m: number, y: number) => {
    const daysInMonth = new Date(y, m, 0).getDate();
    let standard = 0;
    const holidays = getVietnameseHolidays(y);

    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(y, m - 1, d);
      const dayOfWeek = date.getDay(); // 0: CN, 1: T2, ..., 6: T7
      const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

      if (holidays.includes(dateStr)) continue;

      if (dayOfWeek === 0) {
        // Chủ nhật nghỉ
      } else if (dayOfWeek === 6) {
        standard += 0.5; // Thứ 7 làm nửa buổi
      } else {
        standard += 1;   // Thứ 2-6 làm cả ngày
      }
    }
    return standard;
  };

  // ── Phát hiện loại KD/BO từ tên file ──
  function detectLoai(filename: string): 'KD' | 'BO' {
    const upper = filename.toUpperCase();
    if (upper.includes(' BO ') || upper.includes('-BO-') || upper.includes('_BO_') || upper.endsWith(' BO') || /\bBO\b/.test(upper)) return 'BO';
    return 'KD'; // default KD
  }

  // ── Import nhiều file — parse trực tiếp trên browser ──
  const handleFiles = async (files: File[]) => {
    const xlsFiles = files.filter(f => /\.(xlsx|xls)$/i.test(f.name));
    if (xlsFiles.length === 0) {
      showToast('Chỉ chấp nhận file .xlsx hoặc .xls', false);
      return;
    }
    setIsImporting(true);
    let successCount = 0;
    for (const file of xlsFiles) {
      const loai = detectLoai(file.name);
      try {
        const rows = await parseExcelFile(file, loai);
        if (loai === 'KD') setImportedKD(rows);
        else setImportedBO(rows);
        showToast(`Đọc file ${loai} thành công: ${rows.length} nhân viên`);
        successCount++;
      } catch (e: any) {
        showToast(`Lỗi đọc ${file.name}: ${e?.message ?? e}`, false);
      }
    }
    setIsImporting(false);
  };

  // ── Load employee names ──
  useEffect(() => {
    fetch('/api/nhan-vien')
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          const m = new Map<string, string>();
          const dm = new Map<string, number>();
          d.data.forEach((nv: NhanVien) => {
            m.set(nv.id_nhan_vien, nv.ho_ten);
            dm.set(nv.id_nhan_vien, nv.so_nguoi_phu_thuoc || 0);
          });
          setEmpMap(m);
          setDepMap(dm);
        }
      })
      .catch(() => {});
  }, []);

  // ── Show toast ──
  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  }

  // ── Tính lương (preview) ──
  const handleCalculate = useCallback(async () => {
    if (!canEditHRM) return;
    setCalcLoading(true);
    setPreview([]);
    try {
      const res = await fetch('/api/payroll/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thang, nam }),
      });
      const data = await res.json();
      if (data.success) {
        setPreview(data.data);
        setTab('preview');
      } else {
        showToast('Lỗi: ' + data.error, false);
      }
    } catch {
      showToast('Lỗi kết nối khi tính lương', false);
    } finally {
      setCalcLoading(false);
    }
  }, [canEditHRM, thang, nam]);

  // ── Load saved payrolls ──
  const loadSaved = useCallback(async () => {
    setSavedLoading(true);
    try {
      const res = await fetch(`/api/payroll?thang=${thang}&nam=${nam}`);
      const data = await res.json();
      if (data.success) setSaved(data.data);
    } catch {
      showToast('Lỗi tải dữ liệu đã lưu', false);
    } finally {
      setSavedLoading(false);
    }
  }, [thang, nam]);

  useEffect(() => {
    if (tab === 'saved') loadSaved();
  }, [tab, loadSaved]);

  useEffect(() => {
    if (!authLoading && !canEditHRM) {
      setTab('saved');
    }
  }, [authLoading, canEditHRM]);

  const allImported = [...importedKD, ...importedBO];
  const totalThucLinh = allImported.reduce((s, r) => s + r.thuc_linh, 0);

  // ── Inline edit fields ──
  function updateField(idx: number, field: 'thuong' | 'phat' | 'so_ngay_nghi_khong_luong' | 'so_gio_ot' | 'so_nguoi_phu_thuoc', val: string) {
    const raw = Number(val) || 0;
    setPreview(prev => {
      const next = [...prev];
      const row  = { ...next[idx] };
      row[field] = raw;

      // 1. Tính công thực tế
      row.so_ngay_lam_viec_thuc_te = row.so_ngay_cong_chuan - row.so_ngay_nghi_khong_luong;
      
      // 2. Lương theo ngày công
      row.salary_by_day = row.so_ngay_cong_chuan > 0 
        ? (row.luong_co_ban / row.so_ngay_cong_chuan) * row.so_ngay_lam_viec_thuc_te
        : 0;

      // 3. Tính OT
      const hourly_rate = row.so_ngay_cong_chuan > 0 ? (row.luong_co_ban / row.so_ngay_cong_chuan / 8) : 0;
      row.ot_pay = row.so_gio_ot * hourly_rate * 1.5;

      // 4. Gross
      const gross = row.salary_by_day + row.hoa_hong + row.thuong + row.ot_pay - row.phat;
      row.gross = gross;

      // 5. Bảo hiểm
      const bao_hiem = row.isProbation ? 0 : row.luong_co_ban * 0.105;
      row.bao_hiem = bao_hiem;

      // 6. Thuế TNCN
      let thue_ = 0;
      let tttt = 0;
      const so_phu_thuoc = row.so_nguoi_phu_thuoc || 0;

      // Note: Handle Probation, Collaborator, and Intern for 10% flat tax
      if (row.isProbation || row.isCollaborator || row.isIntern) {
        tttt = gross;
        if (tttt >= 2000000) {
          thue_ = Math.round(tttt * 0.1);
        }
      } else {
        const giam_tru = TAX_CONFIG.giam_tru_ban_than + (TAX_CONFIG.giam_tru_phu_thuoc * so_phu_thuoc);
        tttt = Math.max(0, gross - bao_hiem - giam_tru);
        thue_ = Math.round(calculateTaxMonthly(tttt));
      }
      
      row.thu_nhap_chiu_thue = tttt;
      row.thue       = thue_;
      row.tong_luong = gross - bao_hiem - thue_;

      // 7. Cập nhật dynamic items để hiển thị Drawer đồng bộ
      const items: any[] = [];
      if (row.salary_by_day > 0) items.push({ loai_khoan: 'Lương thực tế', nhom: 'thu_nhap', so_tien: Math.round(row.salary_by_day), ghi_chu: '' });
      if (row.hoa_hong > 0)      items.push({ loai_khoan: 'Hoa hồng BĐS', nhom: 'thu_nhap', so_tien: Math.round(row.hoa_hong), ghi_chu: '' });
      if (row.thuong > 0)        items.push({ loai_khoan: 'Thưởng', nhom: 'thu_nhap', so_tien: Math.round(row.thuong), ghi_chu: '' });
      if (row.ot_pay > 0)        items.push({ loai_khoan: 'Lương OT', nhom: 'thu_nhap', so_tien: Math.round(row.ot_pay), ghi_chu: '' });
      if (row.phat > 0)          items.push({ loai_khoan: 'Phạt', nhom: 'khau_tru', so_tien: Math.round(row.phat), ghi_chu: '' });
      if (row.bao_hiem > 0)      items.push({ loai_khoan: 'BHXH (10.5%)', nhom: 'khau_tru', so_tien: Math.round(row.bao_hiem), ghi_chu: '' });
      if (row.thue > 0)          items.push({ loai_khoan: 'Thuế TNCN', nhom: 'khau_tru', so_tien: Math.round(row.thue), ghi_chu: '' });
      
      (row as any).items = items;
      
      next[idx] = row;
      return next;
    });
  }

  // ── Lưu bảng lương ──
  const handleSave = async () => {
    if (!canEditHRM || preview.length === 0) return;
    if (!confirm(`Lưu bảng lương tháng ${thang}/${nam}?\nBản ghi trùng sẽ bị bỏ qua.`)) return;
    
    console.log('[Payroll] Saving entries:', preview.length, { thang, nam });
    setSaving(true);
    try {
      const res = await fetch('/api/payroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thang, nam, entries: preview }),
      });
      const data = await res.json();
      console.log('[Payroll] Save response:', data);

      if (data.success) {
        showToast(data.message || `Đã lưu thành công ${data.saved} bản ghi!`);
        setPreview([]);
        setTab('saved');
        await loadSaved();
      } else {
        showToast('Lỗi: ' + (data.error || data.errors?.join(', ')), false);
      }
    } catch (err) {
      console.error('[Payroll] Save error:', err);
      showToast('Lỗi lưu bảng lương', false);
    } finally {
      setSaving(false);
    }
  };

  // ── Đổi trạng thái ──
  const changeStatus = async (id: string, trang_thai: string) => {
    const res = await fetch('/api/payroll', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, trang_thai }),
    });
    const data = await res.json();
    if (data.success) {
      showToast('Đã cập nhật trạng thái');
      loadSaved();
    } else {
      showToast('Lỗi: ' + data.error, false);
    }
  };

  // ── Xuất báo cáo DOCX ──
  const handleExport = async (isYearly = false) => {
    if (exporting) return;
    setExporting(true);
    try {
      const urlParams = isYearly ? `nam=${nam}` : `thang=${thang}&nam=${nam}`;
      const res = await fetch(`/api/payroll/export?${urlParams}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Lỗi xuất file');
      }
      
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = isYearly ? `Bao_cao_luong_nam_${nam}.docx` : `Bao_cao_luong_${thang}_${nam}.docx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      showToast(isYearly ? `Đã xuất báo cáo năm ${nam}` : 'Đã xuất báo cáo tháng');
    } catch (err: any) {
      showToast(err.message || 'Lỗi khi xuất file', false);
    } finally {
      setExporting(false);
    }
  };

  if (authLoading) return <div className="loading-spinner"><div className="spinner" /></div>;

  // ── Access Control Filter ──
  const displaySaved = canEditHRM ? saved : saved.filter(bl => bl.id_nhan_vien === user?.id_nhan_vien);

  // ── Tổng kết preview ──
  const totalNet  = preview.reduce((s, r) => s + r.tong_luong, 0);
  const totalComm = preview.reduce((s, r) => s + r.hoa_hong,   0);
  const totalRev  = preview.reduce((s, r) => s + r.doanh_thu,  0);

  return (
    <div>
      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 20, right: 24, zIndex: 9999,
          background: toast.ok ? 'var(--success-bg)' : 'var(--danger-bg)',
          color: toast.ok ? 'var(--success-text)' : 'var(--danger-text)',
          border: `1px solid ${toast.ok ? 'var(--success-border)' : 'var(--danger-border)'}`,
          borderRadius: 'var(--radius-lg)', padding: '12px 20px',
          boxShadow: 'var(--shadow-md)', fontSize: '0.875rem', fontWeight: 500,
          display: 'flex', alignItems: 'center', gap: 8,
          animation: 'slideUp var(--transition) ease',
        }}>
          {toast.ok ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="page-header">
        <div className="page-header-left">
          <h1>Bảng lương</h1>
          <p>Import từ file Excel KD/BO hoặc tính từ HOP_DONG + PIPELINE</p>
        </div>
        {canEditHRM && tab === 'preview' && preview.length > 0 && (
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={saving}
          >
            <Save size={16} />
            {saving ? 'Đang lưu...' : `Lưu ${preview.length} bản ghi`}
          </button>
        )}
        {tab === 'saved' && (
          <div style={{ display: 'flex', gap: 8 }}>
            {canEditHRM && displaySaved.length > 0 && (
              <>
                <button 
                  className="btn btn-primary" 
                  onClick={() => handleExport(false)} 
                  disabled={exporting}
                  style={{ background: 'var(--info-text)', borderColor: 'var(--info-text)' }}
                >
                  <FileText size={15} />
                  {exporting ? '...' : `Xuất tháng ${thang}`}
                </button>
                <button 
                  className="btn btn-primary" 
                  onClick={() => handleExport(true)} 
                  disabled={exporting}
                  style={{ background: '#6366f1', borderColor: '#6366f1' }}
                >
                  <Calculator size={15} />
                  {exporting ? '...' : `Xuất năm ${nam}`}
                </button>
              </>
            )}
            <button className="btn btn-secondary" onClick={loadSaved} disabled={savedLoading}>
              <RefreshCw size={15} />
              Làm mới
            </button>
          </div>
        )}
      </div>

      {/* Filter bar */}
      <div className="card" style={{ marginBottom: 20, padding: '16px 20px' }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="form-group" style={{ margin: 0, width: 120 }}>
            <label className="form-label">Tháng</label>
            <select className="form-select" value={thang} onChange={e => setThang(Number(e.target.value))}>
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i + 1} value={i + 1}>Tháng {i + 1}</option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ margin: 0, width: 100 }}>
            <label className="form-label">Năm</label>
            <input
              type="number"
              className="form-input"
              value={nam}
              min={2020} max={2100}
              onChange={e => setNam(Number(e.target.value))}
            />
          </div>
          {canEditHRM && (
            <button
              className="btn btn-secondary"
              onClick={handleCalculate}
              disabled={calcLoading}
            >
              <Calculator size={15} />
              {calcLoading ? 'Đang tính...' : 'Tính lương'}
            </button>
          )}
          {/* Tab switcher */}
          {canEditHRM && (
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
              {([
                { key: 'import',  label: '📥 Import Excel' },
                { key: 'preview', label: '📊 Preview' },
                { key: 'saved',   label: '📁 Đã lưu' },
              ] as const).map(t => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  style={{
                    padding: '7px 16px', borderRadius: 'var(--radius-full)',
                    fontSize: '0.8125rem', fontWeight: 500, cursor: 'pointer',
                    border: '1px solid',
                    background: tab === t.key ? 'var(--primary)' : 'var(--bg-page)',
                    color: tab === t.key ? '#fff' : 'var(--text-muted)',
                    borderColor: tab === t.key ? 'var(--primary)' : 'var(--border-light)',
                    transition: 'all var(--transition-fast)',
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ===== TAB: IMPORT EXCEL ===== */}
      {canEditHRM && tab === 'import' && (
        <>
          {/* Hidden file input - multiple */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            multiple
            style={{ display: 'none' }}
            onChange={e => {
              const files = Array.from(e.target.files || []);
              if (files.length) handleFiles(files);
              e.target.value = '';
            }}
          />

          {/* Drop zone */}
          <div
            className="card"
            style={{
              marginBottom: 20, padding: 0,
              border: `2px dashed ${isDragging ? 'var(--primary)' : 'var(--border-light)'}`,
              background: isDragging ? 'var(--primary-bg)' : undefined,
              transition: 'all 0.15s',
              cursor: isImporting ? 'wait' : 'pointer',
            }}
            onClick={() => !isImporting && fileInputRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={e => {
              e.preventDefault();
              setIsDragging(false);
              const files = Array.from(e.dataTransfer.files);
              if (files.length) handleFiles(files);
            }}
          >
            <div style={{ padding: '32px 24px', textAlign: 'center' }}>
              {isImporting ? (
                <>
                  <div className="spinner" style={{ margin: '0 auto 12px' }} />
                  <div style={{ fontWeight: 500, color: 'var(--text-body)' }}>Đang đọc file...</div>
                </>
              ) : (
                <>
                  <Upload size={32} style={{ color: 'var(--primary)', marginBottom: 10 }} />
                  <div style={{ fontWeight: 600, color: 'var(--text-title)', marginBottom: 4 }}>
                    Kéo thả hoặc nhấn để chọn file
                  </div>
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 12 }}>
                    Chọn 1 hoặc 2 file cùng lúc — tên file chứa <strong>KD</strong> hoặc <strong>BO</strong> để tự phân loại
                  </div>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                    {importedKD.length > 0 ? (
                      <span style={{ fontSize: '0.78rem', background: 'var(--primary-bg)', color: 'var(--primary)', padding: '3px 10px', borderRadius: 'var(--radius-full)', fontWeight: 500 }}>
                        <CheckCircle2 size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                        KD: {importedKD.length} NV
                      </span>
                    ) : (
                      <span style={{ fontSize: '0.78rem', background: 'var(--bg-muted)', color: 'var(--text-muted)', padding: '3px 10px', borderRadius: 'var(--radius-full)' }}>
                        KD: chưa có
                      </span>
                    )}
                    {importedBO.length > 0 ? (
                      <span style={{ fontSize: '0.78rem', background: '#e0e7ff', color: '#6366f1', padding: '3px 10px', borderRadius: 'var(--radius-full)', fontWeight: 500 }}>
                        <CheckCircle2 size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                        BO: {importedBO.length} NV
                      </span>
                    ) : (
                      <span style={{ fontSize: '0.78rem', background: 'var(--bg-muted)', color: 'var(--text-muted)', padding: '3px 10px', borderRadius: 'var(--radius-full)' }}>
                        BO: chưa có
                      </span>
                    )}
                    {(importedKD.length > 0 || importedBO.length > 0) && (
                      <button
                        className="btn btn-secondary"
                        style={{ fontSize: '0.75rem', padding: '3px 10px', height: 'auto' }}
                        onClick={e => { e.stopPropagation(); setImportedKD([]); setImportedBO([]); }}
                      >
                        <Trash2 size={12} /> Xóa
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Table tổng hợp */}
          {allImported.length > 0 ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginBottom: 20 }}>
                {[
                  { label: 'Tổng nhân viên', value: allImported.length + ' người', color: 'var(--primary)' },
                  { label: 'KD thực lĩnh',   value: fmt(importedKD.reduce((s,r)=>s+r.thuc_linh,0)), color: 'var(--primary)' },
                  { label: 'BO + KD tổng',   value: fmt(totalThucLinh), color: 'var(--success-text)' },
                ].map(k => (
                  <div key={k.label} className="kpi-card" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div>
                      <div className="kpi-label">{k.label}</div>
                      <div className="kpi-value" style={{ fontSize: '1.1rem', color: k.color }}>{k.value}</div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="card" style={{ padding: 0 }}>
                <div className="table-wrapper">
                  <table className="data-table" style={{ fontSize: '0.85rem' }}>
                    <thead>
                      <tr>
                        <th style={{ width: 30 }}>#</th>
                        <th style={{ width: 60 }}>Loại</th>
                        <th style={{ width: 90 }}>Mã NV</th>
                        <th>Họ và tên</th>
                        <th style={{ textAlign: 'right', fontWeight: 700 }}>Thực lĩnh (cột AM)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allImported.map((row, idx) => (
                        <tr key={`${row.loai}-${row.id_nhan_vien}-${idx}`}>
                          <td style={{ color: 'var(--text-label)' }}>{idx + 1}</td>
                          <td>
                            <span style={{
                              fontSize: '0.7rem', fontWeight: 600, padding: '2px 8px', borderRadius: 'var(--radius-full)',
                              background: row.loai === 'KD' ? 'var(--primary-bg)' : '#e0e7ff',
                              color: row.loai === 'KD' ? 'var(--primary)' : '#6366f1',
                            }}>{row.loai}</span>
                          </td>
                          <td style={{ color: 'var(--text-muted)', fontFamily: 'monospace' }}>{row.id_nhan_vien}</td>
                          <td style={{ fontWeight: 500 }}>{row.ho_ten}</td>
                          <td style={{ textAlign: 'right', fontWeight: 700, color: row.thuc_linh > 0 ? 'var(--success-text)' : 'var(--text-muted)' }}>
                            {fmt(row.thuc_linh)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ background: 'var(--bg-muted)', fontWeight: 700 }}>
                        <td colSpan={4} style={{ textAlign: 'right', padding: '10px 16px' }}>Tổng cộng:</td>
                        <td style={{ textAlign: 'right', color: 'var(--success-text)', padding: '10px 16px' }}>{fmt(totalThucLinh)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </>
          ) : (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 8 }}>
              Chưa có dữ liệu — kéo thả file vào vùng trên để bắt đầu
            </div>
          )}
        </>
      )}

      {/* ===== TAB: PREVIEW ===== */}
      {canEditHRM && tab === 'preview' && (
        <>
          {/* KPI summary */}
          {preview.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginBottom: 20 }}>
              {[
                { label: 'Doanh thu chốt', value: fmt(totalRev),  icon: <Banknote size={18} />, color: 'var(--primary)' },
                { label: 'Tổng hoa hồng',  value: fmt(totalComm), icon: <BadgeDollarSign size={18} />, color: '#f59e0b' },
                { label: 'Tổng NET chi',   value: fmt(totalNet),  icon: <CheckCircle2 size={18} />, color: 'var(--success-text)' },
              ].map(k => (
                <div key={k.label} className="kpi-card" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ color: k.color, background: `${k.color}15`, borderRadius: 'var(--radius-md)', padding: 10 }}>
                    {k.icon}
                  </div>
                  <div>
                    <div className="kpi-label">{k.label}</div>
                    <div className="kpi-value" style={{ fontSize: '1.1rem' }}>{k.value}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="card" style={{ padding: 0 }}>
            {calcLoading ? (
              <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-muted)' }}>
                <div className="spinner" style={{ margin: '0 auto 12px' }} />
                Đang tính toán lương và hoa hồng từ Sheets...
              </div>
            ) : preview.length === 0 ? (
              <div className="empty-state" style={{ padding: 60 }}>
                <BadgeDollarSign size={40} />
                <h3>Chưa có dữ liệu preview</h3>
                <p>Chọn tháng/năm và nhấn <strong>Tính lương</strong></p>
              </div>
            ) : (
              <div className="table-wrapper" style={{ overflow: 'visible' }}>
                <table className="data-table" style={{ fontSize: '0.85rem' }}>
                  <thead>
                    <tr>
                      <th style={{ width: 30 }}>#</th>
                      <th>Nhân viên</th>
                      <th style={{ textAlign: 'right' }}>Tổng thu nhập (Gross)</th>
                      <th style={{ textAlign: 'right' }}>Khấu trừ (Thuế, BH, Phạt)</th>
                      <th style={{ textAlign: 'right', fontWeight: 700 }}>Thực nhận (Net)</th>
                      <th style={{ textAlign: 'center', width: 90 }}>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((row, idx) => {
                      const tong_khau_tru = (row.bao_hiem || 0) + (row.thue || 0) + (row.phat || 0);
                      return (
                        <tr key={row.id_nhan_vien}>
                          <td style={{ color: 'var(--text-label)' }}>{idx + 1}</td>
                          <td style={{ fontWeight: 500, color: 'var(--text-title)' }}>
                            <div>{empMap.get(row.id_nhan_vien) || row.ho_ten || row.id_nhan_vien}</div>
                            <div style={{ display: 'flex', gap: 4, marginTop: 2, flexWrap: 'wrap' }}>
                              {(!row.isProbation && !row.isCollaborator && !row.isIntern) && <span style={{ fontSize: '0.65rem', color: 'var(--primary)', background: 'var(--primary-bg)', padding: '1px 4px', borderRadius: 4 }}>Chính thức</span>}
                              {row.isProbation && <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', background: 'var(--bg-muted)', padding: '1px 4px', borderRadius: 4 }}>Thử việc</span>}
                              {row.isCollaborator && <span style={{ fontSize: '0.65rem', color: '#6366f1', background: '#e0e7ff', padding: '1px 4px', borderRadius: 4 }}>CTV</span>}
                              {row.isIntern && <span style={{ fontSize: '0.65rem', color: '#10b981', background: '#ecfdf5', padding: '1px 4px', borderRadius: 4 }}>Học viên</span>}
                            </div>
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 500 }}>{fmt(row.gross)}</td>
                          <td style={{ textAlign: 'right', color: 'var(--danger-text)' }}>-{fmt(tong_khau_tru)}</td>
                          <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--success-text)' }}>{fmt(row.tong_luong)}</td>
                          <td style={{ textAlign: 'center' }}>
                            <button className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '0.75rem' }} onClick={() => openDrawer(row.id_nhan_vien)}>
                              <Eye size={14} style={{ marginRight: 4 }} />
                              Chi tiết
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          {preview.length > 0 && (
            <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)', fontSize: '0.8rem' }}>
              <AlertCircle size={13} />
              Công chuẩn {nam}: T2-T6=1, T7=0.5. Đã trừ các ngày lễ VN. Lương = (Lương CB / Công chuẩn) × Thực tế. OT × 1.5.
            </div>
          )}
        </>
      )}

      {/* ===== TAB: SAVED ===== */}
      {tab === 'saved' && (
        <div className="card" style={{ padding: 0 }}>
          {savedLoading ? (
            <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-muted)' }}>
              <div className="spinner" style={{ margin: '0 auto 12px' }} />
              Đang tải...
            </div>
          ) : displaySaved.length === 0 ? (
            <div className="empty-state" style={{ padding: 60 }}>
              <Clock size={40} />
              <h3>Chưa có bảng lương tháng {thang}/{nam}</h3>
              {canEditHRM && <p>Chuyển sang tab Preview, tính lương rồi lưu.</p>}
            </div>
          ) : (
            <div className="table-wrapper" style={{ overflow: 'visible' }}>
              <table className="data-table" style={{ fontSize: '0.85rem' }}>
                <thead>
                  <tr>
                    <th style={{ width: 30 }}>#</th>
                    <th>Nhân viên</th>
                    <th style={{ textAlign: 'right' }}>Tổng thu nhập (Gross)</th>
                    <th style={{ textAlign: 'right' }}>Khấu trừ (Thuế, BH, Phạt)</th>
                    <th style={{ textAlign: 'right', fontWeight: 700 }}>Thực nhận (Net)</th>
                    <th style={{ textAlign: 'center', width: 100 }}>Trạng thái</th>
                    <th style={{ textAlign: 'center', width: 140 }}>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {displaySaved.map((bl, idx) => {
                    const meta = STATUS_META[bl.trang_thai] ?? STATUS_META.draft;
                    const tong_khau_tru = (bl.bao_hiem || 0) + (bl.thue || 0) + (bl.phat || 0);
                    return (
                      <tr key={bl.id}>
                        <td style={{ color: 'var(--text-label)' }}>{idx + 1}</td>
                        <td style={{ fontWeight: 500, color: 'var(--text-title)' }}>
                          <div>{empMap.get(bl.id_nhan_vien) || bl.id_nhan_vien}</div>
                          <div style={{ display: 'flex', gap: 4, marginTop: 2, flexWrap: 'wrap' }}>
                            {(!bl.isProbation && !bl.isCollaborator && !bl.isIntern) && <span style={{ fontSize: '0.65rem', color: 'var(--primary)', background: 'var(--primary-bg)', padding: '1px 4px', borderRadius: 4 }}>Chính thức</span>}
                            {bl.isProbation && <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', background: 'var(--bg-muted)', padding: '1px 4px', borderRadius: 4 }}>Thử việc</span>}
                            {bl.isCollaborator && <span style={{ fontSize: '0.65rem', color: '#6366f1', background: '#e0e7ff', padding: '1px 4px', borderRadius: 4 }}>CTV</span>}
                            {bl.isIntern && <span style={{ fontSize: '0.65rem', color: '#10b981', background: '#ecfdf5', padding: '1px 4px', borderRadius: 4 }}>Học viên</span>}
                          </div>
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 500 }}>{fmt(bl.gross ?? (bl.salary_by_day + bl.hoa_hong + bl.thuong + bl.ot_pay))}</td>
                        <td style={{ textAlign: 'right', color: 'var(--danger-text)' }}>-{fmt(tong_khau_tru)}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--success-text)' }}>{fmt(bl.tong_luong)}</td>
                        <td style={{ textAlign: 'center' }}>
                          <span className={`badge ${meta.cls}`}>{meta.label}</span>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                            <button className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '0.75rem' }} onClick={() => openDrawer(bl.id_nhan_vien)}>
                              <Eye size={14} /> Chi tiết
                            </button>
                            {canEditHRM && (
                              <select
                                className="form-select"
                                style={{ padding: '2px 22px 2px 6px', fontSize: '0.75rem', height: 26, width: 'auto' }}
                                value={bl.trang_thai}
                                onChange={e => changeStatus(bl.id, e.target.value)}
                                disabled={bl.trang_thai === 'locked'}
                              >
                                <option value="draft">Nháp</option>
                                <option value="pending_approval">Chờ duyệt</option>
                                <option value="approved">Đã duyệt</option>
                                <option value="paid">Đã trả</option>
                                <option value="locked">Đã khóa</option>
                              </select>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ===== DRAWER CHI TIẾT LƯƠNG ===== */}
      <div className={`drawer-overlay ${isDrawerOpen ? 'open' : ''}`} onClick={() => setIsDrawerOpen(false)} />
      <div className={`drawer-panel ${isDrawerOpen ? 'open' : ''}`}>
        <div className="drawer-header">
          <h3>Chi tiết lương</h3>
          <button className="btn-icon" onClick={() => setIsDrawerOpen(false)}>
            <X size={20} />
          </button>
        </div>
        <div className="drawer-body">
          {(() => {
            if (!selectedId) return null;
            let drawerRecord: PayrollEntry | BangLuong | null = null;
            let isPreviewMode = false;
            let drawerIdx = -1;

            if (tab === 'preview') {
              drawerIdx = preview.findIndex(r => r.id_nhan_vien === selectedId);
              if (drawerIdx !== -1) {
                drawerRecord = preview[drawerIdx];
                isPreviewMode = true;
              }
            } else {
              drawerRecord = saved.find(r => r.id_nhan_vien === selectedId) || null;
            }

            if (!drawerRecord) return <div className="text-muted text-center mt-4">Không tìm thấy dữ liệu</div>;

            const ho_ten = empMap.get(drawerRecord.id_nhan_vien) || (drawerRecord as any).ho_ten || drawerRecord.id_nhan_vien;
            const items = (drawerRecord as any).items || [];
            
            // Nếu không có items (dữ liệu cũ), tự tạo items ảo để hiển thị đồng nhất
            const _actual   = (drawerRecord as any).so_ngay_lam_viec_thuc_te;
            const _standard = (drawerRecord as any).so_ngay_cong_chuan;
            const _congNote = (_actual != null && _standard != null)
              ? `${_actual}/${_standard} ngày`
              : '';
            const displayItems = items.length > 0 ? items : [
              { loai_khoan: 'Lương thực tế', nhom: 'thu_nhap', so_tien: drawerRecord.salary_by_day, ghi_chu: _congNote },
              { loai_khoan: 'Hoa hồng', nhom: 'thu_nhap', so_tien: drawerRecord.hoa_hong, ghi_chu: '' },
              { loai_khoan: 'Thưởng', nhom: 'thu_nhap', so_tien: drawerRecord.thuong, ghi_chu: '' },
              { loai_khoan: 'Lương OT', nhom: 'thu_nhap', so_tien: drawerRecord.ot_pay, ghi_chu: '' },
              { loai_khoan: 'Phạt', nhom: 'khau_tru', so_tien: drawerRecord.phat, ghi_chu: '' },
              { loai_khoan: 'BHXH (10.5%)', nhom: 'khau_tru', so_tien: drawerRecord.bao_hiem, ghi_chu: '' },
              { loai_khoan: 'Thuế TNCN', nhom: 'khau_tru', so_tien: drawerRecord.thue, ghi_chu: '' },
            ].filter(i => i.so_tien !== 0);

            const incomeItems    = displayItems.filter((i: any) => i.nhom === 'thu_nhap');
            const deductionItems = displayItems.filter((i: any) => i.nhom === 'khau_tru');
            const companyItems   = displayItems.filter((i: any) => i.nhom === 'chi_phi_cty');

            const totalGross = incomeItems.reduce((s: number, i: any) => s + i.so_tien, 0);
            const totalDed   = deductionItems.reduce((s: number, i: any) => s + i.so_tien, 0);
            const totalComp  = companyItems.reduce((s: number, i: any) => s + i.so_tien, 0);

            const so_npt = (drawerRecord as any).so_nguoi_phu_thuoc ?? depMap.get(drawerRecord.id_nhan_vien) ?? 0;

            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {/* Header Profile */}
                <div style={{ background: 'var(--bg-page)', padding: 16, borderRadius: 'var(--radius-lg)' }}>
                  <div style={{ fontWeight: 600, fontSize: '1.1rem', marginBottom: 4 }}>{ho_ten}</div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 8 }}>
                    {drawerRecord.isIntern ? 'Học viên (Thực tập)' : drawerRecord.isCollaborator ? 'Cộng tác viên (CTV)' : drawerRecord.isProbation ? 'Thử việc' : 'Chính thức'} | Tháng {thang}/{nam}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: '0.8rem', color: 'var(--text-body)', borderTop: '1px solid var(--border-light)', paddingTop: 8 }}>
                    <div>Lương hợp đồng: <strong>{fmt(drawerRecord.luong_co_ban || (drawerRecord as any).luong_dong_bh)}</strong></div>
                    <div>Lương đóng BH: <strong>{fmt((drawerRecord as any).luong_dong_bh || drawerRecord.luong_co_ban)}</strong></div>
                    
                    {(!drawerRecord.isProbation && !drawerRecord.isCollaborator && !drawerRecord.isIntern) && (
                      <>
                        <div style={{ color: 'var(--info-text)' }}>Giảm trừ bản thân: <strong>{fmt(11000000)}</strong></div>
                        <div style={{ color: 'var(--info-text)' }}>Giảm trừ NPT ({so_npt}): <strong>{fmt(so_npt * 4400000)}</strong></div>
                      </>
                    )}
                    
                    <div>TN chịu thuế: <strong>{fmt((drawerRecord as any).thu_nhap_chiu_thue || 0)}</strong></div>
                    <div>Tổng chi phí: <strong style={{color: 'var(--primary)'}}>{fmt((drawerRecord as any).tong_chi_phi || (totalGross + totalComp))}</strong></div>
                  </div>
                </div>

                {/* 1. THU NHẬP */}
                <div className="form-section">
                  <div className="form-section-title">1. Thu nhập (Gross)</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
                    {incomeItems.map((item: any, i: number) => (
                      <div key={i} className="card" style={{ padding: '10px 14px', boxShadow: 'none', border: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontSize: '0.85rem', color: 'var(--text-body)' }}>{item.loai_khoan}</div>
                          {item.ghi_chu ? <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>{item.ghi_chu}</div> : null}
                        </div>
                        <div style={{ fontWeight: 600, color: 'var(--text-title)' }}>{fmtCurrency(item.so_tien)}</div>
                      </div>
                    ))}
                    {isPreviewMode && (
                       <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                         * Điều chỉnh Thưởng/OT/Nghỉ ở bảng Preview để cập nhật items
                       </div>
                    )}
                  </div>
                  <div style={{ marginTop: 12, textAlign: 'right', fontSize: '1rem', fontWeight: 700, color: 'var(--primary)' }}>
                    Tổng Gross: {fmtCurrency(totalGross)}
                  </div>
                </div>

                {/* 2. KHẤU TRỪ */}
                <div className="form-section">
                  <div className="form-section-title">2. Khấu trừ (Trừ vào lương)</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
                    {deductionItems.map((item: any, i: number) => (
                      <div key={i} className="card" style={{ padding: '10px 14px', boxShadow: 'none', border: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-body)' }}>{item.loai_khoan}</div>
                        <div style={{ fontWeight: 600, color: 'var(--danger-text)' }}>-{fmtCurrency(item.so_tien)}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: 12, textAlign: 'right', fontSize: '1rem', fontWeight: 600, color: 'var(--danger-text)' }}>
                    Tổng khấu trừ: -{fmtCurrency(totalDed)}
                  </div>
                </div>

                {/* 3. CHI PHÍ NHÂN SỰ CÔNG TY */}
                {companyItems.length > 0 && (
                  <div className="form-section">
                    <div className="form-section-title">3. Chi phí nhân sự Công ty trả (Không ảnh hưởng lương)</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
                      {companyItems.map((item: any, i: number) => (
                        <div key={i} className="card" style={{ padding: '10px 14px', boxShadow: 'none', border: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ fontSize: '0.85rem', color: 'var(--text-body)' }}>{item.loai_khoan}</div>
                          <div style={{ fontWeight: 600, color: 'var(--info-text)' }}>{fmtCurrency(item.so_tien)}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ marginTop: 12, textAlign: 'right', fontSize: '1rem', fontWeight: 600, color: 'var(--info-text)' }}>
                      Tổng CP Công ty trả: {fmtCurrency(totalComp)}
                    </div>
                  </div>
                )}

                {/* 4. THỰC NHẬN */}
                <div style={{ background: 'rgba(16, 185, 129, 0.05)', padding: 20, borderRadius: 'var(--radius-lg)', border: '1px solid rgba(16, 185, 129, 0.2)', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Thực nhận (NET)</div>
                  <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--success-text)' }}>
                    {fmtCurrency(totalGross - totalDed)}
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
