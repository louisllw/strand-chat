import jwt from 'jsonwebtoken';

const COOKIE_NAME = process.env.COOKIE_NAME || 'strand_auth';

export const signToken = (payload) => {
  const secret = process.env.JWT_SECRET;
  return jwt.sign(payload, secret, { expiresIn: '7d' });
};

export const verifyToken = (token) => {
  const secret = process.env.JWT_SECRET;
  return jwt.verify(token, secret);
};

export const authCookieOptions = () => ({
  httpOnly: true,
  sameSite: 'strict',
  secure: getSecureCookieSetting(),
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: '/',
});

export const getAuthCookieName = () => COOKIE_NAME;

export const getSecureCookieSetting = () => {
  const clientOrigin = process.env.CLIENT_ORIGIN || '';
  const origins = clientOrigin
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (origins.length === 0) {
    return process.env.NODE_ENV === 'production';
  }
  return origins.every((origin) => origin.startsWith('https://'));
};
