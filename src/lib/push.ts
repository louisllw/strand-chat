import { apiFetch } from './api';

type PushSubscriptionKeys = {
  p256dh: string;
  auth: string;
};

type PushSubscriptionPayload = {
  endpoint: string;
  expirationTime?: number | null;
  keys: PushSubscriptionKeys;
};

type PushEnableResult =
  | { status: 'subscribed' }
  | { status: 'unsupported' }
  | { status: 'denied' }
  | { status: 'requires-install' }
  | { status: 'error'; message: string };

const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

const isStandalone = () => {
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia('(display-mode: standalone)').matches || Boolean(nav.standalone);
};

const isPushSupported = () => {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
};

const urlBase64ToUint8Array = (base64String: string) => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
};

export const registerServiceWorker = async () => {
  if (!('serviceWorker' in navigator)) return null;
  try {
    return await navigator.serviceWorker.register('/sw.js');
  } catch {
    return null;
  }
};

export const getPushSubscription = async () => {
  if (!('serviceWorker' in navigator)) return null;
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) return null;
  return registration.pushManager.getSubscription();
};

const serializeSubscription = (subscription: PushSubscription): PushSubscriptionPayload => {
  return JSON.parse(JSON.stringify(subscription)) as PushSubscriptionPayload;
};

export const enablePushNotifications = async (): Promise<PushEnableResult> => {
  try {
    if (!isPushSupported()) {
      return { status: 'unsupported' };
    }
    if (isIOS() && !isStandalone()) {
      return { status: 'requires-install' };
    }
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return { status: 'denied' };
    }

    const registration = (await navigator.serviceWorker.getRegistration()) ?? (await registerServiceWorker());
    if (!registration) {
      return { status: 'error', message: 'Service worker registration failed.' };
    }

    const { publicKey } = await apiFetch<{ publicKey: string }>('/api/push/vapid-public-key');
    if (!publicKey) {
      return { status: 'error', message: 'Push is not configured on the server.' };
    }

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });

    await apiFetch('/api/push/subscribe', {
      method: 'POST',
      body: JSON.stringify(serializeSubscription(subscription)),
    });

    return { status: 'subscribed' };
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Push setup failed.',
    };
  }
};

export const disablePushNotifications = async () => {
  if (!isPushSupported()) return false;
  try {
    const subscription = await getPushSubscription();
    if (!subscription) return true;
    await apiFetch('/api/push/unsubscribe', {
      method: 'POST',
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    });
    await subscription.unsubscribe();
    return true;
  } catch {
    return false;
  }
};

export const getPushStatus = async () => {
  if (!isPushSupported()) return { supported: false, subscribed: false };
  const subscription = await getPushSubscription();
  return { supported: true, subscribed: Boolean(subscription) };
};
