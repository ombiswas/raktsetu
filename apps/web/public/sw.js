/**
 * RaktSetu Minimal Push Notification Service Worker
 * Research Prototype - Strict Privacy: ZERO API CACHING.
 */

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  if (!event.data) return;

  try {
    const data = event.data.json();
    const title = data.title || 'RaktSetu Emergency Blood Alert';
    const options = {
      body: data.body || 'An emergency blood request matches your donor profile.',
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      tag: data.requestId || 'raktsetu-alert',
      data: {
        url: data.url || '/donor'
      },
      requireInteraction: true
    };

    event.waitUntil(self.registration.showNotification(title, options));
  } catch {
    // If payload is plain text
    const text = event.data.text();
    event.waitUntil(
      self.registration.showNotification('RaktSetu Emergency Alert', {
        body: text,
        icon: '/favicon.ico'
      })
    );
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/donor';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(targetUrl) && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
