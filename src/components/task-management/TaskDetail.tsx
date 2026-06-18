'use client';
import { useState, useRef, useCallback } from 'react';
import { X, Loader2, ThumbsUp, ThumbsDown, RotateCcw, AlertCircle } from 'lucide-react';
import { useTmStore } from '@/stores/tmStore';
import {
  useTaskDetail, apiUpdateTaskStatus, apiApproveTask, apiRejectTask,
  apiUpdateTask, useTmUsers, useTmDepartments, useTmProjects, useCurrentTmUser,
} from '@/hooks/tm/useTasks';
import { StatusBadge, PriorityBadge, ProgressBar } from './StatusBadge';
import ChecklistPanel from './ChecklistPanel';
import SubtaskList from './SubtaskList';
import CommentSection from './CommentSection';
import ActivityTimeline from './ActivityTimeline';
import type { TaskStatus, TaskPriority } from '@/lib/task-management/types';

const TRANSITIONS: Partial<Record<TaskStatus, TaskStatus[]>> = {
  todo:       ['inprogress'],
  inprogress: ['waiting', 'review', 'completed'],
  waiting:    ['inprogress'],
  review:     ['inprogress', 'completed'],
  completed:  ['closed'],
  closed:     [],
};

const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: 'Chờ làm', inprogress: 'Đang làm', waiting: 'Đang chờ',
  review: 'Chờ duyệt', completed: 'Hoàn thành', closed: 'Đã đóng',
};

const PRIORITY_OPTIONS: { value: TaskPriority; label: string }[] = [
  { value: 'critical', label: '🔴 Khẩn cấp' },
  { value: 'high',     label: '🟠 Cao' },
  { value: 'medium',   label: '🔵 Trung bình' },
  { value: 'low',      label: '🟢 Thấp' },
];

const PREDEFINED_TAGS = [
  'Gọi điện', 'Email', 'Họp', 'Báo cáo',
  'Tư vấn', 'Chăm sóc KH', 'Thu thập data',
  'Sự kiện', 'Đàm phán', 'Hợp đồng',
];

const TABS = [
  { id: 'detail',    label: 'Chi tiết'  },
  { id: 'checklist', label: 'Checklist' },
  { id: 'subtasks',  label: 'Việc con'  },
  { id: 'comments',  label: 'Bình luận' },
  { id: 'activity',  label: 'Lịch sử'  },
];

function formatDate(d: string) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

const LABEL: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, color: 'var(--text-muted)',
  textTransform: 'uppercase', letterSpacing: 0.4, display: 'block', marginBottom: 4,
};

const SELECT_STYLE: React.CSSProperties = {
  width: '100%', height: 34, padding: '0 8px', borderRadius: 7,
  border: '1.5px solid var(--primary)', fontSize: 13,
  background: 'var(--bg-page)', outline: 'none', color: 'var(--text-body)',
  cursor: 'pointer',
};

// ── Approval info ─────────────────────────────────────────

const APPROVAL_LEVEL_LABEL: Record<number, string> = {
  1: 'Team Leader duyệt',
  2: 'Trưởng phòng duyệt',
  3: 'Giám đốc duyệt',
};

const APPROVAL_STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  not_required: { bg: '#f1f5f9', color: '#64748b', label: 'Không cần duyệt' },
  pending:      { bg: '#fffbeb', color: '#b45309', label: 'Chờ phê duyệt' },
  approved:     { bg: '#f0fdf4', color: '#15803d', label: '✓ Đã duyệt' },
  rejected:     { bg: '#fef2f2', color: '#dc2626', label: '✗ Đã từ chối' },
};

function ApprovalInfo({
  task,
  onSave,
}: {
  task: { approval_level: 1 | 2 | 3; approval_status: string; rejection_reason?: string };
  onSave: (field: string, value: unknown) => Promise<void>;
}) {
  const level  = Number(task.approval_level) || 0;
  // Nếu level > 0 mà status vẫn là not_required (dữ liệu cũ) → hiện pending
  const rawStatus = task.approval_status || 'not_required';
  const status = (level > 0 && rawStatus === 'not_required') ? 'pending' : rawStatus;
  const style  = APPROVAL_STATUS_STYLE[status] ?? APPROVAL_STATUS_STYLE.not_required;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* Status badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{
          padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700,
          background: style.bg, color: style.color,
        }}>
          {style.label}
        </span>
        {level > 0 && (
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            — {APPROVAL_LEVEL_LABEL[level] ?? `Cấp ${level}`}
          </span>
        )}
      </div>

      {/* Rejection reason */}
      {status === 'rejected' && task.rejection_reason && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#991b1b' }}>
          <strong>Lý do:</strong> {task.rejection_reason}
        </div>
      )}

      {/* Change approval level */}
      <select
        defaultValue={String(level)}
        onChange={e => {
          const v = Number(e.target.value);
          onSave('approval_level', v || null);
          onSave('approval_status', v ? 'pending' : 'not_required');
        }}
        style={{
          height: 30, padding: '0 8px', borderRadius: 7, fontSize: 12,
          border: '1.5px solid var(--border-light)', background: 'var(--bg-page)',
          color: 'var(--text-muted)', cursor: 'pointer', width: 'fit-content',
        }}
      >
        <option value="0">Không cần phê duyệt</option>
        <option value="1">Cấp 1 — Team Leader duyệt</option>
        <option value="2">Cấp 2 — Trưởng phòng duyệt</option>
        <option value="3">Cấp 3 — Giám đốc duyệt</option>
      </select>
    </div>
  );
}

// ── Inline text editor ─────────────────────────────────────

function InlineText({
  value, placeholder, multiline, onSave,
}: {
  value: string;
  placeholder?: string;
  multiline?: boolean;
  onSave: (v: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLTextAreaElement & HTMLInputElement>(null);

  function startEdit() { setDraft(value); setEditing(true); setTimeout(() => ref.current?.focus(), 0); }

  async function handleBlur() {
    if (draft === value) { setEditing(false); return; }
    setSaving(true);
    try { await onSave(draft); } finally { setSaving(false); setEditing(false); }
  }

  const commonStyle: React.CSSProperties = {
    width: '100%', padding: '6px 8px', borderRadius: 7, fontSize: 13,
    border: '1.5px solid var(--primary)', background: 'var(--bg-page)',
    outline: 'none', color: 'var(--text-body)', resize: 'vertical',
    fontFamily: 'inherit', boxSizing: 'border-box',
  };

  if (editing) {
    return multiline ? (
      <textarea ref={ref as React.Ref<HTMLTextAreaElement>} value={draft} onChange={e => setDraft(e.target.value)}
        onBlur={handleBlur} rows={3} style={commonStyle} />
    ) : (
      <input ref={ref as React.Ref<HTMLInputElement>} value={draft} onChange={e => setDraft(e.target.value)}
        onBlur={handleBlur} style={{ ...commonStyle, height: 34 }} />
    );
  }

  return (
    <div onClick={startEdit} title="Click để chỉnh sửa" style={{
      fontSize: 13, color: value ? 'var(--text-body)' : 'var(--text-muted)',
      cursor: 'text', padding: '4px 6px', borderRadius: 6, minHeight: 28,
      border: '1.5px solid transparent',
      transition: 'border-color 0.15s, background 0.15s',
    }}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border-light)'; (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-page)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'transparent'; (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
    >
      {saving ? <Loader2 size={12} className="tm-spin" style={{ color: 'var(--text-muted)' }} /> : (value || <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>{placeholder ?? 'Click để nhập...'}</span>)}
    </div>
  );
}

// ── Inline select ──────────────────────────────────────────

function InlineSelect({
  value, options, placeholder, onSave, displayValue,
}: {
  value: string;
  options: { value: string; label: string }[];
  placeholder?: string;
  onSave: (v: string) => Promise<void>;
  displayValue?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const v = e.target.value;
    setOpen(false);
    if (v === value) return;
    setSaving(true);
    try { await onSave(v); } finally { setSaving(false); }
  }

  if (saving) return <Loader2 size={14} className="tm-spin" style={{ color: 'var(--primary)' }} />;

  if (open) {
    return (
      <select autoFocus value={value} onChange={handleChange} onBlur={() => setOpen(false)} style={SELECT_STYLE}>
        {placeholder && <option value="">{placeholder}</option>}
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    );
  }

  return (
    <div onClick={() => setOpen(true)} title="Click để thay đổi" style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer',
      padding: '3px 8px', borderRadius: 6, border: '1.5px solid transparent',
      transition: 'border-color 0.15s, background 0.15s',
    }}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border-light)'; (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-page)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'transparent'; (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
    >
      {displayValue ?? <span style={{ fontSize: 13, color: value ? 'var(--text-body)' : 'var(--text-muted)', fontStyle: value ? 'normal' : 'italic' }}>{value ? (options.find(o => o.value === value)?.label ?? value) : (placeholder ?? '—')}</span>}
      <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>▾</span>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────

export default function TaskDetail() {
  const {
    selectedTaskId, sidebarOpen, closeSidebar,
    rejectModalOpen, openRejectModal, closeRejectModal,
  } = useTmStore();

  const [activeTab, setActiveTab]       = useState('detail');
  const [transitioning, setTrans]       = useState(false);
  const [approving, setApproving]       = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectErr, setRejectErr]       = useState('');
  const [tagsOpen, setTagsOpen]         = useState(false);
  const [savingTags, setSavingTags]     = useState(false);

  const { task, isLoading, error, revalidate } = useTaskDetail(selectedTaskId ?? null);
  const { users, userMap } = useTmUsers();
  const departments = useTmDepartments();
  const projects    = useTmProjects();
  const currentUser = useCurrentTmUser();

  const save = useCallback(async (field: string, value: unknown) => {
    if (!task) return;
    await apiUpdateTask(task.task_id, { [field]: value });
    await revalidate();
  }, [task, revalidate]);

  if (!sidebarOpen || !selectedTaskId) return null;

  const resolveName = (id: string) => userMap[id] || id || '—';

  const userOptions    = users.map(u => ({ value: u.user_id, label: u.full_name + (u.position ? ` (${u.position})` : '') }));
  const deptOptions    = departments.map(d => ({ value: d.dept_id, label: d.name }));
  const projectOptions = projects.map(p => ({ value: p.project_id, label: p.name }));

  const isOverdue = task && !['completed', 'closed'].includes(task.status)
    && task.due_date && task.due_date < new Date().toISOString().slice(0, 10);

  let currentTags: string[] = [];
  try { currentTags = JSON.parse(task?.tags || '[]'); } catch { currentTags = []; }

  async function toggleTag(tag: string) {
    if (!task) return;
    setSavingTags(true);
    const next = currentTags.includes(tag)
      ? currentTags.filter(t => t !== tag)
      : [...currentTags, tag];
    try { await apiUpdateTask(task.task_id, { tags: next }); await revalidate(); }
    finally { setSavingTags(false); }
  }

  async function handleTransition(newStatus: TaskStatus) {
    if (!task) return;
    setTrans(true);
    try { await apiUpdateTaskStatus(task.task_id, newStatus); await revalidate(); }
    finally { setTrans(false); }
  }

  async function handleApprove() {
    if (!task) return;
    setApproving(true);
    try { await apiApproveTask(task.task_id); await revalidate(); }
    finally { setApproving(false); }
  }

  async function handleReject() {
    if (!rejectReason.trim()) { setRejectErr('Vui lòng nhập lý do từ chối'); return; }
    if (!task) return;
    setApproving(true);
    try {
      await apiRejectTask(task.task_id, rejectReason);
      closeRejectModal(); setRejectReason('');
      await revalidate();
    } finally { setApproving(false); }
  }

  return (
    <>
      <div onClick={closeSidebar} style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,0.25)' }} />

      <div style={{
        position: 'fixed', right: 0, top: 0, bottom: 0, zIndex: 600,
        width: 'min(620px, 96vw)', background: 'var(--bg-card)',
        borderLeft: '1.5px solid var(--border-light)',
        boxShadow: '-8px 0 32px rgba(0,0,0,0.12)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>

        {/* Header */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-lighter)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {task && <StatusBadge status={task.status} />}
          {task && (
            <InlineSelect
              value={task.priority}
              options={PRIORITY_OPTIONS}
              onSave={v => save('priority', v)}
              displayValue={<PriorityBadge priority={task.priority} />}
            />
          )}
          <div style={{ flex: 1 }} />
          <button onClick={closeSidebar} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        {isLoading && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
            <Loader2 size={24} className="tm-spin" style={{ color: 'var(--text-muted)' }} />
          </div>
        )}
        {!isLoading && (error || !task) && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 60, gap: 8 }}>
            <AlertCircle size={28} color="#dc2626" />
            <span style={{ fontSize: 14, color: '#dc2626', fontWeight: 600 }}>
              {error ? error.message : 'Không tìm thấy công việc'}
            </span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Bạn không có quyền xem hoặc task không tồn tại</span>
          </div>
        )}

        {task && (
          <>
            {/* Title */}
            <div style={{ padding: '10px 16px 0', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>{task.task_code}</span>
                {isOverdue && <span style={{ fontSize: 11, color: '#dc2626', fontWeight: 700 }}>⚠ Quá hạn</span>}
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-title)', lineHeight: 1.4, marginBottom: 6 }}>
                <InlineText value={task.title} placeholder="Tiêu đề công việc" onSave={v => save('title', v)} />
              </div>
              {task.progress_pct > 0 && (
                <div style={{ marginBottom: 8 }}>
                  <ProgressBar pct={task.progress_pct} />
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div style={{ padding: '0 16px 10px', display: 'flex', gap: 8, flexWrap: 'wrap', flexShrink: 0 }}>
              {((TRANSITIONS as Record<string, TaskStatus[]>)[task.status] ?? []).map((next: TaskStatus) => (
                <button key={next} onClick={() => handleTransition(next)} disabled={transitioning} style={{
                  padding: '6px 14px', borderRadius: 8, border: '1.5px solid var(--primary)',
                  background: 'var(--primary)', color: '#fff', cursor: 'pointer',
                  fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4,
                  opacity: transitioning ? 0.6 : 1,
                }}>
                  {transitioning ? <Loader2 size={12} className="tm-spin" /> : <RotateCcw size={12} />}
                  → {STATUS_LABELS[next]}
                </button>
              ))}
              {task.status === 'review' && (
                <>
                  <button onClick={handleApprove} disabled={approving} style={{
                    padding: '6px 14px', borderRadius: 8, border: '1.5px solid #16a34a',
                    background: '#f0fdf4', color: '#16a34a', cursor: 'pointer',
                    fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4,
                  }}>
                    {approving ? <Loader2 size={12} className="tm-spin" /> : <ThumbsUp size={12} />} Duyệt
                  </button>
                  <button onClick={() => openRejectModal(task.task_id)} style={{
                    padding: '6px 14px', borderRadius: 8, border: '1.5px solid #dc2626',
                    background: '#fef2f2', color: '#dc2626', cursor: 'pointer',
                    fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4,
                  }}>
                    <ThumbsDown size={12} /> Từ chối
                  </button>
                </>
              )}
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', padding: '0 16px', borderBottom: '1px solid var(--border-lighter)', flexShrink: 0, overflowX: 'auto' }}>
              {TABS.map(tab => (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
                  padding: '8px 14px', border: 'none', background: 'none', cursor: 'pointer',
                  fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap',
                  color: activeTab === tab.id ? 'var(--primary)' : 'var(--text-muted)',
                  borderBottom: `2px solid ${activeTab === tab.id ? 'var(--primary)' : 'transparent'}`,
                }}>
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px' }}>

              {activeTab === 'detail' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

                  {/* Mục tiêu */}
                  <div>
                    <span style={LABEL}>Mục tiêu</span>
                    <InlineText value={task.objective ?? ''} placeholder="Kết quả đo được, vd: Chốt 2 hợp đồng" onSave={v => save('objective', v)} />
                  </div>

                  {/* Mô tả */}
                  <div>
                    <span style={LABEL}>Mô tả</span>
                    <InlineText value={task.description ?? ''} placeholder="Hướng dẫn, context, link tài liệu..." multiline onSave={v => save('description', v)} />
                  </div>

                  {/* Grid: 2 cột */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>

                    {/* Tiến độ */}
                    <div style={{ gridColumn: '1 / -1' }}>
                      <span style={LABEL}>Tiến độ — {task.progress_pct ?? 0}%</span>
                      <input
                        type="range" min={0} max={100} step={5}
                        defaultValue={task.progress_pct ?? 0}
                        style={{ width: '100%' }}
                        onMouseUp={e => save('progress_pct', Number((e.target as HTMLInputElement).value))}
                        onTouchEnd={e => save('progress_pct', Number((e.target as HTMLInputElement).value))}
                      />
                    </div>

                    {/* Deadline */}
                    <div>
                      <span style={LABEL}>Deadline</span>
                      <input
                        type="date"
                        defaultValue={task.due_date ?? ''}
                        onChange={e => save('due_date', e.target.value)}
                        style={{
                          width: '100%', height: 34, padding: '0 8px', borderRadius: 7,
                          border: `1.5px solid ${isOverdue ? '#fca5a5' : 'var(--border-light)'}`,
                          fontSize: 13, background: 'var(--bg-page)', outline: 'none',
                          color: isOverdue ? '#dc2626' : 'var(--text-body)',
                        }}
                      />
                    </div>

                    {/* Độ ưu tiên */}
                    <div>
                      <span style={LABEL}>Độ ưu tiên</span>
                      <select
                        defaultValue={task.priority}
                        onChange={e => save('priority', e.target.value)}
                        style={{ width: '100%', height: 34, padding: '0 8px', borderRadius: 7, border: '1.5px solid var(--border-light)', fontSize: 13, background: 'var(--bg-page)', outline: 'none', color: 'var(--text-body)' }}
                      >
                        {PRIORITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>

                    {/* Người giao — read only */}
                    <div>
                      <span style={LABEL}>Người giao</span>
                      <span style={{ fontSize: 13, color: 'var(--text-body)', display: 'block', padding: '4px 6px' }}>
                        {resolveName(task.created_by)}
                      </span>
                    </div>

                    {/* Người thực hiện — editable select */}
                    <div>
                      <span style={LABEL}>Người thực hiện</span>
                      <InlineSelect
                        value={task.owner_id ?? ''}
                        options={userOptions}
                        placeholder="— Chưa phân công —"
                        onSave={v => save('owner_id', v)}
                      />
                    </div>

                    {/* Phòng ban — editable select */}
                    <div>
                      <span style={LABEL}>Phòng ban</span>
                      <InlineSelect
                        value={task.department_id ?? ''}
                        options={deptOptions}
                        placeholder="— Chọn phòng ban —"
                        onSave={v => save('department_id', v)}
                      />
                    </div>

                    {/* Dự án — editable select */}
                    <div>
                      <span style={LABEL}>Dự án</span>
                      <InlineSelect
                        value={task.project_id ?? ''}
                        options={projectOptions}
                        placeholder="— Chọn dự án —"
                        onSave={v => save('project_id', v)}
                      />
                    </div>
                  </div>

                  {/* Tags */}
                  <div>
                    <span style={LABEL}>Tags {savingTags && <Loader2 size={10} className="tm-spin" style={{ display: 'inline', marginLeft: 4 }} />}</span>
                    <button onClick={() => setTagsOpen(o => !o)} style={{
                      display: 'flex', alignItems: 'center', gap: 4,
                      fontSize: 11, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', marginBottom: 6, padding: 0,
                    }}>
                      {tagsOpen ? '▲ Thu lại' : '▼ Chọn tags'}
                    </button>
                    {tagsOpen && (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                        {PREDEFINED_TAGS.map(tag => (
                          <button key={tag} onClick={() => toggleTag(tag)} style={{
                            padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                            border: `1.5px solid ${currentTags.includes(tag) ? 'var(--primary)' : 'var(--border-light)'}`,
                            background: currentTags.includes(tag) ? 'var(--primary)' : 'var(--bg-page)',
                            color: currentTags.includes(tag) ? '#fff' : 'var(--text-muted)',
                            transition: 'all 0.15s',
                          }}>
                            {tag}
                          </button>
                        ))}
                      </div>
                    )}
                    {currentTags.length > 0 && (
                      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                        {currentTags.map(t => (
                          <span key={t} onClick={() => toggleTag(t)} title="Click để bỏ" style={{
                            padding: '2px 10px', borderRadius: 20,
                            background: 'var(--bg-page)', border: '1px solid var(--border-light)',
                            fontSize: 12, cursor: 'pointer',
                          }}>{t} ×</span>
                        ))}
                      </div>
                    )}
                    {currentTags.length === 0 && !tagsOpen && (
                      <span style={{ fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic' }}>Chưa có tag — click "Chọn tags" để thêm</span>
                    )}
                  </div>

                  {/* Phê duyệt */}
                  <div>
                    <span style={LABEL}>Phê duyệt</span>
                    <ApprovalInfo task={task} onSave={save} />
                  </div>
                </div>
              )}

              {activeTab === 'checklist' && <ChecklistPanel taskId={task.task_id} />}
              {activeTab === 'subtasks'  && <SubtaskList    taskId={task.task_id} />}
              {activeTab === 'comments'  && <CommentSection  taskId={task.task_id} currentUserId={currentUser?.user_id} userMap={userMap} />}
              {activeTab === 'activity'  && <ActivityTimeline taskId={task.task_id} />}
            </div>
          </>
        )}
      </div>

      {/* Reject modal */}
      {rejectModalOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 700, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--bg-card)', borderRadius: 12, padding: 24, width: 400, maxWidth: '90vw', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
            <h3 style={{ margin: '0 0 14px', fontSize: 16, fontWeight: 700, color: 'var(--text-title)' }}>Lý do từ chối</h3>
            <textarea autoFocus value={rejectReason}
              onChange={e => { setRejectReason(e.target.value); setRejectErr(''); }}
              placeholder="Nhập lý do từ chối task này..." rows={4}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: `1.5px solid ${rejectErr ? '#dc2626' : 'var(--border-light)'}`, fontSize: 14, resize: 'vertical', outline: 'none', boxSizing: 'border-box' }}
            />
            {rejectErr && <p style={{ color: '#dc2626', fontSize: 12, margin: '4px 0 0' }}>{rejectErr}</p>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
              <button onClick={() => { closeRejectModal(); setRejectReason(''); setRejectErr(''); }} style={{
                padding: '8px 18px', borderRadius: 8, border: '1.5px solid var(--border-light)',
                cursor: 'pointer', background: 'transparent', fontSize: 14, fontWeight: 600,
              }}>Hủy</button>
              <button onClick={handleReject} disabled={approving} style={{
                padding: '8px 18px', borderRadius: 8, border: 'none', cursor: 'pointer',
                background: '#dc2626', color: '#fff', fontSize: 14, fontWeight: 700,
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                {approving ? <Loader2 size={14} className="tm-spin" /> : null} Xác nhận từ chối
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
