'use client';

import { useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';

const HEARTBEAT_MS = 60_000;

async function sendHeartbeat(): Promise<void> {
  try {
    await fetch('/api/presence', { method: 'POST', keepalive: true });
  } catch {
    // Presence is best-effort; mất mạng không được làm gián đoạn App.
  }
}

export default function PresenceHeartbeat() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user?.id_nhan_vien) return;
    void sendHeartbeat();
    const timer = window.setInterval(() => { void sendHeartbeat(); }, HEARTBEAT_MS);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void sendHeartbeat();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [user?.id_nhan_vien]);

  return null;
}
