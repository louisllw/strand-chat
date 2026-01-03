import type { NextFunction, Request, Response } from 'express';
import { verifyToken, getAuthCookieName, authCookieOptions } from '../auth.js';
import { isTokenRevoked } from '../services/tokenRevocation.js';
import { logger } from '../utils/logger.js';

const COOKIE_NAME = getAuthCookieName();

export const getUserFromRequest = async (req: Request) => {
  const token = req.cookies[COOKIE_NAME];
  if (!token) {
    if (process.env.NODE_ENV !== 'production') {
      const cookieHeader = req.headers.cookie;
      const cookieNames = cookieHeader
        ? cookieHeader.split(';').map((part) => part.split('=')[0]?.trim()).filter(Boolean)
        : [];
      logger.warn('[auth] missing auth cookie', {
        hasCookieHeader: Boolean(cookieHeader),
        cookieNames,
      });
    }
    return null;
  }
  try {
    const decoded = verifyToken(token);
    const revoked = await isTokenRevoked(token, decoded);
    if (revoked) {
      if (process.env.NODE_ENV !== 'production') {
        logger.warn('[auth] revoked auth token', { userId: decoded.userId });
      }
      return null;
    }
    req.authToken = token;
    return decoded;
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      logger.warn('[auth] invalid auth token', { error: error instanceof Error ? error.message : 'unknown' });
    }
    return null;
  }
};

export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  const user = await getUserFromRequest(req);
  if (!user) {
    if (req.cookies?.[COOKIE_NAME]) {
      const { maxAge: _maxAge, ...cookieOptions } = authCookieOptions();
      res.clearCookie(COOKIE_NAME, cookieOptions);
    }
    return res.status(401).json({ error: 'Unauthorized' });
  }
  req.user = user;
  next();
};
