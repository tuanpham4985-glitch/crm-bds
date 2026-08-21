'use client';
import type { TaskStatus, TaskPriority } from '@/lib/task-management/types';

// ─── STATUS ───────────────────────────────────────────────

const STATUS_CONFIG: Record<TaskStatus, { label: string; color: string; bg: string; dot: string }> = {
  todo:        { label: 'Chờ làm',     color: '#64748b', bg: '#f1f5f9', dot: '#94a3b8' },
  inprogress:  { label: 'Đang làm',    color: '#1d4ed8', bg: '#eff6ff', dot: '#3b82f6' },
  waiting:     { label: 'Đang chờ',    color: '#92400e', bg: '#fef3c7', dot: '#f59e0b' },
  review:      { label: 'Chờ duyệt',   color: '#6b21a8', bg: '#faf5ff', dot: '#a855f7' },
  completed:   { label: 'Hoàn thành',  color: '#166534', bg: '#f0fdf4', dot: '#22c55e' },
  closed:      { label: 'Đã đóng',     color: '#065f46', bg: '#ecfdf5', dot: '#10b981' },
};

export function StatusBadge({ status, size = 'md' }: { status: TaskStatus; size?: 'sm' | 'md' }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.todo;
  const fs  = size === 'sm' ? '11px' : '12px';
  const px  = size === 'sm' ? '6px'  : '8px';
  const py  = size === 'sm' ? '2px'  : '3px';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '5px',
      fontSize: fs, fontWeight: 600, padding: `${py} ${px}`,
      borderRadius: '20px', background: cfg.bg, color: cfg.color,
      border: `1px solid ${cfg.color}22`, whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: cfg.dot, flexShrink: 0 }} />
      {cfg.label}
    </span>
  );
}

export function statusLabel(s: TaskStatus) { return STATUS_CONFIG[s]?.label ?? s; }
export function statusConfig(s: TaskStatus) { return STATUS_CONFIG[s] ?? STATUS_CONFIG.todo; }

// ─── PRIORITY ─────────────────────────────────────────────

const PRIORITY_CONFIG: Record<TaskPriority, { label: string; color: string; bg: string; icon: string }> = {
  critical: { label: 'Khẩn cấp', color: '#991b1b', bg: '#fef2f2', icon: '🔴' },
  high:     { label: 'Cao',      color: '#9a3412', bg: '#fff7ed', icon: '🟠' },
  medium:   { label: 'TB',       color: '#1e3a5f', bg: '#eff6ff', icon: '🔵' },
  low:      { label: 'Thấp',     color: '#166534', bg: '#f0fdf4', icon: '🟢' },
};

export function PriorityBadge({ priority, size = 'md' }: { priority: TaskPriority; size?: 'sm' | 'md' }) {
  const cfg = PRIORITY_CONFIG[priority] ?? PRIORITY_CONFIG.medium;
  const fs  = size === 'sm' ? '11px' : '12px';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '4px',
      fontSize: fs, fontWeight: 600, padding: '2px 8px',
      borderRadius: '20px', background: cfg.bg, color: cfg.color,
      border: `1px solid ${cfg.color}22`,
    }}>
      {cfg.icon} {cfg.label}
    </span>
  );
}

export function priorityLabel(p: TaskPriority) { return PRIORITY_CONFIG[p]?.label ?? p; }

// ─── PROGRESS ─────────────────────────────────────────────

export function ProgressBar({ pct, showLabel = true }: { pct: number; showLabel?: boolean }) {
  const color = pct >= 80 ? '#16a34a' : pct >= 50 ? '#2563eb' : pct >= 20 ? '#f59e0b' : '#94a3b8';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{
        flex: 1, height: 6, background: '#e2e8f0', borderRadius: 10, overflow: 'hidden',
      }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 10, transition: 'width 0.3s ease' }} />
      </div>
      {showLabel && (
        <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', minWidth: 28 }}>{pct}%</span>
      )}
    </div>
  );
}

// ─── APPROVAL ─────────────────────────────────────────────

export function ApprovalBadge({ level, status }: { level: number; status: string }) {
  const colors: Record<string, { color: string; bg: string }> = {
    pending:  { color: '#92400e', bg: '#fef3c7' },
    approved: { color: '#166534', bg: '#f0fdf4' },
    rejected: { color: '#991b1b', bg: '#fef2f2' },
    not_required: { color: '#64748b', bg: '#f1f5f9' },
  };
  const cfg   = colors[status] ?? colors.pending;
  const label = status === 'approved' ? '✓ Đã duyệt' : status === 'rejected' ? '✗ Từ chối' : status === 'not_required' ? '— Không cần duyệt' : `⏳ Chờ duyệt Cấp ${level}`;
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, padding: '2px 8px',
      borderRadius: 20, background: cfg.bg, color: cfg.color,
    }}>
      {label}
    </span>
  );
}
