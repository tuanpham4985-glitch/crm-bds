'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, Plus, RefreshCw, Trash2, CheckCircle, Loader2, Map as MapIcon } from 'lucide-react';

/** TMB Manager — panel Admin quản lý Tổng mặt bằng (Section 9 TMB Manager
 * spec): tạo profile, Phân tích/Tối ưu/Quét mã căn, review + mapping thủ
 * công, Kích hoạt/Xoá. File RIÊNG (không nhét vào page.tsx 1900+ dòng) —
 * cùng convention modal/panel với ManagePanel ("Quản lý Sheet") đã có.
 *
 * KHÔNG động tới TmbMap.tsx/tmb-map-data.ts (renderer + registry tĩnh production-
 * stable) — panel này CHỈ nói chuyện với API /api/stacking/tmb-profiles/*,
 * hoàn toàn tách biệt khỏi luồng xem TMB của Sale.
 */

interface TmbProfileRow {
  id: string;
  stacking_config_id: string;
  label: string;
  subdivision: string | null;
  source_type: string;
  master_asset_ref: string;
  web_asset_ref: string | null;
  page_number: number;
  page_width: number | null;
  page_height: number | null;
  rotation: number;
  unit_code_field: string | null;
  status: string;
  error_message: string | null;
  master_size_bytes: number | null;
  web_size_bytes: number | null;
  created_at: string;
  updated_at: string;
}

interface IndexResult {
  summary: { total: number; matchedDirect: number; matchedAlias: number; ambiguous: number; unmatched: number };
  autoCreated: number;
  autoSkippedManual: number;
  ambiguous: { code: string; reason?: string; sheetRowCount: number }[];
  unmatched: { code: string; reason?: string }[];
  matchedAlias: { code: string; resolvedPdfCode?: string; aliasRuleLabel?: string }[];
  sheetInventoryCount: number;
  sheetInventoryCountNormalized: number;
}

interface AnalyzeResult {
  fileSizeBytes: number;
  pageCount: number;
  page: { width: number; height: number; rotation: number };
  hasTextLayer: boolean;
  textItemCount: number;
  classification: string;
  images: { path: string; width: number; height: number; streamBytes: number; role: string }[];
}

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Nháp', ANALYZED: 'Đã phân tích', READY_FOR_REVIEW: 'Chờ review', ACTIVE: 'Đang dùng', ERROR: 'Lỗi',
};
const STATUS_COLOR: Record<string, string> = {
  DRAFT: '#9ca3af', ANALYZED: '#3b82f6', READY_FOR_REVIEW: '#f59e0b', ACTIVE: '#22c55e', ERROR: '#ef4444',
};

function fmtMB(bytes: number | null): string {
  if (!bytes) return '—';
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function TmbManagerPanel({ stackingConfigId, stackingConfigLabel, onClose }: {
  stackingConfigId: string;
  stackingConfigLabel: string;
  onClose: () => void;
}) {
  const [profiles, setProfiles] = useState<TmbProfileRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [lastAnalyze, setLastAnalyze] = useState<Record<string, AnalyzeResult>>({});
  const [lastIndex, setLastIndex] = useState<Record<string, IndexResult>>({});
  const [actionMsg, setActionMsg] = useState<Record<string, string>>({});

  const [form, setForm] = useState({ label: '', subdivision: '', master_asset_ref: '' });
  const [saving, setSaving] = useState(false);

  const [manualForm, setManualForm] = useState<{ profileId: string; unitCode: string; x: string; y: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const r = await fetch(`/api/stacking/tmb-profiles?stacking_config_id=${encodeURIComponent(stackingConfigId)}`);
      const d = await r.json();
      if (d.success) setProfiles(d.data);
      else setError(d.error || 'Lỗi tải danh sách');
    } catch {
      setError('Lỗi kết nối server');
    } finally {
      setLoading(false);
    }
  }, [stackingConfigId]);

  useEffect(() => { load(); }, [load]);

  async function handleAdd() {
    if (!form.label.trim() || !form.master_asset_ref.trim()) return;
    setSaving(true);
    try {
      const r = await fetch('/api/stacking/tmb-profiles', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stacking_config_id: stackingConfigId,
          label: form.label.trim(),
          subdivision: form.subdivision.trim() || undefined,
          master_asset_ref: form.master_asset_ref.trim(),
        }),
      });
      const d = await r.json();
      if (d.success) {
        setForm({ label: '', subdivision: '', master_asset_ref: '' });
        setShowAddForm(false);
        await load();
      } else {
        setError(d.error || 'Không tạo được profile');
      }
    } finally {
      setSaving(false);
    }
  }

  async function runAction(id: string, action: 'analyze' | 'optimize' | 'index' | 'delete') {
    setBusyId(id); setActionMsg(m => ({ ...m, [id]: '' }));
    try {
      if (action === 'delete') {
        if (!confirm('Xoá map profile này? Mapping của nó cũng bị xoá theo (KHÔNG ảnh hưởng Bảng hàng/Sheet).')) { setBusyId(null); return; }
        const r = await fetch(`/api/stacking/tmb-profiles/${id}`, { method: 'DELETE' });
        const d = await r.json();
        if (d.success) await load(); else setError(d.error);
        return;
      }
      const r = await fetch(`/api/stacking/tmb-profiles/${id}/${action}`, { method: 'POST' });
      const d = await r.json();
      if (!d.success) {
        setActionMsg(m => ({ ...m, [id]: `Lỗi: ${d.error}` }));
        await load();
        return;
      }
      if (action === 'analyze') setLastAnalyze(m => ({ ...m, [id]: d.data.analysis }));
      if (action === 'index') setLastIndex(m => ({ ...m, [id]: d.data }));
      setActionMsg(m => ({ ...m, [id]: 'OK' }));
      setExpandedId(id);
      await load();
    } catch {
      setActionMsg(m => ({ ...m, [id]: 'Lỗi kết nối server' }));
    } finally {
      setBusyId(null);
    }
  }

  async function toggleActivate(profile: TmbProfileRow) {
    setBusyId(profile.id);
    try {
      const action = profile.status === 'ACTIVE' ? 'deactivate' : 'activate';
      const r = await fetch(`/api/stacking/tmb-profiles/${profile.id}/activate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }),
      });
      const d = await r.json();
      if (!d.success) setActionMsg(m => ({ ...m, [profile.id]: `Lỗi: ${d.error}` }));
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function saveManualMapping() {
    if (!manualForm) return;
    const x = Number(manualForm.x), y = Number(manualForm.y);
    if (!manualForm.unitCode.trim() || !Number.isFinite(x) || !Number.isFinite(y)) return;
    const r = await fetch(`/api/stacking/tmb-profiles/${manualForm.profileId}/mappings`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ unit_code: manualForm.unitCode.trim(), x, y }),
    });
    const d = await r.json();
    if (d.success) {
      setManualForm(null);
      setActionMsg(m => ({ ...m, [manualForm.profileId]: `Đã lưu mapping thủ công cho ${manualForm.unitCode}` }));
    } else {
      setError(d.error);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 900, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--surface)', borderRadius: 10, width: 'min(920px, 94vw)', maxHeight: '88vh',
        overflow: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 14,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: 8 }}>
            <MapIcon size={18} /> Quản lý TMB — {stackingConfigLabel}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
        </div>

        {error && (
          <div style={{ padding: '8px 12px', borderRadius: 6, background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', fontSize: '0.85rem' }}>{error}</div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={load} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', fontSize: '0.8rem' }}>
            <RefreshCw size={14} style={loading ? { animation: 'spin 0.7s linear infinite' } : undefined} /> Làm mới
          </button>
          <button onClick={() => setShowAddForm(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--primary)', background: 'transparent', color: 'var(--primary)', cursor: 'pointer', fontSize: '0.8rem' }}>
            <Plus size={14} /> Thêm Tổng mặt bằng
          </button>
        </div>

        {showAddForm && (
          <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-label)' }}>
              File PDF gốc phải được ingest sẵn server-side trước (script hoặc storage abstraction — xem báo cáo audit "Asset storage") rồi dán key/path vào đây. Upload trực tiếp qua form này chỉ hỗ trợ file vừa/nhỏ do giới hạn body size của platform.
            </p>
            <input placeholder="Tên TMB (VD: HLX · TĐNĐ1)" value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
              style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)' }} />
            <input placeholder="Phân khu (tuỳ chọn, VD: TĐNĐ1)" value={form.subdivision} onChange={e => setForm(f => ({ ...f, subdivision: e.target.value }))}
              style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)' }} />
            <input placeholder="master_asset_ref (path public/... hoặc storage key)" value={form.master_asset_ref} onChange={e => setForm(f => ({ ...f, master_asset_ref: e.target.value }))}
              style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)' }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleAdd} disabled={saving || !form.label.trim() || !form.master_asset_ref.trim()} style={{ padding: '6px 12px', borderRadius: 6, border: 'none', background: 'var(--primary)', color: '#fff', cursor: 'pointer', fontSize: '0.8rem' }}>
                {saving ? 'Đang lưu...' : 'Tạo (DRAFT)'}
              </button>
              <button onClick={() => setShowAddForm(false)} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', fontSize: '0.8rem' }}>Huỷ</button>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {profiles.length === 0 && !loading && (
            <p style={{ fontSize: '0.85rem', color: 'var(--text-label)' }}>Chưa có Tổng mặt bằng nào cho nguồn này.</p>
          )}
          {profiles.map(p => {
            const analysis = lastAnalyze[p.id];
            const index = lastIndex[p.id];
            return (
              <div key={p.id} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                  <div>
                    <strong>{p.label}</strong>{p.subdivision && <span style={{ color: 'var(--text-label)' }}> · {p.subdivision}</span>}
                    <span style={{ marginLeft: 8, fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: 10, color: '#fff', background: STATUS_COLOR[p.status] }}>
                      {STATUS_LABEL[p.status] ?? p.status}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button disabled={busyId === p.id} onClick={() => runAction(p.id, 'analyze')} style={actionBtnStyle}>Phân tích</button>
                    <button disabled={busyId === p.id} onClick={() => runAction(p.id, 'optimize')} style={actionBtnStyle}>Tối ưu</button>
                    <button disabled={busyId === p.id} onClick={() => runAction(p.id, 'index')} style={actionBtnStyle}>Quét mã căn</button>
                    <button disabled={busyId === p.id} onClick={() => toggleActivate(p)} style={{ ...actionBtnStyle, borderColor: p.status === 'ACTIVE' ? '#ef4444' : '#22c55e', color: p.status === 'ACTIVE' ? '#ef4444' : '#22c55e' }}>
                      {p.status === 'ACTIVE' ? 'Ngừng dùng' : 'Kích hoạt'}
                    </button>
                    <button disabled={busyId === p.id} onClick={() => runAction(p.id, 'delete')} style={{ ...actionBtnStyle, color: '#ef4444', borderColor: '#ef4444' }}><Trash2 size={12} /></button>
                    <button onClick={() => setExpandedId(id => id === p.id ? null : p.id)} style={actionBtnStyle}>{expandedId === p.id ? 'Thu gọn' : 'Chi tiết'}</button>
                  </div>
                </div>

                <div style={{ marginTop: 6, fontSize: '0.78rem', color: 'var(--text-label)' }}>
                  Master: {fmtMB(p.master_size_bytes)} · Web: {fmtMB(p.web_size_bytes)}
                  {p.page_width && p.page_height && ` · Trang: ${p.page_width.toFixed(0)}×${p.page_height.toFixed(0)}pt (rotation ${p.rotation}°)`}
                  {busyId === p.id && <Loader2 size={12} style={{ marginLeft: 6, verticalAlign: 'middle', animation: 'spin 0.7s linear infinite' }} />}
                  {actionMsg[p.id] && actionMsg[p.id] !== 'OK' && <span style={{ color: '#dc2626', marginLeft: 6 }}>{actionMsg[p.id]}</span>}
                </div>
                {p.error_message && (
                  <div style={{ marginTop: 6, padding: '6px 10px', borderRadius: 6, background: '#fef2f2', color: '#dc2626', fontSize: '0.78rem' }}>{p.error_message}</div>
                )}

                {expandedId === p.id && (
                  <div style={{ marginTop: 10, borderTop: '1px solid var(--border)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {analysis && (
                      <div style={{ fontSize: '0.78rem' }}>
                        <strong>Phân tích gần nhất:</strong> {analysis.pageCount} trang · Text layer: {analysis.hasTextLayer ? 'Có' : 'Không'} ({analysis.textItemCount} items) · Phân loại: {analysis.classification} · {analysis.images.length} ảnh raster
                      </div>
                    )}
                    {index && (
                      <div style={{ fontSize: '0.78rem' }}>
                        <strong>Quét mã căn gần nhất:</strong> Bảng hàng {index.sheetInventoryCount} dòng ({index.sheetInventoryCountNormalized} mã duy nhất) ·
                        Matched trực tiếp: {index.summary.matchedDirect} · Matched qua alias: {index.summary.matchedAlias} · Ambiguous: {index.summary.ambiguous} · Unmatched: {index.summary.unmatched} ·
                        Tự tạo mapping: {index.autoCreated} (bỏ qua {index.autoSkippedManual} đã có MANUAL)
                        {index.matchedAlias.length > 0 && (
                          <div style={{ marginTop: 4 }}>
                            <em>Matched qua alias:</em> {index.matchedAlias.slice(0, 15).map(a => `${a.code} → ${a.resolvedPdfCode}`).join(', ')}{index.matchedAlias.length > 15 ? '…' : ''}
                          </div>
                        )}
                        {index.ambiguous.length > 0 && (
                          <div style={{ marginTop: 4 }}>
                            <em>Ambiguous (cần review thủ công):</em> {index.ambiguous.slice(0, 15).map(a => `${a.code} (${a.reason})`).join(', ')}{index.ambiguous.length > 15 ? '…' : ''}
                          </div>
                        )}
                      </div>
                    )}

                    <div>
                      <strong style={{ fontSize: '0.78rem' }}>Mapping thủ công (Section 8):</strong>
                      {manualForm?.profileId === p.id ? (
                        <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                          <input placeholder="Mã căn" value={manualForm.unitCode} onChange={e => setManualForm(f => f && ({ ...f, unitCode: e.target.value }))} style={smallInputStyle} />
                          <input placeholder="x (pdf user-space)" value={manualForm.x} onChange={e => setManualForm(f => f && ({ ...f, x: e.target.value }))} style={smallInputStyle} />
                          <input placeholder="y (pdf user-space)" value={manualForm.y} onChange={e => setManualForm(f => f && ({ ...f, y: e.target.value }))} style={smallInputStyle} />
                          <button onClick={saveManualMapping} style={actionBtnStyle}><CheckCircle size={12} /> Lưu</button>
                          <button onClick={() => setManualForm(null)} style={actionBtnStyle}>Huỷ</button>
                        </div>
                      ) : (
                        <button onClick={() => setManualForm({ profileId: p.id, unitCode: '', x: '', y: '' })} style={{ ...actionBtnStyle, marginLeft: 8 }}>+ Thêm mapping</button>
                      )}
                      <p style={{ fontSize: '0.72rem', color: 'var(--text-label)', marginTop: 4 }}>
                        v1: nhập toạ độ số trực tiếp (đơn vị PDF user-space, trang chưa xoay/scale — cùng hệ TmbMap.tsx đang dùng). Click-to-place trên canvas là cải tiến tương lai.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const actionBtnStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', borderRadius: 6,
  border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', fontSize: '0.72rem',
};
const smallInputStyle: React.CSSProperties = {
  padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', fontSize: '0.78rem', width: 120,
};
