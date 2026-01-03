import * as webPush from 'web-push';
import { deletePushSubscriptionByEndpoint, listPushSubscriptionsByUserIds, upsertPushSubscription, deletePushSubscription } from '../models/pushSubscriptionModel.js';
import { logger } from '../utils/logger.js';

type PushPayload = {
  title: string;
  body: string;
  url?: string;
  icon?: string;
  badge?: string;
};

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@example.com';

const getWebPush = () => {
  const maybeDefault = webPush as unknown as { default?: typeof webPush };
  return (maybeDefault.default ?? webPush) as unknown as {
    setVapidDetails: (subject: string, publicKey: string, privateKey: string) => void;
    sendNotification: (subscription: webPush.PushSubscription, payload: string) => Promise<void>;
  };
};

let configured = false;

const isPlaceholder = (value?: string) => {
  if (!value) return true;
  return value === 'replace_me' || value === 'change_me_in_production';
};

const configureWebPush = () => {
  if (configured) return true;
  if (isPlaceholder(VAPID_PUBLIC_KEY) || isPlaceholder(VAPID_PRIVATE_KEY)) return false;
  getWebPush().setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY!, VAPID_PRIVATE_KEY!);
  configured = true;
  return true;
};

export const isPushConfigured = () => !isPlaceholder(VAPID_PUBLIC_KEY) && !isPlaceholder(VAPID_PRIVATE_KEY);

export const getVapidPublicKey = () => (isPlaceholder(VAPID_PUBLIC_KEY) ? null : VAPID_PUBLIC_KEY || null);

export const savePushSubscription = async (userId: string, subscription: { endpoint: string }) => {
  if (!isPushConfigured()) {
    throw new Error('Push not configured');
  }
  await upsertPushSubscription({
    userId,
    endpoint: subscription.endpoint,
    subscription,
  });
};

export const removePushSubscription = async (userId: string, endpoint: string) => {
  await deletePushSubscription({ userId, endpoint });
};

const isStaleSubscriptionError = (error: unknown) => {
  const typed = error as { statusCode?: number };
  return typed?.statusCode === 404 || typed?.statusCode === 410;
};

export const sendPushToUsers = async (userIds: string[], payload: PushPayload) => {
  if (!configureWebPush()) return;
  const subscriptions = await listPushSubscriptionsByUserIds(userIds);
  if (subscriptions.length === 0) return;

  await Promise.allSettled(
    subscriptions.map(async (record) => {
      try {
        const sendNotification =
          getWebPush().sendNotification as unknown as (
            subscription: webPush.PushSubscription,
            payload: string,
            options?: { TTL?: number; urgency?: 'very-low' | 'low' | 'normal' | 'high' }
          ) => Promise<void>;
        await sendNotification(record.subscription as webPush.PushSubscription, JSON.stringify(payload), {
          TTL: 15,
          urgency: 'high',
        });
      } catch (error) {
        if (isStaleSubscriptionError(error)) {
          await deletePushSubscriptionByEndpoint(record.endpoint);
        } else {
          logger.warn('[push] send failed', {
            userId: record.userId,
            endpoint: record.endpoint,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    })
  );
};
