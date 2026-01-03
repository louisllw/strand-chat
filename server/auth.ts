import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';

export interface AuthTokenPayload extends jwt.JwtPayload {
  userId: string;
  jti?: string;
}

const COOKIE_NAME = process.env.COOKIE_NAME || 'strand_auth';

const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is required');
  }
  return secret;
};

export const signToken = (payload: Record<string, unknown>) => {
  const secret = getJwtSecret();
  return jwt.sign({ jti: randomUUID(), ...payload }, secret, { expiresIn: '7d' });
};

export const verifyToken = (token: string): AuthTokenPayload => {
  const secret = getJwtSecret();
  return jwt.verify(token, secret) as AuthTokenPayload;
};

export const decodeToken = (token: string): AuthTokenPayload | null => {
  const decoded = jwt.decode(token);
  if (!decoded || typeof decoded === 'string') return null;
  return decoded as AuthTokenPayload;
};

export const authCookieOptions = () => ({
  httpOnly: true,
  sameSite: 'strict' as const,
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
