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

const isPrivateHost = (host: string) => {
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return true;
  if (host.startsWith('127.')) return true;
  if (host.startsWith('10.')) return true;
  if (host.startsWith('192.168.')) return true;
  if (host.startsWith('172.')) {
    const second = Number(host.split('.')[1]);
    if (Number.isFinite(second) && second >= 16 && second <= 31) return true;
  }
  return false;
};

export const signToken = (payload: Record<string, unknown>) => {
  const secret = getJwtSecret();
  return jwt.sign({ jti: randomUUID(), ...payload }, secret, { expiresIn: '7d', algorithm: 'HS256' });
};

export const verifyToken = (token: string): AuthTokenPayload => {
  const secret = getJwtSecret();
  return jwt.verify(token, secret, { algorithms: ['HS256'] }) as AuthTokenPayload;
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
  if (process.env.NODE_ENV === 'production') {
    const clientOrigin = process.env.CLIENT_ORIGIN || '';
    const origins = clientOrigin
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);
    const allowsLocalHttp = origins.some((origin) => {
      try {
        const url = new URL(origin);
        return url.protocol === 'http:' && isPrivateHost(url.hostname);
      } catch {
        return false;
      }
    });
    if (allowsLocalHttp) return false;
    return true;
  }
  const clientOrigin = process.env.CLIENT_ORIGIN || '';
  const origins = clientOrigin
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (origins.length === 0) {
    return false;
  }
  return origins.every((origin) => origin.startsWith('https://'));
};
