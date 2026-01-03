import { Router } from 'express';
import { register, login, logout, logoutAll, compromised, me, refresh, csrf } from '../controllers/authController.js';
import { requireAuth } from '../middleware/auth.js';
import { authRateLimiter, csrfRateLimiter } from '../middleware/rateLimit.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { validate } from '../middleware/validate.js';
import { z } from 'zod';

const router = Router();

const registerSchema = z.object({
  body: z.object({
    username: z.string().min(1),
    email: z.string().email(),
    password: z.string().min(1),
  }),
  params: z.object({}),
  query: z.object({}),
});

const loginSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string().min(1),
  }),
  params: z.object({}),
  query: z.object({}),
});

router.post('/register', authRateLimiter, validate(registerSchema), asyncHandler(register));
router.post('/login', authRateLimiter, validate(loginSchema), asyncHandler(login));
router.get('/csrf', csrfRateLimiter, asyncHandler(csrf));
router.post('/refresh', requireAuth, asyncHandler(refresh));
router.post('/logout', requireAuth, asyncHandler(logout));
router.post('/logout-all', requireAuth, asyncHandler(logoutAll));
router.post('/compromised', requireAuth, asyncHandler(compromised));
router.get('/me', requireAuth, asyncHandler(me));

export default router;
