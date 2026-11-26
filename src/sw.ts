/// <reference lib="webworker" />
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';

declare let self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

self.addEventListener('install', () => {
  void self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST || []);

interface PushPayload {
  title?: string;
  body?: string;
  icon?: string;
  image?: string;
  badge?: string;
  url?: string;
  videoId?: string;
}

self.addEventListener('push', (event: PushEvent) => {
  let payload: PushPayload = {
    title: 'New Release on FilmDrama Box',
    body: 'Tap to watch now on FilmDrama Box',
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    url: '/',
  };

  if (event.data) {
    try {
      const parsed = event.data.json() as PushPayload;
      payload = { ...payload, ...parsed };
    } catch {
      const text = event.data.text();
      if (text) payload.body = text;
    }
  }

  const options: NotificationOptions & {
    image?: string;
    renotify?: boolean;
    vibrate?: number[];
  } = {
    body: payload.body || 'Tap to watch now on FilmDrama Box',
    icon: payload.icon || '/pwa-192x192.png',
    badge: payload.badge || '/pwa-192x192.png',
    tag: payload.videoId ? `filmdrama-video-${payload.videoId}` : 'filmdrama-release',
    renotify: true,
    vibrate: [120, 40, 120],
    data: { url: payload.url || '/' },
  };

  if (payload.image) {
    options.image = payload.image;
  }

  event.waitUntil(
    self.registration
      .showNotification(payload.title || 'FilmDrama Box', options)
      .then(async () => {
        if (!payload.videoId) return;
        const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        for (const client of clients) {
          client.postMessage({ type: 'PUSH_SHOWN', videoId: payload.videoId });
        }
      })
  );
});

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();
  const rawUrl = (event.notification.data as { url?: string } | undefined)?.url || '/';
  const targetUrl = new URL(rawUrl, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clients) => {
      for (const client of clients) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          if ('navigate' in client) {
            try {
              const navigated = await client.navigate(targetUrl);
              if (navigated) return navigated.focus();
            } catch {
              // Fall back to focusing existing client
            }
          }
          return client.focus();
        }
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});
