import { ACTIVE_PRESENCE_KEY_PREFIX } from '../constants.js';
import { logger } from '../utils/logger.js';
import { getRedisClient } from './redis.js';

const getPresenceKey = (userId: string, conversationId: string) =>
  `${ACTIVE_PRESENCE_KEY_PREFIX}${userId}:${conversationId}`;

export const setActiveConversationPresence = async ({
  userId,
  conversationId,
  ttlMs,
}: {
  userId: string;
  conversationId: string;
  ttlMs: number;
}) => {
  const redisClient = await getRedisClient();
  if (!redisClient) return false;
  try {
    await redisClient.set(getPresenceKey(userId, conversationId), '1', { PX: ttlMs });
    return true;
  } catch (error) {
    logger.warn('[presence] set active failed', {
      userId,
      conversationId,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
};

export const clearActiveConversationPresence = async ({
  userId,
  conversationId,
}: {
  userId: string;
  conversationId: string;
}) => {
  const redisClient = await getRedisClient();
  if (!redisClient) return false;
  try {
    await redisClient.del(getPresenceKey(userId, conversationId));
    return true;
  } catch (error) {
    logger.warn('[presence] clear active failed', {
      userId,
      conversationId,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
};

export const getActiveUsersForConversation = async ({
  conversationId,
  userIds,
}: {
  conversationId: string;
  userIds: string[];
}) => {
  const redisClient = await getRedisClient();
  if (!redisClient || userIds.length === 0) return new Set<string>();
  try {
    const keys = userIds.map((userId) => getPresenceKey(userId, conversationId));
    const values = await redisClient.mGet(keys);
    const active = new Set<string>();
    values.forEach((value, idx) => {
      if (value) {
        active.add(userIds[idx]);
      }
    });
    return active;
  } catch (error) {
    logger.warn('[presence] get active failed', {
      conversationId,
      error: error instanceof Error ? error.message : String(error),
    });
    return new Set<string>();
  }
};
