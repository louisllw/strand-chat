import { Router } from 'express';
import type { SocketManager } from '../socket/manager.js';
import { createConversationController } from '../controllers/conversationController.js';
import { requireAuth } from '../middleware/auth.js';
import { requireGroupAdmin } from '../middleware/requireGroupAdmin.js';
import { apiWriteRateLimiter, messageRateLimiter } from '../middleware/rateLimit.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { validate } from '../middleware/validate.js';
import { z } from 'zod';

export const idParams = z.object({
  id: z.string().uuid(),
});

export const listConversationsSchema = z.object({
  body: z.object({}).optional(),
  params: z.object({}).optional(),
  query: z.object({
    limit: z.string().optional(),
    cursor: z.string().optional(),
  }),
});

export const listMessagesSchema = z.object({
  body: z.object({}).optional(),
  params: idParams,
  query: z.object({
    limit: z.string().optional(),
    beforeId: z.string().uuid().optional(),
  }),
});

export const sendMessageSchema = z.object({
  body: z.object({
    content: z.string().min(1),
    type: z.enum(['text', 'image', 'file']).optional(),
    attachmentUrl: z.string().optional(),
    replyToId: z.string().uuid().optional(),
    clientMessageId: z.string().optional(),
  }),
  params: idParams,
  query: z.object({}),
});

export const createConversationSchema = z.object({
  body: z.object({
    type: z.enum(['direct', 'group']).optional(),
    name: z.string().optional(),
    participantIds: z.array(z.string().uuid()).optional(),
  }),
  params: z.object({}),
  query: z.object({}),
});

export const createDirectSchema = z.object({
  body: z.object({
    username: z.string().min(1),
  }),
  params: z.object({}),
  query: z.object({}),
});

export const createGroupSchema = z.object({
  body: z.object({
    name: z.string().min(1),
    usernames: z.array(z.string().min(1)).min(1),
  }),
  params: z.object({}),
  query: z.object({}),
});

export const addMembersSchema = z.object({
  body: z.object({
    usernames: z.array(z.string().min(1)).min(1),
  }),
  params: idParams,
  query: z.object({}),
});

export const removeMembersSchema = z.object({
  body: z.object({
    usernames: z.array(z.string().min(1)).min(1),
  }),
  params: idParams,
  query: z.object({}),
});

export const idOnlySchema = z.object({
  body: z.object({}).optional(),
  params: idParams,
  query: z.object({}),
});

export const listMembersSchema = z.object({
  body: z.object({}).optional(),
  params: idParams,
  query: z.object({}),
});

export const updateMemberRoleSchema = z.object({
  body: z.object({
    userId: z.string().uuid(),
    role: z.enum(['admin', 'member']),
  }),
  params: idParams,
  query: z.object({}),
});

export const leaveSchema = z.object({
  body: z.object({
    delegateUserId: z.string().uuid().optional(),
  }).optional(),
  params: idParams,
  query: z.object({}),
});

const createConversationsRouter = (socketManager: SocketManager) => {
  const router = Router();
  const controller = createConversationController(socketManager);

  router.get('/', requireAuth, validate(listConversationsSchema), asyncHandler(controller.listConversations));
  router.get('/:id/messages', requireAuth, validate(listMessagesSchema), asyncHandler(controller.listMessages));
  router.post('/:id/messages', requireAuth, messageRateLimiter, validate(sendMessageSchema), asyncHandler(controller.sendMessage));
  router.post('/:id/read', requireAuth, apiWriteRateLimiter, validate(idOnlySchema), asyncHandler(controller.markRead));
  router.get('/:id/members', requireAuth, validate(listMembersSchema), asyncHandler(controller.listMembers));
  router.post('/', requireAuth, apiWriteRateLimiter, validate(createConversationSchema), asyncHandler(controller.createConversation));
  router.post('/direct', requireAuth, apiWriteRateLimiter, validate(createDirectSchema), asyncHandler(controller.createDirectConversation));
  router.post('/group', requireAuth, apiWriteRateLimiter, validate(createGroupSchema), asyncHandler(controller.createGroupConversation));
  router.delete('/:id', requireAuth, apiWriteRateLimiter, validate(idOnlySchema), asyncHandler(controller.deleteConversation));
  router.post('/:id/leave', requireAuth, apiWriteRateLimiter, validate(leaveSchema), asyncHandler(controller.leaveConversation));
  router.post(
    '/:id/members',
    requireAuth,
    requireGroupAdmin,
    apiWriteRateLimiter,
    validate(addMembersSchema),
    asyncHandler(controller.addMembers)
  );
  router.post(
    '/:id/members/remove',
    requireAuth,
    requireGroupAdmin,
    apiWriteRateLimiter,
    validate(removeMembersSchema),
    asyncHandler(controller.removeMembers)
  );
  router.post(
    '/:id/members/role',
    requireAuth,
    requireGroupAdmin,
    apiWriteRateLimiter,
    validate(updateMemberRoleSchema),
    asyncHandler(controller.updateMemberRole)
  );

  return router;
};

export default createConversationsRouter;
