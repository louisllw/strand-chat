import { Router } from 'express';
import type { SocketManager } from '../socket/manager.js';
import { createMessageController } from '../controllers/messageController.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { validate } from '../middleware/validate.js';
import { z } from 'zod';

const createMessagesRouter = (socketManager: SocketManager) => {
  const router = Router();
  const controller = createMessageController(socketManager);

  const toggleReactionSchema = z.object({
    body: z.object({
      emoji: z.string().min(1),
    }),
    params: z.object({
      id: z.string().min(1),
    }),
    query: z.object({}),
  });

  router.post('/:id/reactions', requireAuth, validate(toggleReactionSchema), asyncHandler(controller.toggleReaction));

  return router;
};

export default createMessagesRouter;
