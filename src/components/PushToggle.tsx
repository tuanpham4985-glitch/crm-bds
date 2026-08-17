'use client';

import { useEffect, useState } from 'react';
import { Bell, BellOff, Loader2 } from 'lucide-react';

// Chuyển VAPID public key (base64url) → Uint8Array cho pushManager.subscribe
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

type State = 'loading' | 'unsupported' | 'needs-install' | 'off' | 'on' | 'denied' | 'busy';

export default function PushToggle() {
  const [state, setState] = useState<State>('loading');

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  useEffect(() => {
    (async () => {
      if (typeof window === 'undefined') return;
      const supported =
        'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
      if (!supported || !publicKey) { setState('unsupported'); return; }

      // iOS chỉ cho phép push khi mở từ màn hình chính (standalone)
      const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
      const standalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        (navigator as unknown as { standalone?: boolean }).standalone === true;
      if (isIos && !standalone) { setState('needs-install'); return; }

      if (Notification.permission === 'denied') { setState('denied'); return; }

      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        setState(sub ? 'on' : 'off');
      } catch {
        setState('off');
      }
    })();
  }, [publicKey]);

  const enable = async () => {
    if (!publicKey) return;
    setState('busy');
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { setState(perm === 'denied' ? 'denied' : 'off'); return; }

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      });
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: sub.toJSON() }),
      });
      if (!res.ok) throw new Error('subscribe failed');
      setState('on');
    } catch (e) {
      console.error('[push] enable failed:', e);
      setState('off');
      alert('Không bật được thông báo. Vui lòng thử lại.');
    }
  };

  const disable = async () => {
    setState('busy');
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch('/api/push/unsubscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        }).catch(() => {});
        await sub.unsubscribe().catch(() => {});
      }
      setState('off');
    } catch {
      setState('off');
    }
  };

  if (state === 'loading' || state === 'unsupported') return null;

  const base: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600,
    padding: '6px 12px', borderRadius: 8, cursor: 'pointer', border: '1px solid var(--border)',
  };

  if (state === 'needs-install') {
    return (
      <span style={{ ...base, cursor: 'default', color: 'var(--text-secondary)', background: 'var(--bg-secondary)' }}>
        <Bell size={14} /> iPhone: “Thêm vào màn hình chính” để bật thông báo
      </span>
    );
  }
  if (state === 'denied') {
    return (
      <span style={{ ...base, cursor: 'default', color: '#b91c1c', background: '#fef2f2', borderColor: '#fecaca' }}>
        <BellOff size={14} /> Thông báo đang bị chặn — bật lại trong cài đặt trình duyệt
      </span>
    );
  }
  if (state === 'on') {
    return (
      <button onClick={disable} style={{ ...base, color: '#15803d', background: '#f0fdf4', borderColor: '#bbf7d0' }}>
        <Bell size={14} /> Đã bật thông báo · Tắt
      </button>
    );
  }
  if (state === 'busy') {
    return (
      <span style={{ ...base, cursor: 'default', color: 'var(--text-secondary)' }}>
        <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Đang xử lý...
      </span>
    );
  }
  // 'off'
  return (
    <button onClick={enable} style={{ ...base, color: 'var(--primary)', background: 'rgba(99,102,241,0.08)', borderColor: 'transparent' }}>
      <Bell size={14} /> Bật thông báo đơn chờ duyệt
    </button>
  );
}
