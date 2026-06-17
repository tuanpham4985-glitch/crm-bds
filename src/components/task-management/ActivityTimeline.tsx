'use client';
import useSWR from 'swr';
import { Loader2 } from 'lucide-react';
import type { TmActivityLog } from '@/lib/task-management/types';

const fetcher = (url: string) => fetch(url).then(r => r.json()).then(d => d.data ?? []);

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'vừa xong';
  if (m < 60) return `${m} phút trước`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} giờ trước`;
  return new Date(iso).toLocaleDateString('vi-VN');
}

const ACTION_COLORS: Record<string, string> = {
  created:    '#6366f1',
  updated:    '#2563eb',
  status_changed: '#f59e0b',
  approved:   '#16a34a',
  rejected:   '#dc2626',
  commented:  '#94a3b8',
  deleted:    '#ef4444',
};

const ACTION_LABELS: Record<string, string> = {
  created:        'đã tạo task',
  updated:        'đã cập nhật',
  status_changed: 'đổi trạng thái',
  approved:       'đã duyệt',
  rejected:       'đã từ chối',
  commented:      'đã bình luận',
  deleted:        'đã xóa',
};

interface Props { taskId: string; }

export default function ActivityTimeline({ taskId }: Props) {
  const { data: logs = [], isLoading } = useSWR<TmActivityLog[]>(
    `/api/tm/tasks/${taskId}/activity`,
    fetcher,
    { revalidateOnFocus: false }
  );

  if (isLoading) return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 0', color: 'var(--text-muted)', fontSize: 13 }}>
      <Loader2 size={14} className="tm-spin" /> Đang tải...
    </div>
  );

  if (!logs.length) return (
    <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '12px 0' }}>Chưa có lịch sử hoạt động</p>
  );

  return (
    <div style={{ position: 'relative', paddingLeft: 24 }}>
      {/* Vertical line */}
      <div style={{ position: 'absolute', left: 8, top: 8, bottom: 8, width: 2, background: 'var(--border-lighter)' }} />

      {logs.map((log, i) => {
        const color = ACTION_COLORS[log.action] ?? '#94a3b8';
        const label = ACTION_LABELS[log.action] ?? log.action;
        return (
          <div key={log.log_id ?? i} style={{ position: 'relative', marginBottom: 16 }}>
            {/* Dot */}
            <div style={{
              position: 'absolute', left: -20, top: 4,
              width: 10, height: 10, borderRadius: '50%',
              background: color, border: '2px solid var(--bg-card)',
              boxShadow: `0 0 0 2px ${color}33`,
            }} />

            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 2 }}>
              <strong style={{ color: 'var(--text-body)' }}>{log.user_id}</strong>{' '}{label}
              {' · '}
              <span>{timeAgo(log.created_at)}</span>
            </div>

            {log.old_value && log.new_value && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                <span style={{ padding: '1px 6px', borderRadius: 20, background: '#fef2f2', color: '#dc2626', textDecoration: 'line-through' }}>
                  {log.old_value}
                </span>
                <span style={{ color: 'var(--text-muted)' }}>→</span>
                <span style={{ padding: '1px 6px', borderRadius: 20, background: '#f0fdf4', color: '#16a34a' }}>
                  {log.new_value}
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
