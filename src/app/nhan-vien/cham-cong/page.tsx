'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  Upload, FileSpreadsheet, CheckCircle2, AlertCircle,
  Loader2, CalendarDays, RefreshCw, Info, X, ChevronRight,
  Users, FileCheck, SkipForward, Clock
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

// ================================================================
// Types
// ================================================================
interface ImportResult {
  success: boolean;
  message?: string;
  error?: string;
  employees?: number;
  records_processed?: number;
  saved?: number;
  skipped?: number;
  errors?: string[];
}

interface HistoryEntry {
  id: string;
  thang: number;
  nam: number;
  fileName: string;
  savedAt: string;
  result: ImportResult;
}

// ================================================================
// Status badge cho mã chấm công
// ================================================================
const STATUS_CODES = [
  { code: 'x',   label: 'Đi làm đủ ngày',       color: '#10b981', bg: '#d1fae5' },
  { code: 'x/2', label: 'Thứ 7 (nửa công)',       color: '#10b981', bg: '#d1fae5' },
  { code: 'WFH', label: 'Work from home',          color: '#6366f1', bg: '#e0e7ff' },
  { code: 'P',   label: 'Nghỉ phép (hưởng lương)',color: '#f59e0b', bg: '#fef3c7' },
  { code: 'P/2', label: 'Nghỉ phép thứ 7',         color: '#f59e0b', bg: '#fef3c7' },
  { code: 'CĐ',  label: 'Nghỉ chế độ (BH trả)',   color: '#8b5cf6', bg: '#ede9fe' },
  { code: 'L',   label: 'Nghỉ lễ (hưởng lương)',  color: '#3b82f6', bg: '#dbeafe' },
  { code: 'N',   label: 'Nghỉ không lương',        color: '#ef4444', bg: '#fee2e2' },
  { code: 'N/2', label: 'Nghỉ nửa ngày KL',        color: '#ef4444', bg: '#fee2e2' },
  { code: '0',   label: 'Chủ nhật / không làm',   color: '#94a3b8', bg: '#f1f5f9' },
];

// ================================================================
export default function ChamCongPage() {
  const { canEditHRM, isLoading: authLoading } = useAuth();

  const now = new Date();
  const [thang, setThang] = useState(now.getMonth() + 1);
  const [nam,   setNam]   = useState(now.getFullYear());
  const [overwrite, setOverwrite] = useState(true);

  const [file,      setFile]      = useState<File | null>(null);
  const [dragging,  setDragging]  = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [result,    setResult]    = useState<ImportResult | null>(null);
  const [progress,  setProgress]  = useState(0);
  const [progLabel, setProgLabel] = useState('');
  const [history,   setHistory]   = useState<HistoryEntry[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load lịch sử import từ localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem('att_import_history');
      if (stored) setHistory(JSON.parse(stored));
    } catch { /* ignore */ }
  }, []);

  const saveHistory = (entry: HistoryEntry) => {
    const updated = [entry, ...history].slice(0, 10); // giữ tối đa 10 bản ghi
    setHistory(updated);
    localStorage.setItem('att_import_history', JSON.stringify(updated));
  };

  // ── File handling ──────────────────────────────────────────
  const setSelectedFile = (f: File | null) => {
    if (!f) { setFile(null); setResult(null); return; }
    if (!f.name.match(/\.(xlsx|xls)$/i)) {
      setResult({ success: false, error: 'Chỉ chấp nhận file .xlsx hoặc .xls' });
      return;
    }
    setFile(f);
    setResult(null);
  };

  const onDragOver  = (e: React.DragEvent) => { e.preventDefault(); setDragging(true);  };
  const onDragLeave = ()                     => setDragging(false);
  const onDrop      = (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    setSelectedFile(e.dataTransfer.files[0] ?? null);
  };

  // ── Import ─────────────────────────────────────────────────
  const doImport = useCallback(async () => {
    if (!file) return;
    setLoading(true);
    setResult(null);
    setProgress(10); setProgLabel('Đang đọc file...');

    try {
      const fd = new FormData();
      fd.append('file',      file);
      fd.append('thang',     String(thang));
      fd.append('nam',       String(nam));
      fd.append('overwrite', String(overwrite));

      setProgress(40); setProgLabel('Đang gửi lên server...');
      const res  = await fetch('/api/attendance/import-excel', { method: 'POST', body: fd });

      setProgress(80); setProgLabel('Đang nhận kết quả...');
      const json: ImportResult = await res.json();

      setProgress(100); setProgLabel('Hoàn tất!');
      setResult(json);

      if (json.success) {
        saveHistory({
          id:       Date.now().toString(),
          thang, nam,
          fileName: file.name,
          savedAt:  new Date().toLocaleString('vi-VN'),
          result:   json,
        });
      }
    } catch (err: any) {
      setResult({ success: false, error: err?.message || 'Lỗi kết nối server' });
    } finally {
      setLoading(false);
      setTimeout(() => { setProgress(0); setProgLabel(''); }, 800);
    }
  }, [file, thang, nam, overwrite]);

  // ── Render helpers ─────────────────────────────────────────
  if (authLoading) return (
    <div className="page-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
      <Loader2 size={24} className="spin" style={{ color: 'var(--primary)' }} />
    </div>
  );

  return (
    <div className="page-container">
      {/* Header */}
      <div className="page-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>HRM</span>
            <ChevronRight size={14} style={{ color: 'var(--text-label)' }} />
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Chấm công</span>
          </div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <CalendarDays size={24} style={{ color: 'var(--primary)' }} />
            Import Bảng Chấm Công
          </h1>
          <p className="page-subtitle">Nhập file Excel BCC hàng tháng vào hệ thống để tính lương</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 24, alignItems: 'start' }}>

        {/* ── LEFT: Form import ─────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Tháng / Năm */}
          <div className="card" style={{ padding: '20px 24px' }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-title)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <CalendarDays size={16} style={{ color: 'var(--primary)' }} />
              Chọn tháng / năm
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Tháng</label>
                <select
                  className="form-input"
                  value={thang}
                  onChange={e => setThang(+e.target.value)}
                  disabled={loading}
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                    <option key={m} value={m}>Tháng {m}</option>
                  ))}
                </select>
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Năm</label>
                <select
                  className="form-input"
                  value={nam}
                  onChange={e => setNam(+e.target.value)}
                  disabled={loading}
                >
                  {[2024, 2025, 2026, 2027].map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Upload zone */}
          <div className="card" style={{ padding: '20px 24px' }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-title)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <FileSpreadsheet size={16} style={{ color: 'var(--primary)' }} />
              File Excel chấm công
            </div>

            {!file ? (
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                style={{
                  border: `2px dashed ${dragging ? 'var(--primary)' : 'var(--border-light)'}`,
                  borderRadius: 'var(--radius-lg)',
                  padding: '40px 24px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  background: dragging ? 'var(--primary-lighter)' : 'var(--bg-page)',
                  transition: 'all var(--transition)',
                }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  style={{ display: 'none' }}
                  onChange={e => setSelectedFile(e.target.files?.[0] ?? null)}
                />
                <FileSpreadsheet size={40} style={{ color: dragging ? 'var(--primary)' : 'var(--text-label)', margin: '0 auto 12px' }} />
                <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-title)', marginBottom: 6 }}>
                  Kéo thả file vào đây hoặc click để chọn
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  Hỗ trợ .xlsx — Ví dụ: <strong>BCC THÁNG 4.xlsx</strong>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-label)', marginTop: 6 }}>
                  Cần có sheet: <code>Cham cong</code> và <code>BCC OT</code> (tùy chọn)
                </div>
              </div>
            ) : (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 14,
                background: 'var(--info-bg)', border: '1.5px solid var(--info-border)',
                borderRadius: 'var(--radius-md)', padding: '14px 16px',
              }}>
                <FileSpreadsheet size={28} style={{ color: 'var(--info-text)', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--info-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {file.name}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                    {(file.size / 1024).toFixed(0)} KB
                  </div>
                </div>
                <button
                  onClick={() => setSelectedFile(null)}
                  disabled={loading}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, borderRadius: 4 }}
                >
                  <X size={16} />
                </button>
              </div>
            )}
          </div>

          {/* Tùy chọn */}
          <div className="card" style={{ padding: '16px 24px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={overwrite}
                onChange={e => setOverwrite(e.target.checked)}
                disabled={loading}
                style={{ width: 16, height: 16, accentColor: 'var(--primary)', cursor: 'pointer' }}
              />
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-title)' }}>
                  Ghi đè dữ liệu đã có
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1 }}>
                  Cập nhật nếu tháng {thang}/{nam} đã được import trước đó
                </div>
              </div>
            </label>
          </div>

          {/* Progress bar */}
          {loading && progress > 0 && (
            <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)', padding: '14px 18px', border: '1px solid var(--border-light)' }}>
              <div style={{ background: 'var(--border-lighter)', borderRadius: 99, height: 8, overflow: 'hidden', marginBottom: 8 }}>
                <div style={{
                  height: '100%', background: 'var(--primary)', borderRadius: 99,
                  width: `${progress}%`, transition: 'width 0.4s ease',
                }} />
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <Loader2 size={12} className="spin" />
                {progLabel}
              </div>
            </div>
          )}

          {/* Result */}
          {result && (
            <div style={{
              background: result.success ? 'var(--success-bg)' : 'var(--danger-bg)',
              border: `1.5px solid ${result.success ? 'var(--success-border)' : 'var(--danger-border)'}`,
              borderRadius: 'var(--radius-lg)', padding: '18px 20px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                {result.success
                  ? <CheckCircle2 size={18} style={{ color: 'var(--success-text)' }} />
                  : <AlertCircle  size={18} style={{ color: 'var(--danger-text)'  }} />
                }
                <span style={{ fontWeight: 700, fontSize: 14, color: result.success ? 'var(--success-text)' : 'var(--danger-text)' }}>
                  {result.success ? result.message : 'Import thất bại'}
                </span>
              </div>

              {result.success ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {[
                    { icon: Users,       label: 'Nhân viên',     value: result.employees,         color: '#6366f1' },
                    { icon: FileCheck,   label: 'Records xử lý', value: result.records_processed, color: '#10b981' },
                    { icon: CheckCircle2,label: 'Đã lưu',        value: result.saved,              color: '#10b981' },
                    { icon: SkipForward, label: 'Bỏ qua',        value: result.skipped,            color: '#f59e0b' },
                  ].map(({ icon: Icon, label, value, color }) => (
                    <div key={label} style={{ background: 'rgba(255,255,255,0.7)', borderRadius: 8, padding: '10px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <Icon size={13} style={{ color }} />
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>{label}</span>
                      </div>
                      <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-title)' }}>{value ?? '—'}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: 13, color: 'var(--danger-text)', lineHeight: 1.6 }}>
                  {result.error}
                </div>
              )}

              {result.errors && result.errors.length > 0 && (
                <details style={{ marginTop: 12 }}>
                  <summary style={{ fontSize: 12, color: 'var(--warning-text)', cursor: 'pointer', fontWeight: 600 }}>
                    ⚠️ {result.errors.length} cảnh báo
                  </summary>
                  <ul style={{ marginTop: 6, paddingLeft: 16 }}>
                    {result.errors.map((e, i) => (
                      <li key={i} style={{ fontSize: 11, color: 'var(--danger-text)', marginTop: 3 }}>{e}</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}

          {/* Submit button */}
          <button
            className="btn btn-primary"
            style={{ padding: '13px 24px', fontSize: 15, fontWeight: 700, gap: 8 }}
            onClick={doImport}
            disabled={!file || loading || !canEditHRM}
          >
            {loading
              ? <><Loader2 size={18} className="spin" /> Đang import...</>
              : <><Upload size={18} /> Import vào hệ thống</>
            }
          </button>

          {!canEditHRM && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--warning-text)', background: 'var(--warning-bg)', borderRadius: 8, padding: '10px 14px' }}>
              <AlertCircle size={14} />
              Chỉ Admin hoặc HR mới có quyền import chấm công
            </div>
          )}
        </div>

        {/* ── RIGHT: Sidebar info ───────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Hướng dẫn */}
          <div className="card" style={{ padding: '18px 20px' }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-title)', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 7 }}>
              <Info size={15} style={{ color: 'var(--primary)' }} />
              Hướng dẫn
            </div>
            <ol style={{ paddingLeft: 18, fontSize: 13, color: 'var(--text-body)', lineHeight: 2 }}>
              <li>Chọn đúng <strong>tháng / năm</strong> của file Excel</li>
              <li>Nhấn chọn hoặc <strong>kéo thả</strong> file <code>.xlsx</code></li>
              <li>Nhấn <strong>Import</strong> — chờ kết quả</li>
              <li>Kiểm tra trong trang <strong>Bảng lương</strong></li>
            </ol>
          </div>

          {/* Bảng mã chấm công */}
          <div className="card" style={{ padding: '18px 20px' }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-title)', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 7 }}>
              <FileSpreadsheet size={15} style={{ color: 'var(--primary)' }} />
              Bảng mã chấm công
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {STATUS_CODES.map(({ code, label, color, bg }) => (
                <div key={code} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    minWidth: 36, height: 22, borderRadius: 6,
                    background: bg, color, fontWeight: 700, fontSize: 11,
                    padding: '0 6px',
                  }}>
                    {code}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--text-body)' }}>{label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Lịch sử import */}
          {history.length > 0 && (
            <div className="card" style={{ padding: '18px 20px' }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-title)', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 7 }}>
                <Clock size={15} style={{ color: 'var(--primary)' }} />
                Lịch sử import
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {history.slice(0, 5).map(h => (
                  <div key={h.id} style={{
                    background: 'var(--bg-page)', borderRadius: 8,
                    padding: '10px 12px', fontSize: 12,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 700, color: 'var(--primary)' }}>
                        Tháng {h.thang}/{h.nam}
                      </span>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99,
                        background: h.result.success ? 'var(--success-bg)' : 'var(--danger-bg)',
                        color: h.result.success ? 'var(--success-text)' : 'var(--danger-text)',
                      }}>
                        {h.result.success ? `✓ ${h.result.saved} dòng` : 'Lỗi'}
                      </span>
                    </div>
                    <div style={{ color: 'var(--text-muted)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {h.fileName}
                    </div>
                    <div style={{ color: 'var(--text-label)', marginTop: 2 }}>{h.savedAt}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
