import { createClient, type RedisClientType } from 'redis';
import { logger } from '../utils/logger.js';

let redisClient: RedisClientType | null = null;
let redisPromise: Promise<RedisClientType | null> | null = null;

export const getRedisClient = async (): Promise<RedisClientType | null> => {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  if (redisClient) return redisClient;
  if (!redisPromise) {
    redisClient = createClient({ url });
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
