import { verifyToken, getAuthCookieName } from '../auth.js';
import { getConversationMembership, listConversationIdsForUser } from '../models/conversationModel.js';
import { updateUserStatus, updateUserStatusWithProfile } from '../models/userModel.js';
import { createMessage, toggleReaction } from '../services/messageService.js';
import { allowedReactions } from '../utils/validation.js';
import { sanitizeText } from '../utils/sanitize.js';
import cookieParser from 'cookie-parser';
import { logger } from '../utils/logger.js';
import { getMessageDedup, setMessageDedup } from '../services/messageDedup.js';

const cookieMiddleware = cookieParser();
const connectionCounts = new Map();
const MAX_SOCKETS_PER_USER = Number(process.env.SOCKET_MAX_CONNECTIONS || 5);

export const registerSocketHandlers = (io, socketManager) => {
  const COOKIE_NAME = getAuthCookieName();

  io.use((socket, next) => {
    cookieMiddleware(socket.request, {}, (error) => {
      if (error) return next(error);
      const token = socket.request.cookies?.[COOKIE_NAME];
      if (!token) {
        logger.warn('[socket] Unauthorized: missing auth cookie', {
          origin: socket.request.headers.origin,
          hasCookieHeader: Boolean(socket.request.headers.cookie),
        });
        return next(new Error('Unauthorized'));
      }
      try {
        const decoded = verifyToken(token);
        socket.user = { userId: decoded.userId };
      } catch {
        logger.warn('[socket] Unauthorized: invalid auth token', {
          origin: socket.request.headers.origin,
        });
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

    socket.on('conversation:join', async (conversationId) => {
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
    });

    socket.on('message:send', async (payload, callback) => {
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
    });

    socket.on('typing:start', (payload) => {
      const { conversationId } = payload || {};
      if (!conversationId || !userProfile) return;
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
      const { conversationId } = payload || {};
      if (!conversationId || !userProfile) return;
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
    });

    socket.on('presence:active', async () => {
      const lastSeen = new Date().toISOString();
      await updateUserStatus(userId, 'online');
      schedulePresenceUpdate('online', lastSeen);
    });

    socket.on('presence:away', async () => {
      const lastSeen = new Date().toISOString();
      await updateUserStatus(userId, 'away');
      schedulePresenceUpdate('away', lastSeen);
    });

    socket.on('disconnect', async () => {
      await updateUserStatus(userId, 'offline');
      typingState.forEach((entry) => {
        if (entry?.timeoutId) clearTimeout(entry.timeoutId);
      });
      typingState.clear();
      const lastSeen = new Date().toISOString();
      if (presenceTimeout) {
        clearTimeout(presenceTimeout);
        presenceTimeout = null;
      }
      emitPresenceUpdate('offline', lastSeen);
    });
  });
};
