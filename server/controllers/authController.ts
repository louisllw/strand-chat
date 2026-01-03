import type { Request, Response } from 'express';
import { signToken, authCookieOptions, getAuthCookieName, decodeToken } from '../auth.js';
import { issueCsrfToken } from '../middleware/csrf.js';
import { registerUser, loginUser, logoutUser, getCurrentUser, markAccountCompromised } from '../services/authService.js';
import { mapUser } from '../services/userService.js';
import { logger } from '../utils/logger.js';
import { revokeAllUserTokens, revokeAllUserTokensBefore, revokeToken } from '../services/tokenRevocation.js';

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
  if (req.authToken) {
    await revokeToken(req.authToken, req.user);
  }
  const { maxAge: _maxAge, ...cookieOptions } = authCookieOptions();
  res.clearCookie(COOKIE_NAME, cookieOptions);
  res.json({ ok: true });
};

export const logoutAll = async (req: Request, res: Response) => {
  await logoutUser(req.user!.userId);
  await revokeAllUserTokens(req.user!.userId);
  const { maxAge: _maxAge, ...cookieOptions } = authCookieOptions();
  res.clearCookie(COOKIE_NAME, cookieOptions);
  res.json({ ok: true });
};

export const compromised = async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  await markAccountCompromised(userId);
  const token = signToken({ userId });
  const decoded = decodeToken(token);
  if (decoded?.iat) {
    await revokeAllUserTokensBefore(userId, decoded.iat - 1);
  } else {
    await revokeAllUserTokens(userId);
  }
  res.cookie(COOKIE_NAME, token, authCookieOptions());
  const userRow = await getCurrentUser(userId);
  res.json({ user: mapUser(userRow) });
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
