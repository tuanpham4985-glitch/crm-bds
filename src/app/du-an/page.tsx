'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Plus, Edit3, Trash2, X, Building2, Eye, EyeOff,
  ExternalLink, ChevronDown, ChevronRight, Layers,
  SlidersHorizontal, LayoutGrid,
} from 'lucide-react';
import type { DuAn, Pipeline } from '@/lib/types';
import { useAuth } from '@/hooks/useAuth';

export default function DuAnPage() {
  const { isAdmin, isLoading: authLoading } = useAuth();
  const [projects, setProjects] = useState<DuAn[]>([]);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [loading, setLoading] = useState(true);
  const [showHidden, setShowHidden] = useState(false);

  // Chủ đầu tư đang expand
  const [expandedCDT, setExpandedCDT] = useState<Set<string>>(new Set());

  // ── Filters ──────────────────────────────────────────────────────────────
  const [filterCDT, setFilterCDT] = useState('');
  const [filterDuAn, setFilterDuAn] = useState('');

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<DuAn | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [deletingId, setDeletingId] = useState('');
  const [saving, setSaving] = useState(false);

  // Stacking dropdown
  const [openStackingId, setOpenStackingId] = useState<string | null>(null);

  // Form
  const [form, setForm] = useState({
    ma_du_an: '', ten_du_an: '', hien_thi: 1,
    hoa_hong_mac_dinh: 0, link_tai_lieu: '', chu_dau_tu: '', link_du_an: '',
  });
  const [stackingSheets, setStackingSheets] = useState<{ name: string; url: string }[]>([]);

  const parseStacking = (config?: string): { name: string; url: string }[] => {
    if (!config) return [];
    try { return JSON.parse(config); } catch { return []; }
  };

  useEffect(() => {
    if (!openStackingId) return;
    const handler = () => setOpenStackingId(null);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [openStackingId]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [daRes, plRes] = await Promise.all([
        fetch('/api/du-an'), fetch('/api/pipeline'),
      ]);
      const [daData, plData] = await Promise.all([daRes.json(), plRes.json()]);
      if (daData.success) {
        setProjects(daData.data);
        // Tự động mở rộng tất cả CDT lần đầu
        const cdtSet = new Set<string>(
          (daData.data as DuAn[]).map(d => d.chu_dau_tu?.trim() || 'Chưa phân loại')
        );
        setExpandedCDT(cdtSet);
      }
      if (plData.success) setPipelines(plData.data);
    } catch (err) {
      console.error('Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Stats per project
  const getProjectStats = (idDuAn: string) => {
    const deals = pipelines.filter(pl => pl.id_du_an === idDuAn);
    const daKy = deals.filter(pl => pl.giai_doan === 'Ký HĐ');
    return { totalDeals: deals.length, signedDeals: daKy.length };
  };

  // ── Danh sách CDT cho dropdown (dựa trên hien_thi) ───────────────────────
  const baseProjects = showHidden ? projects : projects.filter(p => p.hien_thi === 1);

  const allCDT = Array.from(
    new Set(baseProjects.map(p => p.chu_dau_tu?.trim() || 'Chưa phân loại'))
  ).sort((a, b) => {
    if (a === 'Chưa phân loại') return 1;
    if (b === 'Chưa phân loại') return -1;
    return a.localeCompare(b, 'vi');
  });

  // Dự án cho dropdown lọc theo dự án — cascade theo CDT đang chọn
  const duAnOptions = baseProjects.filter(p =>
    !filterCDT || (p.chu_dau_tu?.trim() || 'Chưa phân loại') === filterCDT
  );

  // ── Apply filters ─────────────────────────────────────────────────────────
  const filteredProjects = baseProjects.filter(p => {
    if (filterCDT && (p.chu_dau_tu?.trim() || 'Chưa phân loại') !== filterCDT) return false;
    if (filterDuAn && p.id_du_an !== filterDuAn) return false;
    return true;
  });

  const isFiltering = !!(filterCDT || filterDuAn);

  // ── Group by CDT ──────────────────────────────────────────────────────────
  const grouped = filteredProjects.reduce<Record<string, DuAn[]>>((acc, da) => {
    const key = da.chu_dau_tu?.trim() || 'Chưa phân loại';
    if (!acc[key]) acc[key] = [];
    acc[key].push(da);
    return acc;
  }, {});

  const sortedCDT = Object.keys(grouped).sort((a, b) => {
    if (a === 'Chưa phân loại') return 1;
    if (b === 'Chưa phân loại') return -1;
    return a.localeCompare(b, 'vi');
  });

  // Khi đang lọc → tự động mở rộng các CDT có kết quả
  useEffect(() => {
    if (isFiltering) {
      setExpandedCDT(prev => {
        const next = new Set(prev);
        sortedCDT.forEach(cdt => next.add(cdt));
        return next;
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterCDT, filterDuAn]);

  const toggleCDT = (cdt: string) => {
    setExpandedCDT(prev => {
      const next = new Set(prev);
      if (next.has(cdt)) next.delete(cdt);
      else next.add(cdt);
      return next;
    });
  };

  // Khi đổi CDT → reset filterDuAn nếu dự án đó không còn thuộc CDT mới
  const handleFilterCDT = (val: string) => {
    setFilterCDT(val);
    if (filterDuAn) {
      const project = projects.find(p => p.id_du_an === filterDuAn);
      const projectCDT = project?.chu_dau_tu?.trim() || 'Chưa phân loại';
      if (val && projectCDT !== val) setFilterDuAn('');
    }
  };

  const clearFilters = () => { setFilterCDT(''); setFilterDuAn(''); };

  const openCreate = () => {
    setEditingItem(null);
    setForm({ ma_du_an: '', ten_du_an: '', hien_thi: 1, hoa_hong_mac_dinh: 0, link_tai_lieu: '', chu_dau_tu: '', link_du_an: '' });
    setStackingSheets([]);
    setShowModal(true);
  };

  const openEdit = (da: DuAn) => {
    setEditingItem(da);
    setForm({
      ma_du_an: da.ma_du_an,
      ten_du_an: da.ten_du_an,
      hien_thi: da.hien_thi,
      hoa_hong_mac_dinh: da.hoa_hong_mac_dinh,
      link_tai_lieu: da.link_tai_lieu || '',
      chu_dau_tu: da.chu_dau_tu || '',
      link_du_an: da.link_du_an || '',
    });
    setStackingSheets(parseStacking(da.stacking_config));
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.ten_du_an.trim()) return;
    setSaving(true);
    try {
      const method = editingItem ? 'PUT' : 'POST';
      const validSheets = stackingSheets.filter(s => s.name.trim());
      const stacking_config = validSheets.length > 0 ? JSON.stringify(validSheets) : '';
      const body = editingItem
        ? { ...editingItem, ...form, stacking_config }
        : { ...form, stacking_config };
      const res = await fetch('/api/du-an', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = await res.json();
      if (result.success) { setShowModal(false); fetchAll(); }
    } catch (err) {
      console.error('Save error:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      const res = await fetch('/api/du-an', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: deletingId }),
      });
      const result = await res.json();
      if (result.success) { setShowConfirm(false); fetchAll(); }
    } catch (err) {
      console.error('Delete error:', err);
    }
  };

  if (loading || authLoading) {
    return <div className="loading-spinner"><div className="spinner" /></div>;
  }

  return (
    <div>
      {/* ── Header ── */}
      <div className="page-header">
        <div className="page-header-left">
          <h1>Dự án</h1>
          <p>
            {isFiltering
              ? `${filteredProjects.length} / ${baseProjects.length} dự án`
              : `${allCDT.length} chủ đầu tư · ${baseProjects.length} dự án`
            }
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            className={`btn ${showHidden ? 'btn-primary' : 'btn-secondary'} btn-sm`}
            onClick={() => setShowHidden(!showHidden)}
          >
            {showHidden ? <Eye size={14} /> : <EyeOff size={14} />}
            {showHidden ? 'Hiển thị tất cả' : 'Ẩn DA tắt'}
          </button>
          {isAdmin && (
            <button className="btn btn-primary" onClick={openCreate}>
              <Plus size={18} />
              Thêm dự án
            </button>
          )}
        </div>
      </div>

      {/* ── Filter bar ── */}
      <div className="filter-bar">
        <div className="flex items-center gap-2">
          <SlidersHorizontal size={14} style={{ color: 'var(--text-label)' }} />
          <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', fontWeight: 500 }}>Lọc:</span>
        </div>

        {/* Dropdown: Chủ đầu tư */}
        <select
          className="form-select"
          value={filterCDT}
          onChange={(e) => handleFilterCDT(e.target.value)}
        >
          <option value="">Tất cả chủ đầu tư</option>
          {allCDT.map(cdt => (
            <option key={cdt} value={cdt}>{cdt}</option>
          ))}
        </select>

        {/* Dropdown: Dự án — cascade theo CDT */}
        <select
          className="form-select"
          value={filterDuAn}
          onChange={(e) => setFilterDuAn(e.target.value)}
        >
          <option value="">Tất cả dự án</option>
          {duAnOptions.map(da => (
            <option key={da.id_du_an} value={da.id_du_an}>{da.ten_du_an}</option>
          ))}
        </select>

        {/* Nút xóa lọc */}
        {isFiltering && (
          <button className="btn btn-ghost btn-sm" onClick={clearFilters}>
            <X size={14} />Xóa lọc
          </button>
        )}
      </div>

      {/* ── Content ── */}
      {sortedCDT.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <Building2 size={40} />
            <h3>{isFiltering ? 'Không tìm thấy dự án' : 'Chưa có dự án'}</h3>
            <p>{isFiltering ? 'Thử thay đổi bộ lọc' : 'Nhấn "Thêm dự án" để tạo mới'}</p>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {sortedCDT.map(cdt => {
            const daList = grouped[cdt];
            const isOpen = expandedCDT.has(cdt);
            const totalDealsAll = daList.reduce((s, da) => s + getProjectStats(da.id_du_an).totalDeals, 0);
            const signedAll = daList.reduce((s, da) => s + getProjectStats(da.id_du_an).signedDeals, 0);

            return (
              <div key={cdt} className="card" style={{ padding: 0, overflow: 'hidden' }}>

                {/* ── Chủ đầu tư header ── */}
                <button
                  onClick={() => toggleCDT(cdt)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center',
                    gap: 12, padding: '16px 20px',
                    background: 'linear-gradient(135deg, var(--primary-light) 0%, #e0e7ff 100%)',
                    border: 'none', cursor: 'pointer', textAlign: 'left',
                    borderBottom: isOpen ? '1px solid var(--border)' : 'none',
                  }}
                >
                  <div style={{
                    width: 40, height: 40, borderRadius: 'var(--radius-lg)',
                    background: 'var(--primary)', display: 'flex',
                    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <Building2 size={20} color="#fff" />
                  </div>

                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--primary)' }}>
                      {cdt}
                    </div>
                    <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: 2 }}>
                      {daList.length} dự án
                      {isAdmin && (
                        <>
                          &nbsp;·&nbsp;
                          <span style={{ color: 'var(--info-text)' }}>{totalDealsAll} deal</span>
                          &nbsp;·&nbsp;
                          <span style={{ color: 'var(--success-text)' }}>{signedAll} đã ký</span>
                        </>
                      )}
                    </div>
                  </div>

                  <span className="badge badge-primary" style={{ marginRight: 4 }}>
                    {daList.length}
                  </span>
                  {isOpen
                    ? <ChevronDown size={18} color="var(--primary)" />
                    : <ChevronRight size={18} color="var(--primary)" />
                  }
                </button>

                {/* ── Danh sách dự án con ── */}
                {isOpen && (
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                    gap: 16, padding: 20,
                    background: 'var(--bg-secondary)',
                  }}>
                    {daList.map(da => {
                      const stats = getProjectStats(da.id_du_an);
                      return (
                        <div
                          key={da.id_du_an}
                          className="card card-interactive"
                          style={{ margin: 0, opacity: da.hien_thi === 0 ? 0.6 : 1, position: 'relative' }}
                        >
                          {/* Status badge */}
                          <div style={{ position: 'absolute', top: 14, right: 14 }}>
                            <span className={`badge ${da.hien_thi === 1 ? 'badge-success' : 'badge-neutral'}`}>
                              {da.hien_thi === 1 ? 'Đang triển khai' : 'Tạm ngừng'}
                            </span>
                          </div>

                          {/* Project name */}
                          <div style={{ marginBottom: 14, paddingRight: 100 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                              <Layers size={16} color="var(--primary)" style={{ flexShrink: 0 }} />
                              <span style={{ fontWeight: 600, fontSize: '0.9375rem', color: 'var(--text-title)' }}>
                                {da.ten_du_an}
                              </span>
                            </div>
                            {da.link_du_an ? (
                              <div style={{ paddingLeft: 24 }}>
                                <a
                                  href={da.link_du_an}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 4,
                                    fontSize: '0.8rem', color: 'var(--primary)',
                                    textDecoration: 'none',
                                  }}
                                  onMouseOver={e => (e.currentTarget.style.textDecoration = 'underline')}
                                  onMouseOut={e => (e.currentTarget.style.textDecoration = 'none')}
                                >
                                  <ExternalLink size={11} style={{ flexShrink: 0 }} />
                                  {da.link_du_an.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                                </a>
                              </div>
                            ) : (
                              <div style={{ paddingLeft: 24, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                Chưa có website
                              </div>
                            )}
                          </div>

                          {/* Stats — admin only */}
                          {isAdmin && (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
                              <div style={{ padding: '8px 12px', background: 'var(--info-bg)', borderRadius: 'var(--radius-md)' }}>
                                <div style={{ fontSize: '0.625rem', color: 'var(--info-text)', fontWeight: 500, marginBottom: 2 }}>Tổng Deal</div>
                                <div style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--info-text)' }}>{stats.totalDeals}</div>
                              </div>
                              <div style={{ padding: '8px 12px', background: 'var(--success-bg)', borderRadius: 'var(--radius-md)' }}>
                                <div style={{ fontSize: '0.625rem', color: 'var(--success-text)', fontWeight: 500, marginBottom: 2 }}>Đã ký</div>
                                <div style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--success-text)' }}>{stats.signedDeals}</div>
                              </div>
                            </div>
                          )}

                          {/* Actions */}
                          {(() => {
                            const stackingList = parseStacking(da.stacking_config);
                            return (
                              <div className="flex items-center gap-2" style={{ justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                                {da.link_tai_lieu && (
                                  <a
                                    href={da.link_tai_lieu} target="_blank" rel="noopener noreferrer"
                                    className="btn btn-secondary btn-sm" style={{ textDecoration: 'none' }}
                                  >
                                    <ExternalLink size={13} />Tài liệu
                                  </a>
                                )}
                                {stackingList.length > 0 && (
                                  <div style={{ position: 'relative' }}>
                                    <button
                                      className="btn btn-secondary btn-sm"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setOpenStackingId(openStackingId === da.id_du_an ? null : da.id_du_an);
                                      }}
                                      style={{ display: 'flex', alignItems: 'center', gap: 5 }}
                                    >
                                      <LayoutGrid size={13} />
                                      Stacking
                                      <ChevronDown size={11} style={{
                                        transition: 'transform 0.15s',
                                        transform: openStackingId === da.id_du_an ? 'rotate(180deg)' : 'none',
                                      }} />
                                    </button>
                                    {openStackingId === da.id_du_an && (
                                      <div
                                        onClick={(e) => e.stopPropagation()}
                                        style={{
                                          position: 'absolute', bottom: 'calc(100% + 6px)', left: 0,
                                          zIndex: 9999,
                                          backgroundColor: '#ffffff',
                                          border: '1px solid #e2e8f0',
                                          borderRadius: 8,
                                          boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
                                          minWidth: 170, padding: '4px 0',
                                        }}
                                      >
                                        <div style={{
                                          padding: '6px 14px 4px',
                                          fontSize: '0.7rem', fontWeight: 600,
                                          color: '#64748b', textTransform: 'uppercase',
                                          letterSpacing: '0.05em',
                                        }}>
                                          Phân khu Stacking
                                        </div>
                                        {stackingList.map(s => {
                                          // Admin: edit URL (thấy tất cả tab)
                                          // User thường: pubhtml single=true (chỉ thấy đúng tab này)
                                          let href = s.url;
                                          if (!isAdmin) {
                                            const idMatch = s.url.match(/\/spreadsheets\/d\/([^/?#]+)/);
                                            const gidMatch = s.url.match(/[?&#]gid=(\d+)/);
                                            if (idMatch && gidMatch) {
                                              href = `https://docs.google.com/spreadsheets/d/${idMatch[1]}/pubhtml?gid=${gidMatch[1]}&single=true`;
                                            }
                                          }
                                          return (
                                            <a
                                              key={s.name}
                                              href={href}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              style={{
                                                display: 'flex', alignItems: 'center', gap: 8,
                                                padding: '7px 14px',
                                                fontSize: '0.8125rem', color: '#1e293b',
                                                textDecoration: 'none',
                                                backgroundColor: 'transparent',
                                              }}
                                              onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#f1f5f9')}
                                              onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                                            >
                                              <LayoutGrid size={12} color="#6366f1" style={{ flexShrink: 0 }} />
                                              <span style={{ fontWeight: 500 }}>{s.name}</span>
                                            </a>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>
                                )}
                                {isAdmin && (
                                  <>
                                    <button className="btn btn-secondary btn-sm" onClick={() => openEdit(da)}>
                                      <Edit3 size={13} />Sửa
                                    </button>
                                    <button className="btn btn-danger btn-sm"
                                      onClick={() => { setDeletingId(da.id_du_an); setShowConfirm(true); }}>
                                      <Trash2 size={13} />Xóa
                                    </button>
                                  </>
                                )}
                              </div>
                            );
                          })()}

                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Create/Edit Modal ── */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{editingItem ? 'Chỉnh sửa dự án' : 'Thêm dự án mới'}</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowModal(false)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div className="form-group">
                  <label className="form-label">Mã dự án *</label>
                  <input className="form-input" value={form.ma_du_an}
                    onChange={(e) => setForm({ ...form, ma_du_an: e.target.value })}
                    placeholder="VD: DA001" />
                </div>
                <div className="form-group">
                  <label className="form-label">Tên dự án *</label>
                  <input className="form-input" value={form.ten_du_an}
                    onChange={(e) => setForm({ ...form, ten_du_an: e.target.value })}
                    placeholder="Tên dự án" />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Chủ đầu tư</label>
                <input className="form-input" value={form.chu_dau_tu}
                  onChange={(e) => setForm({ ...form, chu_dau_tu: e.target.value })}
                  placeholder="VD: Vinhomes, Capitaland..." />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div className="form-group">
                  <label className="form-label">Hoa hồng mặc định</label>
                  <input className="form-input" type="number" step="0.01"
                    value={form.hoa_hong_mac_dinh}
                    onChange={(e) => {
                      let value = parseFloat(e.target.value) || 0;
                      if (value > 1) value = value / 100;
                      setForm({ ...form, hoa_hong_mac_dinh: value });
                    }}
                    placeholder="VD: 3 (%) hoặc 0.03" />
                </div>
                <div className="form-group">
                  <label className="form-label">Hiển thị</label>
                  <select className="form-select" value={form.hien_thi}
                    onChange={(e) => setForm({ ...form, hien_thi: parseInt(e.target.value) })}>
                    <option value={1}>Đang triển khai</option>
                    <option value={0}>Tạm ngừng</option>
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Website dự án</label>
                <input className="form-input" value={form.link_du_an}
                  onChange={(e) => setForm({ ...form, link_du_an: e.target.value })}
                  placeholder="https://vinhomes.vn/..." />
              </div>
              <div className="form-group">
                <label className="form-label">Link tài liệu nội bộ</label>
                <input className="form-input" value={form.link_tai_lieu}
                  onChange={(e) => setForm({ ...form, link_tai_lieu: e.target.value })}
                  placeholder="https://drive.google.com/..." />
              </div>

              {/* Stacking config */}
              <div className="form-group">
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <LayoutGrid size={14} color="var(--primary)" />
                  Phân khu Stacking
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {stackingSheets.map((s, i) => (
                    <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input
                        className="form-input"
                        style={{ width: 90, flexShrink: 0 }}
                        placeholder="Tên PK"
                        value={s.name}
                        onChange={(e) => {
                          const next = [...stackingSheets];
                          next[i] = { ...next[i], name: e.target.value };
                          setStackingSheets(next);
                        }}
                      />
                      <input
                        className="form-input"
                        style={{ flex: 1 }}
                        placeholder="URL Google Sheet (có gid)"
                        value={s.url}
                        onChange={(e) => {
                          const next = [...stackingSheets];
                          next[i] = { ...next[i], url: e.target.value };
                          setStackingSheets(next);
                        }}
                      />
                      <button
                        className="btn btn-ghost btn-icon"
                        type="button"
                        onClick={() => setStackingSheets(stackingSheets.filter((_, idx) => idx !== i))}
                        style={{ flexShrink: 0 }}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                  <button
                    className="btn btn-secondary btn-sm"
                    type="button"
                    onClick={() => setStackingSheets([...stackingSheets, { name: '', url: '' }])}
                    style={{ alignSelf: 'flex-start' }}
                  >
                    <Plus size={13} />
                    Thêm phân khu
                  </button>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Hủy</button>
              <button className="btn btn-primary" onClick={handleSave}
                disabled={saving || !form.ten_du_an.trim()}>
                {saving ? 'Đang lưu...' : (editingItem ? 'Cập nhật' : 'Thêm mới')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm Delete ── */}
      {showConfirm && (
        <div className="confirm-overlay" onClick={() => setShowConfirm(false)}>
          <div className="confirm-box" onClick={(e) => e.stopPropagation()}>
            <h3>Xác nhận xóa</h3>
            <p>Bạn có chắc muốn xóa dự án này? Các deal liên quan sẽ không bị ảnh hưởng.</p>
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
