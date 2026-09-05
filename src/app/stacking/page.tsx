'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Grid3x3, RefreshCw, X, Settings, Plus, Trash2,
  CheckCircle, AlertCircle, ChevronDown, Loader2, Copy,
  Minus, Maximize2, Search, Map as MapIcon, ArrowUp, ArrowDown, ArrowUpDown,
} from 'lucide-react';
import type { StackingUnit, StackingSheetMeta, StackingConfig, StackingListRow } from '@/lib/types';
import { useAuth } from '@/hooks/useAuth';
import TmbMap from './TmbMap';
import TmbManagerPanel from './TmbManagerPanel';
import { resolveTmbMapProfile, tmbShortLabel } from './tmb-map-data';
import { useDbTmbMapProfiles } from './tmb-map-registry';
import { fmtGia, fmtArea, fmtGiaFull } from './format';
import {
  filterStackingListRows, totalStackingListPages, clampStackingListPage, paginateStackingListRows, STACKING_LIST_PAGE_SIZE,
  splitStackingListColumns, groupStackingListColumnsForDetail, effectiveDotStatus, countStackingListRowsByDotStatus,
  reconcileVisibleColumns, sortStackingListRows, type StackingListSort,
} from '@/lib/stacking-list';

// Mirror của extractSheetId() phía server (google-sheets.ts) — Admin có thể
// dán nguyên link đầy đủ ("https://docs.google.com/spreadsheets/d/{id}/edit?...")
// vào ô sheet_id; các API cần spreadsheetId SẠCH (VD mode=list-columns) phải
// tự bóc ở phía client TRƯỚC khi gọi, vì lúc đó config chưa được lưu qua
// addStackingConfig (nơi DUY NHẤT tự extract phía server).
function extractSheetId(input: string): string {
  const m = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : input.trim();
}

// ─── Color map by loaiCan ────────────────────────────────────────────────────

const TYPE_COLOR: Record<string, { bg: string; text: string; border: string }> = {
  'Studio':    { bg: '#e2e8f0', text: '#334155', border: '#94a3b8' },
  '1BR':       { bg: '#bfdbfe', text: '#1e40af', border: '#60a5fa' },   // xanh dương
  '1BR+':      { bg: '#c4b5fd', text: '#4c1d95', border: '#8b5cf6' },   // tím
  '1BR+1MR':   { bg: '#7dd3fc', text: '#0c4a6e', border: '#38bdf8' },   // sky
  '2BR':       { bg: '#86efac', text: '#14532d', border: '#22c55e' },   // xanh lá
  '2BR+':      { bg: '#6ee7b7', text: '#064e3b', border: '#10b981' },   // emerald
  '2BR+1MR':   { bg: '#5eead4', text: '#134e4a', border: '#14b8a6' },   // teal
  '2BR+1MMR':  { bg: '#a5f3fc', text: '#164e63', border: '#22d3ee' },   // cyan
  '3BR':       { bg: '#fdba74', text: '#7c2d12', border: '#f97316' },   // cam
  '3BR+1MR':   { bg: '#d9f99d', text: '#365314', border: '#84cc16' },   // lime
  '4BR':       { bg: '#fca5a5', text: '#7f1d1d', border: '#ef4444' },   // đỏ
  'Penthouse': { bg: '#fcd34d', text: '#713f12', border: '#f59e0b' },   // vàng gold
};

function typeColor(loaiCan: string) {
  return TYPE_COLOR[loaiCan] ?? { bg: '#f9fafb', text: '#374151', border: '#e5e7eb' };
}

const STATUS_LABEL = { con_hang: 'Còn hàng', dang_xem: 'Đang xem', da_ban: 'Đã bán' };
const STATUS_COLOR = { con_hang: '#22c55e', dang_xem: '#f59e0b', da_ban: '#ef4444' };

// Chế độ Danh sách (biệt thự/liền kề) — cột đóng vai trò dropdown "Dự án" của
// chế độ Lưới, nếu Sheet có cột này (VD "IVY PARK" / "GLOBAL PARK" của VHSGP).
const GROUP_FILTER_COLUMN = 'Phân khu';

// Nhãn màu Sale tự đánh dấu trong Sheet gốc (KHÁC hẳn STATUS_LABEL/STATUS_COLOR
// ở trên — đó là authority CRM Pipeline, 2 tín hiệu độc lập hoàn toàn).
const MARKER_LABEL = { check_admin: 'Check Admin', da_ban: 'Đã bán' } as const;
const MARKER_BADGE_STYLE: Record<'check_admin' | 'da_ban', React.CSSProperties> = {
  check_admin: { fontSize: '0.62rem', fontWeight: 700, padding: '1px 5px', borderRadius: 4, background: '#fef08a', color: '#111827', border: '1px solid #000', whiteSpace: 'nowrap' },
  da_ban:      { fontSize: '0.62rem', fontWeight: 700, padding: '1px 5px', borderRadius: 4, background: '#ef4444', color: '#111827', border: '1px solid #000', whiteSpace: 'nowrap' },
};

function naturalCompare(a: string, b: string) {
  return a.localeCompare(b, 'vi', { numeric: true, sensitivity: 'base' });
}

const TOWER_DISPLAY: Record<string, string> = {
  'HH-A': 'HH-A (L1)',
  'HH-B': 'HH-B (L2)',
};
function towerLabel(tower: string) {
  return TOWER_DISPLAY[tower] ?? tower;
}

function hexToRgba(hex: string, alpha: number) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}


// ─── Manage panel ─────────────────────────────────────────────────────────────

function ManagePanel({ configs, onClose, onAdd, onDelete, onUpdate }: {
  configs: StackingConfig[];
  onClose: () => void;
  onAdd: (c: StackingConfig) => void;
  onDelete: (id: string) => void;
  onUpdate: (id: string, updates: { project_code?: string; ten_hien_thi?: string; sheet_id?: string; sheet_tab?: string; visible_columns?: string[] }) => void;
}) {
  const [form, setForm] = useState<{ ten_hien_thi: string; sheet_id: string; loai: 'grid' | 'list'; sheet_tab: string; visible_columns: string[] }>({
    ten_hien_thi: '', sheet_id: '', loai: 'grid', sheet_tab: '', visible_columns: [],
  });
  const [tabColumns, setTabColumns] = useState<string[]>([]); // cột thật của tab đã chọn (bước "chọn cột hiển thị")
  const [loadingColumns, setLoadingColumns] = useState(false);
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
  const [editTab, setEditTab]     = useState('');
  const [editColumns, setEditColumns] = useState<string[]>([]); // cột thật của tab đang sửa
  const [editVisibleColumns, setEditVisibleColumns] = useState<string[]>([]);
  const [loadingEditColumns, setLoadingEditColumns] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  // Đổi Google Sheet backing 1 nguồn đã đăng ký — editSheetId khởi tạo = giá
  // trị sheet_id hiện tại (yêu cầu "hiển thị giá trị Sheet hiện tại"); PHẢI
  // "Kiểm tra" (editSheetProbe.ok === true) trước khi cho Lưu nếu Admin đổi
  // giá trị này — xem handleEditProbe + điều kiện disabled của nút Lưu.
  const [editSheetId, setEditSheetId]           = useState('');
  const [editSheetProbing, setEditSheetProbing] = useState(false);
  const [editSheetProbe, setEditSheetProbe]     = useState<{ ok: boolean; msg: string; allTabs?: string[] } | null>(null);
  // Cột cũ không còn tồn tại sau khi đối chiếu với header Sheet mới — hiện
  // NGAY lúc Kiểm tra (trước khi Lưu), không đợi tới sau khi lưu mới báo.
  const [editColumnsRemoved, setEditColumnsRemoved] = useState<string[]>([]);
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

  // Tải danh sách cột THẬT của tab vừa chọn — bước "chọn cột hiển thị", mặc
  // định check hết (không cắt bớt gì cho tới khi Admin tự bỏ chọn). form.sheet_id
  // có thể vẫn là link đầy đủ Admin vừa dán (chưa qua extractSheetId phía
  // server, việc đó chỉ xảy ra lúc addStackingConfig lưu xuống) — phải tự bóc
  // ID ở đây, nếu không GoogleSpreadsheet sẽ nhận nguyên link làm spreadsheetId
  // và lỗi 500 ("Requested entity was not found").
  async function handleSelectTab(tab: string) {
    setForm(f => ({ ...f, sheet_tab: tab, visible_columns: [] }));
    setTabColumns([]);
    if (!tab) return;
    setLoadingColumns(true);
    try {
      const r = await fetch(`/api/stacking?mode=list-columns&sheet_id=${encodeURIComponent(extractSheetId(form.sheet_id))}&tab=${encodeURIComponent(tab)}`);
      const d = await r.json();
      if (d.success) {
        setTabColumns(d.data);
        setForm(f => ({ ...f, visible_columns: d.data }));
      }
    } catch { /* giữ tabColumns rỗng — canAdd sẽ chặn submit cho tới khi thử lại */ }
    finally { setLoadingColumns(false); }
  }

  function toggleColumn(col: string, allColumns: string[], current: string[], setter: (next: string[]) => void) {
    const included = current.includes(col);
    const next = included ? current.filter(c => c !== col) : [...current, col];
    // Luôn sắp lại theo ĐÚNG thứ tự cột thật trong Sheet — không phụ thuộc thứ tự bấm chọn.
    setter(allColumns.filter(c => next.includes(c)));
  }

  async function handleAdd() {
    if (!form.ten_hien_thi.trim() || !form.sheet_id.trim()) return;
    if (form.loai === 'list' && (!form.sheet_tab || form.visible_columns.length === 0)) return;
    setSaving(true);
    try {
      const r = await fetch('/api/stacking/configs', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const d = await r.json();
      if (d.success) {
        onAdd(d.data);
        setForm({ ten_hien_thi: '', sheet_id: '', loai: 'grid', sheet_tab: '', visible_columns: [] });
        setTabColumns([]);
        setProbeResult(null);
      } else { alert(d.error || 'Lỗi thêm nguồn'); }
    } finally { setSaving(false); }
  }

  // Mở panel sửa cho 1 nguồn Danh sách — tải sẵn cột thật của tab đang gán để
  // Admin có thể chọn lại (VD sau khi Sheet gốc thêm/bớt cột).
  async function openEditColumns(c: StackingConfig) {
    if (!c.sheet_tab) return;
    setLoadingEditColumns(true);
    setEditColumns([]);
    try {
      const r = await fetch(`/api/stacking?mode=list-columns&sheet_id=${encodeURIComponent(c.sheet_id)}&tab=${encodeURIComponent(c.sheet_tab)}`);
      const d = await r.json();
      if (d.success) {
        setEditColumns(d.data);
        // Giữ đúng lựa chọn hiện có của config (nếu có), lọc theo cột THẬT vừa
        // tải (phòng trường hợp Sheet đã đổi tên/xóa bớt cột từ lúc tạo nguồn).
        const existing = c.visible_columns && c.visible_columns.length > 0 ? c.visible_columns : d.data;
        setEditVisibleColumns((d.data as string[]).filter(col => existing.includes(col)));
      }
    } catch { /* giữ editColumns rỗng — Admin có thể bấm lại "Sửa" để thử tải lại */ }
    finally { setLoadingEditColumns(false); }
  }

  // "Kiểm tra" khi Sửa nguồn — validate Sheet MỚI Admin vừa dán (link hoặc
  // Sheet ID) TRƯỚC khi cho Lưu. Chế độ Danh sách: nếu tab hiện tại (c.sheet_tab)
  // còn tồn tại trong Sheet mới -> tự tải cột thật + đối chiếu với lựa chọn cũ
  // (giữ cột còn, báo cột mất — reconcileVisibleColumns); nếu tab KHÔNG còn ->
  // xoá editTab để bắt buộc Admin chọn lại tab hợp lệ trước khi Lưu (không tự
  // đoán mapping tab tuỳ tiện).
  async function handleEditProbe(c: StackingConfig) {
    const raw = editSheetId.trim();
    if (!raw) return;
    setEditSheetProbing(true); setEditSheetProbe(null); setEditColumnsRemoved([]);
    try {
      const r = await fetch(`/api/stacking?probe=1&sheet_id=${encodeURIComponent(raw)}`);
      const d = await r.json();
      if (!d.success) { setEditSheetProbe({ ok: false, msg: d.error || 'Không kết nối được' }); return; }
      const allTabs: string[] = d.allTabs || [];
      setEditSheetProbe({ ok: true, msg: `Kết nối thành công${allTabs.length > 0 ? ` — file có ${allTabs.length} tab` : ''}.`, allTabs });

      if (c.loai === 'list') {
        const cleanId = extractSheetId(raw);
        if (editTab && allTabs.includes(editTab)) {
          setLoadingEditColumns(true);
          try {
            const rc = await fetch(`/api/stacking?mode=list-columns&sheet_id=${encodeURIComponent(cleanId)}&tab=${encodeURIComponent(editTab)}`);
            const dc = await rc.json();
            if (dc.success) {
              const newHeaders: string[] = dc.data;
              setEditColumns(newHeaders);
              const oldSelection = c.visible_columns && c.visible_columns.length > 0 ? c.visible_columns : newHeaders;
              const { kept, removed } = reconcileVisibleColumns(oldSelection, newHeaders);
              setEditVisibleColumns(kept.length > 0 ? kept : newHeaders);
              setEditColumnsRemoved(removed);
            }
          } finally { setLoadingEditColumns(false); }
        } else {
          // Tab cũ không còn trong Sheet mới — bắt buộc chọn lại trước khi Lưu.
          setEditTab(''); setEditColumns([]); setEditVisibleColumns([]);
        }
      }
    } catch {
      setEditSheetProbe({ ok: false, msg: 'Lỗi kết nối server' });
    } finally {
      setEditSheetProbing(false);
    }
  }

  // Admin chọn lại tab hợp lệ sau khi Sheet mới không còn tab cũ — tải cột
  // thật của tab MỚI trên Sheet MỚI (không phải c.sheet_id cũ), mặc định check
  // hết (giống hành vi "chọn tab" lúc thêm nguồn mới, không suy đoán selection cũ
  // vì tab đã đổi hẳn, không có gì để đối chiếu).
  async function handleEditSelectTab(tab: string) {
    setEditTab(tab);
    setEditColumns([]); setEditVisibleColumns([]); setEditColumnsRemoved([]);
    if (!tab) return;
    setLoadingEditColumns(true);
    try {
      const cleanId = extractSheetId(editSheetId);
      const r = await fetch(`/api/stacking?mode=list-columns&sheet_id=${encodeURIComponent(cleanId)}&tab=${encodeURIComponent(tab)}`);
      const d = await r.json();
      if (d.success) { setEditColumns(d.data); setEditVisibleColumns(d.data); }
    } finally { setLoadingEditColumns(false); }
  }

  async function handleUpdate(id: string) {
    const config = configs.find(c => c.id === id);
    if (!config) return;
    const sheetIdChanged = editSheetId.trim() !== '' && extractSheetId(editSheetId.trim()) !== config.sheet_id;
    if (!editName.trim() && !editCode.trim() && !editTab.trim() && editColumns.length === 0 && !sheetIdChanged) return;
    if (config.loai === 'list' && editColumns.length > 0 && editVisibleColumns.length === 0) return; // không cho lưu "0 cột"
    if (sheetIdChanged && !editSheetProbe?.ok) return; // chưa Kiểm tra hoặc Kiểm tra lỗi — chặn lưu, giữ nguyên config cũ
    setUpdatingId(id);
    try {
      const updates: { project_code?: string; ten_hien_thi?: string; sheet_id?: string; sheet_tab?: string; visible_columns?: string[] } = {};
      if (editCode.trim()) updates.project_code = editCode.trim().toUpperCase();
      if (editName.trim()) updates.ten_hien_thi = editName.trim();
      if (sheetIdChanged) updates.sheet_id = editSheetId.trim();
      if (editTab.trim()) updates.sheet_tab = editTab.trim();
      if (editColumns.length > 0) updates.visible_columns = editVisibleColumns;
      const r = await fetch('/api/stacking/configs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...updates }),
      });
      const d = await r.json();
      if (d.success) {
        // Server luôn trả sheet_id đã parse-sạch (bóc từ URL nếu Admin dán
        // nguyên link) — ghi đè bằng giá trị SẠCH này (không phải raw input)
        // trước khi merge vào state, để các lần gọi API sau (fetchListRows...)
        // không gửi nhầm URL thô làm sheet_id. `sheet_id` chỉ có mặt trong
        // `updates` khi thật sự đổi (xem trên) — spread {...c, ...updates}
        // ở onUpdate vì vậy không đụng sheet_id nếu Admin không đổi field này.
        if (sheetIdChanged && d.sheet_id) updates.sheet_id = d.sheet_id;
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

  const canAdd = Boolean(form.ten_hien_thi.trim() && form.sheet_id.trim() && (form.loai !== 'list' || (form.sheet_tab && form.visible_columns.length > 0)));

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

          {/* Loại bảng hàng — Chung cư (lưới tầng, mặc định) vs Biệt thự/liền
              kề (danh sách, cột động theo Sheet, không có khái niệm tầng). */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            {([
              ['grid', 'Chung cư (lưới tầng)'],
              ['list', 'Biệt thự, liền kề (danh sách)'],
            ] as const).map(([val, label]) => (
              <button key={val}
                onClick={() => { setForm(f => ({ ...f, loai: val, sheet_tab: '' })); setProbeResult(null); }}
                style={{
                  flex: 1, padding: '7px 8px', borderRadius: 8, fontSize: '0.76rem', fontWeight: 600, cursor: 'pointer',
                  border: `1.5px solid ${form.loai === val ? 'var(--primary)' : 'var(--border)'}`,
                  background: form.loai === val ? 'var(--primary)' : 'var(--bg-card)',
                  color: form.loai === val ? '#fff' : 'var(--text-muted)',
                }}>
                {label}
              </button>
            ))}
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
              {/* Chế độ Danh sách: bắt buộc chọn ĐÚNG tab chứa bảng hàng thật
                  (1 file có thể có nhiều tab khác không liên quan). */}
              {probeResult.ok && form.loai === 'list' && probeResult.allTabs && probeResult.allTabs.length > 0 && (
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #86efac' }}>
                  <p style={{ fontSize: '0.72rem', color: '#166534', marginBottom: 4, fontWeight: 600 }}>
                    Chọn tab chứa bảng hàng thật (file có {probeResult.allTabs.length} tab):
                  </p>
                  <select
                    value={form.sheet_tab}
                    onChange={e => handleSelectTab(e.target.value)}
                    style={{ ...inputStyle, fontSize: '0.8rem', padding: '6px 10px' }}
                  >
                    <option value="">— Chọn tab —</option>
                    {probeResult.allTabs.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>

                  {loadingColumns && (
                    <p style={{ fontSize: '0.72rem', color: '#166534', marginTop: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
                      <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> Đang tải danh sách cột...
                    </p>
                  )}

                  {/* Chọn cột hiển thị — mặc định check hết, Admin tự bỏ bớt
                      cột không cần (VD chỉ giữ Dãy/Mã căn/Giá..., bỏ các cột
                      phân rã VAT/KPBT chi tiết). */}
                  {!loadingColumns && tabColumns.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <p style={{ fontSize: '0.72rem', color: '#166534', fontWeight: 600, margin: 0 }}>
                          Chọn cột hiển thị ({form.visible_columns.length}/{tabColumns.length})
                        </p>
                        <button
                          onClick={() => setForm(f => ({ ...f, visible_columns: f.visible_columns.length === tabColumns.length ? [] : tabColumns }))}
                          style={{ fontSize: '0.68rem', color: '#166534', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>
                          {form.visible_columns.length === tabColumns.length ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
                        </button>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 160, overflowY: 'auto', padding: 2 }}>
                        {tabColumns.map(col => (
                          <label key={col} style={{
                            display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.72rem', padding: '2px 7px', borderRadius: 4,
                            border: '1px solid #86efac', cursor: 'pointer',
                            background: form.visible_columns.includes(col) ? '#dcfce7' : '#fff', color: '#166534',
                          }}>
                            <input
                              type="checkbox"
                              checked={form.visible_columns.includes(col)}
                              onChange={() => toggleColumn(col, tabColumns, form.visible_columns, next => setForm(f => ({ ...f, visible_columns: next })))}
                              style={{ margin: 0 }}
                            />
                            {col}
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
              {/* Chế độ Chung cư: show tất cả tab khi không tìm thấy tower nào — giúp hiểu file có gì */}
              {probeResult.ok && form.loai === 'grid' && probeResult.allTabs && probeResult.sheets?.length === 0 && (
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
                        {c.loai === 'list' ? (
                          <>
                            <span style={{ background: '#8b5cf6', color: '#fff', padding: '1px 6px', borderRadius: 4, fontWeight: 700, fontSize: '0.65rem' }}>Danh sách</span>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.sheet_tab || '(chưa chọn tab)'}</span>
                          </>
                        ) : (
                          <>
                            <span style={{ background: 'var(--primary)', color: '#fff', padding: '1px 6px', borderRadius: 4, fontWeight: 700, fontSize: '0.65rem' }}>{c.project_code}</span>
                            <span style={{ fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.sheet_id.substring(0, 24)}…</span>
                          </>
                        )}
                      </div>
                    </div>
                    {/* Edit button */}
                    <button
                      onClick={() => {
                        if (editingId === c.id) { setEditingId(null); return; }
                        setEditingId(c.id);
                        setEditCode(c.project_code ?? '');
                        setEditName(c.ten_hien_thi);
                        setEditTab(c.sheet_tab ?? '');
                        setEditColumns([]); setEditVisibleColumns([]);
                        setEditSheetId(c.sheet_id); setEditSheetProbe(null); setEditColumnsRemoved([]);
                        if (c.loai === 'list') openEditColumns(c);
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

                      {/* Đổi Google Sheet backing nguồn này — KHÔNG tạo nguồn
                          mới, chỉ update chính config hiện tại (cùng id). Đổi
                          xong PHẢI "Kiểm tra" thành công mới cho Lưu. */}
                      <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 4 }}>
                        Link hoặc Sheet ID Google Sheets
                      </p>
                      <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                        <input
                          value={editSheetId}
                          onChange={e => { setEditSheetId(e.target.value); setEditSheetProbe(null); setEditColumnsRemoved([]); }}
                          placeholder="Dán link hoặc Sheet ID Google Sheets"
                          style={{ ...inputStyle, flex: 1, padding: '6px 10px', fontSize: '0.82rem' }}
                        />
                        <button
                          onClick={() => handleEditProbe(c)}
                          disabled={editSheetProbing || !editSheetId.trim()}
                          style={{
                            padding: '6px 12px', borderRadius: 8, fontSize: '0.78rem', whiteSpace: 'nowrap',
                            border: '1px solid var(--border)', background: 'var(--bg-card)',
                            color: 'var(--primary)', cursor: 'pointer', fontWeight: 600,
                            opacity: editSheetProbing || !editSheetId.trim() ? 0.5 : 1,
                            display: 'flex', alignItems: 'center', gap: 4,
                          }}>
                          {editSheetProbing ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : null}
                          Kiểm tra
                        </button>
                      </div>

                      {editSheetProbe && (
                        <div style={{ marginBottom: 8, padding: '6px 10px', borderRadius: 6, background: editSheetProbe.ok ? '#dcfce7' : '#fee2e2', color: editSheetProbe.ok ? '#15803d' : '#dc2626', fontSize: '0.76rem' }}>
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                            {editSheetProbe.ok ? <CheckCircle size={13} style={{ flexShrink: 0, marginTop: 1 }} /> : <AlertCircle size={13} style={{ flexShrink: 0, marginTop: 1 }} />}
                            <span>{editSheetProbe.msg}</span>
                          </div>
                          {editColumnsRemoved.length > 0 && (
                            <div style={{ marginTop: 4, fontSize: '0.72rem' }}>
                              ⚠ {editColumnsRemoved.length} cột không còn trong Sheet mới, đã bỏ: {editColumnsRemoved.join(', ')}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Sheet mới không còn tab cũ (c.sheet_tab) — bắt buộc
                          chọn tab hợp lệ trước khi cho Lưu, không tự đoán. */}
                      {c.loai === 'list' && editSheetProbe?.ok && !editTab && editSheetProbe.allTabs && editSheetProbe.allTabs.length > 0 && (
                        <div style={{ marginBottom: 8 }}>
                          <p style={{ fontSize: '0.72rem', color: '#dc2626', marginBottom: 4, fontWeight: 600 }}>
                            Tab "{c.sheet_tab}" không còn trong Sheet mới — chọn tab hợp lệ trước khi lưu:
                          </p>
                          <select value={editTab} onChange={e => handleEditSelectTab(e.target.value)} style={{ ...inputStyle, fontSize: '0.8rem', padding: '6px 10px' }}>
                            <option value="">— Chọn tab —</option>
                            {editSheetProbe.allTabs.map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </div>
                      )}

                      {/* Mã dự án (chỉ chế độ Lưới) / Tên tab (chỉ chế độ Danh sách) */}
                      {c.loai === 'list' ? (
                        <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 4 }}>
                          Tên tab chứa bảng hàng (nếu chọn nhầm lúc thêm nguồn)
                        </p>
                      ) : (
                        <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 4 }}>
                          Mã dự án (tùy chọn — chỉ nhập phần mã, vd: <strong>MPP</strong>, để trống = tự nhận diện)
                        </p>
                      )}
                      <div style={{ display: 'flex', gap: 8 }}>
                        {c.loai === 'list' ? (
                          <input
                            value={editTab}
                            onChange={e => setEditTab(e.target.value)}
                            placeholder="Tên tab chính xác, VD: Bảng hàng độc quyền"
                            style={{ ...inputStyle, flex: 1, padding: '6px 10px', fontSize: '0.82rem' }}
                            onKeyDown={e => { if (e.key === 'Enter') handleUpdate(c.id); if (e.key === 'Escape') setEditingId(null); }}
                          />
                        ) : (
                          <input
                            value={editCode}
                            onChange={e => setEditCode(e.target.value.toUpperCase())}
                            placeholder="VD: MPP  (để trống = auto)"
                            style={{ ...inputStyle, flex: 1, padding: '6px 10px', fontSize: '0.82rem' }}
                            onKeyDown={e => { if (e.key === 'Enter') handleUpdate(c.id); if (e.key === 'Escape') setEditingId(null); }}
                          />
                        )}
                        {(() => {
                          // sheetIdChanged: Admin đã dán 1 giá trị khác sheet_id hiện tại
                          // (so sánh sau extractSheetId — dán nguyên link trỏ ĐÚNG sheet cũ
                          // không tính là "đổi"). Đã đổi thì BẮT BUỘC Kiểm tra thành công
                          // (+ chọn tab hợp lệ nếu tab cũ mất) mới cho Lưu — không tin
                          // client, nhưng cũng không để User bấm Lưu rồi mới biết bị chặn.
                          const sheetIdChanged = editSheetId.trim() !== '' && extractSheetId(editSheetId.trim()) !== c.sheet_id;
                          const hasAnyChange = Boolean(editName.trim() || editCode.trim() || editTab.trim() || editColumns.length > 0 || sheetIdChanged);
                          const columnsInvalid = c.loai === 'list' && editColumns.length > 0 && editVisibleColumns.length === 0;
                          const sheetChangeUnvalidated = sheetIdChanged && editSheetProbe?.ok !== true;
                          const tabRequiredAfterSheetChange = sheetIdChanged && editSheetProbe?.ok === true && c.loai === 'list' && !editTab.trim();
                          const disabled = updatingId === c.id || !hasAnyChange || columnsInvalid || sheetChangeUnvalidated || tabRequiredAfterSheetChange;
                          return (
                            <button
                              onClick={() => handleUpdate(c.id)}
                              disabled={disabled}
                              style={{ padding: '6px 14px', borderRadius: 8, fontSize: '0.8rem', fontWeight: 600, border: 'none', background: 'var(--primary)', color: '#fff', cursor: 'pointer', flexShrink: 0, opacity: disabled ? 0.6 : 1 }}>
                              {updatingId === c.id ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : 'Lưu'}
                            </button>
                          );
                        })()}
                        <button onClick={() => setEditingId(null)} style={{ padding: '6px 10px', borderRadius: 8, fontSize: '0.8rem', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)', cursor: 'pointer' }}>Hủy</button>
                      </div>

                      {/* Chọn lại cột hiển thị — chỉ chế độ Danh sách */}
                      {c.loai === 'list' && (
                        <div style={{ marginTop: 10 }}>
                          {loadingEditColumns && (
                            <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
                              <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> Đang tải danh sách cột...
                            </p>
                          )}
                          {!loadingEditColumns && editColumns.length > 0 && (
                            <>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, margin: 0 }}>
                                  Cột hiển thị ({editVisibleColumns.length}/{editColumns.length})
                                </p>
                                <button
                                  onClick={() => setEditVisibleColumns(v => v.length === editColumns.length ? [] : editColumns)}
                                  style={{ fontSize: '0.68rem', color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>
                                  {editVisibleColumns.length === editColumns.length ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
                                </button>
                              </div>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 160, overflowY: 'auto', padding: 2 }}>
                                {editColumns.map(col => (
                                  <label key={col} style={{
                                    display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.72rem', padding: '2px 7px', borderRadius: 4,
                                    border: '1px solid var(--border)', cursor: 'pointer',
                                    background: editVisibleColumns.includes(col) ? 'var(--bg-card)' : 'transparent', color: 'var(--text-body)',
                                  }}>
                                    <input
                                      type="checkbox"
                                      checked={editVisibleColumns.includes(col)}
                                      onChange={() => toggleColumn(col, editColumns, editVisibleColumns, setEditVisibleColumns)}
                                      style={{ margin: 0 }}
                                    />
                                    {col}
                                  </label>
                                ))}
                              </div>
                            </>
                          )}
                        </div>
                      )}
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

const TYPE_ORDER = ['Studio', '1BR', '1BR+', '1BR+1MR', '2BR', '2BR+', '2BR+1MR', '2BR+1MMR', '3BR', '3BR+1MR', '4BR', 'Penthouse'];

function UnitCell({ unit, onClick, onMouseEnter, isSelected, hlBg, dimmed }: {
  unit: StackingUnit; onClick: () => void; onMouseEnter: () => void; isSelected: boolean;
  hlBg?: string;
  dimmed?: boolean;
}) {
  // All cells use type color; green dot marks Độc quyền; sold = gray
  const sold = unit.trangThai === 'da_ban';
  const inPr = unit.trangThai === 'dang_xem';
  const tc   = typeColor(unit.loaiCan);

  const bg     = sold ? '#f3f4f6' : tc.bg;
  const text   = sold ? '#9ca3af' : tc.text;
  const border = isSelected ? '#6366f1' : tc.border;

  const btnBg = (!isSelected && hlBg && !sold) ? hlBg : bg;

  return (
    <td onMouseEnter={onMouseEnter} style={{ padding: '3px 4px', minWidth: 82, background: !isSelected && hlBg ? hlBg : undefined }}>
      <button onClick={onClick} style={{
        width: '100%', padding: '4px 6px', borderRadius: 6,
        border: `1.5px solid ${border}`,
        background: btnBg, color: text,
        fontSize: 11, fontWeight: 600, cursor: 'pointer',
        fontFamily: '"Be Vietnam Pro", system-ui, -apple-system, sans-serif',
        textDecoration: sold ? 'line-through' : 'none',
        opacity: dimmed ? 0.12 : sold ? 0.5 : inPr ? 0.78 : 1,
        outline: isSelected ? '2px solid var(--primary)' : 'none', outlineOffset: 1,
        position: 'relative', textAlign: 'center', lineHeight: 1.3,
        transition: 'opacity 0.15s',
      }}>
        {/* Green dot top-left = Độc quyền */}
        {unit.mauO === 'xanh' && !sold && (
          <span style={{ position: 'absolute', top: 3, left: 3, width: 6, height: 6, borderRadius: '50%', background: '#22c55e', border: '1.5px solid #15803d' }} />
        )}
        {/* Orange dot top-right = Đang xem */}
        {inPr && <span style={{ position: 'absolute', top: 3, right: 3, width: 6, height: 6, borderRadius: '50%', background: '#f59e0b' }} />}
        {fmtGia(unit.giaKS)}
        <span style={{ display: 'block', fontSize: 9, opacity: 0.7, fontWeight: 400 }}>tỷ</span>
      </button>
    </td>
  );
}

// ─── Chế độ Danh sách: popup chi tiết căn ──────────────────────────────────

// 1 dòng label bên trái / value bên phải — reuse hyperlink nếu cột đó có
// (không giới hạn riêng cho Link PTG, cột nào có hyperlink thật cũng giữ
// nguyên hành vi click-through như trên bảng chính).
function ListDetailRow({ label, row, col }: { label: string; row: StackingListRow; col: string }) {
  const v = row.values[col];
  const link = row.hyperlinks?.[col];
  const display = v === null || v === undefined || v === '' ? '—' : typeof v === 'number' ? v.toLocaleString('vi-VN') : v;
  const isLinkLike = /link|ptg/i.test(col);
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)', fontSize: '0.875rem' }}>
      <span style={{ color: 'var(--text-muted)' }}>{label}</span>
      {link ? (
        <a href={link} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)', fontWeight: 700, textDecoration: 'underline', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          {isLinkLike ? 'Mở PTG ↗' : display}
        </a>
      ) : (
        <span style={{ fontWeight: 600, color: 'var(--text-body)', textAlign: 'right' }}>{display}</span>
      )}
    </div>
  );
}

function ListUnitDetailModal({ row, columns, onClose }: {
  row: StackingListRow;
  columns: string[];
  onClose: () => void;
}) {
  const groups = useMemo(() => groupStackingListColumnsForDetail(columns), [columns]);
  const displayStatus = effectiveDotStatus(row);

  return (
    <div
      // zIndex 750 > TmbMap (700) — popup này có thể mở TỪ BÊN TRONG Tổng mặt
      // bằng (click marker), phải nổi lên trên TmbMap thay vì bị che khuất.
      style={{ position: 'fixed', inset: 0, zIndex: 750, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={onClose}
    >
      <div
        style={{ width: '100%', maxWidth: 460, maxHeight: 'calc(100vh - 32px)', background: 'var(--bg-card)', borderRadius: 16, boxShadow: '0 24px 64px rgba(0,0,0,0.28)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Mã căn</div>
            <div style={{ fontWeight: 800, fontSize: '1.3rem', color: 'var(--text-title)', letterSpacing: '-0.01em' }}>{row.maCan}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, color: 'var(--text-muted)', borderRadius: 8, display: 'flex' }}>
            <X size={18} />
          </button>
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: 'auto' }}>

          {/* Đồng bộ trạng thái hiển thị với bảng chính; căn đã bán chỉ có
              một tag đỏ bo tròn, không lặp marker hoặc hiện "Còn hàng". */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '12px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary, #f9fafb)' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 12px', borderRadius: 999, fontSize: '0.8rem', fontWeight: 600, background: displayStatus === 'con_hang' ? '#dcfce7' : displayStatus === 'da_ban' ? '#fee2e2' : '#fef3c7', color: displayStatus === 'con_hang' ? '#15803d' : displayStatus === 'da_ban' ? '#dc2626' : '#92400e' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: STATUS_COLOR[displayStatus], flexShrink: 0 }} />
              {STATUS_LABEL[displayStatus]}
            </span>
            {displayStatus !== 'da_ban' && row.marker === 'check_admin' && (
              <span style={MARKER_BADGE_STYLE[row.marker]}>{MARKER_LABEL[row.marker]}</span>
            )}
          </div>

          {/* Thông tin cơ bản */}
          {groups.basic.length > 0 && (
            <div style={{ padding: '4px 20px' }}>
              {groups.basic.map(col => <ListDetailRow key={col} label={col} row={row} col={col} />)}
            </div>
          )}

          {/* Giá — block nổi bật, reuse fmtGia/fmtGiaFull hiện có */}
          {groups.gia.length > 0 && (
            <div style={{ margin: '12px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {groups.gia.map(col => {
                const v = row.values[col];
                const isNum = typeof v === 'number';
                return (
                  <div key={col} style={{ padding: '14px 16px', borderRadius: 12, background: 'linear-gradient(135deg,#fefce8,#fef3c7)', border: '1px solid #fcd34d' }}>
                    <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#92400e', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{col}</div>
                    {isNum ? (
                      <>
                        <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#78350f', lineHeight: 1 }}>{fmtGiaFull(v as number)}</div>
                        <div style={{ fontSize: '0.8rem', color: '#b45309', marginTop: 4 }}>≈ {fmtGia(v as number)} tỷ</div>
                      </>
                    ) : (
                      <div style={{ fontSize: '1rem', fontWeight: 700, color: '#78350f' }}>{v === null || v === undefined || v === '' ? '—' : v}</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Tài chính / chính sách */}
          {groups.financial.length > 0 && (
            <div style={{ padding: '4px 20px' }}>
              {groups.financial.map(col => <ListDetailRow key={col} label={col} row={row} col={col} />)}
            </div>
          )}

          {/* Thông tin khác — Link PTG (action), Quỹ, Giỏ bank... */}
          {groups.misc.length > 0 && (
            <div style={{ padding: '4px 20px 20px' }}>
              {groups.misc.map(col => <ListDetailRow key={col} label={col} row={row} col={col} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function StackingPage() {
  const { isAdmin } = useAuth();

  const [configs, setConfigs]               = useState<StackingConfig[]>([]);
  const [selectedConfig, setSelectedConfig] = useState<StackingConfig | null>(null);
  const [towers, setTowers]                 = useState<StackingSheetMeta[]>([]);
  const [towersError, setTowersError]       = useState('');
  const [project, setProject]               = useState('');
  const [tower, setTower]                   = useState('');
  const [units, setUnits]                   = useState<StackingUnit[]>([]);
  const [selectedUnit, setSelectedUnit]     = useState<StackingUnit | null>(null);
  const [showManage, setShowManage]         = useState(false);
  const [showTmbManager, setShowTmbManager] = useState(false);
  const [filterType, setFilterType]         = useState<string | null>(null);
  const [zoom, setZoom]                     = useState(1);
  const [hoverPos, setHoverPos]             = useState<{ fi: number; ci: number } | null>(null);
  const [loadingConfigs, setLoadingConfigs] = useState(true);
  const [loadingTowers, setLoadingTowers]   = useState(false);
  const [loadingUnits, setLoadingUnits]     = useState(false);
  const [unitsError, setUnitsError]         = useState('');

  // Chế độ Danh sách (biệt thự/liền kề, selectedConfig.loai === 'list') —
  // hoàn toàn tách khỏi state lưới tầng ở trên (không dùng chung units/towers).
  const [listColumns, setListColumns]       = useState<string[]>([]);
  const [listRows, setListRows]             = useState<StackingListRow[]>([]);
  const [listError, setListError]           = useState('');
  const [loadingList, setLoadingList]       = useState(false);
  const [listSearch, setListSearch]         = useState('');
  const [listGroupFilter, setListGroupFilter] = useState('');
  const [listSort, setListSort]             = useState<StackingListSort | null>(null);
  const [listPage, setListPage]             = useState(1);
  const [selectedListRow, setSelectedListRow] = useState<StackingListRow | null>(null);
  const [showTmbMap, setShowTmbMap]           = useState(false); // Tổng mặt bằng — chỉ áp dụng nguồn có TMB_MAP_CONFIG_ID tương ứng (xem isTmbAvailableForConfig)
  // Tracks which configId has finished loading towers — prevents stale fetchUnits
  // firing with old project/tower when config switches (race condition guard)
  const towersReadyForRef = useRef<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const zoomWrapperRef     = useRef<HTMLDivElement>(null);

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

  // 2. Load towers when selected config changes (CHỈ chế độ Lưới — chế độ
  // Danh sách không có khái niệm tower, xem effect riêng bên dưới)
  useEffect(() => {
    if (!selectedConfig || selectedConfig.loai === 'list') { setTowers([]); setTowersError(''); towersReadyForRef.current = null; return; }
    towersReadyForRef.current = null; // invalidate gate until towers are loaded
    setLoadingTowers(true);
    setTowers([]); setProject(''); setTower(''); setUnits([]); setSelectedUnit(null); setTowersError(''); setFilterType(null);

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
            towersReadyForRef.current = selectedConfig.id; // open gate only now
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

  // 2b. Load rows when selected config is chế độ Danh sách (biệt thự/liền kề)
  const fetchListRows = useCallback(() => {
    if (!selectedConfig || selectedConfig.loai !== 'list') return;
    if (!selectedConfig.sheet_tab) { setListError('Nguồn này chưa gán tab bảng hàng — vào "Quản lý Sheet" → "Sửa" để chọn tab.'); return; }
    setLoadingList(true); setListError(''); setListSearch(''); setListGroupFilter(''); setListSort(null);
    const params = new URLSearchParams({ mode: 'list', sheet_id: selectedConfig.sheet_id, tab: selectedConfig.sheet_tab });
    if (selectedConfig.project_code) params.set('project_code', selectedConfig.project_code);
    if (selectedConfig.visible_columns && selectedConfig.visible_columns.length > 0) {
      params.set('columns', selectedConfig.visible_columns.join('|'));
    }
    fetch(`/api/stacking?${params}`)
      .then(r => r.json())
      .then(d => {
        if (d.success) { setListColumns(d.data.columns); setListRows(d.data.rows); }
        else { setListError(d.error || 'Lỗi tải dữ liệu bảng hàng'); setListColumns([]); setListRows([]); }
      })
      .catch(() => { setListError('Lỗi kết nối server'); setListColumns([]); setListRows([]); })
      .finally(() => setLoadingList(false));
  }, [selectedConfig]);

  useEffect(() => {
    if (!selectedConfig || selectedConfig.loai !== 'list') { setListColumns([]); setListRows([]); setListError(''); return; }
    fetchListRows();
  }, [selectedConfig, fetchListRows]);

  // 3. Load units when tower changes
  const fetchUnits = useCallback(() => {
    if (!selectedConfig || !project || !tower) return;
    // Guard: towers must have finished loading for THIS config before fetching units.
    // Prevents a stale call with old project/tower when config just switched.
    if (towersReadyForRef.current !== selectedConfig.id) return;
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

  const fitToView = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    // scrollWidth = tổng chiều rộng có thể cuộn = natural_width * zoom
    // (getBoundingClientRect bị clip theo viewport nên không dùng được ở đây)
    const naturalW = container.scrollWidth / zoom;
    if (!naturalW) return;
    const fitZoom = Math.min(container.clientWidth / naturalW, 1);
    setZoom(Math.max(0.3, +fitZoom.toFixed(1)));
  }, [zoom]);

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

  const unitTypes = useMemo(() => {
    const types = new Set<string>();
    for (const u of units) { if (u.loaiCan) types.add(u.loaiCan); }
    return Array.from(types).sort((a, b) => {
      const ia = TYPE_ORDER.indexOf(a), ib = TYPE_ORDER.indexOf(b);
      if (ia === -1 && ib === -1) return a.localeCompare(b);
      if (ia === -1) return 1; if (ib === -1) return -1;
      return ia - ib;
    });
  }, [units]);

  const projects = useMemo(() => [...new Set(towers.map(t => t.project))].sort(), [towers]);
  const towersForProject = useMemo(() => towers.filter(t => t.project === project).map(t => t.tower), [towers, project]);

  // ── Chế độ Danh sách (biệt thự/liền kề) ────────────────────────────────────
  const listStatusCount = useMemo(() => countStackingListRowsByDotStatus(listRows), [listRows]);

  // Cột "Phân khu" (nếu Sheet có) đóng vai trò như dropdown Dự án của chế độ
  // Lưới — lọc theo đúng giá trị thật tìm thấy trong dữ liệu đã tải (không
  // cần query riêng, listRows đã có sẵn toàn bộ). Không tồn tại cột này trong
  // Sheet -> listGroupValues rỗng -> dropdown tự ẩn, không ảnh hưởng dự án khác.
  const listGroupValues = useMemo(() => {
    if (!listColumns.includes(GROUP_FILTER_COLUMN)) return [];
    const set = new Set<string>();
    for (const r of listRows) {
      const v = r.values[GROUP_FILTER_COLUMN];
      if (v !== null && v !== undefined && String(v).trim()) set.add(String(v));
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'vi'));
  }, [listRows, listColumns]);

  const filteredListRows = useMemo(
    () => filterStackingListRows(listRows, { groupColumn: GROUP_FILTER_COLUMN, groupFilter: listGroupFilter, search: listSearch }),
    [listRows, listSearch, listGroupFilter]
  );

  // Sort CHẠY SAU filter (đúng thứ tự filter -> sort -> paginate) — không đổi
  // số dòng/tổng số trang, chỉ đổi thứ tự hiển thị trong trang.
  const sortedListRows = useMemo(
    () => sortStackingListRows(filteredListRows, listSort),
    [filteredListRows, listSort]
  );

  // Reset về trang 1 mỗi khi đổi nguồn/dự án, Phân khu, tìm kiếm, hoặc đổi cột
  // sort — không reset khi chỉ "Làm mới" (refetch cùng bộ lọc).
  useEffect(() => { setListPage(1); }, [selectedConfig?.id, listGroupFilter, listSearch, listSort]);

  const listTotalPages = totalStackingListPages(sortedListRows.length);
  const listPageSafe   = clampStackingListPage(listPage, sortedListRows.length);
  const pagedListRows  = useMemo(
    () => paginateStackingListRows(sortedListRows, listPageSafe),
    [sortedListRows, listPageSafe]
  );

  /** Click header cột — 3-state cycle: chưa sort -> tăng dần -> giảm dần ->
   * về lại thứ tự gốc (Sheet), KHÔNG cộng dồn nhiều cột (1 cột sort tại 1
   * thời điểm — đủ dùng cho bảng này, tránh phức tạp hoá UI). */
  const toggleListSort = useCallback((column: string) => {
    setListSort(current => {
      if (!current || current.column !== column) return { column, direction: 'asc' };
      if (current.direction === 'asc') return { column, direction: 'desc' };
      return null;
    });
  }, []);

  // Bảng chính chỉ hiện nhóm cột tóm tắt theo rule của từng nguồn; các cột còn
  // lại vẫn còn nguyên trong listColumns/row.values và mở trong popup chi tiết.
  const { tableColumns, detailColumns } = useMemo(
    () => splitStackingListColumns(listColumns, { sourceName: selectedConfig?.ten_hien_thi }),
    [listColumns, selectedConfig?.ten_hien_thi]
  );
  const maCanInTable = useMemo(() => tableColumns.some(c => c.trim().toLowerCase() === 'mã căn'), [tableColumns]);

  // Tổng mặt bằng — 1 project có thể có 0..N map (Section 10 TMB Manager):
  // profile TĨNH (hard-code, xem tmb-map-data.ts — Saigon Park/HLX VBM1,
  // KHÔNG đổi) CỘNG profile ADMIN-MANAGED đang ACTIVE lưu Postgres (xem
  // tmb-map-registry.ts). Nhiều dự án dùng CHUNG 1 renderer (TmbMap), chỉ
  // khác profile truyền vào — KHÔNG if/else theo project ở đây.
  const staticTmbProfile = resolveTmbMapProfile(selectedConfig);
  const dbTmbProfiles = useDbTmbMapProfiles(selectedConfig?.id);
  const tmbProfiles = useMemo(() => {
    const list = [...dbTmbProfiles];
    if (staticTmbProfile && !list.some(p => p.configId === staticTmbProfile.configId)) list.unshift(staticTmbProfile);
    return list;
  }, [staticTmbProfile, dbTmbProfiles]);
  const [selectedTmbProfileIdx, setSelectedTmbProfileIdx] = useState(0);
  useEffect(() => { setSelectedTmbProfileIdx(0); }, [selectedConfig?.id]);
  const tmbProfile = tmbProfiles[selectedTmbProfileIdx] ?? tmbProfiles[0] ?? null;

  /** Header cột bảng chính, bấm để sort (tăng dần -> giảm dần -> về gốc) —
   * dùng CHUNG cho cột "Mã căn" fallback lẫn mọi cột trong tableColumns. */
  function renderSortableListHeader(col: string) {
    const direction = listSort?.column === col ? listSort.direction : null;
    return (
      <th key={col} onClick={() => toggleListSort(col)} title="Bấm để sắp xếp" style={{
        padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid var(--border)',
        color: 'var(--text-label)', fontWeight: 600, cursor: 'pointer', userSelect: 'none',
      }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          {col}
          {direction === 'asc' && <ArrowUp size={12} />}
          {direction === 'desc' && <ArrowDown size={12} />}
          {!direction && <ArrowUpDown size={11} style={{ opacity: 0.35 }} />}
        </span>
      </th>
    );
  }

  // ── Crosshair highlight ───────────────────────────────────────────────────
  // Hover có ưu tiên hơn click — khi chuột rời bảng thì fallback về selectedUnit
  const xFloorIdx = hoverPos ? hoverPos.fi : (selectedUnit ? floors.indexOf(selectedUnit.tang)   : -1);
  const xColIdx   = hoverPos ? hoverPos.ci : (selectedUnit ? columns.indexOf(selectedUnit.canSo) : -1);
  const hoveredUnit    = hoverPos ? (unitMap[floors[hoverPos.fi]]?.[columns[hoverPos.ci]] ?? null) : null;
  const hlSourceUnit   = hoveredUnit ?? selectedUnit;
  const hlCell         = xFloorIdx >= 0
    ? (hlSourceUnit ? hexToRgba(typeColor(hlSourceUnit.loaiCan).border, 0.20) : 'rgba(100,116,139,0.15)')
    : '';
  const hlAxisSticky   = xFloorIdx >= 0 ? '#64748b' : undefined;

  if (loadingConfigs) return <div style={{ padding: 40, color: 'var(--text-muted)' }}>Đang khởi tạo...</div>;

  // ── Chế độ Danh sách (biệt thự/liền kề) — nhánh render HOÀN TOÀN riêng,
  // không đụng bất kỳ state/JSX nào của chế độ Lưới bên dưới. ─────────────────
  if (selectedConfig?.loai === 'list') {
    return (
      <div className="stacking-root" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 60px)', overflow: 'hidden' }}>
        {/* Top bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '10px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg-card)', flexShrink: 0 }}>
          <Grid3x3 size={18} color="var(--primary)" />
          <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-title)' }}>Bảng hàng</span>

          <div style={{ position: 'relative' }}>
            <select value={selectedConfig.id} onChange={e => setSelectedConfig(configs.find(c => c.id === e.target.value) || null)} style={selectStyle}>
              {configs.map(c => <option key={c.id} value={c.id}>{c.ten_hien_thi}</option>)}
            </select>
            <ChevronDown size={13} style={chevronStyle} />
          </div>

          {/* Cột "Phân khu" (nếu Sheet có) — dropdown lọc, cùng vai trò với
              dropdown Dự án của chế độ Lưới (VD "IVY PARK" / "GLOBAL PARK"). */}
          {listGroupValues.length > 0 && (
            <div style={{ position: 'relative' }}>
              <select value={listGroupFilter} onChange={e => setListGroupFilter(e.target.value)} style={selectStyle}>
                <option value="">Tất cả {GROUP_FILTER_COLUMN}</option>
                {listGroupValues.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
              <ChevronDown size={13} style={chevronStyle} />
            </div>
          )}

          <div className="search-wrapper" style={{ position: 'relative', minWidth: 220 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              placeholder="Tìm mã căn, dãy..."
              value={listSearch}
              onChange={e => setListSearch(e.target.value)}
              style={{ ...selectStyle, width: '100%', paddingLeft: 30 }}
            />
          </div>

          <button onClick={fetchListRows} disabled={loadingList}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px', borderRadius: 6, fontSize: '0.78rem', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)', cursor: 'pointer' }}>
            <RefreshCw size={13} style={{ animation: loadingList ? 'spin 1s linear infinite' : 'none' }} />
            Làm mới
          </button>

          {listRows.length > 0 && (
            <div style={{ display: 'flex', gap: 10, marginLeft: 'auto', flexWrap: 'wrap' }}>
              {(['con_hang', 'dang_xem', 'da_ban'] as const).map(s => (
                <span key={s} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS_COLOR[s], display: 'inline-block' }} />
                  {STATUS_LABEL[s]}: <strong style={{ color: 'var(--text-body)' }}>{listStatusCount[s]}</strong>
                </span>
              ))}
            </div>
          )}

          {/* Chỉ hiện khi nguồn đang chọn CÓ spatial map tương ứng (tmbProfile
              != null) — không giả vờ generic cho nguồn chưa audit spatial
              mapping. Xem inventory trên bản đồ là tính năng xem, không phải
              quản trị -> không gate theo isAdmin như "Quản lý Sheet". Có >1
              map (Section 10, VD dự án có nhiều phân khu) -> thêm dropdown
              chọn map TRƯỚC khi mở, KHÔNG tự đổi hành vi khi chỉ có 1 map
              (dropdown ẩn hẳn, giữ nguyên UX hiện tại cho Saigon Park/HLX VBM1). */}
          {tmbProfiles.length > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                Chọn TMB
              </span>
              <div style={{ position: 'relative' }}>
                <select
                  value={selectedTmbProfileIdx}
                  onChange={e => setSelectedTmbProfileIdx(Number(e.target.value))}
                  title="Chọn Tổng mặt bằng đang xem"
                  style={{ ...selectStyle, fontWeight: 700 }}
                >
                  {tmbProfiles.map((p, idx) => (
                    <option key={p.configId} value={idx} title={p.label}>{tmbShortLabel(p.label)}</option>
                  ))}
                </select>
                <ChevronDown size={13} style={chevronStyle} />
              </div>
            </div>
          )}
          {tmbProfile && (
            <button onClick={() => setShowTmbMap(true)} title="Xem vị trí các căn Còn hàng trên Tổng mặt bằng" style={{
              display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 6,
              fontSize: '0.8rem', fontWeight: 600, border: '1px solid var(--primary)',
              background: 'transparent', color: 'var(--primary)', cursor: 'pointer', marginLeft: listRows.length > 0 ? 0 : 'auto',
            }}>
              <MapIcon size={14} /> Tổng mặt bằng
            </button>
          )}

          {isAdmin && (
            <button onClick={() => setShowManage(true)} style={{
              display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 6,
              fontSize: '0.8rem', fontWeight: 600, border: '1px solid var(--primary)',
              background: 'transparent', color: 'var(--primary)', cursor: 'pointer',
              marginLeft: (listRows.length > 0 || Boolean(tmbProfile)) ? 0 : 'auto',
            }}>
              <Settings size={14} /> Quản lý Sheet
            </button>
          )}

          {isAdmin && selectedConfig && (
            <button onClick={() => setShowTmbManager(true)} title="Tạo/tối ưu/quét mã căn cho Tổng mặt bằng của nguồn này" style={{
              display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 6,
              fontSize: '0.8rem', fontWeight: 600, border: '1px solid var(--primary)',
              background: 'transparent', color: 'var(--primary)', cursor: 'pointer',
            }}>
              <MapIcon size={14} /> Quản lý TMB
            </button>
          )}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
          <div className="stacking-scroll" style={{ height: '100%', overflow: 'auto', padding: 14 }}>
            {listError && (
              <div style={{ padding: '10px 14px', borderRadius: 6, background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', fontSize: '0.875rem', marginBottom: 12 }}>
                {listError}
              </div>
            )}

            {loadingList && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', padding: 16 }}>
                <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                Đang tải dữ liệu bảng hàng...
              </div>
            )}

            {!loadingList && !listError && listRows.length === 0 && (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', textAlign: 'center', padding: '30px 0' }}>
                Không có căn nào trong bảng hàng này.
              </p>
            )}

            {!loadingList && listColumns.length > 0 && filteredListRows.length > 0 && (
              <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-secondary, #f9fafb)' }}>
                      <th style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary, #f9fafb)', width: '1%', whiteSpace: 'nowrap' }} />
                      {/* Fallback — chỉ thêm cột Mã căn riêng nếu nguồn này (hiếm)
                          không có "Mã căn" trong nửa cột đầu; bình thường "Mã căn"
                          đã nằm sẵn trong tableColumns, giữ ĐÚNG vị trí như Sheet gốc. */}
                      {!maCanInTable && renderSortableListHeader('Mã căn')}
                      {tableColumns.map(col => renderSortableListHeader(col))}
                    </tr>
                  </thead>
                  <tbody>
                    {pagedListRows.map((row, i) => {
                      // Màu nền dòng lấy TỪ CHÍNH Sheet gốc (Sale đánh dấu thủ
                      // công, VD "Đã bán" đỏ) — CHỈ để tham khảo trực quan, KHÔNG
                      // phải authority trạng thái (chấm màu Còn hàng/Đang xem/Đã
                      // bán bên trái vẫn tính từ CRM Pipeline, độc lập hoàn toàn).
                      const rowBg = row.rowColor ? hexToRgba(row.rowColor, 0.22) : undefined;
                      // Chấm không có label đi kèm nên ưu tiên marker "Đã bán" (Sheet)
                      // khi CRM Pipeline (authority) chưa kịp cập nhật — CHỈ đổi màu
                      // hiển thị của chấm, KHÔNG đổi row.trangThai gốc (filter/search/
                      // đếm số lượng/badge có label trong popup vẫn dùng CRM Pipeline
                      // như cũ, xem effectiveDotStatus trong stacking-list.ts).
                      const dotStatus = effectiveDotStatus(row);
                      return (
                        <tr key={row.maCan + i} style={{ borderBottom: '1px solid var(--border)', background: rowBg }}>
                          <td style={{ padding: '6px 10px', background: rowBg ?? 'var(--bg-card)', width: '1%', whiteSpace: 'nowrap' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                              <span title={STATUS_LABEL[dotStatus]} style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS_COLOR[dotStatus], display: 'inline-block', flexShrink: 0 }} />
                              {/* Nhãn "Check Admin"/"Đã bán" — quy ước màu Sale tự đánh
                                  dấu trong Sheet gốc. Marker "Đã bán" đã được phản ánh vào
                                  màu chấm bên cạnh (effectiveDotStatus); "Check Admin" thì
                                  không, chấm vẫn giữ nguyên theo CRM Pipeline. */}
                              {row.marker && (
                                <span style={MARKER_BADGE_STYLE[row.marker]}>
                                  {MARKER_LABEL[row.marker]}
                                </span>
                              )}
                            </div>
                          </td>
                          {!maCanInTable && (
                            <td style={{ padding: '6px 10px' }}>
                              <button onClick={() => setSelectedListRow(row)} style={{
                                background: 'none', border: 'none', padding: 0, margin: 0, cursor: 'pointer',
                                color: 'var(--primary)', fontWeight: 700, textDecoration: 'underline',
                                fontSize: 'inherit', fontFamily: 'inherit',
                              }}>
                                {row.maCan}
                              </button>
                            </td>
                          )}
                          {tableColumns.map(col => {
                            // Cột "Mã căn" giữ ĐÚNG vị trí như Sheet gốc, chỉ đổi thành
                            // clickable để mở popup chi tiết — không thêm/xoá cột nào.
                            if (col.trim().toLowerCase() === 'mã căn') {
                              return (
                                <td key={col} style={{ padding: '6px 10px' }}>
                                  <button onClick={() => setSelectedListRow(row)} style={{
                                    background: 'none', border: 'none', padding: 0, margin: 0, cursor: 'pointer',
                                    color: 'var(--primary)', fontWeight: 700, textDecoration: 'underline',
                                    fontSize: 'inherit', fontFamily: 'inherit',
                                  }}>
                                    {row.maCan}
                                  </button>
                                </td>
                              );
                            }
                            const v = row.values[col];
                            const link = row.hyperlinks?.[col];
                            const display = v === null ? '—' : typeof v === 'number' ? v.toLocaleString('vi-VN') : v;
                            return (
                              <td key={col} style={{ padding: '6px 10px', color: 'var(--text-body)' }}>
                                {link
                                  ? <a href={link} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)', textDecoration: 'underline' }}>{display}</a>
                                  : display}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {!loadingList && listColumns.length > 0 && filteredListRows.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  {(listPageSafe - 1) * STACKING_LIST_PAGE_SIZE + 1}–{Math.min(listPageSafe * STACKING_LIST_PAGE_SIZE, filteredListRows.length)} / {filteredListRows.length} căn
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <button onClick={() => setListPage(p => Math.max(1, p - 1))} disabled={listPageSafe <= 1} style={pagerBtnStyle(listPageSafe <= 1)}>
                    Trước
                  </button>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    Trang {listPageSafe} / {listTotalPages}
                  </span>
                  <button onClick={() => setListPage(p => Math.min(listTotalPages, p + 1))} disabled={listPageSafe >= listTotalPages} style={pagerBtnStyle(listPageSafe >= listTotalPages)}>
                    Sau
                  </button>
                </div>
              </div>
            )}

            {!loadingList && !listError && listRows.length > 0 && filteredListRows.length === 0 && (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', textAlign: 'center', padding: '30px 0' }}>
                Không tìm thấy căn nào khớp "{listSearch}".
              </p>
            )}
          </div>
        </div>

        {selectedListRow && (
          <ListUnitDetailModal
            row={selectedListRow}
            columns={detailColumns}
            onClose={() => setSelectedListRow(null)}
          />
        )}

        {/* Tổng mặt bằng — click marker Còn hàng -> lookup Mã căn trong
            listRows hiện có -> mở CHÍNH ListUnitDetailModal, không tạo popup
            business thứ hai. QUAN TRỌNG: onOpenUnit CHỈ set selectedListRow —
            KHÔNG đóng TMB (showTmbMap) — để TmbMap giữ nguyên mount, giữ
            nguyên zoom/pan/scroll nội bộ. Đóng detail (onClose bên trên,
            setSelectedListRow(null)) không đụng showTmbMap nên quay lại đúng
            TMB đang mở. Chỉ nút X của TmbMap mới gọi setShowTmbMap(false). */}
        {showTmbMap && tmbProfile && (
          <TmbMap
            profile={tmbProfile}
            listRows={listRows}
            onOpenUnit={row => setSelectedListRow(row)}
            onClose={() => setShowTmbMap(false)}
          />
        )}

        {showTmbManager && isAdmin && selectedConfig && (
          <TmbManagerPanel
            stackingConfigId={selectedConfig.id}
            stackingConfigLabel={selectedConfig.ten_hien_thi}
            onClose={() => setShowTmbManager(false)}
          />
        )}

        {showManage && isAdmin && (
          <ManagePanel
            configs={configs}
            onClose={() => setShowManage(false)}
            onAdd={c => { setConfigs(prev => [...prev, c]); if (!selectedConfig) setSelectedConfig(c); }}
            onDelete={id => {
              setConfigs(prev => prev.filter(c => c.id !== id));
              if (selectedConfig?.id === id) setSelectedConfig(null);
            }}
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

  return (
    <div className="stacking-root" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 60px)', overflow: 'hidden' }}>

      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '10px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg-card)', flexShrink: 0 }}>
        <Grid3x3 size={18} color="var(--primary)" />
        <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-title)' }}>Bảng hàng</span>

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
              <select value={project} onChange={e => { setProject(e.target.value); setTower(towers.find(t => t.project === e.target.value)?.tower || ''); setFilterType(null); }} style={selectStyle}>
                {projects.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <ChevronDown size={13} style={chevronStyle} />
            </div>
            <div style={{ position: 'relative' }}>
              <select value={tower} onChange={e => { setTower(e.target.value); setFilterType(null); }} style={selectStyle}>
                {towersForProject.map(t => <option key={t} value={t}>Tower {towerLabel(t)}</option>)}
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

        {isAdmin && (
          <button onClick={() => setShowManage(true)} style={{
            display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 6,
            fontSize: '0.8rem', fontWeight: 600, border: '1px solid var(--primary)',
            background: 'transparent', color: 'var(--primary)', cursor: 'pointer', marginLeft: configs.length === 0 ? 0 : 'auto',
          }}>
            <Settings size={14} /> Quản lý Sheet
          </button>
        )}
      </div>

      {/* ── Body ────────────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        <div ref={scrollContainerRef} className="stacking-scroll" style={{ height: '100%', overflow: 'auto', padding: '0 12px 14px 12px' }}>

          {/* Empty state: no configs */}
          {configs.length === 0 && (
            <div style={{ textAlign: 'center', paddingTop: 80 }}>
              <Grid3x3 size={48} style={{ margin: '0 auto 12px', display: 'block', opacity: 0.2 }} />
              <p style={{ color: 'var(--text-title)', fontWeight: 600, marginBottom: 6 }}>Chưa có nguồn bảng hàng nào</p>
              {isAdmin ? (
                <>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: 20 }}>
                    Nhấn "Quản lý Sheet" → thêm Sheet ID của file bảng hàng
                  </p>
                  <button onClick={() => setShowManage(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 8, fontWeight: 600, fontSize: '0.875rem', border: 'none', background: 'var(--primary)', color: '#fff', cursor: 'pointer' }}>
                    <Plus size={15} /> Thêm nguồn đầu tiên
                  </button>
                </>
              ) : (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                  Liên hệ Admin để cấu hình nguồn bảng hàng.
                </p>
              )}
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
            <div ref={zoomWrapperRef} style={{ zoom: zoom } as React.CSSProperties}>
              {/* Legend: loại căn clickable filter + chú thích Độc quyền */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10, paddingTop: 14 }}>
                {unitTypes.map(type => {
                  const tc = typeColor(type);
                  const isActive = filterType === type;
                  return (
                    <button
                      key={type}
                      onClick={() => setFilterType(f => f === type ? null : type)}
                      title={`Lọc căn ${type}`}
                      style={{
                        display: 'inline-flex', justifyContent: 'center', alignItems: 'center',
                        minWidth: 64, padding: '3px 12px', borderRadius: 999,
                        fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer',
                        background: isActive ? tc.bg : 'transparent',
                        color: tc.text,
                        border: `1.5px solid ${tc.border}`,
                        boxShadow: isActive ? `0 0 0 2px ${tc.border}` : 'none',
                        transition: 'all 0.15s',
                      }}
                    >
                      {type}
                    </button>
                  );
                })}
                {/* Chú thích chấm xanh = Độc quyền */}
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.72rem', color: 'var(--text-muted)', paddingLeft: 8, borderLeft: '1px solid var(--border)', marginLeft: 2 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', border: '1.5px solid #15803d', display: 'inline-block', flexShrink: 0 }} />
                  Độc quyền
                </span>
              </div>

                <table className="stacking-table" onMouseLeave={() => setHoverPos(null)}>
                  <thead>
                    <tr>
                      {/* Corner: label TẦNG — đơn giản, đồng nhất với các header căn khác */}
                      <th style={{ padding: '6px 4px', minWidth: 56, textAlign: 'center' }}>
                        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#ffffff' }}>TẦNG</div>
                      </th>
                      {columns.map((canSo, ci) => {
                        const isHlTh = xColIdx >= 0 && ci === xColIdx;
                        return (
                          <th key={canSo} style={{ padding: '6px 4px', textAlign: 'center', minWidth: 82, ...(isHlTh ? { background: hlAxisSticky } : {}) }}>
                            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#ffffff' }}>{canSo}</div>
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
                          {/* Cột TẦNG: CSS sets dark gray base; inline chỉ ghi đè khi crosshair */}
                          <td style={{ padding: '5px 6px', textAlign: 'center', minWidth: 56, fontWeight: 700, fontSize: '0.8rem', color: '#ffffff', background: isHlRow ? hlAxisSticky : undefined, borderTop: '1px solid #334155' }}>{tang}</td>
                          {columns.map((canSo, ci) => {
                            const unit = unitMap[tang]?.[canSo];
                            // Hàng: cùng tầng, cột từ 0 đến xColIdx (tức từ ô đó hất sang trái)
                            const isRowHl = isHlRow && ci <= xColIdx;
                            // Cột: cùng canSo, tầng từ 0 đến xFloorIdx (tức từ ô đó hất lên trên)
                            const isColHl = xColIdx >= 0 && ci === xColIdx && fi <= xFloorIdx;
                            const isHl    = isRowHl || isColHl;
                            const handleHover = () => setHoverPos({ fi, ci });
                            if (!unit) return (
                              <td key={canSo} onMouseEnter={handleHover} style={{ padding: '3px 4px', minWidth: 82, background: isHl ? hlCell : undefined }}>
                                <div style={{ height: 46, borderRadius: 6, border: '1px dashed #e5e7eb' }} />
                              </td>
                            );
                            const isSel = selectedUnit?.maCan === unit.maCan;
                            const isDimmed = filterType !== null && unit.loaiCan !== filterType;
                            return <UnitCell key={canSo} unit={unit} isSelected={isSel} hlBg={isHl && !isSel ? hlCell : undefined} dimmed={isDimmed} onMouseEnter={handleHover} onClick={() => setSelectedUnit(u => u?.maCan === unit.maCan ? null : unit)} />;
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
            </div>
          )}
        </div>

        {/* ── Floating zoom controls ────────────────────────────────────────── */}
        {units.length > 0 && (
          <div style={{
            position: 'absolute', bottom: 20, right: 20, zIndex: 50,
            display: 'flex', flexDirection: 'column',
            background: 'var(--bg-card)', borderRadius: 10,
            border: '1px solid var(--border)',
            boxShadow: '0 4px 20px rgba(0,0,0,0.13)',
            overflow: 'hidden',
          }}>
            <button onClick={() => setZoom(z => Math.min(1, Math.round((z + 0.1) * 10) / 10))}
              disabled={zoom >= 1} title="Phóng to" style={zoomFloatBtn(zoom >= 1)}>
              <Plus size={15} />
            </button>
            <div style={{ height: 1, background: 'var(--border)' }} />
            <button onClick={() => setZoom(z => Math.max(0.3, Math.round((z - 0.1) * 10) / 10))}
              disabled={zoom <= 0.3} title="Thu nhỏ" style={zoomFloatBtn(zoom <= 0.3)}>
              <Minus size={15} />
            </button>
            <div style={{ height: 1, background: 'var(--border)' }} />
            <button onClick={() => setZoom(1)} title="Đặt lại 100%"
              style={{ ...zoomFloatBtn(false), fontSize: '0.65rem', fontWeight: 700, color: zoom !== 1 ? 'var(--primary)' : 'var(--text-muted)' }}>
              {Math.round(zoom * 100)}%
            </button>
            <div style={{ height: 1, background: 'var(--border)' }} />
            <button onClick={fitToView} title="Vừa khung nhìn" style={zoomFloatBtn(false)}>
              <Maximize2 size={15} />
            </button>
          </div>
        )}
      </div>

      {/* ── Detail modal ──────────────────────────────────────────────────── */}
      {selectedUnit && (() => {
        const tc = typeColor(selectedUnit.loaiCan);
        return (
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 600, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
            onClick={() => setSelectedUnit(null)}
          >
            <div
              style={{ width: '100%', maxWidth: 460, maxHeight: 'calc(100vh - 32px)', background: 'var(--bg-card)', borderRadius: 16, boxShadow: '0 24px 64px rgba(0,0,0,0.28)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
                <div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Mã căn</div>
                  <div style={{ fontWeight: 800, fontSize: '1.3rem', color: 'var(--text-title)', letterSpacing: '-0.01em' }}>{selectedUnit.maCan}</div>
                </div>
                <button onClick={() => setSelectedUnit(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, color: 'var(--text-muted)', borderRadius: 8, display: 'flex' }}>
                  <X size={18} />
                </button>
              </div>

              {/* Scrollable body — flex:1 so it fills remaining modal height and enables scroll on small screens */}
              <div style={{ flex: 1, overflowY: 'auto' }}>

              {/* Status badges */}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '12px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary, #f9fafb)' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 12px', borderRadius: 999, fontSize: '0.8rem', fontWeight: 600, background: selectedUnit.trangThai === 'con_hang' ? '#dcfce7' : selectedUnit.trangThai === 'da_ban' ? '#fee2e2' : '#fef3c7', color: selectedUnit.trangThai === 'con_hang' ? '#15803d' : selectedUnit.trangThai === 'da_ban' ? '#dc2626' : '#92400e' }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: STATUS_COLOR[selectedUnit.trangThai], flexShrink: 0 }} />
                  {STATUS_LABEL[selectedUnit.trangThai]}
                </span>
                {selectedUnit.mauO === 'xanh' && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 12px', borderRadius: 999, fontSize: '0.8rem', fontWeight: 600, background: '#dcfce7', color: '#15803d', border: '1px solid #86efac' }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', flexShrink: 0 }} />
                    Độc quyền
                  </span>
                )}
                {selectedUnit.mauO === 'vang' && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 12px', borderRadius: 999, fontSize: '0.8rem', fontWeight: 600, background: '#fef9c3', color: '#854d0e', border: '1px solid #fcd34d' }}>
                    Check Admin
                  </span>
                )}
              </div>

              {/* Info rows */}
              <div style={{ padding: '4px 20px' }}>
                {/* Loại căn — với color swatch */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)', fontSize: '0.875rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Loại căn</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700, color: tc.text }}>
                    <span style={{ width: 10, height: 10, borderRadius: 3, background: tc.bg, border: `1.5px solid ${tc.border}`, flexShrink: 0 }} />
                    {selectedUnit.loaiCan || '—'}
                  </span>
                </div>
                {[
                  ['DT Tim tường', fmtArea(selectedUnit.dtTim)],
                  ['DT Thông thuỷ', fmtArea(selectedUnit.dtThongThuy)],
                  ['Hướng',         selectedUnit.huong],
                  ['View',          selectedUnit.view],
                ].map(([label, value]) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)', fontSize: '0.875rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>{label}</span>
                    <span style={{ fontWeight: 600, color: 'var(--text-body)' }}>{value || '—'}</span>
                  </div>
                ))}
              </div>

              {/* Giá — card chia cột */}
              <div style={{ margin: '12px 20px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {/* Giá KS — nổi bật */}
                <div style={{ padding: '14px 16px', borderRadius: 12, background: 'linear-gradient(135deg,#fefce8,#fef3c7)', border: '1px solid #fcd34d' }}>
                  <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#92400e', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Giá KS (chưa VAT & KPBT)
                  </div>
                  <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#78350f', lineHeight: 1 }}>{fmtGiaFull(selectedUnit.giaKS)}</div>
                  <div style={{ fontSize: '0.8rem', color: '#b45309', marginTop: 4 }}>≈ {fmtGia(selectedUnit.giaKS)} tỷ</div>
                </div>

                {/* TTS / TT Chuẩn / Vay NH — chỉ hiện nếu có dữ liệu */}
                {(selectedUnit.ttsTamTinh || selectedUnit.ttChuanTamTinh || selectedUnit.vayNhTamTinh) && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                    {[
                      { label: 'TTS', value: selectedUnit.ttsTamTinh, color: '#6366f1' },
                      { label: 'TT Chuẩn', value: selectedUnit.ttChuanTamTinh, color: '#0891b2' },
                      { label: 'Vay NH', value: selectedUnit.vayNhTamTinh, color: '#059669' },
                    ].map(({ label, value, color }) => (
                      <div key={label} style={{ padding: '10px 10px', borderRadius: 10, background: 'var(--bg-secondary, #f9fafb)', border: '1px solid var(--border)', textAlign: 'center' }}>
                        <div style={{ fontSize: '0.66rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
                        {value ? (
                          <>
                            <div style={{ fontSize: '0.85rem', fontWeight: 800, color }}>{fmtGia(value)} tỷ</div>
                            <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)', marginTop: 2 }}>Tạm tính</div>
                          </>
                        ) : (
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>—</div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Link PTG */}
                {selectedUnit.linkPTG && (
                  <a
                    href={selectedUnit.linkPTG}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      padding: '10px 16px', borderRadius: 10,
                      background: 'var(--primary)', color: '#fff',
                      fontWeight: 700, fontSize: '0.875rem',
                      textDecoration: 'none', border: 'none', cursor: 'pointer',
                    }}
                  >
                    Xem Phiếu tính giá & Chỉ căn ↗
                  </a>
                )}
              </div>
              </div>{/* /scrollable body */}
            </div>
          </div>
        );
      })()}

      {/* Manage panel — chỉ Admin mới được mở */}
      {showManage && isAdmin && (
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

function zoomFloatBtn(disabled: boolean): React.CSSProperties {
  return {
    width: 38, height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'var(--bg-card)', border: 'none', cursor: disabled ? 'default' : 'pointer',
    color: disabled ? 'var(--text-muted)' : 'var(--text-body)',
    opacity: disabled ? 0.35 : 1,
    transition: 'background 0.1s',
  };
}

function pagerBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: '5px 12px', borderRadius: 6, fontSize: '0.78rem', fontWeight: 600,
    border: '1px solid var(--border)', background: 'var(--bg-card)',
    color: disabled ? 'var(--text-muted)' : 'var(--text-body)',
    cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1,
  };
}

const selectStyle: React.CSSProperties = {
  padding: '6px 30px 6px 11px', borderRadius: 10, fontSize: '0.8125rem',
  border: '1.5px solid #e2e8f0', background: 'var(--bg-card)',
  color: 'var(--text-body)', cursor: 'pointer', appearance: 'none',
  fontFamily: 'var(--font-family)',
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
