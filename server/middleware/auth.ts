import type { NextFunction, Request, Response } from 'express';
import { verifyToken, getAuthCookieName } from '../auth.js';

const COOKIE_NAME = getAuthCookieName();

export const getUserFromRequest = (req: Request) => {
  const token = req.cookies[COOKIE_NAME];
  if (!token) return null;
  try {
    return verifyToken(token);
  } catch {
    return null;
  }
};

export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  const user = getUserFromRequest(req);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  req.user = user;
  next();
};
