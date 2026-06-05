'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Grid3x3, RefreshCw, X, Settings, Plus, Trash2,
  CheckCircle, AlertCircle, ChevronDown, Loader2,
} from 'lucide-react';
import type { StackingUnit, StackingSheetMeta, StackingConfig } from '@/lib/types';

// ─── Color map by loaiCan ────────────────────────────────────────────────────

const TYPE_COLOR: Record<string, { bg: string; text: string; border: string }> = {
  'Studio':    { bg: '#f3f4f6', text: '#4b5563', border: '#d1d5db' },
  '1BR':       { bg: '#dbeafe', text: '#1d4ed8', border: '#93c5fd' },
  '1BR+':      { bg: '#ede9fe', text: '#5b21b6', border: '#c4b5fd' },
  '2BR':       { bg: '#dcfce7', text: '#15803d', border: '#86efac' },
  '2BR+':      { bg: '#d1fae5', text: '#065f46', border: '#6ee7b7' },
  '3BR':       { bg: '#ffedd5', text: '#9a3412', border: '#fdba74' },
  'Penthouse': { bg: '#fef3c7', text: '#92400e', border: '#fcd34d' },
};

function typeColor(loaiCan: string) {
  return TYPE_COLOR[loaiCan] ?? { bg: '#f9fafb', text: '#374151', border: '#e5e7eb' };
}

const STATUS_LABEL  = { con_hang: 'Còn hàng', dang_xem: 'Đang xem', da_ban: 'Đã bán' };
const STATUS_COLOR  = { con_hang: '#22c55e',   dang_xem: '#f59e0b',  da_ban: '#ef4444' };

function naturalCompare(a: string, b: string) {
  return a.localeCompare(b, 'vi', { numeric: true, sensitivity: 'base' });
}

function fmtGia(gia: number)     { return gia ? (gia / 1e9).toFixed(3).replace(/\.?0+$/, '') : '—'; }
function fmtArea(area: number)   { return area ? area.toFixed(1) + ' m²' : '—'; }
function fmtGiaFull(gia: number) { return gia ? gia.toLocaleString('vi-VN') + ' đ' : '—'; }

// ─── Manage panel ─────────────────────────────────────────────────────────────

function ManagePanel({
  configs, onClose, onAdd, onDelete,
}: {
  configs: StackingConfig[];
  onClose: () => void;
  onAdd: (c: StackingConfig) => void;
  onDelete: (id: string) => void;
}) {
  const [form, setForm] = useState({ ten_hien_thi: '', sheet_id: '', project_code: 'MPP' });
  const [probeResult, setProbeResult] = useState<{ ok: boolean; msg: string; sheets?: StackingSheetMeta[] } | null>(null);
  const [probing, setProbing]   = useState(false);
  const [saving, setSaving]     = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  async function handleProbe() {
    if (!form.sheet_id.trim()) return;
    setProbing(true);
    setProbeResult(null);
    try {
      const r = await fetch(`/api/stacking?probe=1&sheet_id=${encodeURIComponent(form.sheet_id)}`);
      const d = await r.json();
      if (d.success) {
        const detected = [...new Set((d.data as StackingSheetMeta[]).map(s => s.project))];
        setProbeResult({ ok: true, msg: `Kết nối thành công — phát hiện ${d.data.length} tower.`, sheets: d.data });
        if (detected.length === 1) setForm(f => ({ ...f, project_code: detected[0] }));
      } else {
        setProbeResult({ ok: false, msg: d.error || 'Không kết nối được' });
      }
    } catch {
      setProbeResult({ ok: false, msg: 'Lỗi kết nối server' });
    } finally {
      setProbing(false);
    }
  }

  async function handleAdd() {
    if (!form.ten_hien_thi.trim() || !form.sheet_id.trim() || !form.project_code.trim()) return;
    setSaving(true);
    try {
      const r = await fetch('/api/stacking/configs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const d = await r.json();
      if (d.success) {
        onAdd(d.data);
        setForm({ ten_hien_thi: '', sheet_id: '', project_code: 'MPP' });
        setProbeResult(null);
      } else {
        alert(d.error || 'Lỗi thêm nguồn');
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Xóa nguồn này?')) return;
    setDeleting(id);
    try {
      await fetch(`/api/stacking/configs?id=${id}`, { method: 'DELETE' });
      onDelete(id);
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.35)',
      display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end',
    }} onClick={onClose}>
      <div
        style={{
          width: 420, height: '100%', overflowY: 'auto',
          background: 'var(--bg-card)', boxShadow: '-4px 0 24px rgba(0,0,0,0.15)',
          padding: 24,
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Settings size={18} color="var(--primary)" />
            <span style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-title)' }}>
              Quản lý Google Sheet
            </span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--text-muted)' }}>
            <X size={18} />
          </button>
        </div>

        {/* Add form */}
        <div style={{ padding: 16, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-secondary, #f9fafb)', marginBottom: 24 }}>
          <p style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: 12, color: 'var(--text-title)' }}>
            Thêm nguồn Google Sheet mới
          </p>

          <div style={{ marginBottom: 10 }}>
            <input
              placeholder="Tên hiển thị (vd: Masteri Park Place)"
              value={form.ten_hien_thi}
              onChange={e => setForm(f => ({ ...f, ten_hien_thi: e.target.value }))}
              style={inputStyle}
            />
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
            <input
              placeholder="Sheet ID hoặc dán link Google Sheets"
              value={form.sheet_id}
              onChange={e => { setForm(f => ({ ...f, sheet_id: e.target.value })); setProbeResult(null); }}
              style={{ ...inputStyle, flex: 1 }}
            />
            <button
              onClick={handleProbe}
              disabled={probing || !form.sheet_id.trim()}
              style={{
                padding: '8px 12px', borderRadius: 8, fontSize: '0.8rem', whiteSpace: 'nowrap',
                border: '1px solid var(--border)', background: 'var(--bg-card)',
                color: 'var(--primary)', cursor: 'pointer', fontWeight: 600,
                opacity: probing || !form.sheet_id.trim() ? 0.5 : 1,
              }}
            >
              {probing ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : 'Kiểm tra'}
            </button>
          </div>

          {/* Probe result */}
          {probeResult && (
            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 10,
              padding: '8px 10px', borderRadius: 6,
              background: probeResult.ok ? '#dcfce7' : '#fee2e2',
              color: probeResult.ok ? '#15803d' : '#dc2626', fontSize: '0.8rem',
            }}>
              {probeResult.ok
                ? <CheckCircle size={14} style={{ marginTop: 1, flexShrink: 0 }} />
                : <AlertCircle size={14} style={{ marginTop: 1, flexShrink: 0 }} />}
              <span>{probeResult.msg}</span>
            </div>
          )}

          {/* Project code */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                Mã dự án (tên tab master trong Sheets)
              </label>
              <input
                placeholder="VD: MPP, MCC, MCCN"
                value={form.project_code}
                onChange={e => setForm(f => ({ ...f, project_code: e.target.value.toUpperCase() }))}
                style={inputStyle}
              />
              {probeResult?.sheets && (
                <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4 }}>
                  Phát hiện: {[...new Set(probeResult.sheets.map(s => s.project))].join(', ')}
                </p>
              )}
            </div>
          </div>

          <button
            onClick={handleAdd}
            disabled={saving || !form.ten_hien_thi.trim() || !form.sheet_id.trim() || !form.project_code.trim()}
            style={{
              width: '100%', padding: '9px 0', borderRadius: 8, fontWeight: 700,
              fontSize: '0.875rem', border: 'none', cursor: 'pointer',
              background: 'var(--primary)', color: '#fff',
              opacity: saving || !form.ten_hien_thi.trim() || !form.sheet_id.trim() ? 0.6 : 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            {saving
              ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Đang lưu...</>
              : <><Plus size={15} /> Thêm nguồn</>}
          </button>
        </div>

        {/* Registered sources */}
        <div>
          <p style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: 10, color: 'var(--text-title)' }}>
            Nguồn đã đăng ký ({configs.length})
          </p>

          {configs.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textAlign: 'center', padding: '20px 0' }}>
              Chưa có nguồn nào
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {configs.map(c => (
                <div key={c.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 12px', borderRadius: 8,
                  border: '1px solid var(--border)', background: 'var(--bg-card)',
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-title)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.ten_hien_thi}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'flex', gap: 8, marginTop: 2 }}>
                      <span style={{
                        background: 'var(--primary)', color: '#fff',
                        padding: '1px 6px', borderRadius: 4, fontWeight: 700, fontSize: '0.65rem',
                      }}>
                        {c.project_code}
                      </span>
                      <span style={{ fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.sheet_id.substring(0, 20)}…
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(c.id)}
                    disabled={deleting === c.id}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#ef4444', flexShrink: 0 }}
                  >
                    {deleting === c.id
                      ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} />
                      : <Trash2 size={15} />}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: '0.875rem',
  border: '1px solid var(--border)', background: 'var(--bg-card)',
  color: 'var(--text-body)', boxSizing: 'border-box',
};

// ─── Unit cell ────────────────────────────────────────────────────────────────

function UnitCell({ unit, onClick, isSelected }: { unit: StackingUnit; onClick: () => void; isSelected: boolean }) {
  const c    = typeColor(unit.loaiCan);
  const sold = unit.trangThai === 'da_ban';
  const inPr = unit.trangThai === 'dang_xem';

  return (
    <td style={{ padding: '3px 4px', minWidth: 78 }}>
      <button onClick={onClick} style={{
        width: '100%', padding: '5px 6px', borderRadius: 6,
        border: `1.5px solid ${isSelected ? 'var(--primary)' : c.border}`,
        background: sold ? '#f3f4f6' : c.bg,
        color: sold ? '#9ca3af' : c.text,
        fontSize: 11, fontWeight: 600, cursor: 'pointer',
        textDecoration: sold ? 'line-through' : 'none',
        opacity: sold ? 0.5 : inPr ? 0.78 : 1,
        outline: isSelected ? '2px solid var(--primary)' : 'none',
        outlineOffset: 1, position: 'relative', textAlign: 'center', lineHeight: 1.3,
      }}>
        {inPr && (
          <span style={{ position: 'absolute', top: 3, right: 3, width: 6, height: 6, borderRadius: '50%', background: '#f59e0b' }} />
        )}
        {fmtGia(unit.giaKS)}
        <span style={{ display: 'block', fontSize: 9, opacity: 0.7, fontWeight: 400 }}>tỷ</span>
      </button>
    </td>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function StackingPage() {
  const [configs, setConfigs]         = useState<StackingConfig[]>([]);
  const [selectedConfig, setSelectedConfig] = useState<StackingConfig | null>(null);
  const [towers, setTowers]           = useState<StackingSheetMeta[]>([]);
  const [project, setProject]         = useState('');
  const [tower, setTower]             = useState('');
  const [units, setUnits]             = useState<StackingUnit[]>([]);
  const [selectedUnit, setSelectedUnit] = useState<StackingUnit | null>(null);
  const [showManage, setShowManage]   = useState(false);
  const [loadingConfigs, setLoadingConfigs] = useState(true);
  const [loadingTowers, setLoadingTowers]   = useState(false);
  const [loadingUnits, setLoadingUnits]     = useState(false);
  const [error, setError]             = useState('');

  // 1. Load config list
  useEffect(() => {
    fetch('/api/stacking/configs')
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          setConfigs(d.data);
          if (d.data.length > 0) setSelectedConfig(d.data[0]);
        }
      })
      .catch(() => setError('Không thể tải danh sách nguồn'))
      .finally(() => setLoadingConfigs(false));
  }, []);

  // 2. Load towers when config changes
  useEffect(() => {
    if (!selectedConfig) { setTowers([]); return; }
    setLoadingTowers(true);
    setTowers([]); setProject(''); setTower(''); setUnits([]); setSelectedUnit(null);
    fetch(`/api/stacking?sheets=1&sheet_id=${encodeURIComponent(selectedConfig.sheet_id)}`)
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          setTowers(d.data);
          const first = d.data[0];
          if (first) { setProject(first.project); setTower(first.tower); }
        } else {
          setError(d.error || 'Lỗi tải tower');
        }
      })
      .catch(() => setError('Lỗi kết nối server'))
      .finally(() => setLoadingTowers(false));
  }, [selectedConfig]);

  // 3. Load units when tower changes
  const fetchUnits = useCallback(() => {
    if (!selectedConfig || !project || !tower) return;
    setLoadingUnits(true); setSelectedUnit(null); setError('');
    fetch(`/api/stacking?sheet_id=${encodeURIComponent(selectedConfig.sheet_id)}&project=${encodeURIComponent(project)}&tower=${encodeURIComponent(tower)}`)
      .then(r => r.json())
      .then(d => {
        if (d.success) setUnits(d.data);
        else setError(d.error || 'Lỗi tải dữ liệu');
      })
      .catch(() => setError('Lỗi kết nối server'))
      .finally(() => setLoadingUnits(false));
  }, [selectedConfig, project, tower]);

  useEffect(() => { fetchUnits(); }, [fetchUnits]);

  // Grid structure
  const { columns, floors, unitMap } = useMemo(() => {
    const colSet = new Set<string>(), floorSet = new Set<string>();
    const map: Record<string, Record<string, StackingUnit>> = {};
    for (const u of units) {
      colSet.add(u.canSo); floorSet.add(u.tang);
      if (!map[u.tang]) map[u.tang] = {};
      map[u.tang][u.canSo] = u;
    }
    return {
      columns: Array.from(colSet).sort(naturalCompare),
      floors:  Array.from(floorSet).sort((a, b) => naturalCompare(b, a)),
      unitMap: map,
    };
  }, [units]);

  const colMeta = useMemo(() => {
    const m: Record<string, { loaiCan: string; dtTim: number; huong: string; view: string }> = {};
    for (const u of units) if (!m[u.canSo]) m[u.canSo] = { loaiCan: u.loaiCan, dtTim: u.dtTim, huong: u.huong, view: u.view };
    return m;
  }, [units]);

  const statusCount = useMemo(() => {
    const c = { con_hang: 0, dang_xem: 0, da_ban: 0 };
    for (const u of units) c[u.trangThai]++;
    return c;
  }, [units]);

  const projects = useMemo(() => [...new Set(towers.map(t => t.project))].sort(), [towers]);
  const towersForProject = useMemo(() => towers.filter(t => t.project === project).map(t => t.tower), [towers, project]);

  if (loadingConfigs) {
    return <div style={{ padding: 40, color: 'var(--text-muted)' }}>Đang khởi tạo...</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 60px)', overflow: 'hidden' }}>

      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        padding: '10px 16px', borderBottom: '1px solid var(--border)',
        background: 'var(--bg-card)', flexShrink: 0,
      }}>
        <Grid3x3 size={18} color="var(--primary)" />
        <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-title)' }}>
          Bảng hàng Stacking
        </span>

        {/* Config (dự án) selector */}
        {configs.length > 0 ? (
          <div style={{ position: 'relative' }}>
            <select
              value={selectedConfig?.id || ''}
              onChange={e => setSelectedConfig(configs.find(c => c.id === e.target.value) || null)}
              style={selectStyle}
            >
              {configs.map(c => <option key={c.id} value={c.id}>{c.ten_hien_thi}</option>)}
            </select>
            <ChevronDown size={13} style={chevronStyle} />
          </div>
        ) : (
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Chưa có nguồn nào</span>
        )}

        {/* Project + Tower selectors (only when towers loaded) */}
        {towers.length > 0 && (
          <>
            <div style={{ position: 'relative' }}>
              <select
                value={project}
                onChange={e => { setProject(e.target.value); setTower(towers.find(t => t.project === e.target.value)?.tower || ''); }}
                style={selectStyle}
              >
                {projects.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <ChevronDown size={13} style={chevronStyle} />
            </div>
            <div style={{ position: 'relative' }}>
              <select value={tower} onChange={e => setTower(e.target.value)} style={selectStyle}>
                {towersForProject.map(t => <option key={t} value={t}>Tower {t}</option>)}
              </select>
              <ChevronDown size={13} style={chevronStyle} />
            </div>
          </>
        )}

        <button onClick={fetchUnits} disabled={loadingUnits || !selectedConfig}
          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px', borderRadius: 6, fontSize: '0.78rem', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)', cursor: 'pointer' }}>
          <RefreshCw size={13} style={{ animation: loadingUnits ? 'spin 1s linear infinite' : 'none' }} />
          Làm mới
        </button>

        {/* Status counts */}
        {units.length > 0 && (
          <div style={{ display: 'flex', gap: 10, marginLeft: 'auto', flexWrap: 'wrap' }}>
            {(['con_hang', 'dang_xem', 'da_ban'] as const).map(s => (
              <span key={s} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS_COLOR[s], display: 'inline-block' }} />
                {STATUS_LABEL[s]}: <strong style={{ color: 'var(--text-body)' }}>{statusCount[s]}</strong>
              </span>
            ))}
          </div>
        )}

        {/* Manage button */}
        <button
          onClick={() => setShowManage(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '6px 12px', borderRadius: 6, fontSize: '0.8rem', fontWeight: 600,
            border: '1px solid var(--primary)', background: 'transparent',
            color: 'var(--primary)', cursor: 'pointer', marginLeft: configs.length === 0 ? 0 : 'auto',
          }}
        >
          <Settings size={14} />
          Quản lý Sheet
        </button>
      </div>

      {/* ── Body ────────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* ── Grid ─────────────────────────────────────────────────────────── */}
        <div style={{ flex: 1, overflow: 'auto', padding: '14px 12px' }}>
          {error && (
            <div style={{ padding: '10px 14px', borderRadius: 6, marginBottom: 12, background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', fontSize: '0.875rem' }}>
              {error}
            </div>
          )}

          {/* Empty state */}
          {!loadingConfigs && configs.length === 0 && (
            <div style={{ textAlign: 'center', paddingTop: 80 }}>
              <Grid3x3 size={48} style={{ margin: '0 auto 12px', display: 'block', opacity: 0.2 }} />
              <p style={{ color: 'var(--text-title)', fontWeight: 600, marginBottom: 6 }}>Chưa có nguồn bảng hàng nào</p>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: 20 }}>
                Nhấn "Quản lý Sheet" để thêm Google Sheets bảng hàng đầu tiên
              </p>
              <button onClick={() => setShowManage(true)} style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '9px 18px', borderRadius: 8, fontWeight: 600, fontSize: '0.875rem',
                border: 'none', background: 'var(--primary)', color: '#fff', cursor: 'pointer',
              }}>
                <Plus size={15} /> Thêm nguồn đầu tiên
              </button>
            </div>
          )}

          {(loadingTowers || loadingUnits) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', padding: 20 }}>
              <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
              Đang tải...
            </div>
          )}

          {!loadingUnits && units.length > 0 && (
            <>
              {/* Legend */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                {Object.entries(TYPE_COLOR).map(([type, c]) => (
                  <span key={type} style={{ padding: '2px 8px', borderRadius: 999, fontSize: '0.72rem', fontWeight: 600, background: c.bg, color: c.text, border: `1px solid ${c.border}` }}>
                    {type}
                  </span>
                ))}
                <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: '0.72rem', fontWeight: 600, background: '#f3f4f6', color: '#9ca3af', border: '1px solid #e5e7eb', textDecoration: 'line-through' }}>
                  Đã bán
                </span>
              </div>

              {/* Grid table */}
              <div style={{ overflowX: 'auto' }}>
                <table style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
                  <thead>
                    <tr>
                      <th style={thFloorStyle}>TẦNG</th>
                      {columns.map(canSo => {
                        const m = colMeta[canSo];
                        const c = typeColor(m?.loaiCan || '');
                        return (
                          <th key={canSo} style={{ padding: '6px 4px', textAlign: 'center', minWidth: 78, borderBottom: '2px solid var(--border)', background: 'var(--bg-card)' }}>
                            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-title)' }}>{canSo}</div>
                            {m && (
                              <>
                                <div style={{ display: 'inline-block', marginTop: 2, padding: '1px 5px', borderRadius: 4, fontSize: '0.63rem', background: c.bg, color: c.text, fontWeight: 600 }}>{m.loaiCan}</div>
                                <div style={{ fontSize: '0.63rem', color: 'var(--text-muted)', marginTop: 1 }}>{fmtArea(m.dtTim)}</div>
                                <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>{m.huong}{m.view ? ` · ${m.view}` : ''}</div>
                              </>
                            )}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {floors.map((tang, fi) => (
                      <tr key={tang} style={{ background: fi % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.015)' }}>
                        <td style={{ ...thFloorStyle, background: fi % 2 === 0 ? 'var(--bg-card)' : 'var(--bg-secondary, #f9fafb)', borderTop: '1px solid var(--border)' }}>
                          {tang}
                        </td>
                        {columns.map(canSo => {
                          const unit = unitMap[tang]?.[canSo];
                          if (!unit) return (
                            <td key={canSo} style={{ padding: '3px 4px', minWidth: 78 }}>
                              <div style={{ height: 38, borderRadius: 6, border: '1px dashed #e5e7eb' }} />
                            </td>
                          );
                          return (
                            <UnitCell key={canSo} unit={unit}
                              isSelected={selectedUnit?.maCan === unit.maCan}
                              onClick={() => setSelectedUnit(u => u?.maCan === unit.maCan ? null : unit)}
                            />
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        {/* ── Detail panel ──────────────────────────────────────────────────── */}
        {selectedUnit && (
          <div style={{ width: 272, flexShrink: 0, borderLeft: '1px solid var(--border)', background: 'var(--bg-card)', overflowY: 'auto', padding: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 2 }}>Mã căn</div>
                <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-title)' }}>{selectedUnit.maCan}</div>
              </div>
              <button onClick={() => setSelectedUnit(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--text-muted)' }}><X size={16} /></button>
            </div>

            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 5, marginBottom: 14,
              padding: '3px 10px', borderRadius: 999, fontSize: '0.78rem', fontWeight: 600,
              background: selectedUnit.trangThai === 'con_hang' ? '#dcfce7' : selectedUnit.trangThai === 'da_ban' ? '#fee2e2' : '#fef3c7',
              color: selectedUnit.trangThai === 'con_hang' ? '#15803d' : selectedUnit.trangThai === 'da_ban' ? '#dc2626' : '#92400e',
            }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: STATUS_COLOR[selectedUnit.trangThai] }} />
              {STATUS_LABEL[selectedUnit.trangThai]}
            </span>

            {[
              ['Loại căn',        selectedUnit.loaiCan],
              ['DT Tim',          fmtArea(selectedUnit.dtTim)],
              ['DT Thông thuỷ',   fmtArea(selectedUnit.dtThongThuy)],
              ['Hướng',           selectedUnit.huong],
              ['View',            selectedUnit.view],
            ].map(([label, value]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--border)', fontSize: '0.85rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>{label}</span>
                <span style={{ fontWeight: 600, color: 'var(--text-body)' }}>{value || '—'}</span>
              </div>
            ))}

            <div style={{ marginTop: 14, padding: '12px 14px', borderRadius: 8, background: '#fef3c7', border: '1px solid #fcd34d' }}>
              <div style={{ fontSize: '0.72rem', color: '#92400e', marginBottom: 4 }}>Giá KS</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#92400e' }}>{fmtGiaFull(selectedUnit.giaKS)}</div>
              <div style={{ fontSize: '0.78rem', color: '#b45309', marginTop: 2 }}>≈ {fmtGia(selectedUnit.giaKS)} tỷ</div>
            </div>
          </div>
        )}
      </div>

      {/* ── Manage panel ─────────────────────────────────────────────────────── */}
      {showManage && (
        <ManagePanel
          configs={configs}
          onClose={() => setShowManage(false)}
          onAdd={c => setConfigs(prev => [...prev, c])}
          onDelete={id => {
            setConfigs(prev => prev.filter(c => c.id !== id));
            if (selectedConfig?.id === id) setSelectedConfig(null);
          }}
        />
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  padding: '6px 26px 6px 10px', borderRadius: 6, fontSize: '0.82rem',
  border: '1px solid var(--border)', background: 'var(--bg-card)',
  color: 'var(--text-body)', cursor: 'pointer', appearance: 'none',
};
const chevronStyle: React.CSSProperties = {
  position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
  pointerEvents: 'none', color: 'var(--text-muted)',
};
const thFloorStyle: React.CSSProperties = {
  position: 'sticky', left: 0, zIndex: 10, padding: '5px 10px',
  textAlign: 'center', minWidth: 52, fontWeight: 700, fontSize: '0.8rem',
  color: 'var(--text-title)', borderRight: '1px solid var(--border)',
};
