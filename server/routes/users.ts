import { Router } from 'express';
import {
  usernameAvailability,
  updateMe,
  getEmojiRecentsForMe,
  addEmojiRecentForMe,
  getUserById,
} from '../controllers/userController.js';
import { requireAuth } from '../middleware/auth.js';
import { apiWriteRateLimiter } from '../middleware/rateLimit.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { validate } from '../middleware/validate.js';
import { z } from 'zod';
import { isValidUkNationalPhone } from '../utils/validation.js';

const router = Router();

export const usernameAvailabilitySchema = z.object({
  body: z.object({}).optional(),
  params: z.object({}),
  query: z.object({
    username: z.string().optional(),
  }),
});

export const updateMeSchema = z.object({
  body: z.object({
    username: z.string().optional(),
    email: z.string().email().optional(),
    avatar: z.string().optional().nullable(),
    banner: z.string().optional().nullable(),
    phone: z
      .string()
      .optional()
      .nullable()
      .refine((value) => {
        if (value == null) return true;
        const trimmed = value.trim();
        if (!trimmed) return true;
        return isValidUkNationalPhone(trimmed);
      }, { message: 'Phone number must be a valid UK number.' }),
    bio: z.string().optional().nullable(),
    website: z.string().optional().nullable(),
    socialX: z.string().optional().nullable(),
    socialInstagram: z.string().optional().nullable(),
    socialLinkedin: z.string().optional().nullable(),
    socialTiktok: z.string().optional().nullable(),
    socialYoutube: z.string().optional().nullable(),
    socialFacebook: z.string().optional().nullable(),
    socialGithub: z.string().optional().nullable(),
    status: z.enum(['online', 'offline', 'away']).optional(),
    theme: z.enum(['light', 'dark']).optional(),
  }),
  params: z.object({}),
  query: z.object({}),
});

export const emojiRecentsSchema = z.object({
  body: z.object({}).optional(),
  params: z.object({}),
  query: z.object({
    limit: z.string().optional(),
  }),
});

export const addEmojiSchema = z.object({
  body: z.object({
    emoji: z.string().min(1),
  }),
  params: z.object({}),
  query: z.object({}),
});

export const userIdSchema = z.object({
  body: z.object({}).optional(),
  params: z.object({
    id: z.string().uuid(),
  }),
  query: z.object({}),
});

router.get('/username-availability', requireAuth, validate(usernameAvailabilitySchema), asyncHandler(usernameAvailability));
router.patch('/me', requireAuth, apiWriteRateLimiter, validate(updateMeSchema), asyncHandler(updateMe));
router.get('/me/emoji-recents', requireAuth, validate(emojiRecentsSchema), asyncHandler(getEmojiRecentsForMe));
router.post('/me/emoji-recents', requireAuth, apiWriteRateLimiter, validate(addEmojiSchema), asyncHandler(addEmojiRecentForMe));
router.get('/:id', requireAuth, validate(userIdSchema), asyncHandler(getUserById));

export default router;
