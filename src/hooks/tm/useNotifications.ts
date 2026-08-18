'use client';
import { useEffect, useCallback } from 'react';
import useSWR, { mutate } from 'swr';
import { useTmStore } from '@/stores/tmStore';
import type { TmNotification } from '@/lib/task-management/types';

const fetcher = (url: string) => fetch(url).then(r => r.json()).then(d => d.data ?? {});

export function useNotifications() {
  const setNotifications = useTmStore(s => s.setNotifications);
  const markReadStore    = useTmStore(s => s.markRead);
  const markAllStore     = useTmStore(s => s.markAllRead);
  const notifications    = useTmStore(s => s.notifications);
  const unreadCount      = useTmStore(s => s.unreadCount);

  // Dùng /api/tm/combined thay cho 3 calls riêng lẻ
  const { data, isLoading } = useSWR('/api/tm/combined', fetcher, {
    refreshInterval:    120_000, // 2 phút
    revalidateOnFocus:  false,
    dedupingInterval:   60_000,
  });

  useEffect(() => {
    if (!data) return;
    const notifs: TmNotification[] = Array.isArray(data.notifications) ? data.notifications : [];
    const pendingTasks = Array.isArray(data.pending_tasks) ? data.pending_tasks : [];
    setNotifications(notifs, data.unread_count ?? 0, data.pending_count ?? 0, pendingTasks);
  }, [data, setNotifications]);

  const markRead = useCallback(async (notifId: string) => {
    markReadStore(notifId);
    await fetch('/api/tm/notifications', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ notif_id: notifId }),
    });
  }, [markReadStore]);

  const markAllRead = useCallback(async () => {
    markAllStore();
    await fetch('/api/tm/notifications', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ read_all: true }),
    });
    await mutate('/api/tm/combined');
  }, [markAllStore]);

  return { notifications, unreadCount, isLoading, markRead, markAllRead };
}
