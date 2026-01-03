import { createClient, type RedisClientType } from 'redis';
import { logger } from '../utils/logger.js';

let redisClient: RedisClientType | null = null;
let redisPromise: Promise<RedisClientType | null> | null = null;

export const getRedisClient = async (): Promise<RedisClientType | null> => {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  if (redisClient) return redisClient;
  if (!redisPromise) {
    redisClient = createClient({
      url,
      socket: {
        reconnectStrategy: (retries) => {
          const baseDelay = Number(process.env.REDIS_RETRY_DELAY_MS || 250);
          const maxDelay = Number(process.env.REDIS_RETRY_MAX_DELAY_MS || 5000);
          const delay = Math.min(baseDelay * 2 ** retries, maxDelay);
          return delay;
        },
      },
    });
    redisClient.on('error', (error) => {
      logger.warn('[redis] client error', { error: error?.message });
    });
    redisPromise = redisClient
      .connect()
      .then(() => redisClient)
      .catch((error) => {
        logger.error('[redis] connection failed', { error: error?.message });
        redisClient = null;
        redisPromise = null;
        return null;
      });
  }
  return redisPromise;
};
