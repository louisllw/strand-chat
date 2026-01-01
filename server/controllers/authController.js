import { signToken, authCookieOptions, getAuthCookieName } from '../auth.js';
import { registerUser, loginUser, logoutUser, getCurrentUser } from '../services/authService.js';
import { mapUser } from '../services/userService.js';

const COOKIE_NAME = getAuthCookieName();

export const register = async (req, res) => {
  const { username, email, password } = req.body || {};
  const userRow = await registerUser({ username, email, password });
  const user = mapUser(userRow);
  const token = signToken({ userId: user.id });
  res.cookie(COOKIE_NAME, token, authCookieOptions());
  res.json({ user });
};

export const login = async (req, res) => {
  const { email, password } = req.body || {};
  const userRow = await loginUser({ email, password });
  const user = mapUser(userRow);
  const token = signToken({ userId: user.id });
  res.cookie(COOKIE_NAME, token, authCookieOptions());
  res.json({ user });
};

export const logout = async (req, res) => {
  await logoutUser(req.user.userId);
  res.clearCookie(COOKIE_NAME, { path: '/' });
  res.json({ ok: true });
};

export const me = async (req, res) => {
  const start = process.hrtime.bigint();
  const userRow = await getCurrentUser(req.user.userId);
  const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
  console.log(`[perf] /api/auth/me ${req.user.userId} ${durationMs.toFixed(1)}ms`);
  res.json({ user: mapUser(userRow) });
};
