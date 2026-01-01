import { Router } from 'express';
import { createMessageController } from '../controllers/messageController.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

const createMessagesRouter = (socketManager) => {
  const router = Router();
  const controller = createMessageController(socketManager);

  router.post('/:id/reactions', requireAuth, asyncHandler(controller.toggleReaction));

  return router;
};

export default createMessagesRouter;
