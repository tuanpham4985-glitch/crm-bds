'use client';
import { useState } from 'react';
import {
  X, Loader2, ThumbsUp, ThumbsDown, RotateCcw,
  AlertCircle, Pencil, Save, XCircle,
} from 'lucide-react';
import { useTmStore } from '@/stores/tmStore';
import {
  useTaskDetail, apiUpdateTaskStatus, apiApproveTask, apiRejectTask,
  apiUpdateTask, useTmUsers,
} from '@/hooks/tm/useTasks';
import { StatusBadge, PriorityBadge, ProgressBar, ApprovalBadge } from './StatusBadge';
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

const TABS = [
  { id: 'detail',    label: 'Chi tiết'  },
  { id: 'checklist', label: 'Checklist' },
  { id: 'subtasks',  label: 'Việc con'  },
  { id: 'comments',  label: 'Bình luận' },
  { id: 'activity',  label: 'Lịch sử'  },
];

const PREDEFINED_TAGS = [
  'Gọi điện', 'Email', 'Họp', 'Báo cáo',
  'Tư vấn', 'Chăm sóc KH', 'Thu thập data',
  'Sự kiện', 'Đàm phán', 'Hợp đồng',
];

function formatDate(d: string) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

const FIELD: React.CSSProperties = {
  width: '100%', padding: '7px 10px', borderRadius: 7,
  border: '1.5px solid var(--border-light)', fontSize: 13,
  background: 'var(--bg-page)', outline: 'none', boxSizing: 'border-box',
  color: 'var(--text-body)',
};

export default function TaskDetail() {
  const {
    selectedTaskId, sidebarOpen, closeSidebar,
    rejectModalOpen, openRejectModal, closeRejectModal,
  } = useTmStore();

  const [activeTab, setActiveTab]     = useState('detail');
  const [transitioning, setTrans]     = useState(false);
  const [approving, setApproving]     = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectErr, setRejectErr]     = useState('');
  const [editing, setEditing]         = useState(false);
  const [saving, setSaving]           = useState(false);
  const [saveErr, setSaveErr]         = useState('');
  const [editForm, setEditForm]       = useState<Record<string, unknown>>({});

  const { task, isLoading, error, revalidate } = useTaskDetail(selectedTaskId ?? null);
  const { users, userMap } = useTmUsers();

  if (!sidebarOpen || !selectedTaskId) return null;

  const resolveName = (id: string) => userMap[id] || id || '—';

  function startEdit() {
    if (!task) return;
    let tags: string[] = [];
    try { tags = JSON.parse(task.tags || '[]'); } catch { tags = []; }
    setEditForm({
      title:       task.title,
      objective:   task.objective ?? '',
      description: task.description ?? '',
      owner_id:    task.owner_id ?? '',
      priority:    task.priority,
      due_date:    task.due_date ?? '',
      progress_pct: task.progress_pct ?? 0,
      tags,
    });
    setSaveErr('');
    setEditing(true);
  }

  function setField(k: string, v: unknown) {
    setEditForm(f => ({ ...f, [k]: v }));
  }

  function toggleEditTag(tag: string) {
    setEditForm(f => {
      const prev = (f.tags as string[]) ?? [];
      return { ...f, tags: prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag] };
    });
  }

  async function saveEdit() {
    if (!task) return;
    const payload: Record<string, unknown> = { ...editForm };
    if (Array.isArray(payload.tags)) payload.tags = payload.tags;
    if (!String(payload.title ?? '').trim()) { setSaveErr('Tiêu đề không được để trống'); return; }
    setSaving(true);
    setSaveErr('');
    try {
      await apiUpdateTask(task.task_id, payload);
      await revalidate();
      setEditing(false);
    } catch (e: unknown) {
      setSaveErr(e instanceof Error ? e.message : 'Lưu thất bại');
    } finally {
      setSaving(false);
    }
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
      closeRejectModal();
      setRejectReason('');
      await revalidate();
    } finally { setApproving(false); }
  }

  const isOverdue = task && !['completed', 'closed'].includes(task.status)
    && task.due_date && task.due_date < new Date().toISOString().slice(0, 10);

  const editTags = (editForm.tags as string[]) ?? [];

  return (
    <>
      {/* Backdrop */}
      <div onClick={closeSidebar} style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,0.25)' }} />

      {/* Slide-over panel */}
      <div style={{
        position: 'fixed', right: 0, top: 0, bottom: 0, zIndex: 600,
        width: 'min(620px, 96vw)', background: 'var(--bg-card)',
        borderLeft: '1.5px solid var(--border-light)',
        boxShadow: '-8px 0 32px rgba(0,0,0,0.12)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>

        {/* Header */}
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border-lighter)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {task && <StatusBadge status={task.status} />}
          {task && <PriorityBadge priority={task.priority} />}
          <div style={{ flex: 1 }} />
          {task && !editing && (
            <button onClick={startEdit} title="Chỉnh sửa" style={{
              display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px',
              borderRadius: 7, border: '1.5px solid var(--border-light)',
              background: 'transparent', cursor: 'pointer', fontSize: 12, fontWeight: 600,
              color: 'var(--text-muted)',
            }}>
              <Pencil size={13} /> Chỉnh sửa
            </button>
          )}
          {editing && (
            <>
              <button onClick={() => { setSaveErr(''); setEditing(false); }} style={{
                display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px',
                borderRadius: 7, border: '1.5px solid var(--border-light)',
                background: 'transparent', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                color: 'var(--text-muted)',
              }}>
                <XCircle size={13} /> Hủy
              </button>
              <button onClick={saveEdit} disabled={saving} style={{
                display: 'flex', alignItems: 'center', gap: 4, padding: '5px 14px',
                borderRadius: 7, border: 'none',
                background: 'var(--primary)', color: '#fff',
                cursor: saving ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 700,
                opacity: saving ? 0.7 : 1,
              }}>
                {saving ? <Loader2 size={13} className="tm-spin" /> : <Save size={13} />} Lưu
              </button>
            </>
          )}
          <button onClick={closeSidebar} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, marginLeft: 4 }}>
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
            {/* Title area */}
            <div style={{ padding: '12px 18px 0', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>{task.task_code}</span>
                {isOverdue && <span style={{ fontSize: 11, color: '#dc2626', fontWeight: 700 }}>⚠ Quá hạn</span>}
              </div>
              {editing ? (
                <input
                  value={String(editForm.title ?? '')}
                  onChange={e => setField('title', e.target.value)}
                  style={{ ...FIELD, fontSize: 16, fontWeight: 700, marginBottom: 10, height: 40 }}
                  placeholder="Tiêu đề công việc"
                />
              ) : (
                <h2 style={{ margin: '0 0 10px', fontSize: 17, fontWeight: 700, color: 'var(--text-title)', lineHeight: 1.4 }}>{task.title}</h2>
              )}

              {/* Progress (editable inline always) */}
              {(task.progress_pct > 0 || editing) && !editing && (
                <div style={{ marginBottom: 10 }}>
                  <ProgressBar pct={task.progress_pct} />
                </div>
              )}
              {editing && (
                <div style={{ marginBottom: 10 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
                    Tiến độ: {Number(editForm.progress_pct ?? 0)}%
                  </label>
                  <input
                    type="range" min={0} max={100} step={5}
                    value={Number(editForm.progress_pct ?? 0)}
                    onChange={e => setField('progress_pct', Number(e.target.value))}
                    style={{ width: '100%' }}
                  />
                </div>
              )}
            </div>

            {/* Action buttons (only when not editing) */}
            {!editing && (
              <div style={{ padding: '0 18px 12px', display: 'flex', gap: 8, flexWrap: 'wrap', flexShrink: 0 }}>
                {((TRANSITIONS as Record<string, TaskStatus[]>)[task.status] ?? []).map((next: TaskStatus) => (
                  <button key={next} onClick={() => handleTransition(next)} disabled={transitioning} style={{
                    padding: '6px 14px', borderRadius: 8, border: '1.5px solid var(--primary)',
                    background: 'var(--primary)', color: '#fff', cursor: 'pointer',
                    fontSize: 12, fontWeight: 700,
                    display: 'flex', alignItems: 'center', gap: 4,
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
            )}

            {/* Tabs */}
            <div style={{ display: 'flex', padding: '0 18px', borderBottom: '1px solid var(--border-lighter)', flexShrink: 0, overflowX: 'auto' }}>
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
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px' }}>

              {activeTab === 'detail' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

                  {saveErr && (
                    <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#dc2626' }}>
                      {saveErr}
                    </div>
                  )}

                  {/* Objective */}
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Mục tiêu</label>
                    {editing ? (
                      <input
                        value={String(editForm.objective ?? '')}
                        onChange={e => setField('objective', e.target.value)}
                        style={FIELD}
                        placeholder="Kết quả đo được, ví dụ: Chốt 2 hợp đồng"
                      />
                    ) : (
                      <span style={{ fontSize: 13, color: 'var(--text-body)' }}>{task.objective || '—'}</span>
                    )}
                  </div>

                  {/* Description */}
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Mô tả</label>
                    {editing ? (
                      <textarea
                        value={String(editForm.description ?? '')}
                        onChange={e => setField('description', e.target.value)}
                        rows={4}
                        style={{ ...FIELD, height: 'auto', resize: 'vertical' }}
                        placeholder="Hướng dẫn, context, link tài liệu..."
                      />
                    ) : (
                      <p style={{ fontSize: 13, color: 'var(--text-body)', margin: 0, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{task.description || '—'}</p>
                    )}
                  </div>

                  {/* Grid fields */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>

                    {/* Priority */}
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Độ ưu tiên</label>
                      {editing ? (
                        <select
                          value={String(editForm.priority ?? 'medium')}
                          onChange={e => setField('priority', e.target.value)}
                          style={{ ...FIELD, height: 36 }}
                        >
                          {PRIORITY_OPTIONS.map(o => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                      ) : (
                        <PriorityBadge priority={task.priority} />
                      )}
                    </div>

                    {/* Deadline */}
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Deadline</label>
                      {editing ? (
                        <input
                          type="date"
                          value={String(editForm.due_date ?? '')}
                          onChange={e => setField('due_date', e.target.value)}
                          style={{ ...FIELD, height: 36 }}
                        />
                      ) : (
                        <span style={{ fontSize: 13, color: isOverdue ? '#dc2626' : 'var(--text-body)', fontWeight: isOverdue ? 700 : 400 }}>
                          {formatDate(task.due_date)}
                        </span>
                      )}
                    </div>

                    {/* Người giao (created_by — read-only) */}
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Người giao</label>
                      <span style={{ fontSize: 13, color: 'var(--text-body)' }}>{resolveName(task.created_by)}</span>
                    </div>

                    {/* Người thực hiện (owner_id — editable) */}
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Người thực hiện</label>
                      {editing ? (
                        <select
                          value={String(editForm.owner_id ?? '')}
                          onChange={e => setField('owner_id', e.target.value)}
                          style={{ ...FIELD, height: 36 }}
                        >
                          <option value="">— Chưa phân công —</option>
                          {users.map(u => (
                            <option key={u.user_id} value={u.user_id}>
                              {u.full_name}{u.position ? ` (${u.position})` : ''}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span style={{ fontSize: 13, color: task.owner_id ? 'var(--text-body)' : 'var(--text-muted)' }}>
                          {task.owner_id ? resolveName(task.owner_id) : '— Chưa phân công'}
                        </span>
                      )}
                    </div>

                    {/* Phòng ban */}
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Phòng ban</label>
                      <span style={{ fontSize: 13, color: 'var(--text-body)' }}>{task.department_id || '—'}</span>
                    </div>

                    {/* Dự án */}
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Dự án</label>
                      <span style={{ fontSize: 13, color: 'var(--text-body)' }}>{task.project_id || '—'}</span>
                    </div>
                  </div>

                  {/* Tags */}
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Tags</label>
                    {editing ? (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {PREDEFINED_TAGS.map(tag => (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => toggleEditTag(tag)}
                            style={{
                              padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                              border: `1.5px solid ${editTags.includes(tag) ? 'var(--primary)' : 'var(--border-light)'}`,
                              background: editTags.includes(tag) ? 'var(--primary)' : 'var(--bg-page)',
                              color: editTags.includes(tag) ? '#fff' : 'var(--text-muted)',
                              cursor: 'pointer', transition: 'all 0.15s',
                            }}
                          >
                            {tag}
                          </button>
                        ))}
                      </div>
                    ) : (() => {
                      try {
                        const tags = JSON.parse(task.tags || '[]') as string[];
                        return tags.length > 0 ? (
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {tags.map(t => (
                              <span key={t} style={{ padding: '3px 10px', borderRadius: 20, background: 'var(--bg-page)', border: '1px solid var(--border-light)', fontSize: 12 }}>{t}</span>
                            ))}
                          </div>
                        ) : <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>—</span>;
                      } catch { return <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>—</span>; }
                    })()}
                  </div>

                  {/* Approval */}
                  {!editing && (
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Phê duyệt</label>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {[1, 2, 3].map(l => {
                          const status = (task as Record<string, unknown>)[`approval_level${l}_status`] as string ?? 'not_required';
                          return <ApprovalBadge key={l} level={l} status={status} />;
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'checklist' && <ChecklistPanel taskId={task.task_id} />}
              {activeTab === 'subtasks'  && <SubtaskList    taskId={task.task_id} />}
              {activeTab === 'comments'  && <CommentSection  taskId={task.task_id} />}
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
            <textarea
              autoFocus
              value={rejectReason}
              onChange={e => { setRejectReason(e.target.value); setRejectErr(''); }}
              placeholder="Nhập lý do từ chối task này..."
              rows={4}
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
