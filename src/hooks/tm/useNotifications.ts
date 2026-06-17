'use client';
import { useEffect } from 'react';
import useSWR, { mutate } from 'swr';
import { useTmStore } from '@/stores/tmStore';
import type { TmNotification } from '@/lib/task-management/types';

const fetcher = (url: string) => fetch(url).then(r => r.json()).then(d => d.data ?? []);

export function useNotifications() {
  const { setNotifications, markRead: markReadStore, markAllRead: markAllStore } = useTmStore();

  const { data, isLoading } = useSWR<TmNotification[]>('/api/tm/notifications', fetcher, {
    refreshInterval: 30_000,
    revalidateOnFocus: true,
  });

  useEffect(() => {
    if (data) setNotifications(data);
  }, [data, setNotifications]);

  const notifications = useTmStore(s => s.notifications);
  const unreadCount   = useTmStore(s => s.unreadCount);

  async function markRead(notifId: string) {
    markReadStore(notifId);
    await fetch('/api/tm/notifications', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ notif_id: notifId }),
    });
  }

  async function markAllRead() {
    markAllStore();
    await fetch('/api/tm/notifications', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ read_all: true }),
    });
    await mutate('/api/tm/notifications');
  }

  return { notifications, unreadCount, isLoading, markRead, markAllRead };
}
