import { getRedisClient } from './redis.js';

const TTL_MS = 60 * 1000;
const dedupStore = new Map<string, { message: unknown; expiresAt: number }>();
const CLEANUP_INTERVAL_MS = 60 * 1000;

const cleanup = () => {
  const now = Date.now();
  for (const [key, entry] of dedupStore.entries()) {
    if (entry.expiresAt <= now) {
      dedupStore.delete(key);
    }
  }
};

const getKey = (userId: string, clientMessageId: string) => `${userId}:${clientMessageId}`;

const cleanupInterval = setInterval(cleanup, CLEANUP_INTERVAL_MS);
if (typeof cleanupInterval.unref === 'function') {
  cleanupInterval.unref();
}

export const getMessageDedup = async (userId: string, clientMessageId: string) => {
  if (!clientMessageId) return null;
  const redisClient = await getRedisClient();
  if (redisClient) {
    const stored = await redisClient.get(getKey(userId, clientMessageId));
    if (!stored) return null;
    try {
      return JSON.parse(stored);
    } catch {
      return null;
    }
  }
  cleanup();
  const entry = dedupStore.get(getKey(userId, clientMessageId));
  return entry?.message || null;
};

export const setMessageDedup = async (userId: string, clientMessageId: string, message: unknown) => {
  if (!clientMessageId || !message) return;
  const redisClient = await getRedisClient();
  if (redisClient) {
    await redisClient.set(getKey(userId, clientMessageId), JSON.stringify(message), {
      PX: TTL_MS,
    });
    return;
  }
  cleanup();
  dedupStore.set(getKey(userId, clientMessageId), {
    message,
    expiresAt: Date.now() + TTL_MS,
  });
};
