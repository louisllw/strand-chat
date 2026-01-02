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
  markConversationAsRead,
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
      return res.status(400).json({ error: 'Invalid cursor' });
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
        return res.status(400).json({ error: 'Invalid message cursor' });
      }
      beforeCreatedAt = cursor.created_at;
    }

    const { clearedAt } = await listMessagesForConversation({ conversationId, userId });
    const messages = await listMessages({
      conversationId,
      userId,
      limit,
      clearedAt,
      beforeCreatedAt,
      beforeId,
    });
    res.json({ messages });
  },

  sendMessage: async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    const conversationId = req.params.id;
    const { content, type = 'text', attachmentUrl, replyToId, clientMessageId } = req.body || {};
    const sanitizedContent = sanitizeText(content);

    if (!sanitizedContent.trim()) {
      return res.status(400).json({ error: 'Message content required' });
    }
    if (isMessageTooLong(sanitizedContent)) {
      return res.status(400).json({ error: 'Message too long' });
    }
    if (attachmentUrl) {
      if (typeof attachmentUrl !== 'string') {
        return res.status(400).json({ error: 'Invalid attachment' });
      }
      if (isAttachmentUrlTooLong(attachmentUrl) || isDataUrlTooLarge(attachmentUrl)) {
        return res.status(400).json({ error: 'Attachment too large' });
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
      replyToId,
    });
    if (!result.replyOk) {
      return res.status(400).json({ error: 'Invalid reply target' });
    }
    if (!result.isMember) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    if (!result.message) {
      return res.status(500).json({ error: 'Failed to send message' });
    }

    if (clientMessageId) {
      await setMessageDedup(userId, clientMessageId, result.message);
    }

    result.unhiddenUserIds.forEach((memberId) => {
      socketManager.emitToUser(memberId, 'conversation:created', { conversationId });
      void socketManager.addConversationToUserSockets(memberId, conversationId);
    });

    socketManager.emitToConversation(conversationId, 'message:new', result.message);

    res.json({ message: result.message });
  },

  markRead: async (req: Request, res: Response) => {
    await markConversationAsRead({
      conversationId: req.params.id,
      userId: req.user!.userId,
    });
    res.json({ ok: true });
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
      void socketManager.addConversationToUserSockets(memberId, conversationId);
    });
    res.json({ conversationId });
  },

  createDirectConversation: async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    const { username } = req.body || {};
    const { conversationId, memberIds } = await createDirectChat({ userId, username });
    memberIds.forEach((memberId) => {
      socketManager.emitToUser(memberId, 'conversation:created', { conversationId });
      void socketManager.addConversationToUserSockets(memberId, conversationId);
    });
    res.json({ conversationId });
  },

  createGroupConversation: async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    const { name, usernames } = req.body || {};
    const { conversationId, memberIds } = await createGroupChat({ userId, name, usernames });
    memberIds.forEach((memberId) => {
      socketManager.emitToUser(memberId, 'conversation:created', { conversationId });
      void socketManager.addConversationToUserSockets(memberId, conversationId);
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
    const result = await leaveConversation({ conversationId, userId });
    void socketManager.removeConversationFromUserSockets(userId, conversationId);

    if (result.systemMessage) {
      socketManager.emitToConversation(conversationId, 'message:new', result.systemMessage);
    }
    result.remainingMemberIds.forEach((memberId) => {
      socketManager.emitToUser(memberId, 'conversation:updated', { conversationId });
    });
    res.json({ ok: true });
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
});
