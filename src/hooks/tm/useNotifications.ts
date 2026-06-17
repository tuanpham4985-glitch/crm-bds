'use client';
import { useEffect, useCallback } from 'react';
import useSWR, { mutate } from 'swr';
import { useTmStore } from '@/stores/tmStore';
import type { TmNotification } from '@/lib/task-management/types';

const fetcher = (url: string) => fetch(url).then(r => r.json()).then(d => d.data ?? []);

export function useNotifications() {
  const setNotifications = useTmStore(s => s.setNotifications);
  const markReadStore    = useTmStore(s => s.markRead);
  const markAllStore     = useTmStore(s => s.markAllRead);
  const notifications    = useTmStore(s => s.notifications);
  const unreadCount      = useTmStore(s => s.unreadCount);

  const { data, isLoading } = useSWR<TmNotification[]>('/api/tm/notifications', fetcher, {
    refreshInterval: 30_000,
    revalidateOnFocus: false,
  });

  useEffect(() => {
    if (data) setNotifications(data);
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
    await mutate('/api/tm/notifications');
  }, [markAllStore]);

  return { notifications, unreadCount, isLoading, markRead, markAllRead };
}
