import { decodeToken, type AuthTokenPayload } from '../auth.js';
import { getRedisClient } from './redis.js';

const TOKEN_REVOCATION_PREFIX = 'auth:revoked:';
const USER_REVOCATION_PREFIX = 'auth:revoked:user:';
const revokedTokens = new Map<string, number>();
const revokedUsers = new Map<string, number>();

const pruneRevokedTokens = () => {
  const now = Date.now();
  for (const [tokenId, expiresAt] of revokedTokens.entries()) {
    if (expiresAt <= now) {
      revokedTokens.delete(tokenId);
    }
  }
};

const setLocalRevoked = (tokenId: string, expiresAtMs: number) => {
  revokedTokens.set(tokenId, expiresAtMs);
};

const setLocalUserRevoked = (userId: string, revokedAtSeconds: number) => {
  revokedUsers.set(userId, revokedAtSeconds);
};

const setUserRevokedAt = async (userId: string, revokedAtSeconds: number) => {
  const redisClient = await getRedisClient();
  if (redisClient) {
    await redisClient.set(`${USER_REVOCATION_PREFIX}${userId}`, String(revokedAtSeconds));
    return;
  }
  setLocalUserRevoked(userId, revokedAtSeconds);
};

const isLocalRevoked = (tokenId: string) => {
  pruneRevokedTokens();
  const expiresAt = revokedTokens.get(tokenId);
  if (!expiresAt) return false;
  if (expiresAt <= Date.now()) {
    revokedTokens.delete(tokenId);
    return false;
  }
  return true;
};

const getUserRevokedAt = async (userId: string) => {
  const redisClient = await getRedisClient();
  if (redisClient) {
    const value = await redisClient.get(`${USER_REVOCATION_PREFIX}${userId}`);
    return value ? Number(value) : null;
  }
  return revokedUsers.get(userId) ?? null;
};

const getTokenMeta = (token: string, payload?: AuthTokenPayload) => {
  const decoded = payload ?? decodeToken(token);
  if (!decoded?.jti || !decoded.exp) return null;
  return {
    tokenId: decoded.jti,
    expiresAtMs: decoded.exp * 1000,
  };
};

export const revokeToken = async (token: string, payload?: AuthTokenPayload) => {
  const meta = getTokenMeta(token, payload);
  if (!meta) return;
  const ttlMs = meta.expiresAtMs - Date.now();
  if (ttlMs <= 0) return;
  const redisClient = await getRedisClient();
  if (redisClient) {
    await redisClient.set(`${TOKEN_REVOCATION_PREFIX}${meta.tokenId}`, '1', { PX: ttlMs });
    return;
  }
  setLocalRevoked(meta.tokenId, meta.expiresAtMs);
};

export const revokeAllUserTokens = async (userId: string) => {
  const nowSeconds = Math.floor(Date.now() / 1000);
  await setUserRevokedAt(userId, nowSeconds);
};

export const revokeAllUserTokensBefore = async (userId: string, revokedBeforeSeconds: number) => {
  const revokedAt = Math.max(0, Math.floor(revokedBeforeSeconds));
  await setUserRevokedAt(userId, revokedAt);
};

export const isTokenRevoked = async (token: string, payload?: AuthTokenPayload) => {
  const decoded = payload ?? decodeToken(token);
  const meta = getTokenMeta(token, decoded ?? undefined);
  if (!meta || !decoded) return false;
  const userRevokedAt = await getUserRevokedAt(decoded.userId);
  if (userRevokedAt) {
    if (!decoded.iat || decoded.iat <= userRevokedAt) {
      return true;
    }
  }
  const redisClient = await getRedisClient();
  if (redisClient) {
    const exists = await redisClient.exists(`${TOKEN_REVOCATION_PREFIX}${meta.tokenId}`);
    return exists === 1;
  }
  return isLocalRevoked(meta.tokenId);
};
