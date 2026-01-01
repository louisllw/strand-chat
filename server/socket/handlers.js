import { verifyToken, getAuthCookieName } from '../auth.js';
import { getConversationMembership, listConversationIdsForUser } from '../models/conversationModel.js';
import { updateUserStatus, updateUserStatusWithProfile } from '../models/userModel.js';
import { createMessage, toggleReaction } from '../services/messageService.js';
import {
  allowedReactions,
  isAttachmentUrlTooLong,
  isDataUrlTooLarge,
  isMessageTooLong,
} from '../utils/validation.js';
import { sanitizeText } from '../utils/sanitize.js';
import cookieParser from 'cookie-parser';
import { logger } from '../utils/logger.js';
import { getMessageDedup, setMessageDedup } from '../services/messageDedup.js';

const cookieMiddleware = cookieParser();
const connectionCounts = new Map();
const userRateLimits = new Map();
const MAX_SOCKETS_PER_USER = Number(process.env.SOCKET_MAX_CONNECTIONS || 5);
const CONNECTION_SWEEP_MS = Number(process.env.SOCKET_CONNECTION_SWEEP_MS || 5 * 60 * 1000);
const MESSAGE_RATE_LIMIT = Number(process.env.SOCKET_MESSAGE_LIMIT || 12);
const MESSAGE_RATE_WINDOW_MS = Number(process.env.SOCKET_MESSAGE_WINDOW_MS || 10 * 1000);
const REACTION_RATE_LIMIT = Number(process.env.SOCKET_REACTION_LIMIT || 20);
const REACTION_RATE_WINDOW_MS = Number(process.env.SOCKET_REACTION_WINDOW_MS || 10 * 1000);
const TYPING_RATE_LIMIT = Number(process.env.SOCKET_TYPING_LIMIT || 40);
const TYPING_RATE_WINDOW_MS = Number(process.env.SOCKET_TYPING_WINDOW_MS || 10 * 1000);

export const registerSocketHandlers = (io, socketManager) => {
  const COOKIE_NAME = getAuthCookieName();
  const sweepConnections = () => {
    connectionCounts.clear();
    io.of('/').sockets.forEach((socket) => {
      const userId = socket.user?.userId;
      if (!userId) return;
      connectionCounts.set(userId, (connectionCounts.get(userId) || 0) + 1);
    });
    for (const userId of userRateLimits.keys()) {
      if (!connectionCounts.has(userId)) {
        userRateLimits.delete(userId);
      }
    }
  };
  const sweepInterval = setInterval(sweepConnections, CONNECTION_SWEEP_MS);
  if (typeof sweepInterval.unref === 'function') {
    sweepInterval.unref();
  }

  io.use((socket, next) => {
    cookieMiddleware(socket.request, {}, (error) => {
      if (error) return next(error);
      const token = socket.request.cookies?.[COOKIE_NAME];
      if (!token) {
        const logPayload = {
          hasCookieHeader: Boolean(socket.request.headers.cookie),
        };
        if (process.env.NODE_ENV !== 'production') {
          logPayload.origin = socket.request.headers.origin;
        }
        logger.warn('[socket] Unauthorized: missing auth cookie', logPayload);
        return next(new Error('Unauthorized'));
      }
      try {
        const decoded = verifyToken(token);
        socket.user = { userId: decoded.userId };
      } catch {
        const logPayload = {};
        if (process.env.NODE_ENV !== 'production') {
          logPayload.origin = socket.request.headers.origin;
        }
        logger.warn('[socket] Unauthorized: invalid auth token', logPayload);
        return next(new Error('Unauthorized'));
      }

      const current = connectionCounts.get(socket.user.userId) || 0;
      if (current >= MAX_SOCKETS_PER_USER) {
        logger.warn('[socket] Connection limit exceeded', {
          userId: socket.user.userId,
          current,
        });
        return next(new Error('Too many connections'));
      }
      connectionCounts.set(socket.user.userId, current + 1);
      socket.data.connectionCounted = true;
      socket.once('disconnect', () => {
        if (!socket.data.connectionCounted) return;
        const remaining = (connectionCounts.get(socket.user.userId) || 1) - 1;
        if (remaining <= 0) {
          connectionCounts.delete(socket.user.userId);
        } else {
          connectionCounts.set(socket.user.userId, remaining);
        }
      });
      return next();
    });
  });

  io.on('connection', async (socket) => {
    const { userId } = socket.user;
    if (!socket.data.rateLimits) {
      socket.data.rateLimits = new Map();
    }
    if (!userRateLimits.has(userId)) {
      userRateLimits.set(userId, new Map());
    }
    socket.join(`user:${userId}`);

    const userProfile = await updateUserStatusWithProfile(userId, 'online');
    const conversationIds = await listConversationIdsForUser(userId);
    socket.data.conversationIds = new Set(conversationIds);
    const typingState = new Map();
    let presenceTimeout = null;
    let pendingPresenceStatus = null;
    let pendingPresenceLastSeen = null;

    const emitPresenceUpdate = (status, lastSeen) => {
      const ids = socket.data.conversationIds ? Array.from(socket.data.conversationIds) : [];
      if (ids.length === 0) return;
      ids.forEach((conversationId) => {
        socket.to(conversationId).emit('presence:update', {
          userId,
          status,
          lastSeen,
        });
      });
    };

    const schedulePresenceUpdate = (status, lastSeen, delayMs = 250) => {
      pendingPresenceStatus = status;
      pendingPresenceLastSeen = lastSeen;
      if (presenceTimeout) {
        clearTimeout(presenceTimeout);
      }
      presenceTimeout = setTimeout(() => {
        emitPresenceUpdate(pendingPresenceStatus, pendingPresenceLastSeen);
        pendingPresenceStatus = null;
        pendingPresenceLastSeen = null;
        presenceTimeout = null;
      }, delayMs);
    };
    conversationIds.forEach((conversationId) => {
      socket.join(conversationId);
    });

    const initialLastSeen = new Date().toISOString();
    emitPresenceUpdate('online', initialLastSeen);

    const hasConversationAccess = (conversationId) =>
      Boolean(socket.data.conversationIds && socket.data.conversationIds.has(conversationId));
    const isRateLimited = (key, limit, windowMs) => {
      const now = Date.now();
      const checkLimit = (limits) => {
        const current = limits.get(key);
        if (!current || now > current.resetAt) {
          limits.set(key, { count: 1, resetAt: now + windowMs });
          return false;
        }
        if (current.count >= limit) {
          return true;
        }
        current.count += 1;
        return false;
      };
      if (checkLimit(socket.data.rateLimits)) {
        return true;
      }
      const userLimits = userRateLimits.get(userId);
      if (!userLimits) return false;
      return checkLimit(userLimits);
    };

    socket.on('conversation:join', async (conversationId) => {
      try {
        const membership = await getConversationMembership({
          conversationId,
          userId,
          requireVisible: true,
        });
        if (membership) {
          socket.join(conversationId);
          if (!socket.data.conversationIds) {
            socket.data.conversationIds = new Set();
          }
          socket.data.conversationIds.add(conversationId);
        }
      } catch (error) {
        logger.warn('[socket] Failed to join conversation', {
          conversationId,
          userId,
          error: error?.message,
        });
      }
    });

    socket.on('message:send', async (payload, callback) => {
      try {
        if (isRateLimited('message:send', MESSAGE_RATE_LIMIT, MESSAGE_RATE_WINDOW_MS)) {
          if (callback) callback({ error: 'Rate limited' });
          return;
        }
        const {
          conversationId,
          content,
          type = 'text',
          attachmentUrl,
          replyToId,
          clientMessageId,
        } = payload || {};
        const sanitizedContent = sanitizeText(content);
        if (!conversationId || !sanitizedContent.trim()) {
          if (callback) callback({ error: 'Invalid message' });
          return;
        }
        if (isMessageTooLong(sanitizedContent)) {
          if (callback) callback({ error: 'Message too long' });
          return;
        }
        if (attachmentUrl) {
          if (typeof attachmentUrl !== 'string') {
            if (callback) callback({ error: 'Invalid attachment' });
            return;
          }
          if (isAttachmentUrlTooLong(attachmentUrl) || isDataUrlTooLarge(attachmentUrl)) {
            if (callback) callback({ error: 'Attachment too large' });
            return;
          }
        }

        if (clientMessageId) {
          const existing = getMessageDedup(userId, clientMessageId);
          if (existing) {
            if (callback) callback({ message: existing });
            return;
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
          if (callback) callback({ error: 'Invalid reply target' });
          return;
        }
        if (!result.isMember) {
          if (callback) callback({ error: 'Forbidden' });
          return;
        }
        if (!result.message) {
          if (callback) callback({ error: 'Failed to send message' });
          return;
        }

        if (clientMessageId) {
          setMessageDedup(userId, clientMessageId, result.message);
        }

        result.unhiddenUserIds.forEach((memberId) => {
          socketManager.emitToUser(memberId, 'conversation:created', { conversationId });
          void socketManager.addConversationToUserSockets(memberId, conversationId);
        });

        socketManager.emitToConversation(conversationId, 'message:new', result.message);
        if (callback) callback({ message: result.message });
      } catch (error) {
        logger.error('[socket] Failed to send message', {
          userId,
          error: error?.message,
        });
        if (callback) callback({ error: 'Failed to send message' });
      }
    });

    socket.on('typing:start', (payload) => {
      if (isRateLimited('typing:start', TYPING_RATE_LIMIT, TYPING_RATE_WINDOW_MS)) return;
      const { conversationId } = payload || {};
      if (!conversationId || !userProfile) return;
      if (!hasConversationAccess(conversationId)) return;
      const prev = typingState.get(conversationId);
      const nextSeq = (prev?.seq || 0) + 1;
      if (prev?.timeoutId) {
        clearTimeout(prev.timeoutId);
      }
      socket.to(conversationId).emit('typing:indicator', {
        conversationId,
        userId: userProfile.id,
        username: userProfile.username,
      });
      const timeoutId = setTimeout(() => {
        const current = typingState.get(conversationId);
        if (!current || current.seq !== nextSeq) return;
        typingState.delete(conversationId);
        socket.to(conversationId).emit('typing:stop', {
          conversationId,
          userId: userProfile.id,
        });
      }, 3000);
      typingState.set(conversationId, { timeoutId, seq: nextSeq });
    });

    socket.on('typing:stop', (payload) => {
      if (isRateLimited('typing:stop', TYPING_RATE_LIMIT, TYPING_RATE_WINDOW_MS)) return;
      const { conversationId } = payload || {};
      if (!conversationId || !userProfile) return;
      if (!hasConversationAccess(conversationId)) return;
      const current = typingState.get(conversationId);
      if (current?.timeoutId) {
        clearTimeout(current.timeoutId);
      }
      typingState.delete(conversationId);
      socket.to(conversationId).emit('typing:stop', {
        conversationId,
        userId: userProfile.id,
      });
    });

    socket.on('reaction:toggle', async (payload, callback) => {
      try {
        if (isRateLimited('reaction:toggle', REACTION_RATE_LIMIT, REACTION_RATE_WINDOW_MS)) {
          if (callback) callback({ error: 'Rate limited' });
          return;
        }
        const { messageId, emoji } = payload || {};
        if (!messageId || !allowedReactions.has(emoji)) {
          if (callback) callback({ error: 'Invalid reaction' });
          return;
        }

        const result = await toggleReaction({ messageId, userId, emoji });
        if (!result?.conversation_id) {
          if (callback) callback({ error: 'Forbidden' });
          return;
        }

        socketManager.emitToConversation(result.conversation_id, 'reaction:update', {
          messageId,
          reactions: result.reactions,
        });
        if (callback) callback({ messageId, reactions: result.reactions });
      } catch (error) {
        logger.error('[socket] Failed to toggle reaction', {
          userId,
          error: error?.message,
        });
        if (callback) callback({ error: 'Failed to toggle reaction' });
      }
    });

    socket.on('presence:active', async () => {
      try {
        const lastSeen = new Date().toISOString();
        await updateUserStatus(userId, 'online');
        schedulePresenceUpdate('online', lastSeen);
      } catch (error) {
        logger.warn('[socket] Failed to update presence', {
          userId,
          status: 'online',
          error: error?.message,
        });
      }
    });

    socket.on('presence:away', async () => {
      try {
        const lastSeen = new Date().toISOString();
        await updateUserStatus(userId, 'away');
        schedulePresenceUpdate('away', lastSeen);
      } catch (error) {
        logger.warn('[socket] Failed to update presence', {
          userId,
          status: 'away',
          error: error?.message,
        });
      }
    });

    socket.on('disconnect', async () => {
      typingState.forEach((entry) => {
        if (entry?.timeoutId) clearTimeout(entry.timeoutId);
      });
      typingState.clear();
      if (presenceTimeout) {
        clearTimeout(presenceTimeout);
        presenceTimeout = null;
      }
      const remaining = connectionCounts.get(userId) || 0;
      if (remaining > 0) return;
      try {
        await updateUserStatus(userId, 'offline');
        const lastSeen = new Date().toISOString();
        emitPresenceUpdate('offline', lastSeen);
      } catch (error) {
        logger.warn('[socket] Failed to update presence', {
          userId,
          status: 'offline',
          error: error?.message,
        });
      }
    });
  });
};
