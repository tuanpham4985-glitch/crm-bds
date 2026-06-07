'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Grid3x3, RefreshCw, X, Settings, Plus, Trash2,
  CheckCircle, AlertCircle, ChevronDown, Loader2, Copy,
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

const STATUS_LABEL = { con_hang: 'Còn hàng', dang_xem: 'Đang xem', da_ban: 'Đã bán' };
const STATUS_COLOR = { con_hang: '#22c55e', dang_xem: '#f59e0b', da_ban: '#ef4444' };

function naturalCompare(a: string, b: string) {
  return a.localeCompare(b, 'vi', { numeric: true, sensitivity: 'base' });
}

function fmtGia(gia: number) { return gia ? (gia / 1e9).toFixed(3).replace(/\.?0+$/, '') : '—'; }
function fmtArea(area: number) { return area ? area.toFixed(1) + ' m²' : '—'; }
function fmtGiaFull(gia: number) { return gia ? gia.toLocaleString('vi-VN') + ' đ' : '—'; }

// ─── Manage panel ─────────────────────────────────────────────────────────────

function ManagePanel({ configs, onClose, onAdd, onDelete, onUpdate }: {
  configs: StackingConfig[];
  onClose: () => void;
  onAdd: (c: StackingConfig) => void;
  onDelete: (id: string) => void;
  onUpdate: (id: string, updates: { project_code?: string; ten_hien_thi?: string }) => void;
}) {
  const [form, setForm] = useState({ ten_hien_thi: '', sheet_id: '' });
  const [probeResult, setProbeResult] = useState<{
    ok: boolean; msg: string;
    sheets?: StackingSheetMeta[]; allTabs?: string[];
  } | null>(null);
  const [probing, setProbing]   = useState(false);
  const [saving, setSaving]     = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCode, setEditCode]   = useState('');
  const [editName, setEditName]   = useState('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [saEmail, setSaEmail]   = useState('');
  const [copied, setCopied]     = useState(false);

  useEffect(() => {
    fetch('/api/stacking/info').then(r => r.json()).then(d => { if (d.sa_email) setSaEmail(d.sa_email); });
  }, []);

  async function handleProbe() {
    if (!form.sheet_id.trim()) return;
    setProbing(true); setProbeResult(null);
    try {
      const r = await fetch(`/api/stacking?probe=1&sheet_id=${encodeURIComponent(form.sheet_id)}`);
      const d = await r.json();
      if (d.success) {
        const detected = [...new Set((d.data as StackingSheetMeta[]).map(s => s.project))];
        setProbeResult({
          ok: true,
          msg: d.data.length > 0
            ? `Kết nối thành công — phát hiện ${d.data.length} tower: ${(d.data as StackingSheetMeta[]).map(s => s.sheetName).join(', ')}.`
            : `Kết nối thành công nhưng không tìm thấy tab nào dạng "PREFIX TEN". Xem tất cả tab bên dưới.`,
          sheets: d.data,
          allTabs: d.allTabs,
        });
        void detected; // auto-detect used at runtime, no need to store in form
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
    if (!form.ten_hien_thi.trim() || !form.sheet_id.trim()) return;
    setSaving(true);
    try {
      const r = await fetch('/api/stacking/configs', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const d = await r.json();
      if (d.success) {
        onAdd(d.data);
        setForm({ ten_hien_thi: '', sheet_id: '' });
        setProbeResult(null);
      } else { alert(d.error || 'Lỗi thêm nguồn'); }
    } finally { setSaving(false); }
  }

  async function handleUpdate(id: string) {
    if (!editName.trim() && !editCode.trim()) return;
    setUpdatingId(id);
    try {
      const updates: { project_code?: string; ten_hien_thi?: string } = {};
      if (editCode.trim()) updates.project_code = editCode.trim().toUpperCase();
      if (editName.trim()) updates.ten_hien_thi = editName.trim();
      const r = await fetch('/api/stacking/configs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...updates }),
      });
      const d = await r.json();
      if (d.success) {
        onUpdate(id, updates);
        setEditingId(null);
      } else { alert(d.error || 'Lỗi cập nhật'); }
    } finally { setUpdatingId(null); }
  }

  async function handleDelete(id: string) {
    if (!confirm('Xóa nguồn này?')) return;
    setDeleting(id);
    try { await fetch(`/api/stacking/configs?id=${id}`, { method: 'DELETE' }); onDelete(id); }
    finally { setDeleting(null); }
  }

  function handleCopy() {
    if (!saEmail) return;
    navigator.clipboard.writeText(saEmail);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  }

  const canAdd = form.ten_hien_thi.trim() && form.sheet_id.trim();

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end' }} onClick={onClose}>
      <div style={{ width: 440, height: '100%', overflowY: 'auto', background: 'var(--bg-card)', boxShadow: '-4px 0 24px rgba(0,0,0,0.15)', padding: 24 }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Settings size={18} color="var(--primary)" />
            <span style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-title)' }}>Quản lý Google Sheet</span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--text-muted)' }}><X size={18} /></button>
        </div>

        {/* Service account email — hướng dẫn share */}
        {saEmail && (
          <div style={{ marginBottom: 20, padding: '12px 14px', borderRadius: 8, background: '#eff6ff', border: '1px solid #bfdbfe' }}>
            <p style={{ fontSize: '0.78rem', fontWeight: 600, color: '#1d4ed8', marginBottom: 6 }}>
              Share file Sheets với tài khoản dịch vụ này (Viewer trở lên):
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <code style={{ flex: 1, fontSize: '0.72rem', color: '#1e40af', wordBreak: 'break-all', background: '#dbeafe', padding: '4px 8px', borderRadius: 4 }}>
                {saEmail}
              </code>
              <button onClick={handleCopy} title="Sao chép" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#1d4ed8', padding: 4, flexShrink: 0 }}>
                {copied ? <CheckCircle size={15} color="#15803d" /> : <Copy size={15} />}
              </button>
            </div>
          </div>
        )}

        {/* Add form */}
        <div style={{ padding: 16, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-secondary, #f9fafb)', marginBottom: 24 }}>
          <p style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: 12, color: 'var(--text-title)' }}>
            Thêm nguồn Google Sheet mới
          </p>

          <div style={{ marginBottom: 10 }}>
            <input placeholder="Tên hiển thị (vd: Masteri Park Place)" value={form.ten_hien_thi}
              onChange={e => setForm(f => ({ ...f, ten_hien_thi: e.target.value }))} style={inputStyle} />
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
            <input
              placeholder="Dán link hoặc Sheet ID Google Sheets"
              value={form.sheet_id}
              onChange={e => { setForm(f => ({ ...f, sheet_id: e.target.value })); setProbeResult(null); }}
              style={{ ...inputStyle, flex: 1 }}
            />
            <button onClick={handleProbe} disabled={probing || !form.sheet_id.trim()} style={{
              padding: '8px 12px', borderRadius: 8, fontSize: '0.8rem', whiteSpace: 'nowrap',
              border: '1px solid var(--border)', background: 'var(--bg-card)',
              color: 'var(--primary)', cursor: 'pointer', fontWeight: 600,
              opacity: probing || !form.sheet_id.trim() ? 0.5 : 1,
              display: 'flex', alignItems: 'center', gap: 4,
            }}>
              {probing ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : null}
              Kiểm tra
            </button>
          </div>

          {/* Probe result */}
          {probeResult && (
            <div style={{ marginBottom: 10, padding: '8px 10px', borderRadius: 6, background: probeResult.ok ? '#dcfce7' : '#fee2e2', color: probeResult.ok ? '#15803d' : '#dc2626', fontSize: '0.8rem' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                {probeResult.ok ? <CheckCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} /> : <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />}
                <span>{probeResult.msg}</span>
              </div>
              {/* Show all tabs when no towers found — help user understand what's in the file */}
              {probeResult.ok && probeResult.allTabs && probeResult.sheets?.length === 0 && (
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #86efac' }}>
                  <p style={{ fontSize: '0.72rem', color: '#166534', marginBottom: 4 }}>
                    Tất cả tab trong file ({probeResult.allTabs.length}). Tab stacking cần dạng "KÝ_TỰ TÊN" (chữ hoa + khoảng trắng + tên, vd: "MPP A1"):
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {probeResult.allTabs.map(t => (
                      <span key={t} style={{ padding: '2px 7px', borderRadius: 4, fontSize: '0.7rem', border: '1px solid #86efac', background: '#f0fdf4', color: '#166534', fontWeight: 500 }}>{t}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <button onClick={handleAdd} disabled={saving || !canAdd} style={{
            width: '100%', padding: '9px 0', borderRadius: 8, fontWeight: 700, fontSize: '0.875rem',
            border: 'none', cursor: 'pointer', background: 'var(--primary)', color: '#fff',
            opacity: saving || !canAdd ? 0.6 : 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>
            {saving ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Đang lưu...</> : <><Plus size={15} /> Thêm nguồn</>}
          </button>
        </div>

        {/* Registered sources */}
        <div>
          <p style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: 10, color: 'var(--text-title)' }}>
            Nguồn đã đăng ký ({configs.length})
          </p>
          {configs.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textAlign: 'center', padding: '20px 0' }}>Chưa có nguồn nào</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {configs.map(c => (
                <div key={c.id} style={{ borderRadius: 8, border: `1.5px solid ${editingId === c.id ? 'var(--primary)' : 'var(--border)'}`, background: 'var(--bg-card)', overflow: 'hidden' }}>
                  {/* Main row */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-title)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.ten_hien_thi}</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'flex', gap: 6, marginTop: 3, alignItems: 'center' }}>
                        <span style={{ background: 'var(--primary)', color: '#fff', padding: '1px 6px', borderRadius: 4, fontWeight: 700, fontSize: '0.65rem' }}>{c.project_code}</span>
                        <span style={{ fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.sheet_id.substring(0, 24)}…</span>
                      </div>
                    </div>
                    {/* Edit button */}
                    <button
                      onClick={() => {
                        if (editingId === c.id) { setEditingId(null); return; }
                        setEditingId(c.id);
                        setEditCode(c.project_code ?? '');
                        setEditName(c.ten_hien_thi);
                      }}
                      title="Sửa thông tin"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: editingId === c.id ? 'var(--primary)' : 'var(--text-muted)', flexShrink: 0, fontSize: '0.7rem', fontWeight: 600 }}>
                      Sửa
                    </button>
                    <button onClick={() => handleDelete(c.id)} disabled={deleting === c.id}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#ef4444', flexShrink: 0 }}>
                      {deleting === c.id ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <Trash2 size={15} />}
                    </button>
                  </div>

                  {/* Inline edit panel */}
                  {editingId === c.id && (
                    <div style={{ padding: '10px 12px', borderTop: '1px solid var(--border)', background: 'var(--bg-secondary, #f9fafb)' }}>
                      {/* Tên hiển thị */}
                      <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 4 }}>Tên hiển thị</p>
                      <input
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        placeholder="VD: Masteri Park Place"
                        style={{ ...inputStyle, padding: '6px 10px', fontSize: '0.82rem', marginBottom: 8 }}
                        autoFocus
                      />
                      {/* Mã dự án */}
                      <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 4 }}>
                        Mã dự án (tùy chọn — chỉ nhập phần mã, vd: <strong>MPP</strong>, để trống = tự nhận diện)
                      </p>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <input
                          value={editCode}
                          onChange={e => setEditCode(e.target.value.toUpperCase())}
                          placeholder="VD: MPP  (để trống = auto)"
                          style={{ ...inputStyle, flex: 1, padding: '6px 10px', fontSize: '0.82rem' }}
                          onKeyDown={e => { if (e.key === 'Enter') handleUpdate(c.id); if (e.key === 'Escape') setEditingId(null); }}
                        />
                        <button
                          onClick={() => handleUpdate(c.id)}
                          disabled={updatingId === c.id || (!editName.trim() && !editCode.trim())}
                          style={{ padding: '6px 14px', borderRadius: 8, fontSize: '0.8rem', fontWeight: 600, border: 'none', background: 'var(--primary)', color: '#fff', cursor: 'pointer', flexShrink: 0, opacity: (!editName.trim() && !editCode.trim()) ? 0.6 : 1 }}>
                          {updatingId === c.id ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : 'Lưu'}
                        </button>
                        <button onClick={() => setEditingId(null)} style={{ padding: '6px 10px', borderRadius: 8, fontSize: '0.8rem', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)', cursor: 'pointer' }}>Hủy</button>
                      </div>
                    </div>
                  )}
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

// Màu nền / chữ / viền theo mauO — khớp chính xác màu trong Google Sheets
// Sheet dùng: #00ff00 (độc quyền) và #ffff00 (check Admin)
const MAU_O_COLOR: Record<'xanh' | 'vang', { bg: string; text: string; border: string }> = {
  xanh: { bg: '#00ff00', text: '#004d00', border: '#00bb00' }, // #00ff00 — HÀNG ĐỘC QUYỀN
  vang: { bg: '#ffff00', text: '#5c3d00', border: '#ccaa00' }, // #ffff00 — CHECK ADMIN
};

function UnitCell({ unit, onClick, isSelected, hlBg }: {
  unit: StackingUnit; onClick: () => void; isSelected: boolean;
  hlBg?: string; // crosshair highlight background
}) {
  const mauColor = unit.mauO ? MAU_O_COLOR[unit.mauO] : null;
  const sold     = unit.trangThai === 'da_ban';
  const inPr     = unit.trangThai === 'dang_xem';

  // Chỉ tô màu khi có mauO từ GSheets; còn lại để trắng/neutral
  const bg     = sold ? '#f3f4f6' : (mauColor?.bg     ?? '#ffffff');
  const text   = sold ? '#9ca3af' : (mauColor?.text   ?? '#475569');
  const border = isSelected ? '#6366f1' : (mauColor?.border ?? '#e2e8f0');

  // Màu badge loaiCan — dùng typeColor của unit chính nó (đúng theo section)
  const tc = typeColor(unit.loaiCan);

  // Crosshair: ô không có màu riêng → tô hlBg lên cả button; ô có màu (xanh/vàng) → chỉ tô viền td
  const btnBg = (!isSelected && hlBg && !mauColor && !sold) ? hlBg : bg;

  return (
    <td style={{ padding: '3px 4px', minWidth: 82, background: !isSelected && hlBg ? hlBg : undefined }}>
      <button onClick={onClick} style={{
        width: '100%', padding: '4px 6px', borderRadius: 6,
        border: `1.5px solid ${border}`,
        background: btnBg, color: text,
        fontSize: 11, fontWeight: 600, cursor: 'pointer',
        textDecoration: sold ? 'line-through' : 'none',
        opacity: sold ? 0.5 : inPr ? 0.78 : 1,
        outline: isSelected ? '2px solid var(--primary)' : 'none', outlineOffset: 1,
        position: 'relative', textAlign: 'center', lineHeight: 1.3,
      }}>
        {inPr && <span style={{ position: 'absolute', top: 3, right: 3, width: 6, height: 6, borderRadius: '50%', background: '#f59e0b' }} />}
        {/* Badge loaiCan — mỗi ô tự hiện loại CĂN đúng theo section của tầng đó */}
        {unit.loaiCan && !sold && (
          <span style={{
            display: 'block', fontSize: 8, fontWeight: 700, lineHeight: 1.4,
            padding: '0 3px', borderRadius: 3, marginBottom: 2,
            background: mauColor ? 'rgba(255,255,255,0.35)' : tc.bg,
            color: mauColor ? text : tc.text,
            border: `1px solid ${mauColor ? 'rgba(0,0,0,0.12)' : tc.border}`,
          }}>
            {unit.loaiCan}
          </span>
        )}
        {fmtGia(unit.giaKS)}
        <span style={{ display: 'block', fontSize: 9, opacity: 0.7, fontWeight: 400 }}>tỷ</span>
      </button>
    </td>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function StackingPage() {
  const [configs, setConfigs]               = useState<StackingConfig[]>([]);
  const [selectedConfig, setSelectedConfig] = useState<StackingConfig | null>(null);
  const [towers, setTowers]                 = useState<StackingSheetMeta[]>([]);
  const [towersError, setTowersError]       = useState('');
  const [project, setProject]               = useState('');
  const [tower, setTower]                   = useState('');
  const [units, setUnits]                   = useState<StackingUnit[]>([]);
  const [selectedUnit, setSelectedUnit]     = useState<StackingUnit | null>(null);
  const [showManage, setShowManage]         = useState(false);
  const [loadingConfigs, setLoadingConfigs] = useState(true);
  const [loadingTowers, setLoadingTowers]   = useState(false);
  const [loadingUnits, setLoadingUnits]     = useState(false);
  const [unitsError, setUnitsError]         = useState('');

  // 1. Load config list on mount
  useEffect(() => {
    fetch('/api/stacking/configs')
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          setConfigs(d.data);
          if (d.data.length > 0) setSelectedConfig(d.data[0]);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingConfigs(false));
  }, []);

  // 2. Load towers when selected config changes
  useEffect(() => {
    if (!selectedConfig) { setTowers([]); setTowersError(''); return; }
    setLoadingTowers(true);
    setTowers([]); setProject(''); setTower(''); setUnits([]); setSelectedUnit(null); setTowersError('');

    const params = new URLSearchParams({ sheets: '1', sheet_id: selectedConfig.sheet_id });
    if (selectedConfig.project_code) params.set('project_code', selectedConfig.project_code);

    fetch(`/api/stacking?${params}`)
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          if (d.data.length === 0) {
            setTowersError(
              'Không tìm thấy tower nào trong file này. ' +
              'File cần có tab tên dạng "MPP A1", "MPP A2", "MCC B1" v.v. ' +
              '(chữ hoa + khoảng trắng + tên tower). ' +
              'Nhấn "Mở Quản lý Sheet" → "Kiểm tra" để xem tất cả tab trong file.'
            );
          } else {
            setTowers(d.data);
            const first = d.data[0];
            setProject(first.project);
            setTower(first.tower);
          }
        } else {
          setTowersError(d.error || 'Lỗi tải danh sách tower');
        }
      })
      .catch(() => setTowersError('Lỗi kết nối server'))
      .finally(() => setLoadingTowers(false));
  }, [selectedConfig]);

  // 3. Load units when tower changes
  const fetchUnits = useCallback(() => {
    if (!selectedConfig || !project || !tower) return;
    setLoadingUnits(true); setSelectedUnit(null); setUnitsError('');

    const params = new URLSearchParams({ sheet_id: selectedConfig.sheet_id, project, tower });
    fetch(`/api/stacking?${params}`)
      .then(r => r.json())
      .then(d => {
        if (d.success) setUnits(d.data);
        else setUnitsError(d.error || 'Lỗi tải dữ liệu căn hộ');
      })
      .catch(() => setUnitsError('Lỗi kết nối server'))
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
      floors: Array.from(floorSet).sort((a, b) => naturalCompare(a, b)),
      unitMap: map,
    };
  }, [units]);

  const colMeta = useMemo(() => {
    // Mỗi cột (canSo) có thể chứa nhiều section với loaiCan/dtTim KHÁC NHAU
    // (vd: cột 16 → section 1 = "1BR" 51m², section 2 = "3BR" 95m², section 3 = "DUPLEX")
    // → Thu thập TẤT CẢ giá trị unique để hiện đầy đủ trong header
    const firstUnit: Record<string, StackingUnit> = {};
    const loaiCanSets: Record<string, Set<string>> = {};
    const dtTimSets: Record<string, Set<number>> = {};

    for (const u of units) {
      if (!firstUnit[u.canSo]) firstUnit[u.canSo] = u;
      if (!loaiCanSets[u.canSo]) loaiCanSets[u.canSo] = new Set();
      if (!dtTimSets[u.canSo]) dtTimSets[u.canSo] = new Set();
      if (u.loaiCan) loaiCanSets[u.canSo].add(u.loaiCan);
      if (u.dtTim > 0) dtTimSets[u.canSo].add(Math.round(u.dtTim * 10)); // tránh float dupe
    }

    const m: Record<string, { loaiCan: string; dtTim: number; huong: string; view: string }> = {};
    for (const canSo of Object.keys(firstUnit)) {
      const u = firstUnit[canSo];
      m[canSo] = {
        // Nếu nhiều loại → hiện tất cả, vd "1BR / 3BR / DUPLEX"
        loaiCan: Array.from(loaiCanSets[canSo]).join(' / '),
        // Chỉ hiện dtTim nếu tất cả unit trong cột có cùng giá trị
        dtTim: dtTimSets[canSo].size === 1 ? u.dtTim : 0,
        huong: u.huong,
        view: u.view,
      };
    }
    return m;
  }, [units]);

  const statusCount = useMemo(() => {
    const c = { con_hang: 0, dang_xem: 0, da_ban: 0 };
    for (const u of units) c[u.trangThai]++;
    return c;
  }, [units]);

  const projects = useMemo(() => [...new Set(towers.map(t => t.project))].sort(), [towers]);
  const towersForProject = useMemo(() => towers.filter(t => t.project === project).map(t => t.tower), [towers, project]);

  // ── Crosshair highlight ───────────────────────────────────────────────────
  // Khi click 1 ô: tô màu nhạt sang trái (cùng hàng, từ ô đó về TẦNG)
  //                              và lên trên (cùng cột, từ ô đó lên header)
  const xFloorIdx = selectedUnit ? floors.indexOf(selectedUnit.tang)   : -1;
  const xColIdx   = selectedUnit ? columns.indexOf(selectedUnit.canSo) : -1;
  // Màu cell (semi-transparent) và màu sticky (solid) — theo mauO của unit đang chọn
  const hlCell   = !selectedUnit ? ''
    : selectedUnit.mauO === 'xanh' ? 'rgba(0,220,80,0.09)'
    : selectedUnit.mauO === 'vang' ? 'rgba(255,220,0,0.11)'
    : 'rgba(99,102,241,0.07)';
  const hlSticky = !selectedUnit ? ''
    : selectedUnit.mauO === 'xanh' ? '#dcfce7'
    : selectedUnit.mauO === 'vang' ? '#fef9c3'
    : '#eef2ff';

  if (loadingConfigs) return <div style={{ padding: 40, color: 'var(--text-muted)' }}>Đang khởi tạo...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 60px)', overflow: 'hidden' }}>

      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '10px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg-card)', flexShrink: 0 }}>
        <Grid3x3 size={18} color="var(--primary)" />
        <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-title)' }}>Bảng hàng Stacking</span>

        {/* Config selector */}
        {configs.length > 0 ? (
          <div style={{ position: 'relative' }}>
            <select value={selectedConfig?.id || ''} onChange={e => setSelectedConfig(configs.find(c => c.id === e.target.value) || null)} style={selectStyle}>
              {configs.map(c => <option key={c.id} value={c.id}>{c.ten_hien_thi}</option>)}
            </select>
            <ChevronDown size={13} style={chevronStyle} />
          </div>
        ) : (
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Chưa có nguồn nào</span>
        )}

        {/* Tower selectors */}
        {towers.length > 0 && (
          <>
            <div style={{ position: 'relative' }}>
              <select value={project} onChange={e => { setProject(e.target.value); setTower(towers.find(t => t.project === e.target.value)?.tower || ''); }} style={selectStyle}>
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

        {loadingTowers && <Loader2 size={15} style={{ animation: 'spin 1s linear infinite', color: 'var(--text-muted)' }} />}

        <button onClick={fetchUnits} disabled={loadingUnits || !selectedConfig || towers.length === 0}
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

        <button onClick={() => setShowManage(true)} style={{
          display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 6,
          fontSize: '0.8rem', fontWeight: 600, border: '1px solid var(--primary)',
          background: 'transparent', color: 'var(--primary)', cursor: 'pointer', marginLeft: configs.length === 0 ? 0 : 'auto',
        }}>
          <Settings size={14} /> Quản lý Sheet
        </button>
      </div>

      {/* ── Body ────────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <div style={{ flex: 1, minWidth: 0, overflow: 'auto', padding: '0 12px 14px' }}>

          {/* Empty state: no configs */}
          {configs.length === 0 && (
            <div style={{ textAlign: 'center', paddingTop: 80 }}>
              <Grid3x3 size={48} style={{ margin: '0 auto 12px', display: 'block', opacity: 0.2 }} />
              <p style={{ color: 'var(--text-title)', fontWeight: 600, marginBottom: 6 }}>Chưa có nguồn bảng hàng nào</p>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: 20 }}>
                Nhấn "Quản lý Sheet" → thêm Sheet ID của file bảng hàng
              </p>
              <button onClick={() => setShowManage(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 8, fontWeight: 600, fontSize: '0.875rem', border: 'none', background: 'var(--primary)', color: '#fff', cursor: 'pointer' }}>
                <Plus size={15} /> Thêm nguồn đầu tiên
              </button>
            </div>
          )}

          {/* Towers error */}
          {towersError && (
            <div style={{ padding: '12px 16px', borderRadius: 8, background: '#fef3c7', border: '1px solid #fcd34d', color: '#92400e', fontSize: '0.875rem', marginBottom: 12 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
                <div>
                  <strong>Không tải được danh sách tower</strong>
                  <p style={{ marginTop: 4, marginBottom: 0 }}>{towersError}</p>
                  <button onClick={() => setShowManage(true)} style={{ marginTop: 8, fontSize: '0.8rem', fontWeight: 600, color: '#92400e', background: 'none', border: '1px solid #d97706', borderRadius: 6, padding: '3px 10px', cursor: 'pointer' }}>
                    Mở Quản lý Sheet →
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Units error */}
          {unitsError && (
            <div style={{ padding: '10px 14px', borderRadius: 6, background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', fontSize: '0.875rem', marginBottom: 12 }}>
              {unitsError}
            </div>
          )}

          {/* Loading */}
          {(loadingTowers || loadingUnits) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', padding: 16 }}>
              <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
              {loadingTowers ? 'Đang tải danh sách tower...' : 'Đang tải dữ liệu căn hộ...'}
            </div>
          )}

          {/* Grid */}
          {!loadingUnits && units.length > 0 && (
            <>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10, paddingTop: 14 }}>
                <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: '0.72rem', fontWeight: 600, background: MAU_O_COLOR.xanh.bg, color: MAU_O_COLOR.xanh.text, border: `1px solid ${MAU_O_COLOR.xanh.border}` }}>Độc quyền</span>
                <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: '0.72rem', fontWeight: 600, background: MAU_O_COLOR.vang.bg, color: MAU_O_COLOR.vang.text, border: `1px solid ${MAU_O_COLOR.vang.border}` }}>Check Admin</span>
                <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: '0.72rem', fontWeight: 600, background: '#fef2f2', color: '#ef4444', border: '1px solid #fecaca', textDecoration: 'line-through' }}>Đã bán</span>
              </div>

                <table className="stacking-table">
                  <thead>
                    <tr>
                      {/* Corner: CSS class xử lý sticky top+left+z-index+background */}
                      <th style={{ padding: '5px 10px', textAlign: 'center', minWidth: 52, fontWeight: 700, fontSize: '0.8rem', color: 'var(--text-title)' }}>TẦNG</th>
                      {columns.map((canSo, ci) => {
                        const isHlTh = xColIdx >= 0 && ci === xColIdx;
                        return (
                          <th key={canSo} style={{ padding: '6px 4px', textAlign: 'center', minWidth: 82, ...(isHlTh ? { background: hlSticky } : {}) }}>
                            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-title)' }}>{canSo}</div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {floors.map((tang, fi) => {
                      const isHlRow = xFloorIdx >= 0 && fi === xFloorIdx;
                      return (
                        <tr key={tang} style={{ background: fi % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.015)' }}>
                          {/* Cột TẦNG: CSS class xử lý sticky left+z-index; background theo crosshair hoặc alternating */}
                          <td style={{ padding: '5px 10px', textAlign: 'center', minWidth: 52, fontWeight: 700, fontSize: '0.8rem', color: 'var(--text-title)', background: isHlRow ? hlSticky : fi % 2 === 0 ? '#ffffff' : '#f9fafb', borderTop: '1px solid #e2e8f0' }}>{tang}</td>
                          {columns.map((canSo, ci) => {
                            const unit = unitMap[tang]?.[canSo];
                            // Hàng: cùng tầng, cột từ 0 đến xColIdx (tức từ ô đó hất sang trái)
                            const isRowHl = isHlRow && ci <= xColIdx;
                            // Cột: cùng canSo, tầng từ 0 đến xFloorIdx (tức từ ô đó hất lên trên)
                            const isColHl = xColIdx >= 0 && ci === xColIdx && fi <= xFloorIdx;
                            const isHl    = isRowHl || isColHl;
                            if (!unit) return (
                              <td key={canSo} style={{ padding: '3px 4px', minWidth: 82, background: isHl ? hlCell : undefined }}>
                                <div style={{ height: 46, borderRadius: 6, border: '1px dashed #e5e7eb' }} />
                              </td>
                            );
                            const isSel = selectedUnit?.maCan === unit.maCan;
                            return <UnitCell key={canSo} unit={unit} isSelected={isSel} hlBg={isHl && !isSel ? hlCell : undefined} onClick={() => setSelectedUnit(u => u?.maCan === unit.maCan ? null : unit)} />;
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
            </>
          )}
        </div>

        {/* Detail panel */}
        {selectedUnit && (
          <div style={{ width: 272, flexShrink: 0, borderLeft: '1px solid var(--border)', background: 'var(--bg-card)', overflowY: 'auto', padding: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 2 }}>Mã căn</div>
                <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-title)' }}>{selectedUnit.maCan}</div>
              </div>
              <button onClick={() => setSelectedUnit(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--text-muted)' }}><X size={16} /></button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 999, fontSize: '0.78rem', fontWeight: 600, background: selectedUnit.trangThai === 'con_hang' ? '#dcfce7' : selectedUnit.trangThai === 'da_ban' ? '#fee2e2' : '#fef3c7', color: selectedUnit.trangThai === 'con_hang' ? '#15803d' : selectedUnit.trangThai === 'da_ban' ? '#dc2626' : '#92400e' }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: STATUS_COLOR[selectedUnit.trangThai] }} />
                {STATUS_LABEL[selectedUnit.trangThai]}
              </span>
              {selectedUnit.mauO === 'xanh' && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 999, fontSize: '0.78rem', fontWeight: 600, background: MAU_O_COLOR.xanh.bg, color: MAU_O_COLOR.xanh.text, border: `1px solid ${MAU_O_COLOR.xanh.border}` }}>
                  Độc quyền
                </span>
              )}
              {selectedUnit.mauO === 'vang' && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 999, fontSize: '0.78rem', fontWeight: 600, background: MAU_O_COLOR.vang.bg, color: MAU_O_COLOR.vang.text, border: `1px solid ${MAU_O_COLOR.vang.border}` }}>
                  Check Admin
                </span>
              )}
            </div>
            {[['Loại căn', selectedUnit.loaiCan], ['DT Thông thuỷ', fmtArea(selectedUnit.dtThongThuy)], ['Hướng', selectedUnit.huong], ['View', selectedUnit.view]].map(([label, value]) => (
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

      {/* Manage panel */}
      {showManage && (
        <ManagePanel configs={configs} onClose={() => setShowManage(false)}
          onAdd={c => { setConfigs(prev => [...prev, c]); if (!selectedConfig) setSelectedConfig(c); }}
          onDelete={id => { setConfigs(prev => prev.filter(c => c.id !== id)); if (selectedConfig?.id === id) setSelectedConfig(null); }}
          onUpdate={(id, updates) => {
            setConfigs(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
            if (selectedConfig?.id === id) setSelectedConfig(sc => sc ? { ...sc, ...updates } : sc);
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
