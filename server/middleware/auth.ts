import type { NextFunction, Request, Response } from 'express';
import { verifyToken, getAuthCookieName } from '../auth.js';
import { isTokenRevoked } from '../services/tokenRevocation.js';

const COOKIE_NAME = getAuthCookieName();

export const getUserFromRequest = async (req: Request) => {
  const token = req.cookies[COOKIE_NAME];
  if (!token) return null;
  try {
    const decoded = verifyToken(token);
    const revoked = await isTokenRevoked(token, decoded);
    if (revoked) return null;
    req.authToken = token;
    return decoded;
  } catch {
    return null;
  }
};

export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  const user = await getUserFromRequest(req);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  req.user = user;
  next();
};
