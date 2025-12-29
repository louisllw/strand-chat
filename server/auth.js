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
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: '/',
});

export const getAuthCookieName = () => COOKIE_NAME;
