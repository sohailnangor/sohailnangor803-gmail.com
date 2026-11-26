const NOTIFIED_IDS_STORAGE_KEY = 'filmdrama_notified_video_ids_v1';
const notifiedInMemory = new Set<string>();
let swMessageListenerBound = false;

function loadNotifiedSet(): Set<string> {
  if (notifiedInMemory.size > 0) return notifiedInMemory;
  try {
    const raw = window.localStorage.getItem(NOTIFIED_IDS_STORAGE_KEY);
    if (raw) {
      const arr = JSON.parse(raw) as unknown;
      if (Array.isArray(arr)) {
        for (const item of arr) {
          if (typeof item === 'string') notifiedInMemory.add(item);
        }
      }
    }
  } catch {
    // Ignore storage read errors
  }
  return notifiedInMemory;
}

function markVideoNotified(videoId: string): boolean {
  const set = loadNotifiedSet();
  if (set.has(videoId)) return false;
  set.add(videoId);
  try {
    const recent = Array.from(set).slice(-100);
    window.localStorage.setItem(NOTIFIED_IDS_STORAGE_KEY, JSON.stringify(recent));
  } catch {
    // Ignore storage quota errors
  }
  return true;
}

function bindServiceWorkerMessageListener(): void {
  if (swMessageListenerBound || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return;
  }
  swMessageListenerBound = true;
  navigator.serviceWorker.addEventListener('message', (event) => {
    const data = event.data as { type?: string; videoId?: string } | undefined;
    if (data?.type === 'PUSH_SHOWN' && data.videoId) {
      markVideoNotified(data.videoId);
    }
  });
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export type BrowserNotificationPermission = NotificationPermission | 'unsupported';

export function getBrowserNotificationPermission(): BrowserNotificationPermission {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission;
}

async function getReadyServiceWorker(timeoutMs = 5000): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }
  bindServiceWorkerMessageListener();
  try {
    const existing = await navigator.serviceWorker.getRegistration();
    if (existing && existing.active) return existing;
    return await Promise.race<ServiceWorkerRegistration | null>([
      navigator.serviceWorker.ready,
      new Promise<ServiceWorkerRegistration | null>((resolve) =>
        window.setTimeout(() => resolve(existing ?? null), timeoutMs)
      ),
    ]);
  } catch {
    return null;
  }
}

export async function syncPushSubscriptionIfAllowed(): Promise<boolean> {
  if (getBrowserNotificationPermission() !== 'granted') return false;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;

  const registration = await getReadyServiceWorker();
  if (!registration || !('pushManager' in registration)) return false;

  try {
    const keyRes = await fetch('/api/notifications/vapid-public-key');
    if (!keyRes.ok) return false;
    const { publicKey } = (await keyRes.json()) as { publicKey?: string };
    if (!publicKey) return false;

    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }

    const subRes = await fetch('/api/notifications/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: subscription.toJSON() }),
    });
    return subRes.ok;
  } catch {
    return false;
  }
}

export async function requestAndSubscribeNotifications(): Promise<{
  permission: BrowserNotificationPermission;
  pushSubscribed: boolean;
}> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return { permission: 'unsupported', pushSubscribed: false };
  }

  let permission: NotificationPermission = Notification.permission;
  if (permission === 'default') {
    permission = await Notification.requestPermission();
  }

  if (permission !== 'granted') {
    return { permission, pushSubscribed: false };
  }

  const pushSubscribed = await syncPushSubscriptionIfAllowed();
  return { permission, pushSubscribed };
}

export async function unsubscribeNotifications(): Promise<void> {
  const registration = await getReadyServiceWorker(1500);
  if (!registration || !('pushManager' in registration)) return;
  try {
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      await fetch('/api/notifications/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      }).catch(() => {});
      await subscription.unsubscribe().catch(() => {});
    }
  } catch {
    // Ignore unsubscribe errors
  }
}

export async function triggerVideoReleaseNotification(payload: {
  videoId: string;
  youtubeId: string;
  title: string;
  category: string;
}): Promise<void> {
  if (getBrowserNotificationPermission() !== 'granted') return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  if (!markVideoNotified(payload.videoId)) return;

  const thumbUrl = `https://i.ytimg.com/vi/${encodeURIComponent(payload.youtubeId)}/hqdefault.jpg`;
  const notifTitle = `New ${payload.category}: ${payload.title}`;
  const targetUrl = `/?watch=${encodeURIComponent(payload.videoId)}`;
  const tag = `filmdrama-video-${payload.videoId}`;

  const options: NotificationOptions & {
    image?: string;
    renotify?: boolean;
    vibrate?: number[];
  } = {
    body: 'Tap to watch now on FilmDrama Box',
    icon: thumbUrl,
    image: thumbUrl,
    badge: '/pwa-192x192.png',
    tag,
    renotify: true,
    vibrate: [120, 40, 120],
    data: { url: targetUrl },
  };

  const registration = await getReadyServiceWorker(1500);
  if (registration && typeof registration.showNotification === 'function') {
    try {
      if (typeof registration.getNotifications === 'function') {
        const active = await registration.getNotifications({ tag });
        if (active.length > 0) return;
      }
      await registration.showNotification(notifTitle, options);
      return;
    } catch {
      // Fall back to Window Notification API below
    }
  }

  try {
    const notification = new Notification(notifTitle, options);
    notification.onclick = () => {
      window.focus();
      window.location.href = targetUrl;
      notification.close();
    };
  } catch {
    // Notification blocked by environment
  }
}
