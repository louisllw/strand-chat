import { Router } from 'express';
import { createConversationController } from '../controllers/conversationController.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

const createConversationsRouter = (socketManager) => {
  const router = Router();
  const controller = createConversationController(socketManager);

  router.get('/', requireAuth, asyncHandler(controller.listConversations));
  router.get('/:id/messages', requireAuth, asyncHandler(controller.listMessages));
  router.post('/:id/messages', requireAuth, asyncHandler(controller.sendMessage));
  router.post('/:id/read', requireAuth, asyncHandler(controller.markRead));
  router.post('/', requireAuth, asyncHandler(controller.createConversation));
  router.post('/direct', requireAuth, asyncHandler(controller.createDirectConversation));
  router.post('/group', requireAuth, asyncHandler(controller.createGroupConversation));
  router.delete('/:id', requireAuth, asyncHandler(controller.deleteConversation));
  router.post('/:id/leave', requireAuth, asyncHandler(controller.leaveConversation));
  router.post('/:id/members', requireAuth, asyncHandler(controller.addMembers));

  return router;
};

export default createConversationsRouter;
