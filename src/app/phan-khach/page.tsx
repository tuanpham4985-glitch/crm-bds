'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Users, ChevronDown, Save, X, Check,
  UserCheck, Settings, Phone, Mail, Info,
} from 'lucide-react';
import type { DuAn, KhachHang, NhanVien } from '@/lib/types';
import { formatPhone } from '@/lib/utils';
import { useCrmAccess } from '@/hooks/useCrmAccess';

// Parse ds_sale JSON từ DuAn
function parseDsSale(raw?: string): string[] {
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

// Kiểm tra row có thay đổi so với dữ liệu gốc không
function isDirty(original: KhachHang, draft: Partial<KhachHang>): boolean {
  const fields: (keyof KhachHang)[] = [
    'sale_lan_1', 'ghi_chu_lan_1',
    'sale_lan_2', 'ghi_chu_lan_2',
    'sale_lan_3', 'ghi_chu_lan_3',
  ];
  return fields.some(f => draft[f] !== undefined && draft[f] !== (original[f] ?? ''));
}

export default function PhanKhachPage() {
  const { phanKhachIds } = useCrmAccess();
  const [projects, setProjects] = useState<DuAn[]>([]);
  const [employees, setEmployees] = useState<NhanVien[]>([]);
  const [customers, setCustomers] = useState<KhachHang[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingBase, setLoadingBase] = useState(true);

  const [selectedProjectId, setSelectedProjectId] = useState('');
  const selectedProject = projects.find(p => p.id_du_an === selectedProjectId) ?? null;
  const teamSales = parseDsSale(selectedProject?.ds_sale);

  // Draft edits per customer id
  const [drafts, setDrafts] = useState<Record<string, Partial<KhachHang>>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});

  // Team config modal
  const [showTeamModal, setShowTeamModal] = useState(false);
  const [teamForm, setTeamForm] = useState({ truong_nhom: '', ds_sale: [] as string[] });
  const [savingTeam, setSavingTeam] = useState(false);


  // Load projects + employees on mount
  useEffect(() => {
    setLoadingBase(true);
    Promise.all([
      fetch('/api/du-an').then(r => r.json()),
      fetch('/api/nhan-vien').then(r => r.json()),
    ]).then(([daData, nvData]) => {
      if (daData.success) setProjects(daData.data.filter((d: DuAn) => d.hien_thi !== 0));
      if (nvData.success) setEmployees(nvData.data);
    }).catch(console.error)
      .finally(() => setLoadingBase(false));
  }, []);

  // Load customers when project changes
  const fetchCustomers = useCallback(async (tenDuAn: string) => {
    if (!tenDuAn) { setCustomers([]); return; }
    setLoading(true);
    setDrafts({});
    try {
      const res = await fetch(`/api/khach-hang?du_an=${encodeURIComponent(tenDuAn)}&limit=999`);
      const data = await res.json();
      if (data.success) setCustomers(data.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (selectedProject) fetchCustomers(selectedProject.ten_du_an);
    else setCustomers([]);
  }, [selectedProject, fetchCustomers]);

  // Update a single cell in drafts
  const setCell = (id: string, field: keyof KhachHang, value: string) => {
    setDrafts(prev => {
      const patch: Partial<KhachHang> = { [field]: value };
      // sale_phu_trach = latest non-empty sale among lan_1/2/3
      if (field === 'sale_lan_1' || field === 'sale_lan_2' || field === 'sale_lan_3') {
        const d = prev[id] ?? {};
        const kh = customers.find(c => c.id_khach_hang === id);
        const get = (f: keyof KhachHang) => field === f ? value : ((d[f] ?? kh?.[f] ?? '') as string);
        patch.sale_phu_trach = get('sale_lan_3') || get('sale_lan_2') || get('sale_lan_1');
      }
      return { ...prev, [id]: { ...prev[id], ...patch } };
    });
    setSaved(prev => ({ ...prev, [id]: false }));
  };

  // Get current value (draft > original)
  const getVal = (kh: KhachHang, field: keyof KhachHang): string => {
    const d = drafts[kh.id_khach_hang];
    if (d && d[field] !== undefined) return d[field] as string;
    return (kh[field] as string) ?? '';
  };

  // Save a single row
  const saveRow = async (kh: KhachHang) => {
    const draft = drafts[kh.id_khach_hang] ?? {};
    const updated: KhachHang = { ...kh, ...draft };
    setSaving(prev => ({ ...prev, [kh.id_khach_hang]: true }));
    try {
      const res = await fetch('/api/khach-hang', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      });
      const result = await res.json();
      if (result.success) {
        setCustomers(prev => prev.map(c => c.id_khach_hang === kh.id_khach_hang ? updated : c));
        setDrafts(prev => { const n = { ...prev }; delete n[kh.id_khach_hang]; return n; });
        setSaved(prev => ({ ...prev, [kh.id_khach_hang]: true }));
        setTimeout(() => setSaved(prev => ({ ...prev, [kh.id_khach_hang]: false })), 2000);
      }
    } catch (err) { console.error(err); }
    finally { setSaving(prev => ({ ...prev, [kh.id_khach_hang]: false })); }
  };

  // Save all dirty rows
  const saveAll = async () => {
    const dirtyIds = customers.filter(kh => isDirty(kh, drafts[kh.id_khach_hang] ?? {})).map(kh => kh.id_khach_hang);
    await Promise.all(customers.filter(kh => dirtyIds.includes(kh.id_khach_hang)).map(saveRow));
  };

  const dirtyCount = customers.filter(kh => isDirty(kh, drafts[kh.id_khach_hang] ?? {})).length;

  // Open team config modal
  const openTeamModal = () => {
    setTeamForm({
      truong_nhom: selectedProject?.truong_nhom ?? '',
      ds_sale: parseDsSale(selectedProject?.ds_sale),
    });
    setShowTeamModal(true);
  };

  // Toggle sale in team
  const toggleSaleInTeam = (name: string) => {
    setTeamForm(prev => ({
      ...prev,
      ds_sale: prev.ds_sale.includes(name)
        ? prev.ds_sale.filter(s => s !== name)
        : [...prev.ds_sale, name],
    }));
  };

  // Save team config
  const saveTeam = async () => {
    if (!selectedProject) return;
    setSavingTeam(true);
    try {
      const updated: DuAn = {
        ...selectedProject,
        truong_nhom: teamForm.truong_nhom,
        ds_sale: JSON.stringify(teamForm.ds_sale),
      };
      const res = await fetch('/api/du-an', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      });
      const result = await res.json();
      if (result.success) {
        setProjects(prev => prev.map(p => p.id_du_an === updated.id_du_an ? updated : p));
        setShowTeamModal(false);
      }
    } catch (err) { console.error(err); }
    finally { setSavingTeam(false); }
  };

  // Sale dropdown options: team sales if configured, else all employees
  const saleOptions = teamSales.length > 0
    ? teamSales
    : employees.map(e => e.ho_ten);

  if (loadingBase) {
    return <div className="loading-spinner"><div className="spinner" /></div>;
  }

  return (
    <div>
      {/* ── Header ── */}
      <div className="page-header">
        <div className="page-header-left">
          <h1>Phân khách</h1>
          <p>Giao khách cho sale theo từng dự án</p>
        </div>
        {dirtyCount > 0 && (
          <button className="btn btn-primary" onClick={saveAll}>
            <Save size={16} />
            Lưu {dirtyCount} thay đổi
          </button>
        )}
      </div>

      {/* ── Project Selector ── */}
      <div className="card" style={{ marginBottom: 20, padding: '16px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: '0 0 auto', minWidth: 280 }}>
            <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-label)', display: 'block', marginBottom: 6 }}>
              Chọn dự án
            </label>
            <div style={{ position: 'relative' }}>
              <select
                className="form-select"
                style={{ paddingLeft: 40, fontSize: '0.9375rem', fontWeight: 600 }}
                value={selectedProjectId}
                onChange={e => setSelectedProjectId(e.target.value)}
              >
                <option value="">-- Chọn dự án --</option>
                {projects
                  .filter(p => phanKhachIds === null || phanKhachIds === undefined || phanKhachIds.includes(p.id_du_an))
                  .map(p => (
                  <option key={p.id_du_an} value={p.id_du_an}>{p.ten_du_an}</option>
                ))}
              </select>
              <ChevronDown size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-label)', pointerEvents: 'none' }} />
            </div>
          </div>

          {/* Team info card */}
          {selectedProject && (
            <div style={{
              flex: 1, minWidth: 0,
              background: 'var(--bg-subtle, #f8fafc)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              padding: '10px 16px',
              display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
            }}>
              {selectedProject.truong_nhom ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <UserCheck size={15} color="var(--primary)" />
                    <span style={{ fontSize: '0.82rem', color: 'var(--text-label)' }}>Trưởng nhóm:</span>
                    <span style={{ fontWeight: 700, color: 'var(--text-title)', fontSize: '0.875rem' }}>
                      {selectedProject.truong_nhom}
                    </span>
                  </div>
                  {teamSales.length > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-label)', flexShrink: 0 }}>Team:</span>
                      {teamSales.map(s => (
                        <span key={s} style={{
                          background: s === selectedProject.truong_nhom ? '#ede9fe' : '#f1f5f9',
                          color: s === selectedProject.truong_nhom ? '#5b21b6' : '#475569',
                          border: `1px solid ${s === selectedProject.truong_nhom ? '#c4b5fd' : '#e2e8f0'}`,
                          borderRadius: 20, padding: '2px 10px', fontSize: '0.78rem', fontWeight: 600,
                        }}>
                          {s}{s === selectedProject.truong_nhom ? ' ★' : ''}
                        </span>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  <Info size={14} />
                  Chưa cấu hình team — nhấn &quot;Cấu hình team&quot; để thiết lập
                </div>
              )}
              <button className="btn btn-secondary btn-sm" style={{ marginLeft: 'auto', flexShrink: 0 }} onClick={openTeamModal}>
                <Settings size={13} />
                Cấu hình team
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Customer Table ── */}
      {!selectedProjectId ? (
        <div className="card">
          <div className="empty-state">
            <Users size={40} />
            <h3>Chọn dự án để bắt đầu</h3>
            <p>Chọn một dự án ở trên để xem danh sách khách hàng</p>
          </div>
        </div>
      ) : loading ? (
        <div className="loading-spinner"><div className="spinner" /></div>
      ) : customers.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <Users size={40} />
            <h3>Chưa có khách hàng</h3>
            <p>Dự án này chưa có khách hàng nào được gán</p>
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-subtle, #f8fafc)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-label)', fontWeight: 600 }}>
              {customers.length} khách hàng
              {dirtyCount > 0 && (
                <span style={{ color: '#d97706', marginLeft: 8 }}>· {dirtyCount} chưa lưu</span>
              )}
            </span>
            {dirtyCount > 0 && (
              <button className="btn btn-primary btn-sm" onClick={saveAll}>
                <Save size={13} />
                Lưu tất cả
              </button>
            )}
          </div>

          <div className="table-wrapper" style={{ overflowX: 'auto' }}>
            <table className="data-table" style={{ minWidth: 1200 }}>
              <thead>
                <tr>
                  <th style={{ width: 42 }}>#</th>
                  <th style={{ minWidth: 140 }}>Tên KH</th>
                  <th style={{ minWidth: 110 }}>SĐT</th>
                  <th style={{ minWidth: 160 }}>Email</th>
                  <th style={{ minWidth: 90 }}>Nguồn</th>
                  <th style={{ minWidth: 180 }}>Nhu cầu</th>
                  {/* Lần 1 */}
                  <th style={{ minWidth: 140, background: '#eff6ff', color: '#1d4ed8' }}>Sale lần 1</th>
                  <th style={{ minWidth: 160, background: '#eff6ff', color: '#1d4ed8' }}>Ghi chú lần 1</th>
                  {/* Lần 2 */}
                  <th style={{ minWidth: 140, background: '#fffbeb', color: '#b45309' }}>Sale lần 2</th>
                  <th style={{ minWidth: 160, background: '#fffbeb', color: '#b45309' }}>Ghi chú lần 2</th>
                  {/* Lần 3 */}
                  <th style={{ minWidth: 140, background: '#f0fdf4', color: '#15803d' }}>Sale lần 3</th>
                  <th style={{ minWidth: 160, background: '#f0fdf4', color: '#15803d' }}>Ghi chú lần 3</th>
                  <th style={{ width: 64, textAlign: 'center' }}>Lưu</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((kh, idx) => {
                  const dirty = isDirty(kh, drafts[kh.id_khach_hang] ?? {});
                  const isSaving = saving[kh.id_khach_hang];
                  const justSaved = saved[kh.id_khach_hang];

                  return (
                    <tr
                      key={kh.id_khach_hang}
                      style={dirty ? { background: '#fefce8' } : undefined}
                    >
                      <td style={{ color: 'var(--text-label)' }}>{idx + 1}</td>

                      {/* Tên KH */}
                      <td style={{ fontWeight: 600, color: 'var(--text-title)' }}>{kh.ten_KH}</td>

                      {/* SĐT */}
                      <td>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.82rem' }}>
                          <Phone size={12} style={{ color: 'var(--text-label)', flexShrink: 0 }} />
                          {formatPhone(kh.so_dien_thoai)}
                        </span>
                      </td>

                      {/* Email */}
                      <td>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.82rem' }}>
                          <Mail size={12} style={{ color: 'var(--text-label)', flexShrink: 0 }} />
                          <span className="truncate" style={{ maxWidth: 150 }}>{kh.email || '—'}</span>
                        </span>
                      </td>

                      {/* Nguồn */}
                      <td>
                        {kh.nguon ? (
                          <span className="badge badge-info" style={{ fontSize: '0.72rem' }}>{kh.nguon}</span>
                        ) : '—'}
                      </td>

                      {/* Nhu cầu */}
                      <td className="truncate" style={{ maxWidth: 180, fontSize: '0.82rem', color: 'var(--text-body)' }}>
                        {kh.nhu_cau || '—'}
                      </td>

                      {/* ── Lần 1 ── */}
                      <SaleCell
                        value={getVal(kh, 'sale_lan_1')}
                        options={saleOptions}
                        color="#1d4ed8"
                        bg="#eff6ff"
                        onChange={v => setCell(kh.id_khach_hang, 'sale_lan_1', v)}
                      />
                      <NoteCell
                        value={getVal(kh, 'ghi_chu_lan_1')}
                        color="#1d4ed8"
                        bg="#eff6ff"
                        onChange={v => setCell(kh.id_khach_hang, 'ghi_chu_lan_1', v)}
                      />

                      {/* ── Lần 2 ── */}
                      <SaleCell
                        value={getVal(kh, 'sale_lan_2')}
                        options={saleOptions}
                        color="#b45309"
                        bg="#fffbeb"
                        onChange={v => setCell(kh.id_khach_hang, 'sale_lan_2', v)}
                      />
                      <NoteCell
                        value={getVal(kh, 'ghi_chu_lan_2')}
                        color="#b45309"
                        bg="#fffbeb"
                        onChange={v => setCell(kh.id_khach_hang, 'ghi_chu_lan_2', v)}
                      />

                      {/* ── Lần 3 ── */}
                      <SaleCell
                        value={getVal(kh, 'sale_lan_3')}
                        options={saleOptions}
                        color="#15803d"
                        bg="#f0fdf4"
                        onChange={v => setCell(kh.id_khach_hang, 'sale_lan_3', v)}
                      />
                      <NoteCell
                        value={getVal(kh, 'ghi_chu_lan_3')}
                        color="#15803d"
                        bg="#f0fdf4"
                        onChange={v => setCell(kh.id_khach_hang, 'ghi_chu_lan_3', v)}
                      />

                      {/* Save button */}
                      <td style={{ textAlign: 'center' }}>
                        {justSaved ? (
                          <Check size={16} style={{ color: '#16a34a' }} />
                        ) : dirty ? (
                          <button
                            className="btn btn-ghost btn-icon btn-sm"
                            title="Lưu dòng này"
                            style={{ color: 'var(--primary)' }}
                            disabled={isSaving}
                            onClick={() => saveRow(kh)}
                          >
                            {isSaving ? <div className="spinner" style={{ width: 14, height: 14 }} /> : <Save size={15} />}
                          </button>
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Team Config Modal ── */}
      {showTeamModal && selectedProject && (
        <div className="modal-overlay" onClick={() => setShowTeamModal(false)}>
          <div className="modal-content" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3 className="modal-title">Cấu hình team</h3>
                <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  {selectedProject.ten_du_an}
                </p>
              </div>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowTeamModal(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              {/* Trưởng nhóm */}
              <div className="form-group">
                <label className="form-label">Trưởng nhóm / GDDA</label>
                <select
                  className="form-select"
                  value={teamForm.truong_nhom}
                  onChange={e => {
                    const name = e.target.value;
                    setTeamForm(prev => ({
                      truong_nhom: name,
                      // Auto-add trưởng nhóm vào ds_sale nếu chưa có
                      ds_sale: name && !prev.ds_sale.includes(name) ? [name, ...prev.ds_sale] : prev.ds_sale,
                    }));
                  }}
                >
                  <option value="">Chọn trưởng nhóm</option>
                  {employees.map(nv => (
                    <option key={nv.id_nhan_vien} value={nv.ho_ten}>{nv.ho_ten}</option>
                  ))}
                </select>
              </div>

              {/* Danh sách sale */}
              <div className="form-group">
                <label className="form-label">
                  Danh sách sale trong team
                  <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: 6 }}>
                    ({teamForm.ds_sale.length} người)
                  </span>
                </label>
                <div style={{
                  border: '1px solid var(--border)', borderRadius: 8,
                  maxHeight: 280, overflowY: 'auto', padding: '8px 4px',
                }}>
                  {employees.map(nv => {
                    const checked = teamForm.ds_sale.includes(nv.ho_ten);
                    const isLeader = nv.ho_ten === teamForm.truong_nhom;
                    return (
                      <label
                        key={nv.id_nhan_vien}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '7px 12px', cursor: 'pointer', borderRadius: 6,
                          background: checked ? (isLeader ? '#ede9fe' : '#f0fdf4') : 'transparent',
                          transition: 'background 0.12s',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleSaleInTeam(nv.ho_ten)}
                          style={{ accentColor: isLeader ? '#7c3aed' : '#16a34a', width: 16, height: 16 }}
                        />
                        <span style={{ flex: 1, fontSize: '0.875rem', fontWeight: checked ? 600 : 400, color: 'var(--text-body)' }}>
                          {nv.ho_ten}
                        </span>
                        {isLeader && (
                          <span style={{ fontSize: '0.72rem', background: '#ede9fe', color: '#5b21b6', borderRadius: 10, padding: '1px 8px', fontWeight: 600 }}>
                            Trưởng nhóm
                          </span>
                        )}
                        {nv.employee_type && (
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{nv.employee_type}</span>
                        )}
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Preview */}
              {teamForm.ds_sale.length > 0 && (
                <div style={{ background: '#f8fafc', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px' }}>
                  <p style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-label)', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Preview team
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {teamForm.ds_sale.map(s => (
                      <span key={s} style={{
                        background: s === teamForm.truong_nhom ? '#ede9fe' : '#f1f5f9',
                        color: s === teamForm.truong_nhom ? '#5b21b6' : '#475569',
                        border: `1px solid ${s === teamForm.truong_nhom ? '#c4b5fd' : '#e2e8f0'}`,
                        borderRadius: 20, padding: '3px 12px',
                        fontSize: '0.8rem', fontWeight: 600,
                        display: 'flex', alignItems: 'center', gap: 5,
                      }}>
                        {s}
                        {s === teamForm.truong_nhom && <span style={{ fontSize: '0.7rem' }}>★</span>}
                        <button
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1, color: 'inherit', opacity: 0.6 }}
                          onClick={() => toggleSaleInTeam(s)}
                        >
                          <X size={11} />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowTeamModal(false)}>Hủy</button>
              <button className="btn btn-primary" onClick={saveTeam} disabled={savingTeam}>
                {savingTeam ? 'Đang lưu...' : 'Lưu cấu hình'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────

function SaleCell({
  value, options, color, bg, onChange,
}: {
  value: string;
  options: string[];
  color: string;
  bg: string;
  onChange: (v: string) => void;
}) {
  return (
    <td style={{ background: bg + '66', padding: '6px 8px' }}>
      <select
        className="form-select"
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          fontSize: '0.8rem', padding: '4px 8px',
          color: value ? color : 'var(--text-muted)',
          fontWeight: value ? 600 : 400,
          border: `1px solid ${value ? color + '55' : 'var(--border)'}`,
          borderRadius: 6, background: value ? bg : '#ffffff',
          minWidth: 120,
        }}
      >
        <option value="">— Chưa giao —</option>
        {options.map(s => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>
    </td>
  );
}

function NoteCell({
  value, color, bg, onChange,
}: {
  value: string;
  color: string;
  bg: string;
  onChange: (v: string) => void;
}) {
  return (
    <td style={{ background: bg + '33', padding: '6px 8px' }}>
      <input
        className="form-input"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="Ghi chú..."
        style={{
          fontSize: '0.8rem', padding: '4px 8px',
          borderRadius: 6, minWidth: 140,
          borderColor: value ? color + '55' : 'var(--border)',
        }}
      />
    </td>
  );
}
