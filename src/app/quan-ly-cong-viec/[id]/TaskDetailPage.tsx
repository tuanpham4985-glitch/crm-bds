'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useTaskDetail } from '@/hooks/tm/useTasks';
import { StatusBadge, PriorityBadge, ProgressBar, ApprovalBadge } from '@/components/task-management/StatusBadge';
import ChecklistPanel from '@/components/task-management/ChecklistPanel';
import SubtaskList from '@/components/task-management/SubtaskList';
import CommentSection from '@/components/task-management/CommentSection';
import ActivityTimeline from '@/components/task-management/ActivityTimeline';

function formatDate(d: string) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

interface Props { taskId: string; }

export default function TaskDetailPage({ taskId }: Props) {
  const router = useRouter();
  const { task, isLoading, error } = useTaskDetail(taskId);

  const isOverdue = task && !['completed','closed'].includes(task.status) && task.due_date < new Date().toISOString().slice(0,10);

  if (isLoading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh', gap: 12, color: 'var(--text-muted)' }}>
      <Loader2 size={24} className="tm-spin" /> Đang tải...
    </div>
  );

  if (error || !task) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 80, gap: 12, color: 'var(--text-muted)' }}>
      <p style={{ fontSize: 16 }}>Không tìm thấy công việc</p>
      <button onClick={() => router.back()} style={{ padding: '8px 20px', borderRadius: 8, border: '1.5px solid var(--border-light)', cursor: 'pointer', background: 'transparent', fontSize: 14 }}>
        Quay lại
      </button>
    </div>
  );

  return (
    <div style={{ maxWidth: 880, margin: '0 auto', padding: '24px 20px' }}>
      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <button onClick={() => router.push('/quan-ly-cong-viec')} style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px',
          border: '1.5px solid var(--border-light)', borderRadius: 8,
          cursor: 'pointer', background: 'transparent', fontSize: 13, fontWeight: 600,
          color: 'var(--text-muted)',
        }}>
          <ArrowLeft size={14} /> Danh sách
        </button>
        <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>/</span>
        <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600 }}>{task.task_code}</span>
      </div>

      {/* Card */}
      <div style={{ background: 'var(--bg-card)', borderRadius: 12, border: '1px solid var(--border-light)', overflow: 'hidden' }}>
        {/* Priority stripe */}
        <div style={{ height: 4, background: task.priority === 'critical' ? '#ef4444' : task.priority === 'high' ? '#f97316' : task.priority === 'medium' ? '#6366f1' : '#22c55e' }} />

        <div style={{ padding: '20px 24px' }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 700 }}>{task.task_code}</span>
                <StatusBadge status={task.status} />
                <PriorityBadge priority={task.priority} />
                {isOverdue && (
                  <span style={{ fontSize: 12, color: '#dc2626', fontWeight: 700 }}>⚠ Quá hạn</span>
                )}
              </div>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--text-title)', lineHeight: 1.4 }}>{task.title}</h1>
              {task.objective && (
                <p style={{ margin: '8px 0 0', fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.5 }}>{task.objective}</p>
              )}
            </div>
          </div>

          {/* Progress */}
          {task.progress_pct > 0 && (
            <div style={{ marginBottom: 16 }}>
              <ProgressBar pct={task.progress_pct} />
            </div>
          )}

          {/* Meta grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 16, padding: '14px 0', borderTop: '1px solid var(--border-lighter)', borderBottom: '1px solid var(--border-lighter)' }}>
            <MetaItem label="Deadline"        value={formatDate(task.due_date)} warning={!!isOverdue} />
            <MetaItem label="Ước tính"        value={task.estimated_hours ? `${task.estimated_hours}h` : '—'} />
            <MetaItem label="Người giao"      value={task.owner_id ?? '—'} />
            <MetaItem label="Người thực hiện" value={task.assignee_id ?? '—'} />
            <MetaItem label="Phòng ban"       value={task.department_id ?? '—'} />
            <MetaItem label="Dự án"           value={task.project_id ?? '—'} />
          </div>

          {/* Description */}
          {task.description && (
            <div style={{ marginBottom: 16 }}>
              <h3 style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Mô tả</h3>
              <p style={{ margin: 0, fontSize: 14, color: 'var(--text-body)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{task.description}</p>
            </div>
          )}

          {/* Approval */}
          <div style={{ marginBottom: 16 }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Phê duyệt</h3>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {[1, 2, 3].map(l => {
                const status = (task as Record<string, unknown>)[`approval_level${l}_status`] as string ?? 'not_required';
                return <ApprovalBadge key={l} level={l} status={status} />;
              })}
            </div>
          </div>
        </div>

        {/* Tabs section */}
        <TabSection taskId={taskId} />
      </div>

      <style>{`
        @keyframes tm-spin { to { transform: rotate(360deg); } }
        .tm-spin { animation: tm-spin 0.8s linear infinite; }
      `}</style>
    </div>
  );
}

function MetaItem({ label, value, warning }: { label: string; value: string; warning?: boolean }) {
  return (
    <div>
      <span style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 2 }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: warning ? '#dc2626' : 'var(--text-body)' }}>{value}</span>
    </div>
  );
}

const TABS = [
  { id: 'checklist', label: 'Checklist' },
  { id: 'subtasks',  label: 'Việc con'  },
  { id: 'comments',  label: 'Bình luận' },
  { id: 'activity',  label: 'Lịch sử'   },
];

function TabSection({ taskId }: { taskId: string }) {
  const [tab, setTab] = useState('checklist');

  return (
    <div>
      <div style={{ display: 'flex', borderTop: '1px solid var(--border-lighter)', padding: '0 24px', overflowX: 'auto' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '10px 16px', border: 'none', background: 'none', cursor: 'pointer',
            fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap',
            color: tab === t.id ? 'var(--primary)' : 'var(--text-muted)',
            borderBottom: `2px solid ${tab === t.id ? 'var(--primary)' : 'transparent'}`,
          }}>
            {t.label}
          </button>
        ))}
      </div>
      <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border-lighter)' }}>
        {tab === 'checklist' && <ChecklistPanel taskId={taskId} />}
        {tab === 'subtasks'  && <SubtaskList    taskId={taskId} />}
        {tab === 'comments'  && <CommentSection  taskId={taskId} />}
        {tab === 'activity'  && <ActivityTimeline taskId={taskId} />}
      </div>
    </div>
  );
}

