'use client';
import { Calendar, User, MessageSquare, CheckSquare, Clock, AlertTriangle } from 'lucide-react';
import { StatusBadge, PriorityBadge, ProgressBar } from './StatusBadge';
import type { TmTask } from '@/lib/task-management/types';
import { useTmStore } from '@/stores/tmStore';

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
  if (['completed', 'closed'].includes(task.status)) return false;
  return task.due_date && task.due_date < new Date().toISOString().slice(0, 10);
}

function getCollabCount(collabJson: string) {
  try { return JSON.parse(collabJson || '[]').length; } catch { return 0; }
}

export default function TaskCard({ task, onClick, compact = false }: Props) {
  const openSidebar = useTmStore(s => s.openSidebar);
  const overdue = isOverdue(task);
  const collabs = getCollabCount(task.collaborator_ids);

  const handleClick = () => {
    if (onClick) onClick();
    else openSidebar(task.task_id);
  };

  return (
    <div
      onClick={handleClick}
      style={{
        background: 'var(--bg-card)',
        border: `1.5px solid ${overdue ? '#fca5a5' : 'var(--border-light)'}`,
        borderLeft: `4px solid ${task.priority === 'critical' ? '#ef4444' : task.priority === 'high' ? '#f97316' : task.priority === 'medium' ? '#6366f1' : '#22c55e'}`,
        borderRadius: 10,
        padding: compact ? '10px 12px' : '14px 16px',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        marginBottom: 8,
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)';
        (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-1px)';
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = 'none';
        (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)';
      }}
    >
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>{task.task_code}</span>
            {overdue && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, color: '#dc2626', fontWeight: 600 }}>
                <AlertTriangle size={11} /> Quá hạn
              </span>
            )}
          </div>
          <p style={{
            fontSize: compact ? 13 : 14, fontWeight: 600, color: 'var(--text-title)',
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
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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

        {task.estimated_hours > 0 && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, color: 'var(--text-muted)' }}>
            <Clock size={11} />
            {task.estimated_hours}h
          </span>
        )}

        <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, color: 'var(--text-muted)' }}>
          <User size={11} />
          {collabs > 0 ? `+${collabs}` : '—'}
        </span>
      </div>
    </div>
  );
}
