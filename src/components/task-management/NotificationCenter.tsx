'use client';
import { useRef, useState, useEffect } from 'react';
import { Bell, Check, CheckCheck, Loader2 } from 'lucide-react';
import { useNotifications } from '@/hooks/tm/useNotifications';
import type { TmNotification } from '@/lib/task-management/types';

const NOTIF_ICONS: Record<string, string> = {
  assigned:       '📋',
  status_changed: '🔄',
  commented:      '💬',
  due_soon:       '⏰',
  overdue:        '⚠️',
  approved:       '✅',
  rejected:       '❌',
  mentioned:      '📣',
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'vừa xong';
  if (m < 60) return `${m} phút`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} giờ`;
  return `${Math.floor(h / 24)} ngày`;
}

export default function NotificationCenter() {
  const { notifications, unreadCount, isLoading, markRead, markAllRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  async function handleMarkAll() {
    setMarkingAll(true);
    try { await markAllRead(); }
    finally { setMarkingAll(false); }
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {/* Bell button */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          position: 'relative', width: 36, height: 36, borderRadius: 8,
          border: `1.5px solid ${open ? 'var(--primary)' : 'var(--border-light)'}`,
          background: open ? 'var(--primary-light)' : 'transparent',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: open ? 'var(--primary)' : 'var(--text-muted)',
        }}
      >
        <Bell size={16} />
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute', top: -6, right: -6,
            width: 18, height: 18, borderRadius: '50%',
            background: '#ef4444', color: '#fff',
            fontSize: 10, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '2px solid var(--bg-card)',
          }}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: 'absolute', top: 42, right: 0, zIndex: 999,
          width: 360, maxHeight: 480,
          background: 'var(--bg-card)', border: '1.5px solid var(--border-light)',
          borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', borderBottom: '1px solid var(--border-lighter)' }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-title)' }}>
              Thông báo {unreadCount > 0 && <span style={{ color: '#ef4444' }}>({unreadCount})</span>}
            </span>
            {unreadCount > 0 && (
              <button onClick={handleMarkAll} disabled={markingAll} style={{
                display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600,
                color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer',
                opacity: markingAll ? 0.6 : 1,
              }}>
                {markingAll ? <Loader2 size={12} className="tm-spin" /> : <CheckCheck size={12} />}
                Đọc tất cả
              </button>
            )}
          </div>

          {/* List */}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {isLoading && (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
                <Loader2 size={20} className="tm-spin" style={{ color: 'var(--text-muted)' }} />
              </div>
            )}
            {!isLoading && notifications.length === 0 && (
              <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--text-muted)' }}>
                <Bell size={28} strokeWidth={1.2} style={{ marginBottom: 8, opacity: 0.4 }} />
                <p style={{ fontSize: 13, margin: 0 }}>Không có thông báo mới</p>
              </div>
            )}
            {notifications.map((n: TmNotification) => (
              <NotifItem key={n.notif_id} n={n} onRead={markRead} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function NotifItem({ n, onRead }: { n: TmNotification; onRead: (id: string) => void }) {
  return (
    <div
      style={{
        display: 'flex', gap: 10, padding: '10px 14px',
        background: n.status === 'read' ? 'transparent' : 'var(--primary-light)',
        borderBottom: '1px solid var(--border-lighter)',
        cursor: 'pointer', transition: 'background 0.1s',
      }}
      onClick={() => { if (n.status !== 'read') onRead(n.notif_id); }}
      onMouseEnter={e => (e.currentTarget.style.background = '#f1f5f9')}
      onMouseLeave={e => (e.currentTarget.style.background = n.status === 'read' ? 'transparent' : 'var(--primary-light)')}
    >
      <span style={{ fontSize: 20, flexShrink: 0, lineHeight: 1.3 }}>{NOTIF_ICONS[n.type] ?? '📌'}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: '0 0 2px', fontSize: 13, color: 'var(--text-body)', fontWeight: n.status !== 'read' ? 600 : 400, lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {n.title || n.body}
        </p>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{timeAgo(n.created_at)}</span>
      </div>
      {n.status !== 'read' && (
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--primary)', flexShrink: 0, marginTop: 5 }} />
      )}
    </div>
  );
}
