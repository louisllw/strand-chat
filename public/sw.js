self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'New message';
  const options = {
    body: data.body || '',
    icon: data.icon || '/pwa-icon-v2.svg',
    badge: data.badge || '/pwa-icon-v2.svg',
    data: {
      url: data.url || '/',
    },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const rawUrl = event.notification?.data?.url || '/';
  const targetUrl = new URL(rawUrl, self.location.origin).toString();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('navigate' in client) {
          return client.navigate(targetUrl).then(() => client.focus());
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
      return undefined;
    })
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/uploads/messages/')) return;
  event.respondWith((async () => {
    const cache = await caches.open('image-cache-v1');
    let cached = await cache.match(request);
    if (cached) {
      const cachedAt = Number(cached.headers.get('x-cache-time') || 0);
      const maxAgeMs = 90 * 24 * 60 * 60 * 1000;
      const ageMs = cachedAt > 0 ? Date.now() - cachedAt : maxAgeMs + 1;
      if (ageMs <= maxAgeMs) {
        return cached;
      }
      await cache.delete(request);
      cached = undefined;
    }
    try {
      const response = await fetch(request);
      if (response && response.ok) {
        const cachedResponse = await (async () => {
          const cloned = response.clone();
          const blob = await cloned.blob();
          const headers = new Headers(cloned.headers);
          headers.set('x-cache-time', Date.now().toString());
          return new Response(blob, {
            status: cloned.status,
            statusText: cloned.statusText,
            headers,
          });
        })();
        cache.put(request, cachedResponse);
      }
      return response;
    } catch {
      if (cached) return cached;
      throw new Error('Network error');
    }
  })());
});
