import type { Request, Response } from 'express';
import { signToken, authCookieOptions, getAuthCookieName } from '../auth.js';
import { issueCsrfToken } from '../middleware/csrf.js';
import { registerUser, loginUser, logoutUser, getCurrentUser } from '../services/authService.js';
import { mapUser } from '../services/userService.js';
import { logger } from '../utils/logger.js';

const COOKIE_NAME = getAuthCookieName();

export const register = async (req: Request, res: Response) => {
  const { username, email, password } = req.body || {};
  const userRow = await registerUser({ username, email, password });
  const user = mapUser(userRow);
  const token = signToken({ userId: user.id });
  res.cookie(COOKIE_NAME, token, authCookieOptions());
  res.json({ user });
};

export const login = async (req: Request, res: Response) => {
  const { email, password } = req.body || {};
  const userRow = await loginUser({ email, password });
  const user = mapUser(userRow);
  const token = signToken({ userId: user.id });
  res.cookie(COOKIE_NAME, token, authCookieOptions());
  res.json({ user });
};

export const refresh = async (req: Request, res: Response) => {
  const userRow = await getCurrentUser(req.user!.userId);
  const user = mapUser(userRow);
  const token = signToken({ userId: user.id });
  res.cookie(COOKIE_NAME, token, authCookieOptions());
  res.json({ user });
};

export const csrf = async (req: Request, res: Response) => {
  const token = await issueCsrfToken(req, res);
  res.json({ csrfToken: token });
};

export const logout = async (req: Request, res: Response) => {
  await logoutUser(req.user!.userId);
  res.clearCookie(COOKIE_NAME, { path: '/' });
  res.json({ ok: true });
};

export const me = async (req: Request, res: Response) => {
  const start = process.hrtime.bigint();
  const userRow = await getCurrentUser(req.user!.userId);
  const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
  if (process.env.NODE_ENV !== 'production') {
    logger.debug('[perf] /api/auth/me', {
      userId: req.user!.userId,
      requestId: req.id,
      durationMs: Number(durationMs.toFixed(1)),
    });
  }
  res.json({ user: mapUser(userRow) });
};
