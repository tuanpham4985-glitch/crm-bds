'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  BadgeDollarSign, Calculator, Save, RefreshCw,
  AlertCircle, CheckCircle2, Clock, Banknote, FileText
} from 'lucide-react';
import type { BangLuong, NhanVien } from '@/lib/types';
import type { PayrollEntry } from '@/lib/payroll';
import { useAuth } from '@/hooks/useAuth';
import { calculateTaxMonthly, TAX_CONFIG } from '@/lib/tax';

// ---- helpers ----
function fmt(n: number) {
  if (!n) return '0 ₫';
  return n.toLocaleString('vi-VN') + ' ₫';
}
function fmtShort(n: number) {
  if (!n) return '0';
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(1).replace('.0', '') + 'tr';
  return n.toLocaleString('vi-VN');
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  draft:     { label: 'Nháp',      cls: 'badge-neutral'  },
  confirmed: { label: 'Đã duyệt',  cls: 'badge-info'     },
  paid:      { label: 'Đã trả',    cls: 'badge-success'  },
};

// ================================================================
export default function BangLuongPage() {
  const { user, isAdmin, isLoading: authLoading } = useAuth();

  const now = new Date();
  const [thang, setThang] = useState(now.getMonth() + 1);
  const [nam,   setNam]   = useState(now.getFullYear());

  // Tab: 'preview' | 'saved'
  const [tab, setTab] = useState<'preview' | 'saved'>('preview');

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
    if (!isAdmin) return;
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
  }, [isAdmin, thang, nam]);

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
    if (!authLoading && !isAdmin) {
      setTab('saved');
    }
  }, [authLoading, isAdmin]);

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
      const so_phu_thuoc = row.so_nguoi_phu_thuoc || 0;
      const giam_tru     = TAX_CONFIG.giam_tru_ban_than + (TAX_CONFIG.giam_tru_phu_thuoc * so_phu_thuoc);
      const tttt         = gross - bao_hiem - giam_tru;
      const thue_        = calculateTaxMonthly(tttt);
      
      row.thue       = thue_;
      row.tong_luong = gross - bao_hiem - thue_;
      
      next[idx] = row;
      return next;
    });
  }

  // ── Lưu bảng lương ──
  const handleSave = async () => {
    if (!isAdmin || preview.length === 0) return;
    if (!confirm(`Lưu bảng lương tháng ${thang}/${nam}?\nBản ghi trùng sẽ bị bỏ qua.`)) return;
    setSaving(true);
    try {
      const res = await fetch('/api/payroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thang, nam, entries: preview }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message);
        setPreview([]);
        setTab('saved');
        await loadSaved();
      } else {
        showToast('Lỗi: ' + data.error, false);
      }
    } catch {
      showToast('Lỗi lưu bảng lương', false);
    } finally {
      setSaving(false);
    }
  };

  // ── Đổi trạng thái ──
  const changeStatus = async (id: string, trang_thai: 'draft' | 'confirmed' | 'paid') => {
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
  const displaySaved = isAdmin ? saved : saved.filter(bl => bl.id_nhan_vien === user?.id_nhan_vien);

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
          <h1>Bảng lương & Chấm công</h1>
          <p>Tự động tính từ HOP_DONG (lương cơ bản) + PIPELINE (giai_doan = Chốt)</p>
        </div>
        {isAdmin && tab === 'preview' && preview.length > 0 && (
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
            {isAdmin && displaySaved.length > 0 && (
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
          {isAdmin && (
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
          {isAdmin && (
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
              {(['preview', 'saved'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  style={{
                    padding: '7px 16px', borderRadius: 'var(--radius-full)',
                    fontSize: '0.8125rem', fontWeight: 500, cursor: 'pointer',
                    border: '1px solid',
                    background: tab === t ? 'var(--primary)' : 'var(--bg-page)',
                    color: tab === t ? '#fff' : 'var(--text-muted)',
                    borderColor: tab === t ? 'var(--primary)' : 'var(--border-light)',
                    transition: 'all var(--transition-fast)',
                  }}
                >
                  {t === 'preview' ? '📊 Preview' : '📁 Đã lưu'}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ===== TAB: PREVIEW ===== */}
      {isAdmin && tab === 'preview' && (
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

          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
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
              <div className="table-wrapper">
                <table className="data-table" style={{ fontSize: '0.85rem' }}>
                  <thead>
                    <tr>
                      <th style={{ width: 30 }}>#</th>
                      <th style={{ minWidth: 100 }}>Nhân viên</th>
                      <th style={{ textAlign: 'right', width: 70 }}>Lương CB</th>
                      <th style={{ textAlign: 'center', width: 60 }}>Công chuẩn</th>
                      <th style={{ textAlign: 'center', width: 70 }}>Nghỉ</th>
                      <th style={{ textAlign: 'center', width: 60 }}>OT (h)</th>
                      <th style={{ textAlign: 'right', width: 80 }}>Hoa hồng</th>
                      <th style={{ textAlign: 'right', width: 100 }}>Thưởng</th>
                      <th style={{ textAlign: 'right', width: 100 }}>Phạt</th>
                      <th style={{ textAlign: 'right', width: 70 }}>Gross</th>
                      <th style={{ textAlign: 'right', width: 70 }}>BHXH</th>
                      <th style={{ textAlign: 'right', width: 70 }}>Thuế</th>
                      <th style={{ textAlign: 'center', width: 50 }}>P.Thuộc</th>
                      <th style={{ textAlign: 'right', minWidth: 70, fontWeight: 700 }}>NET</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((row, idx) => (
                      <tr key={row.id_nhan_vien}>
                        <td style={{ color: 'var(--text-label)' }}>{idx + 1}</td>
                        <td style={{ fontWeight: 500, color: 'var(--text-title)' }}>
                          <div>{empMap.get(row.id_nhan_vien) || row.ho_ten || row.id_nhan_vien}</div>
                          {row.isProbation && <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', background: 'var(--bg-muted)', padding: '1px 4px', borderRadius: 4 }}>Thử việc</span>}
                        </td>
                        <td style={{ textAlign: 'right' }}>{fmtShort(row.luong_co_ban)}</td>
                        <td style={{ textAlign: 'center', fontSize: '0.85rem' }}>{row.so_ngay_cong_chuan}</td>
                        <td style={{ textAlign: 'center' }}>
                          <input
                            type="number" className="form-input" step="0.5"
                            style={{ padding: '2px 4px', textAlign: 'center', height: 28, fontSize: '0.8rem', width: 55 }}
                            value={row.so_ngay_nghi_khong_luong || 0}
                            onChange={e => updateField(idx, 'so_ngay_nghi_khong_luong', e.target.value)}
                          />
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <input
                            type="number" className="form-input"
                            style={{ padding: '2px 4px', textAlign: 'center', height: 28, fontSize: '0.8rem', width: 45 }}
                            value={row.so_gio_ot || 0}
                            onChange={e => updateField(idx, 'so_gio_ot', e.target.value)}
                          />
                        </td>
                        <td style={{ textAlign: 'right', color: '#f59e0b', fontWeight: 500 }}>{fmtShort(row.hoa_hong)}</td>
                        <td style={{ textAlign: 'right' }}>
                          <input
                            type="number" className="form-input"
                            style={{ padding: '4px 6px', textAlign: 'right', height: 28, fontSize: '0.8rem', width: 85 }}
                            value={row.thuong || ''}
                            placeholder="0"
                            onChange={e => updateField(idx, 'thuong', e.target.value)}
                          />
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <input
                            type="number" className="form-input"
                            style={{ padding: '4px 6px', textAlign: 'right', height: 28, fontSize: '0.8rem', width: 85 }}
                            value={row.phat || ''}
                            placeholder="0"
                            onChange={e => updateField(idx, 'phat', e.target.value)}
                          />
                        </td>
                        <td style={{ textAlign: 'right' }}>{fmtShort(row.gross)}</td>
                        <td style={{ textAlign: 'right', color: 'var(--danger-text)' }}>-{fmtShort(row.bao_hiem)}</td>
                        <td style={{ textAlign: 'right', color: 'var(--warning-text)' }}>-{fmtShort(row.thue)}</td>
                        <td style={{ textAlign: 'center' }}>
                          <input
                            type="number" className="form-input"
                            style={{ padding: '2px 4px', textAlign: 'center', height: 28, fontSize: '0.8rem', width: 35 }}
                            value={row.so_nguoi_phu_thuoc || 0}
                            onChange={e => updateField(idx, 'so_nguoi_phu_thuoc', e.target.value)}
                          />
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--success-text)', whiteSpace: 'nowrap' }}>
                          {fmt(row.tong_luong)}
                        </td>
                      </tr>
                    ))}
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
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {savedLoading ? (
            <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-muted)' }}>
              <div className="spinner" style={{ margin: '0 auto 12px' }} />
              Đang tải...
            </div>
          ) : displaySaved.length === 0 ? (
            <div className="empty-state" style={{ padding: 60 }}>
              <Clock size={40} />
              <h3>Chưa có bảng lương tháng {thang}/{nam}</h3>
              {isAdmin && <p>Chuyển sang tab Preview, tính lương rồi lưu.</p>}
            </div>
          ) : (
            <div className="table-wrapper">
              <table className="data-table" style={{ fontSize: '0.85rem' }}>
                <thead>
                  <tr>
                    <th style={{ width: 30 }}>#</th>
                    <th style={{ minWidth: 140 }}>Nhân viên</th>
                    <th style={{ textAlign: 'right', width: 70 }}>Lương CB</th>
                    <th style={{ textAlign: 'center', width: 60 }}>Công chuẩn</th>
                    <th style={{ textAlign: 'center', width: 60 }}>Nghỉ (k.L)</th>
                    <th style={{ textAlign: 'center', width: 50 }}>OT (h)</th>
                    <th style={{ textAlign: 'right', width: 80 }}>Hoa hồng</th>
                    <th style={{ textAlign: 'right', width: 70 }}>Thưởng</th>
                    <th style={{ textAlign: 'right', width: 70 }}>Phạt</th>
                    <th style={{ textAlign: 'center', width: 60 }}>P.Thuộc</th>
                    <th style={{ textAlign: 'right', minWidth: 100, fontWeight: 700 }}>NET</th>
                    <th style={{ width: 100 }}>Trạng thái</th>
                    {isAdmin && <th style={{ width: 110 }}>Hành động</th>}
                  </tr>
                </thead>
                <tbody>
                  {displaySaved.map((bl, idx) => {
                    const meta = STATUS_META[bl.trang_thai] ?? STATUS_META.draft;
                    return (
                      <tr key={bl.id}>
                        <td style={{ color: 'var(--text-label)' }}>{idx + 1}</td>
                        <td style={{ fontWeight: 500 }}>{empMap.get(bl.id_nhan_vien) || bl.id_nhan_vien}</td>
                        <td style={{ textAlign: 'right' }}>{fmtShort(bl.luong_co_ban)}</td>
                        <td style={{ textAlign: 'center', fontSize: '0.8rem' }}>{bl.so_ngay_cong_chuan}</td>
                        <td style={{ textAlign: 'center', fontSize: '0.8rem' }}>{bl.so_ngay_nghi_khong_luong}</td>
                        <td style={{ textAlign: 'center', fontSize: '0.8rem' }}>{bl.so_gio_ot}</td>
                        <td style={{ textAlign: 'right', color: '#f59e0b' }}>{fmtShort(bl.hoa_hong)}</td>
                        <td style={{ textAlign: 'right', color: 'var(--success-text)' }}>+{fmtShort(bl.thuong)}</td>
                        <td style={{ textAlign: 'right', color: 'var(--danger-text)' }}>-{fmtShort(bl.phat)}</td>
                        <td style={{ textAlign: 'center', fontSize: '0.8rem' }}>{bl.so_nguoi_phu_thuoc ?? depMap.get(bl.id_nhan_vien) ?? 0}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--success-text)', whiteSpace: 'nowrap' }}>
                          {fmt(bl.tong_luong)}
                        </td>
                        <td>
                          <span className={`badge ${meta.cls}`}>{meta.label}</span>
                        </td>
                        {isAdmin && (
                          <td>
                            <div style={{ position: 'relative', display: 'inline-block' }}>
                              <select
                                className="form-select"
                                style={{ padding: '4px 28px 4px 8px', fontSize: '0.8rem', height: 30 }}
                                value={bl.trang_thai}
                                onChange={e => changeStatus(bl.id, e.target.value as 'draft' | 'confirmed' | 'paid')}
                              >
                                <option value="draft">Nháp</option>
                                <option value="confirmed">Đã duyệt</option>
                                <option value="paid">Đã trả</option>
                              </select>
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
      )}
    </div>
  );
}
