import { Router } from 'express';
import type { SocketManager } from '../socket/manager.js';
import { createMessageController } from '../controllers/messageController.js';
import { requireAuth } from '../middleware/auth.js';
import { messageRateLimiter } from '../middleware/rateLimit.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { validate } from '../middleware/validate.js';
import { z } from 'zod';

export const toggleReactionSchema = z.object({
  body: z.object({
    emoji: z.string().min(1),
  }),
  params: z.object({
    id: z.string().uuid(),
  }),
  query: z.object({}),
});

const createMessagesRouter = (socketManager: SocketManager) => {
  const router = Router();
  const controller = createMessageController(socketManager);

  router.post('/:id/reactions', requireAuth, messageRateLimiter, validate(toggleReactionSchema), asyncHandler(controller.toggleReaction));

  return router;
};

export default createMessagesRouter;
