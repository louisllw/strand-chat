import type { Request, Response } from 'express';
import type { SocketManager } from '../socket/manager.js';
import {
  listConversations,
  listMessagesForConversation,
  createConversationWithParticipants,
  createDirectChat,
  createGroupChat,
  hideConversation,
  leaveConversation,
  addMembersToConversation,
  removeMembersFromConversation,
  markConversationAsRead,
  getConversationInfoForMember,
  listConversationMemberIdsForUser,
  listConversationMembersForUser,
  updateConversationMemberRole,
} from '../services/conversationService.js';
import { listMessages, createMessage } from '../services/messageService.js';
import { getMessageCursor } from '../models/messageModel.js';
import { getMessageDedup, setMessageDedup } from '../services/messageDedup.js';
import { sanitizeText } from '../utils/sanitize.js';
import {
  isAttachmentUrlTooLong,
  isDataUrlTooLarge,
  isMessageTooLong,
} from '../utils/validation.js';
import { logger } from '../utils/logger.js';
import { sendPushToUsers } from '../services/pushService.js';
import { getActiveUsersForConversation } from '../services/presence.js';
import { sendError } from '../utils/errors.js';

const ACTIVE_PRESENCE_TTL_MS = 20000;

export const createConversationController = (socketManager: SocketManager) => ({
  listConversations: async (req: Request, res: Response) => {
    const start = process.hrtime.bigint();
    const limitParam = Number(req.query.limit);
    const limit = Number.isFinite(limitParam) ? limitParam : undefined;
    const cursor = typeof req.query.cursor === 'string' && req.query.cursor.length > 0
      ? req.query.cursor
      : null;
    const parsedCursor = cursor ? (() => {
      const [sortTs, id] = cursor.split('|');
      if (!sortTs || !id) return null;
      const ts = new Date(sortTs);
      if (Number.isNaN(ts.getTime())) return null;
      return { sortTs: ts.toISOString(), id };
    })() : null;
    if (cursor && !parsedCursor) {
      return sendError(res, 400, 'INVALID_CURSOR', 'Invalid cursor');
    }
    const { conversations, nextCursor } = await listConversations({
      userId: req.user!.userId,
      limit,
      cursor: parsedCursor,
    });
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    if (process.env.NODE_ENV !== 'production') {
      logger.debug('[perf] /api/conversations', {
        userId: req.user!.userId,
        requestId: req.id,
        durationMs: Number(durationMs.toFixed(1)),
      });
    }
    const cursorPayload = nextCursor ? `${nextCursor.sortTs}|${nextCursor.id}` : null;
    res.json({ conversations, nextCursor: cursorPayload });
  },

  listMessages: async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    const conversationId = req.params.id;
    const limitParam = Number(req.query.limit);
    const limit = Number.isFinite(limitParam) && limitParam > 0
      ? Math.min(limitParam, 500)
      : 50;
    const beforeId = typeof req.query.beforeId === 'string' ? req.query.beforeId : null;
    let beforeCreatedAt = null;
    if (beforeId) {
      const cursor = await getMessageCursor({ conversationId, messageId: beforeId });
      if (!cursor) {
        return sendError(res, 400, 'INVALID_MESSAGE_CURSOR', 'Invalid message cursor');
      }
      beforeCreatedAt = cursor.created_at;
    }

    const { clearedAt, joinedAt, leftAt } = await listMessagesForConversation({ conversationId, userId });
    const messages = await listMessages({
      conversationId,
      userId,
      limit,
      clearedAt,
      joinedAt,
      leftAt,
      beforeCreatedAt,
      beforeId,
    });
    res.json({ messages });
  },

  sendMessage: async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    const conversationId = req.params.id;
    const { content, type = 'text', attachmentUrl, attachmentMeta, replyToId, clientMessageId } = req.body || {};
    const sanitizedContent = sanitizeText(content);

    if (!sanitizedContent.trim()) {
      return sendError(res, 400, 'MESSAGE_CONTENT_REQUIRED', 'Message content required');
    }
    if (isMessageTooLong(sanitizedContent)) {
      return sendError(res, 400, 'MESSAGE_TOO_LONG', 'Message too long');
    }
    if (attachmentUrl) {
      if (typeof attachmentUrl !== 'string') {
        return sendError(res, 400, 'ATTACHMENT_INVALID', 'Invalid attachment');
      }
      if (isAttachmentUrlTooLong(attachmentUrl) || isDataUrlTooLarge(attachmentUrl)) {
        return sendError(res, 400, 'ATTACHMENT_TOO_LARGE', 'Attachment too large');
      }
    }

    if (clientMessageId) {
      const existing = await getMessageDedup(userId, clientMessageId);
      if (existing) {
        return res.json({ message: existing });
      }
    }

    const result = await createMessage({
      conversationId,
      userId,
      content: sanitizedContent,
      type,
      attachmentUrl,
      attachmentMeta,
      replyToId,
    });
    if (!result.replyOk) {
      return sendError(res, 400, 'REPLY_INVALID', 'Invalid reply target');
    }
    if (!result.isMember) {
      return sendError(res, 403, 'FORBIDDEN', 'Forbidden');
    }
    if (!result.message) {
      return sendError(res, 500, 'MESSAGE_SEND_FAILED', 'Failed to send message');
    }

    if (clientMessageId) {
      await setMessageDedup(userId, clientMessageId, result.message);
    }

    result.unhiddenUserIds.forEach((memberId) => {
      socketManager.emitToUser(memberId, 'conversation:created', { conversationId });
      socketManager.addConversationToUserSockets(memberId, conversationId).catch((error) => {
        logger.warn('[socket] add conversation failed', {
          userId: memberId,
          conversationId,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    });

    const message = result.message;
    socketManager.emitToConversation(conversationId, 'message:new', message);

    void (async () => {
      const sender = message.senderUsername ? `@${message.senderUsername}` : 'Someone';
      const { type: conversationType, name: conversationName } = await getConversationInfoForMember({
        conversationId,
        userId,
      });
      const groupPrefix = conversationType === 'group' && conversationName
        ? `${conversationName}: `
        : '';
      const pushBody = `${groupPrefix}${message.type === 'image'
        ? 'Sent an image'
        : message.type === 'file'
          ? 'Sent a file'
          : message.content}`;
      const members = await listConversationMemberIdsForUser({ conversationId, userId });
      const sockets = await socketManager.io.in(conversationId).fetchSockets();
      const activeUserIds = new Set<string>();
      const now = Date.now();
      sockets.forEach((socket) => {
        const lastActiveAt = socket.data.activeConversationAt;
        if (
          socket.user?.userId
          && socket.data.activeConversationId === conversationId
          && lastActiveAt
          && now - lastActiveAt < ACTIVE_PRESENCE_TTL_MS
        ) {
          activeUserIds.add(socket.user.userId);
        }
      });
      const redisActive = await getActiveUsersForConversation({
        conversationId,
        userIds: members,
      });
      redisActive.forEach((memberId) => activeUserIds.add(memberId));
      const recipients = members.filter((memberId) => (
        memberId !== userId && !activeUserIds.has(memberId)
      ));
      if (recipients.length > 0) {
        await sendPushToUsers(recipients, {
          title: sender,
          body: pushBody,
          url: `/chat?conversationId=${encodeURIComponent(conversationId)}`,
          icon: '/pwa-icon-v2.svg',
          badge: '/pwa-icon-v2.svg',
        });
      }
    })().catch((error) => {
      logger.warn('[push] send failed', {
        conversationId,
        error: error instanceof Error ? error.message : String(error),
      });
    });

    res.json({ message: result.message });
  },

  markRead: async (req: Request, res: Response) => {
    await markConversationAsRead({
      conversationId: req.params.id,
      userId: req.user!.userId,
    });
    res.json({ ok: true });
  },

  listMembers: async (req: Request, res: Response) => {
    const members = await listConversationMembersForUser({
      conversationId: req.params.id,
      userId: req.user!.userId,
    });
    res.json({ members });
  },

  createConversation: async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    const { type = 'direct', name, participantIds } = req.body || {};
    const { conversationId, memberIds } = await createConversationWithParticipants({
      userId,
      type,
      name,
      participantIds,
    });
    memberIds.forEach((memberId) => {
      socketManager.emitToUser(memberId, 'conversation:created', { conversationId });
      socketManager.addConversationToUserSockets(memberId, conversationId).catch((error) => {
        logger.warn('[socket] add conversation failed', {
          userId: memberId,
          conversationId,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    });
    res.json({ conversationId });
  },

  createDirectConversation: async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    const { username } = req.body || {};
    const { conversationId, memberIds } = await createDirectChat({ userId, username });
    memberIds.forEach((memberId) => {
      socketManager.emitToUser(memberId, 'conversation:created', { conversationId });
      socketManager.addConversationToUserSockets(memberId, conversationId).catch((error) => {
        logger.warn('[socket] add conversation failed', {
          userId: memberId,
          conversationId,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    });
    res.json({ conversationId });
  },

  createGroupConversation: async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    const { name, usernames } = req.body || {};
    const { conversationId, memberIds } = await createGroupChat({ userId, name, usernames });
    memberIds.forEach((memberId) => {
      socketManager.emitToUser(memberId, 'conversation:created', { conversationId });
      socketManager.addConversationToUserSockets(memberId, conversationId).catch((error) => {
        logger.warn('[socket] add conversation failed', {
          userId: memberId,
          conversationId,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    });
    res.json({ conversationId });
  },

  deleteConversation: async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    const conversationId = req.params.id;
    await hideConversation({ conversationId, userId });
    void socketManager.removeConversationFromUserSockets(userId, conversationId);
    res.json({ ok: true });
  },

  leaveConversation: async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    const conversationId = req.params.id;
    const { delegateUserId } = req.body || {};
    const result = await leaveConversation({ conversationId, userId, delegateUserId });
    void socketManager.removeConversationFromUserSockets(userId, conversationId);

    result.systemMessages.forEach((message) => {
      socketManager.emitToConversation(conversationId, 'message:new', message);
    });
    result.remainingMemberIds.forEach((memberId) => {
      socketManager.emitToUser(memberId, 'conversation:updated', { conversationId });
    });
    res.json({ ok: true, deleted: result.remainingMemberIds.length === 0 });
  },

  addMembers: async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    const conversationId = req.params.id;
    const { usernames } = req.body || {};
    const result = await addMembersToConversation({ conversationId, userId, usernames });
    if (result.added === 0) {
      return res.json({ added: 0 });
    }
    const addedIds = result.addedIds ?? [];
    const currentMembers = result.currentMembers ?? [];

    if (result.systemMessage) {
      socketManager.emitToConversation(conversationId, 'message:new', result.systemMessage);
    }
    addedIds.forEach((memberId) => {
      socketManager.emitToUser(memberId, 'conversation:created', { conversationId });
      void socketManager.addConversationToUserSockets(memberId, conversationId);
    });
    currentMembers.forEach((memberId) => {
      socketManager.emitToUser(memberId, 'conversation:updated', { conversationId });
    });

    res.json({ added: result.added });
  },

  removeMembers: async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    const conversationId = req.params.id;
    const { usernames } = req.body || {};
    const result = await removeMembersFromConversation({ conversationId, userId, usernames });
    if (result.removed === 0) {
      return res.json({ removed: 0 });
    }
    const removedIds = result.removedIds ?? [];
    const currentMembers = result.currentMembers ?? [];

    if (result.systemMessage) {
      socketManager.emitToConversation(conversationId, 'message:new', result.systemMessage);
    }
    removedIds.forEach((memberId) => {
      socketManager.emitToUser(memberId, 'conversation:updated', { conversationId });
      socketManager.emitToUser(memberId, 'conversation:removed', {
        conversationId,
        name: result.conversationName ?? null,
      });
      socketManager.removeConversationFromUserSockets(memberId, conversationId).catch((error) => {
        logger.warn('[socket] remove conversation failed', {
          userId: memberId,
          conversationId,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    });
    currentMembers.forEach((memberId) => {
      socketManager.emitToUser(memberId, 'conversation:updated', { conversationId });
    });

    res.json({ removed: result.removed });
  },

  updateMemberRole: async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    const conversationId = req.params.id;
    const { userId: targetUserId, role } = req.body || {};
    const result = await updateConversationMemberRole({
      conversationId,
      userId,
      targetUserId,
      role,
    });
    if (result?.systemMessage) {
      socketManager.emitToConversation(conversationId, 'message:new', result.systemMessage);
    }
    (result?.currentMembers ?? []).forEach((memberId) => {
      socketManager.emitToUser(memberId, 'conversation:updated', { conversationId });
    });
    res.json({ ok: true });
  },
});
