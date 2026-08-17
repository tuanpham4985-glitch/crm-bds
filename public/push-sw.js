// Web Push handlers — được importScripts vào service worker do next-pwa sinh ra.
// Xử lý: hiện thông báo + cập nhật số trên icon app (badge) kể cả khi app đã đóng.

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = {}; }

  const title = data.title || 'Victory Holdings';
  const url = data.url || '/';
  const options = {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: data.tag || 'cham-cong-pending',
    renotify: true,
    data: { url },
  };

  event.waitUntil((async () => {
    await self.registration.showNotification(title, options);
    // Cập nhật số trên icon app nếu trình duyệt hỗ trợ
    if (typeof data.count === 'number' && self.navigator && 'setAppBadge' in self.navigator) {
      try {
        if (data.count > 0) await self.navigator.setAppBadge(data.count);
        else await self.navigator.clearAppBadge();
      } catch (e) { /* bỏ qua */ }
    }
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of all) {
      if ('focus' in client) {
        await client.focus();
        if ('navigate' in client) { try { await client.navigate(url); } catch (e) { /* bỏ qua */ } }
        return;
      }
    }
    if (self.clients.openWindow) await self.clients.openWindow(url);
  })());
});
