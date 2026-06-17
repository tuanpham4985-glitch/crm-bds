'use client';
import { useState } from 'react';
import { X, ChevronDown, Loader2, ThumbsUp, ThumbsDown, RotateCcw, AlertCircle } from 'lucide-react';
import { useTmStore } from '@/stores/tmStore';
import { useTaskDetail, apiUpdateTaskStatus, apiApproveTask, apiRejectTask } from '@/hooks/tm/useTasks';
import { StatusBadge, PriorityBadge, ProgressBar, ApprovalBadge } from './StatusBadge';
import ChecklistPanel from './ChecklistPanel';
import SubtaskList from './SubtaskList';
import CommentSection from './CommentSection';
import ActivityTimeline from './ActivityTimeline';
import type { TaskStatus } from '@/lib/task-management/types';

const TRANSITIONS: Partial<Record<TaskStatus, TaskStatus[]>> = {
  todo:        ['inprogress'],
  inprogress:  ['waiting', 'review', 'completed'],
  waiting:     ['inprogress'],
  review:      ['inprogress', 'completed'],
  completed:   ['closed'],
  closed:      [],
};

const TABS = [
  { id: 'detail',    label: 'Chi tiết'     },
  { id: 'checklist', label: 'Checklist'    },
  { id: 'subtasks',  label: 'Việc con'     },
  { id: 'comments',  label: 'Bình luận'    },
  { id: 'activity',  label: 'Lịch sử'      },
];

function formatDate(d: string) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default function TaskDetail() {
  const { selectedTaskId, sidebarOpen, closeSidebar, rejectModalOpen, openRejectModal, closeRejectModal } = useTmStore();
  const [activeTab, setActiveTab] = useState('detail');
  const [transitioning, setTransitioning] = useState(false);
  const [approving, setApproving] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectErr, setRejectErr] = useState('');

  const { task, isLoading, error, revalidate } = useTaskDetail(selectedTaskId ?? null);

  if (!sidebarOpen || !selectedTaskId) return null;

  async function handleTransition(newStatus: TaskStatus) {
    if (!task) return;
    setTransitioning(true);
    try {
      await apiUpdateTaskStatus(task.task_id, newStatus);
      await revalidate();
    } finally { setTransitioning(false); }
  }

  async function handleApprove() {
    if (!task) return;
    setApproving(true);
    try {
      await apiApproveTask(task.task_id);
      await revalidate();
    } finally { setApproving(false); }
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

  const isOverdue = task && !['completed','closed'].includes(task.status) && task.due_date < new Date().toISOString().slice(0,10);

  return (
    <>
      {/* Backdrop */}
      <div onClick={closeSidebar} style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,0.25)' }} />

      {/* Slide-over panel */}
      <div style={{
        position: 'fixed', right: 0, top: 0, bottom: 0, zIndex: 600,
        width: 'min(600px, 95vw)', background: 'var(--bg-card)',
        borderLeft: '1.5px solid var(--border-light)',
        boxShadow: '-8px 0 32px rgba(0,0,0,0.12)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border-lighter)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          {task && <StatusBadge status={task.status} />}
          {task && <PriorityBadge priority={task.priority} />}
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
        {error && (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 60, gap: 10, color: '#dc2626' }}>
            <AlertCircle size={20} /> Không tải được thông tin task
          </div>
        )}

        {task && (
          <>
            {/* Task title */}
            <div style={{ padding: '12px 18px 0', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>{task.task_code}</span>
                {isOverdue && (
                  <span style={{ fontSize: 11, color: '#dc2626', fontWeight: 700 }}>⚠ Quá hạn</span>
                )}
              </div>
              <h2 style={{ margin: '0 0 10px', fontSize: 17, fontWeight: 700, color: 'var(--text-title)', lineHeight: 1.4 }}>{task.title}</h2>
              {task.progress_pct > 0 && (
                <div style={{ marginBottom: 10 }}>
                  <ProgressBar pct={task.progress_pct} />
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div style={{ padding: '0 18px 12px', display: 'flex', gap: 8, flexWrap: 'wrap', flexShrink: 0 }}>
              {/* Status transitions */}
              {((TRANSITIONS as Record<string, TaskStatus[]>)[task.status] ?? []).map((next: TaskStatus) => (
                <button key={next} onClick={() => handleTransition(next)} disabled={transitioning} style={{
                  padding: '6px 14px', borderRadius: 8, border: '1.5px solid var(--primary)',
                  background: 'var(--primary)', color: '#fff', cursor: 'pointer',
                  fontSize: 12, fontWeight: 700,
                  display: 'flex', alignItems: 'center', gap: 4,
                  opacity: transitioning ? 0.6 : 1,
                }}>
                  {transitioning ? <Loader2 size={12} className="tm-spin" /> : <RotateCcw size={12} />}
                  → {statusLabel(next)}
                </button>
              ))}

              {/* Approve / Reject (for review) */}
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
            <div style={{ display: 'flex', gap: 0, padding: '0 18px', borderBottom: '1px solid var(--border-lighter)', flexShrink: 0, overflowX: 'auto' }}>
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
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {task.objective && (
                    <DetailRow label="Mục tiêu" value={task.objective} />
                  )}
                  {task.description && (
                    <div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Mô tả</span>
                      <p style={{ fontSize: 13, color: 'var(--text-body)', margin: 0, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{task.description}</p>
                    </div>
                  )}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <DetailRow label="Deadline"        value={formatDate(task.due_date)} />
                    <DetailRow label="Ước tính"        value={task.estimated_hours ? `${task.estimated_hours}h` : '—'} />
                    <DetailRow label="Người giao"      value={task.owner_id ?? '—'} />
                    <DetailRow label="Người thực hiện" value={task.assignee_id ?? '—'} />
                    <DetailRow label="Phòng ban"       value={task.department_id ?? '—'} />
                    <DetailRow label="Dự án"           value={task.project_id ?? '—'} />
                  </div>
                  {/* Approval status */}
                  <div>
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Phê duyệt</span>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {[1, 2, 3].map(l => {
                        const status = (task as any)[`approval_level${l}_status`] ?? 'not_required';
                        return <ApprovalBadge key={l} level={l} status={status} />;
                      })}
                    </div>
                  </div>
                  {/* Tags */}
                  {task.tags && (() => {
                    try {
                      const tags = JSON.parse(task.tags) as string[];
                      return tags.length > 0 ? (
                        <div>
                          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Tags</span>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {tags.map(t => (
                              <span key={t} style={{ padding: '2px 8px', borderRadius: 20, background: 'var(--bg-page)', border: '1px solid var(--border-light)', fontSize: 12 }}>{t}</span>
                            ))}
                          </div>
                        </div>
                      ) : null;
                    } catch { return null; }
                  })()}
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

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 2 }}>{label}</span>
      <span style={{ fontSize: 13, color: 'var(--text-body)' }}>{value}</span>
    </div>
  );
}

function statusLabel(s: TaskStatus) {
  const labels: Record<TaskStatus, string> = {
    todo: 'Chờ làm', inprogress: 'Đang làm', waiting: 'Đang chờ',
    review: 'Chờ duyệt', completed: 'Hoàn thành', closed: 'Đã đóng',
  };
  return labels[s] ?? s;
}
