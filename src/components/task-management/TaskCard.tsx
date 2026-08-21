'use client';
import { Calendar, User, AlertTriangle } from 'lucide-react';
import { StatusBadge, PriorityBadge, ProgressBar } from './StatusBadge';
import type { TmTask } from '@/lib/task-management/types';
import { useTmStore } from '@/stores/tmStore';
import { useTmUsers } from '@/hooks/tm/useTasks';
import { getOverdueDays, isOpenTaskOverdue } from '@/lib/task-management/date-utils';

interface Props {
  task: TmTask;
  onClick?: () => void;
  compact?: boolean;
}

function formatDate(d: string) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
}

function isOverdue(task: TmTask) {
  return isOpenTaskOverdue(task.due_date, task.status);
}

function getCollabCount(collabJson: string) {
  try { return JSON.parse(collabJson || '[]').length; } catch { return 0; }
}

export default function TaskCard({ task, onClick, compact = false }: Props) {
  const openSidebar = useTmStore(s => s.openSidebar);
  const { userMap } = useTmUsers();
  const overdue = isOverdue(task);
  const overdueDays = overdue ? getOverdueDays(task.due_date) : 0;
  const collabs = getCollabCount(task.collaborator_ids);
  const ownerName = task.owner_id ? (userMap[task.owner_id] || task.owner_id) : '';
  const assigneeLabel = ownerName
    ? `${ownerName}${collabs > 0 ? ` +${collabs}` : ''}`
    : (collabs > 0 ? `+${collabs}` : '—');

  const handleClick = () => {
    if (onClick) onClick();
    else openSidebar(task.task_id);
  };

  return (
    <div
      onClick={handleClick}
      style={{
        background: overdue ? '#fee2e2' : 'var(--bg-card)',
        border: `1.5px solid ${overdue ? '#ef4444' : 'var(--border-light)'}`,
        borderLeft: `4px solid ${overdue ? '#ef4444' : task.priority === 'critical' ? '#ef4444' : task.priority === 'high' ? '#f97316' : task.priority === 'medium' ? '#6366f1' : '#22c55e'}`,
        borderRadius: 10,
        padding: compact ? '10px 12px' : '14px 16px',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        marginBottom: 8,
        boxShadow: overdue ? 'inset 0 0 0 1px rgba(239, 68, 68, 0.08)' : 'none',
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = overdue
          ? '0 4px 12px rgba(239,68,68,0.18), inset 0 0 0 1px rgba(239,68,68,0.08)'
          : '0 4px 12px rgba(0,0,0,0.08)';
        (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-1px)';
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = overdue
          ? 'inset 0 0 0 1px rgba(239,68,68,0.08)'
          : 'none';
        (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)';
      }}
    >
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>{task.task_code}</span>
            {overdue && (
              <span style={{
                display: 'flex',
                alignItems: 'center',
                gap: 3,
                padding: '2px 6px',
                borderRadius: 999,
                background: '#fee2e2',
                color: '#b91c1c',
                fontSize: 10,
                fontWeight: 800,
                whiteSpace: 'nowrap',
              }}>
                <AlertTriangle size={11} /> Quá hạn{overdueDays > 0 ? ` ${overdueDays} ngày` : ''}
              </span>
            )}
          </div>
          <p style={{
            fontSize: compact ? 13 : 14, fontWeight: 600, color: overdue ? '#991b1b' : 'var(--text-title)',
            margin: 0, overflow: 'hidden', textOverflow: 'ellipsis',
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          }}>
            {task.title}
          </p>
        </div>
        <StatusBadge status={task.status} size="sm" />
      </div>

      {/* Objective */}
      {!compact && task.objective && (
        <p style={{ fontSize: 12, color: overdue ? '#7f1d1d' : 'var(--text-muted)', margin: '0 0 8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {task.objective}
        </p>
      )}

      {/* Progress */}
      {task.progress_pct > 0 && (
        <div style={{ marginBottom: 8 }}>
          <ProgressBar pct={task.progress_pct} showLabel />
        </div>
      )}

      {/* Footer row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <PriorityBadge priority={task.priority} size="sm" />

        <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, color: overdue ? '#dc2626' : 'var(--text-muted)' }}>
          <Calendar size={11} />
          {formatDate(task.due_date)}
        </span>

        <span
          title={assigneeLabel}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 3,
            fontSize: 11,
            color: 'var(--text-muted)',
            minWidth: 0,
            maxWidth: compact ? 132 : 180,
          }}
        >
          <User size={11} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {assigneeLabel}
          </span>
        </span>
      </div>
    </div>
  );
}
