import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { getVapidPublicKey, isPushConfigured, removePushSubscription, savePushSubscription } from '../services/pushService.js';
import { sendError } from '../utils/errors.js';

const pushSubscriptionSchema = z.object({
  body: z.object({
    endpoint: z.string().url(),
    expirationTime: z.number().nullable().optional(),
    keys: z.object({
      p256dh: z.string(),
      auth: z.string(),
    }),
  }),
  params: z.object({}).optional(),
  query: z.object({}).optional(),
});

const unsubscribeSchema = z.object({
  body: z.object({
    endpoint: z.string().url(),
  }),
  params: z.object({}).optional(),
  query: z.object({}).optional(),
});

const router = Router();

router.get('/vapid-public-key', requireAuth, (_req, res) => {
  const publicKey = getVapidPublicKey();
  if (!publicKey) {
    return sendError(res, 503, 'PUSH_NOT_CONFIGURED', 'Push not configured');
  }
  return res.json({ publicKey });
});

router.post(
  '/subscribe',
  requireAuth,
  validate(pushSubscriptionSchema),
  asyncHandler(async (req, res) => {
    if (!isPushConfigured()) {
      return sendError(res, 503, 'PUSH_NOT_CONFIGURED', 'Push not configured');
    }
    await savePushSubscription(req.user!.userId, req.body);
    return res.json({ ok: true });
  })
);

router.post(
  '/unsubscribe',
  requireAuth,
  validate(unsubscribeSchema),
  asyncHandler(async (req, res) => {
    await removePushSubscription(req.user!.userId, req.body.endpoint);
    return res.json({ ok: true });
  })
);

export default router;
