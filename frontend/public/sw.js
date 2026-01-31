// public/sw.js
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// This listens for notification clicks to open the app
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      // If the app is already open, focus it
      for (const client of clientList) {
        if (client.url === '/' && 'focus' in client) return client.focus();
      }
      // Otherwise open it
      if (clients.openWindow) return clients.openWindow('/');
    })
  );
});