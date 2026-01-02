import { Router } from 'express';
import type { SocketManager } from '../socket/manager.js';
import { createConversationController } from '../controllers/conversationController.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { validate } from '../middleware/validate.js';
import { z } from 'zod';

const createConversationsRouter = (socketManager: SocketManager) => {
  const router = Router();
  const controller = createConversationController(socketManager);

  const idParams = z.object({
    id: z.string().min(1),
  });

  const listConversationsSchema = z.object({
    body: z.object({}).optional(),
    params: z.object({}).optional(),
    query: z.object({
      limit: z.string().optional(),
      cursor: z.string().optional(),
    }),
  });

  const listMessagesSchema = z.object({
    body: z.object({}).optional(),
    params: idParams,
    query: z.object({
      limit: z.string().optional(),
      beforeId: z.string().optional(),
    }),
  });

  const sendMessageSchema = z.object({
    body: z.object({
      content: z.string().min(1),
      type: z.enum(['text', 'image', 'file']).optional(),
      attachmentUrl: z.string().optional(),
      replyToId: z.string().optional(),
      clientMessageId: z.string().optional(),
    }),
    params: idParams,
    query: z.object({}),
  });

  const createConversationSchema = z.object({
    body: z.object({
      type: z.enum(['direct', 'group']).optional(),
      name: z.string().optional(),
      participantIds: z.array(z.string().min(1)).optional(),
    }),
    params: z.object({}),
    query: z.object({}),
  });

  const createDirectSchema = z.object({
    body: z.object({
      username: z.string().min(1),
    }),
    params: z.object({}),
    query: z.object({}),
  });

  const createGroupSchema = z.object({
    body: z.object({
      name: z.string().min(1),
      usernames: z.array(z.string().min(1)).min(1),
    }),
    params: z.object({}),
    query: z.object({}),
  });

  const addMembersSchema = z.object({
    body: z.object({
      usernames: z.array(z.string().min(1)).min(1),
    }),
    params: idParams,
    query: z.object({}),
  });

  const idOnlySchema = z.object({
    body: z.object({}).optional(),
    params: idParams,
    query: z.object({}),
  });

  router.get('/', requireAuth, validate(listConversationsSchema), asyncHandler(controller.listConversations));
  router.get('/:id/messages', requireAuth, validate(listMessagesSchema), asyncHandler(controller.listMessages));
  router.post('/:id/messages', requireAuth, validate(sendMessageSchema), asyncHandler(controller.sendMessage));
  router.post('/:id/read', requireAuth, validate(idOnlySchema), asyncHandler(controller.markRead));
  router.post('/', requireAuth, validate(createConversationSchema), asyncHandler(controller.createConversation));
  router.post('/direct', requireAuth, validate(createDirectSchema), asyncHandler(controller.createDirectConversation));
  router.post('/group', requireAuth, validate(createGroupSchema), asyncHandler(controller.createGroupConversation));
  router.delete('/:id', requireAuth, validate(idOnlySchema), asyncHandler(controller.deleteConversation));
  router.post('/:id/leave', requireAuth, validate(idOnlySchema), asyncHandler(controller.leaveConversation));
  router.post('/:id/members', requireAuth, validate(addMembersSchema), asyncHandler(controller.addMembers));

  return router;
};

export default createConversationsRouter;
