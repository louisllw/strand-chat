import type { Request } from 'express';
import rateLimit from 'express-rate-limit';

const getRateLimitKey = (req: Request) => req.user?.userId ?? req.ip ?? 'unknown';

const defaultOptions = {
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getRateLimitKey,
  message: { error: 'Too many requests, please try again later.' },
};

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  ...defaultOptions,
  message: { error: 'Too many attempts, please try again later.' },
});

export const apiWriteRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  ...defaultOptions,
});

export const messageRateLimiter = rateLimit({
  windowMs: 10 * 1000,
  max: 30,
  ...defaultOptions,
});
