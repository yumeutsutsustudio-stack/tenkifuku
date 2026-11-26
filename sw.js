// てんき服 — 通知を出すためのサービスワーカー（キャッシュはしない）
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

// 通知を押したらアプリを開く
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((list) => (list.length ? list[0].focus() : self.clients.openWindow('./'))),
  );
});
