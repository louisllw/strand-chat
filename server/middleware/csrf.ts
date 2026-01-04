import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { getSecureCookieSetting } from '../auth.js';
import { getRedisClient } from '../services/redis.js';
import { sendError } from '../utils/errors.js';

const DEFAULT_CSRF_COOKIE_NAME = 'strand_csrf';
const CSRF_COOKIE_NAME = process.env.CSRF_COOKIE_NAME || DEFAULT_CSRF_COOKIE_NAME;
const CSRF_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const CSRF_TOKEN_TTL_MS = Number(process.env.CSRF_TOKEN_TTL_MS || 60 * 60 * 1000);
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const CSRF_STORE_PREFIX = 'csrf:';
const csrfStore = new Map<string, { token: string; expiresAt: number }>();
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000;
const originMatches = (origin: string, allowAll: boolean, allowedOrigins: string[]) => {
  if (allowAll) return true;
  return allowedOrigins.includes(origin);
};

const getAllowedOrigins = () => (process.env.CLIENT_ORIGIN || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const isTrustedOrigin = (req: Request) => {
  const origin = req.get?.('origin');
  if (!origin) return true;
  const allowAll = process.env.NODE_ENV !== 'production' || process.env.CORS_ALLOW_ALL === 'true';
  const allowedOrigins = getAllowedOrigins();
  if (allowAll) return true;
  if (allowedOrigins.length === 0) return false;
  return originMatches(origin, allowAll, allowedOrigins);
};

const cleanup = () => {
  const now = Date.now();
  for (const [key, entry] of csrfStore.entries()) {
    if (entry.expiresAt <= now) {
      csrfStore.delete(key);
    }
  }
};

const cleanupInterval = setInterval(cleanup, CLEANUP_INTERVAL_MS);
if (typeof cleanupInterval.unref === 'function') {
  cleanupInterval.unref();
}

const isLocalRequest = (req: Request) => {
  const raw = req.ip || '';
  const ip = raw.split(',')[0]?.trim() || '';
  if (!ip) return false;
  if (ip === '::1' || ip === '127.0.0.1') return true;
  const normalized = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  if (normalized === '127.0.0.1') return true;
  const parts = normalized.split('.').map((value) => Number(value));
  if (parts.length !== 4 || parts.some((value) => Number.isNaN(value))) return false;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
};

export const getCsrfCookieName = () => {
  if (process.env.CSRF_COOKIE_NAME) {
    return CSRF_COOKIE_NAME;
  }
  return getSecureCookieSetting() ? `__Host-${DEFAULT_CSRF_COOKIE_NAME}` : CSRF_COOKIE_NAME;
};

export const getCsrfCookieOptions = () => ({
  httpOnly: true,
  sameSite: 'strict' as const,
  secure: getSecureCookieSetting(),
  maxAge: CSRF_MAX_AGE_MS,
  path: '/',
});

const generateToken = () => crypto.randomBytes(32).toString('hex');

const getStoredToken = async (sessionId: string): Promise<string | null> => {
  const redisClient = await getRedisClient();
  if (redisClient) {
    return redisClient.get(`${CSRF_STORE_PREFIX}${sessionId}`);
  }
  cleanup();
  const entry = csrfStore.get(sessionId);
  if (!entry || entry.expiresAt <= Date.now()) {
    csrfStore.delete(sessionId);
    return null;
  }
  return entry.token;
};

const setStoredToken = async (sessionId: string, token: string) => {
  const redisClient = await getRedisClient();
  if (redisClient) {
    await redisClient.set(`${CSRF_STORE_PREFIX}${sessionId}`, token, { PX: CSRF_TOKEN_TTL_MS });
    return;
  }
  cleanup();
  csrfStore.set(sessionId, { token, expiresAt: Date.now() + CSRF_TOKEN_TTL_MS });
};

const ensureCsrfSession = (req: Request, res: Response) => {
  const cookieName = getCsrfCookieName();
  let sessionId = req.cookies?.[cookieName];
  if (!sessionId) {
    sessionId = crypto.randomBytes(16).toString('hex');
    res.cookie(cookieName, sessionId, getCsrfCookieOptions());
  }
  return sessionId;
};

export const ensureCsrfCookie = (req: Request, res: Response, next: NextFunction) => {
  ensureCsrfSession(req, res);
  return next();
};

export const issueCsrfToken = async (req: Request, res: Response) => {
  if (!isTrustedOrigin(req)) {
    return sendError(res, 403, 'ORIGIN_INVALID', 'Invalid origin');
  }
  const sessionId = ensureCsrfSession(req, res);
  const token = generateToken();
  await setStoredToken(sessionId, token);
  return token;
};

export const requireCsrf = async (req: Request, res: Response, next: NextFunction) => {
  if (SAFE_METHODS.has(req.method)) {
    return next();
  }
  if (isLocalRequest(req)) {
    return next();
  }
  const headerToken = req.get('x-csrf-token');
  const sessionId = req.cookies?.[getCsrfCookieName()];
  if (!sessionId || !headerToken) {
    return sendError(res, 403, 'CSRF_INVALID', 'Invalid CSRF token');
  }
  const storedToken = await getStoredToken(sessionId);
  if (!storedToken || storedToken !== headerToken) {
    return sendError(res, 403, 'CSRF_INVALID', 'Invalid CSRF token');
  }
  return next();
};
