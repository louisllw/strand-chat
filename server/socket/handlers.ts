import type { Server, Socket } from 'socket.io';
import type { SocketManager } from './manager.js';
import { verifyToken, getAuthCookieName } from '../auth.js';
import { isTokenRevoked } from '../services/tokenRevocation.js';
import { getConversationMembership, listConversationIdsForUser } from '../models/conversationModel.js';
import { findUserPublicById, updateUserStatus } from '../models/userModel.js';
import { createMessage, toggleReaction } from '../services/messageService.js';
import { getConversationInfoForMember, listConversationMemberIdsForUser } from '../services/conversationService.js';
import {
  allowedReactions,
  isAttachmentUrlTooLong,
  isDataUrlTooLarge,
  isMessageTooLong,
} from '../utils/validation.js';
import { sanitizeText } from '../utils/sanitize.js';
import { randomUUID } from 'crypto';
import cookieParser from 'cookie-parser';
import { logger } from '../utils/logger.js';
import { getMessageDedup, setMessageDedup } from '../services/messageDedup.js';
import { getRedisClient } from '../services/redis.js';
import { SOCKET_LIMITS } from '../constants.js';
import { sendPushToUsers } from '../services/pushService.js';
import {
  clearActiveConversationPresence,
  getActiveUsersForConversation,
  setActiveConversationPresence,
} from '../services/presence.js';

const cookieMiddleware = cookieParser();
const connectionCounts = new Map<string, number>();
const userRateLimits = new Map<string, Map<string, { count: number; resetAt: number }>>();
const {
  MAX_SOCKETS_PER_USER,
  CONNECTION_SWEEP_MS,
  MESSAGE_RATE_LIMIT,
  MESSAGE_RATE_WINDOW_MS,
  REACTION_RATE_LIMIT,
  REACTION_RATE_WINDOW_MS,
  TYPING_RATE_LIMIT,
  TYPING_RATE_WINDOW_MS,
  TYPING_INDICATOR_TIMEOUT_MS,
  PRESENCE_DEBOUNCE_MS,
} = SOCKET_LIMITS;
const ACTIVE_PRESENCE_TTL_MS = 5000;

const getErrorMessage = (error: unknown) => (error instanceof Error ? error.message : undefined);
const createErrorId = () => randomUUID();

export const registerSocketHandlers = (io: Server, socketManager: SocketManager) => {
  const COOKIE_NAME = getAuthCookieName();
  const getPresenceSummary = (userId: string, excludeSocketId?: string) => {
    let hasAny = false;
    let hasActive = false;
    io.of('/').sockets.forEach((candidate: Socket) => {
      if (candidate.user?.userId !== userId) return;
      if (excludeSocketId && candidate.id === excludeSocketId) return;
      hasAny = true;
      const presenceState = candidate.data.presenceState as 'active' | 'away' | undefined;
      if (presenceState !== 'away') {
        hasActive = true;
      }
    });
    return { hasAny, hasActive };
  };

  const sweepConnections = () => {
    connectionCounts.clear();
    io.of('/').sockets.forEach((socket: Socket) => {
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

  io.use((socket: Socket, next: (err?: Error) => void) => {
    const res = (socket.request as { res?: Parameters<typeof cookieMiddleware>[1] }).res
      ?? ({} as Parameters<typeof cookieMiddleware>[1]);
    const request = socket.request as Parameters<typeof cookieMiddleware>[0] & { cookies?: Record<string, string> };
    cookieMiddleware(request, res, (error) => {
      if (error) return next(error);
      void (async () => {
        const token = request.cookies?.[COOKIE_NAME];
        if (!token) {
          const logPayload: { hasCookieHeader: boolean; origin?: string | string[] } = {
            hasCookieHeader: Boolean(request.headers.cookie),
          };
          if (process.env.NODE_ENV !== 'production') {
            logPayload.origin = request.headers.origin;
          }
        const errorId = createErrorId();
        logger.warn('[socket] Unauthorized: missing auth cookie', { errorId, ...logPayload });
        return next(new Error(`Unauthorized (${errorId})`));
        }
        try {
          const decoded = verifyToken(token);
          const revoked = await isTokenRevoked(token, decoded);
          if (revoked) {
            const errorId = createErrorId();
            logger.warn('[socket] Unauthorized: revoked auth token', { errorId });
            return next(new Error(`Unauthorized (${errorId})`));
          }
          socket.user = { userId: decoded.userId };
        } catch {
          const errorId = createErrorId();
          const logPayload: { origin?: string | string[] } = {};
          if (process.env.NODE_ENV !== 'production') {
            logPayload.origin = request.headers.origin;
          }
          logger.warn('[socket] Unauthorized: invalid auth token', { errorId, ...logPayload });
          return next(new Error(`Unauthorized (${errorId})`));
        }

        const current = connectionCounts.get(socket.user!.userId) || 0;
        if (current >= MAX_SOCKETS_PER_USER) {
          const errorId = createErrorId();
          logger.warn('[socket] Connection limit exceeded', {
            errorId,
            userId: socket.user!.userId,
            current,
          });
          return next(new Error(`Too many connections (${errorId})`));
        }
        connectionCounts.set(socket.user!.userId, current + 1);
        socket.data.connectionCounted = true;
        socket.once('disconnect', () => {
          if (!socket.data.connectionCounted) return;
          const remaining = (connectionCounts.get(socket.user!.userId) || 1) - 1;
          if (remaining <= 0) {
            connectionCounts.delete(socket.user!.userId);
          } else {
            connectionCounts.set(socket.user!.userId, remaining);
          }
        });
        return next();
      })().catch(next);
    });
  });

  io.on('connection', async (socket: Socket) => {
    if (!socket.user?.userId) {
      socket.disconnect(true);
      return;
    }
    const { userId } = socket.user;
    if (!socket.data.rateLimits) {
      socket.data.rateLimits = new Map<string, { count: number; resetAt: number }>();
    }
    if (!userRateLimits.has(userId)) {
      userRateLimits.set(userId, new Map<string, { count: number; resetAt: number }>());
    }
    socket.join(`user:${userId}`);

    const userProfile = await findUserPublicById(userId);
    const conversationIds = await listConversationIdsForUser(userId);
    socket.data.conversationIds = new Set(conversationIds);
    socket.data.presenceState = 'away';
    const typingState = new Map<string, { timeoutId: ReturnType<typeof setTimeout>; seq: number }>();
    let presenceTimeout: ReturnType<typeof setTimeout> | null = null;
    let pendingPresenceStatus: string | null = null;
    let pendingPresenceLastSeen: string | null = null;
    let presenceSeq = 0;

    const emitPresenceUpdate = (status: string, lastSeen: string | null) => {
      const ids = socket.data.conversationIds
        ? (Array.from(socket.data.conversationIds) as string[])
        : [];
      if (ids.length === 0) return;
      ids.forEach((conversationId) => {
        socket.to(conversationId).emit('presence:update', {
          userId,
          status,
          lastSeen,
        });
      });
    };

    const updateActivePresence = async (
      conversationId: string | null,
      previousConversationId: string | null
    ) => {
      if (previousConversationId && previousConversationId !== conversationId) {
        await clearActiveConversationPresence({ userId, conversationId: previousConversationId });
      }
      if (conversationId) {
        await setActiveConversationPresence({
          userId,
          conversationId,
          ttlMs: ACTIVE_PRESENCE_TTL_MS,
        });
      }
    };

    const emitSocketError = (
      event: string,
      message: string,
      error?: unknown,
      code: 'UNAUTHORIZED' | 'FORBIDDEN' | 'RATE_LIMITED' | 'INVALID_PAYLOAD' | 'ERROR' = 'ERROR'
    ) => {
      const errorId = createErrorId();
      if (error) {
        logger.warn('[socket] emit error', {
          errorId,
          event,
          message,
          error: getErrorMessage(error),
          userId,
        });
      }
      socket.emit('error', { event, message, errorId, code });
    };

    const schedulePresenceUpdate = (
      status: string,
      lastSeen: string | null,
      delayMs = PRESENCE_DEBOUNCE_MS
    ) => {
      const nextSeq = presenceSeq + 1;
      presenceSeq = nextSeq;
      pendingPresenceStatus = status;
      pendingPresenceLastSeen = lastSeen;
      if (presenceTimeout) {
        clearTimeout(presenceTimeout);
      }
      presenceTimeout = setTimeout(() => {
        if (nextSeq !== presenceSeq || !pendingPresenceStatus) return;
        emitPresenceUpdate(pendingPresenceStatus, pendingPresenceLastSeen);
        pendingPresenceStatus = null;
        pendingPresenceLastSeen = null;
        presenceTimeout = null;
      }, delayMs);
    };
    conversationIds.forEach((conversationId) => {
      socket.join(conversationId);
    });

    const hasConversationAccess = (conversationId: string) =>
      Boolean(socket.data.conversationIds && socket.data.conversationIds.has(conversationId));
    // Layered rate limits: per-socket, per-user (process), then Redis (shared).
    const isRateLimited = async (key: string, limit: number, windowMs: number) => {
      const now = Date.now();
      const checkLimit = (limits: Map<string, { count: number; resetAt: number }>) => {
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
      if (checkLimit(socket.data.rateLimits ?? new Map())) {
        return true;
      }
      const userLimits = userRateLimits.get(userId);
      if (!userLimits) return false;
      if (checkLimit(userLimits)) {
        return true;
      }

      const redisClient = await getRedisClient();
      if (!redisClient) return false;
      const redisKey = `rate:${userId}:${key}`;
      try {
        const count = await redisClient.incr(redisKey);
        if (count === 1) {
          await redisClient.pExpire(redisKey, windowMs);
        }
        return count > limit;
      } catch (error) {
        logger.warn('[socket] Redis rate limit failed', { error: getErrorMessage(error) });
        return false;
      }
    };

    socket.on('conversation:join', async (conversationId: string) => {
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
        } else {
          emitSocketError('conversation:join', 'Unable to join conversation', undefined, 'FORBIDDEN');
        }
      } catch (error) {
        const errorId = createErrorId();
        logger.error('[socket] Failed to join conversation', {
          errorId,
          conversationId,
          userId,
          error,
        });
        emitSocketError('conversation:join', 'Failed to join conversation', error, 'ERROR');
      }
    });

    socket.on('conversation:active', (conversationId: string | null) => {
      const previousConversationId = socket.data.activeConversationId ?? null;
      if (!conversationId) {
        logger.info('[presence] user went inactive', { userId, previousConversationId });
        socket.data.activeConversationId = null;
        socket.data.activeConversationAt = undefined;
        void updateActivePresence(null, previousConversationId);
        return;
      }
      if (!socket.data.conversationIds || !socket.data.conversationIds.has(conversationId)) {
        return;
      }
      logger.info('[presence] user now active', { userId, conversationId });
      socket.data.activeConversationId = conversationId;
      socket.data.activeConversationAt = Date.now();
      void updateActivePresence(conversationId, previousConversationId);
    });

    socket.on('message:send', async (
      payload: {
        conversationId?: string;
        content?: string;
        type?: string;
        attachmentUrl?: string;
        attachmentMeta?: {
          width?: number;
          height?: number;
          thumbnailUrl?: string;
          thumbnailWidth?: number;
          thumbnailHeight?: number;
        };
        replyToId?: string | null;
        clientMessageId?: string;
      } | null,
      callback?: (response: { error?: string; message?: unknown }) => void
    ) => {
      try {
        if (await isRateLimited('message:send', MESSAGE_RATE_LIMIT, MESSAGE_RATE_WINDOW_MS)) {
          if (callback) callback({ error: 'Rate limited' });
          return;
        }
        const {
          conversationId,
          content,
          type = 'text',
          attachmentUrl,
          attachmentMeta,
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
        if (attachmentMeta) {
          const width = attachmentMeta.width;
          const height = attachmentMeta.height;
          const valid = typeof width === 'number'
            && typeof height === 'number'
            && Number.isFinite(width)
            && Number.isFinite(height)
            && width > 0
            && height > 0;
          if (!valid) {
            if (callback) callback({ error: 'Invalid attachment metadata' });
            return;
          }
          const thumbUrl = attachmentMeta.thumbnailUrl;
          const thumbWidth = attachmentMeta.thumbnailWidth;
          const thumbHeight = attachmentMeta.thumbnailHeight;
          const hasThumbMeta = Boolean(thumbUrl || thumbWidth || thumbHeight);
          if (hasThumbMeta) {
            const thumbValid = typeof thumbUrl === 'string'
              && typeof thumbWidth === 'number'
              && typeof thumbHeight === 'number'
              && Number.isFinite(thumbWidth)
              && Number.isFinite(thumbHeight)
              && thumbWidth > 0
              && thumbHeight > 0
              && !isAttachmentUrlTooLong(thumbUrl)
              && !isDataUrlTooLarge(thumbUrl);
            if (!thumbValid) {
              if (callback) callback({ error: 'Invalid attachment metadata' });
              return;
            }
          }
        }

        if (clientMessageId) {
          const existing = await getMessageDedup(userId, clientMessageId);
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
          attachmentMeta,
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
          await setMessageDedup(userId, clientMessageId, result.message);
        }

        result.unhiddenUserIds.forEach((memberId) => {
          socketManager.emitToUser(memberId, 'conversation:created', { conversationId });
          void socketManager.addConversationToUserSockets(memberId, conversationId);
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
        if (callback) callback({ message: result.message });
      } catch (error) {
        const errorId = createErrorId();
        logger.error('[socket] Failed to send message', {
          errorId,
          userId,
          error,
        });
        emitSocketError('message:send', 'Failed to send message', error, 'ERROR');
        if (callback) callback({ error: 'Failed to send message' });
      }
    });

    // Typing indicator: throttle events, and auto-expire after a short timeout.
    socket.on('typing:start', async (payload: { conversationId?: string } | null) => {
      if (await isRateLimited('typing:start', TYPING_RATE_LIMIT, TYPING_RATE_WINDOW_MS)) return;
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
      }, TYPING_INDICATOR_TIMEOUT_MS);
      typingState.set(conversationId, { timeoutId, seq: nextSeq });
    });

    socket.on('typing:stop', async (payload: { conversationId?: string } | null) => {
      if (await isRateLimited('typing:stop', TYPING_RATE_LIMIT, TYPING_RATE_WINDOW_MS)) return;
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

    socket.on('reaction:toggle', async (
      payload: { messageId?: string; emoji?: string } | null,
      callback?: (response: { error?: string; messageId?: string; reactions?: unknown }) => void
    ) => {
      try {
        if (await isRateLimited('reaction:toggle', REACTION_RATE_LIMIT, REACTION_RATE_WINDOW_MS)) {
          if (callback) callback({ error: 'Rate limited' });
          return;
        }
        const { messageId, emoji } = payload || {};
        if (!messageId || typeof emoji !== 'string' || !allowedReactions.has(emoji)) {
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
        const errorId = createErrorId();
        logger.error('[socket] Failed to toggle reaction', {
          errorId,
          userId,
          error,
        });
        emitSocketError('reaction:toggle', 'Failed to toggle reaction', error, 'ERROR');
        if (callback) callback({ error: 'Failed to toggle reaction' });
      }
    });

    socket.on('presence:active', async () => {
      try {
        const lastSeen = new Date().toISOString();
        socket.data.presenceState = 'active';
        await updateUserStatus(userId, 'online');
        schedulePresenceUpdate('online', lastSeen);
      } catch (error) {
        const errorId = createErrorId();
        logger.warn('[socket] Failed to update presence', {
          errorId,
          userId,
          status: 'online',
          error: getErrorMessage(error),
        });
        emitSocketError('presence:active', 'Failed to update presence', error, 'ERROR');
      }
    });

    socket.on('presence:away', async () => {
      try {
        const lastSeen = new Date().toISOString();
        socket.data.presenceState = 'away';
        const { hasActive } = getPresenceSummary(userId, socket.id);
        if (hasActive) {
          return;
        }
        await updateUserStatus(userId, 'away');
        schedulePresenceUpdate('away', lastSeen);
      } catch (error) {
        const errorId = createErrorId();
        logger.warn('[socket] Failed to update presence', {
          errorId,
          userId,
          status: 'away',
          error: getErrorMessage(error),
        });
        emitSocketError('presence:away', 'Failed to update presence', error, 'ERROR');
      }
    });

    socket.on('disconnect', async () => {
      typingState.forEach((_entry, conversationId) => {
        socket.to(conversationId).emit('typing:stop', {
          conversationId,
          userId,
        });
      });
      typingState.forEach((entry) => {
        if (entry?.timeoutId) clearTimeout(entry.timeoutId);
      });
      typingState.clear();
      if (presenceTimeout) {
        clearTimeout(presenceTimeout);
        presenceTimeout = null;
      }
      presenceSeq += 1;
      pendingPresenceStatus = null;
      pendingPresenceLastSeen = null;
      if (socket.data.activeConversationId) {
        void updateActivePresence(null, socket.data.activeConversationId);
      }
      socket.data.presenceState = 'away';
      const { hasAny, hasActive } = getPresenceSummary(userId, socket.id);
      if (hasAny) {
        if (!hasActive) {
          try {
            const lastSeen = new Date().toISOString();
            await updateUserStatus(userId, 'away');
            schedulePresenceUpdate('away', lastSeen);
          } catch (error) {
            const errorId = createErrorId();
            logger.warn('[socket] Failed to update presence', {
              errorId,
              userId,
              status: 'away',
              error: getErrorMessage(error),
            });
            emitSocketError('presence:away', 'Failed to update presence', error, 'ERROR');
          }
        }
        return;
      }
      userRateLimits.delete(userId);
      try {
        await updateUserStatus(userId, 'offline');
        const lastSeen = new Date().toISOString();
        emitPresenceUpdate('offline', lastSeen);
      } catch (error) {
        const errorId = createErrorId();
        logger.warn('[socket] Failed to update presence', {
          errorId,
          userId,
          status: 'offline',
          error: getErrorMessage(error),
        });
        emitSocketError('presence:offline', 'Failed to update presence', error, 'ERROR');
      }
    });
  });
};
