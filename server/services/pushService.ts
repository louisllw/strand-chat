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

const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@example.com';
const DEFAULT_TTL_SECONDS = 300;

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

const readVapidPublicKey = () => process.env.VAPID_PUBLIC_KEY;

const readVapidPrivateKey = () => process.env.VAPID_PRIVATE_KEY;

const getPushTtlSeconds = () => {
  const ttl = Number(process.env.PUSH_TTL_SECONDS || DEFAULT_TTL_SECONDS);
  if (!Number.isFinite(ttl) || ttl <= 0) return DEFAULT_TTL_SECONDS;
  return ttl;
};

const configureWebPush = () => {
  if (configured) return true;
  const publicKey = readVapidPublicKey();
  const privateKey = readVapidPrivateKey();
  if (isPlaceholder(publicKey) || isPlaceholder(privateKey)) return false;
  getWebPush().setVapidDetails(VAPID_SUBJECT, publicKey!, privateKey!);
  configured = true;
  return true;
};

export const isPushConfigured = () => {
  const publicKey = readVapidPublicKey();
  const privateKey = readVapidPrivateKey();
  return !isPlaceholder(publicKey) && !isPlaceholder(privateKey);
};

export const getVapidPublicKey = () => {
  const publicKey = readVapidPublicKey();
  return isPlaceholder(publicKey) ? null : publicKey || null;
};

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
          TTL: getPushTtlSeconds(),
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
