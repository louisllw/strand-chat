import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Conversation, Message, MessageReaction } from '@/types';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/contexts/useAuth';
import { useSocket } from '@/contexts/useSocket';
import { ChatConversationsContext } from '@/contexts/chat-conversations-context';
import { toast } from '@/hooks/use-toast';
import {
  STORAGE_CONVERSATIONS_KEY,
  STORAGE_LAST_ACTIVE_KEY,
  STORAGE_MESSAGES_PREFIX,
  safeStorage,
} from '@/contexts/chat/storage';

export const ChatConversationsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const { socket, on, off, emit } = useSocket();
  const conversationsRef = useRef<Conversation[]>([]);
  const joinedConversationsRef = useRef<Set<string>>(new Set());
  const persistTimeoutRef = useRef<number | null>(null);
  const didInitialLoadRef = useRef(false);
  const visibilityRef = useRef(document.visibilityState === 'visible');
  const getInitialConversationId = () => {
    if (typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.search);
    return params.get('conversationId');
  };
  const pendingConversationIdRef = useRef<string | null>(getInitialConversationId());
  const currentUsername = useMemo(() => (user?.username || '').toLowerCase(), [user?.username]);

  const normalizeReactions = useCallback((reactions: MessageReaction[] | undefined) => (
    (reactions || []).map((reaction) => ({
      ...reaction,
      reactedByMe: reaction.usernames
        ? reaction.usernames.map(name => name.toLowerCase()).includes(currentUsername)
        : reaction.reactedByMe,
    }))
  ), [currentUsername]);

  const normalizeMessage = useCallback((message: Message) => ({
    ...message,
    timestamp: new Date(message.timestamp),
    reactions: normalizeReactions(message.reactions),
  }), [normalizeReactions]);

  const normalizeConversation = useCallback((conversation: Conversation) => ({
    ...conversation,
    createdAt: new Date(conversation.createdAt),
    updatedAt: new Date(conversation.updatedAt),
    leftAt: conversation.leftAt ? new Date(conversation.leftAt) : null,
    lastMessage: conversation.lastMessage
      ? normalizeMessage(conversation.lastMessage)
      : undefined,
    participants: (conversation.participants || []).map(participant => ({
      ...participant,
      lastSeen: participant.lastSeen ? new Date(participant.lastSeen) : undefined,
    })),
    participantCount: conversation.participantCount ?? conversation.participants?.length ?? 0,
  }), [normalizeMessage]);

  const initialConversations = useMemo(() => {
    const cached = safeStorage.get(STORAGE_CONVERSATIONS_KEY);
    if (!cached) return [];
    try {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed)) {
        return parsed.map(normalizeConversation);
      }
    } catch {
      // Ignore malformed cache.
    }
    return [];
  }, [normalizeConversation]);

  const initialActiveConversation = useMemo(() => {
    const lastActiveId = safeStorage.get(STORAGE_LAST_ACTIVE_KEY);
    if (!lastActiveId) return null;
    return initialConversations.find(conv => conv.id === lastActiveId) || null;
  }, [initialConversations]);

  const [conversations, setConversations] = useState<Conversation[]>(initialConversations);
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(initialActiveConversation);
  const activeConversationRef = useRef<Conversation | null>(initialActiveConversation);
  const markReadInFlightRef = useRef<Set<string>>(new Set());
  const lastMarkReadAtRef = useRef<Record<string, number>>({});

  const schedulePersistConversations = useCallback((next: Conversation[]) => {
    if (persistTimeoutRef.current) {
      window.clearTimeout(persistTimeoutRef.current);
    }
    persistTimeoutRef.current = window.setTimeout(() => {
      safeStorage.set(STORAGE_CONVERSATIONS_KEY, JSON.stringify(next));
    }, 500);
  }, []);

  const refreshConversations = useCallback(async () => {
    if (!user) {
      setConversations([]);
      return [];
    }
    try {
      const data = await apiFetch<{ conversations: Conversation[] }>('/api/conversations');
      const normalized = data.conversations.map(normalizeConversation);
      setConversations(normalized);
      schedulePersistConversations(data.conversations);
      const pendingId = pendingConversationIdRef.current;
      if (pendingId) {
        const pendingMatch = normalized.find(conv => conv.id === pendingId) || null;
        pendingConversationIdRef.current = null;
        if (pendingMatch) {
          setActiveConversation(pendingMatch);
          safeStorage.set(STORAGE_LAST_ACTIVE_KEY, pendingMatch.id);
          return normalized;
        }
      }
      const lastActiveId = activeConversationRef.current?.id || safeStorage.get(STORAGE_LAST_ACTIVE_KEY);
      if (lastActiveId) {
        const matching = normalized.find(conv => conv.id === lastActiveId) || null;
        setActiveConversation(matching);
      }
      return normalized;
    } catch (error) {
      void error;
      setConversations([]);
      return [];
    }
  }, [normalizeConversation, schedulePersistConversations, user]);

  useEffect(() => {
    activeConversationRef.current = activeConversation;
  }, [activeConversation]);

  useEffect(() => {
    if (!socket || !socket.connected) return;
    emit('conversation:active', activeConversationRef.current?.id || null);
  }, [emit, socket, activeConversation]);

  useEffect(() => {
    if (!socket) return;
    const handleVisibility = () => {
      visibilityRef.current = document.visibilityState === 'visible';
      if (!visibilityRef.current) {
        emit('conversation:active', null);
        return;
      }
      emit('conversation:active', activeConversationRef.current?.id || null);
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [emit, socket]);

  useEffect(() => {
    if (!socket) return;
    const intervalId = window.setInterval(() => {
      if (!visibilityRef.current) return;
      emit('conversation:active', activeConversationRef.current?.id || null);
    }, 15000);
    return () => window.clearInterval(intervalId);
  }, [emit, socket]);

  const markAsRead = useCallback((conversationId: string) => {
    const active = activeConversationRef.current;
    const current = conversationsRef.current.find(conv => conv.id === conversationId);
    if (!current || current.unreadCount === 0 || current.leftAt) {
      return;
    }
    const now = Date.now();
    const lastAt = lastMarkReadAtRef.current[conversationId] || 0;
    if (now - lastAt < 5000) {
      return;
    }
    if (markReadInFlightRef.current.has(conversationId)) {
      return;
    }
    lastMarkReadAtRef.current[conversationId] = now;
    markReadInFlightRef.current.add(conversationId);
    setConversations(prev => {
      const next = prev.map(conv =>
        conv.id === conversationId
          ? { ...conv, unreadCount: 0 }
          : conv
      );
      schedulePersistConversations(next);
      return next;
    });
    setActiveConversation(prev => (
      prev?.id === conversationId
        ? { ...prev, unreadCount: 0 }
        : prev
    ));
    if (active?.id !== conversationId && current?.unreadCount === 0) {
      markReadInFlightRef.current.delete(conversationId);
      return;
    }
    apiFetch(`/api/conversations/${conversationId}/read`, { method: 'POST' })
      .catch((error) => {
        void error;
      })
      .finally(() => {
        markReadInFlightRef.current.delete(conversationId);
      });
  }, [schedulePersistConversations]);

  const handleSetActiveConversation = useCallback((conversation: Conversation | null) => {
    setActiveConversation(conversation);
    if (conversation) {
      safeStorage.set(STORAGE_LAST_ACTIVE_KEY, conversation.id);
    }
  }, []);

  // Apply latest message and unread increments per conversation in a single pass.
  const applyMessageUpdates = useCallback((
    updates: Record<string, { lastMessage: Message; unreadInc: number }>,
    activeConversationId: string | null
  ) => {
    const updateKeys = Object.keys(updates);
    if (updateKeys.length === 0) return;
    setConversations(prev => {
      const next = prev.map(conv => {
        const update = updates[conv.id];
        if (!update) return conv;
        const unreadCount = conv.id === activeConversationId ? 0 : conv.unreadCount + update.unreadInc;
        return {
          ...conv,
          lastMessage: update.lastMessage,
          updatedAt: update.lastMessage.timestamp,
          unreadCount,
        };
      });
      schedulePersistConversations(next);
      return next;
    });
    if (activeConversationId && updates[activeConversationId]) {
      const update = updates[activeConversationId];
      setActiveConversation(prev => (
        prev
          ? { ...prev, lastMessage: update.lastMessage, updatedAt: update.lastMessage.timestamp, unreadCount: 0 }
          : prev
      ));
    }
  }, [schedulePersistConversations]);

  const createDirectConversation = useCallback(async (username: string) => {
    const data = await apiFetch<{ conversationId: string }>('/api/conversations/direct', {
      method: 'POST',
      body: JSON.stringify({ username }),
    });
    const updated = await refreshConversations();
    const created = updated.find(conv => conv.id === data.conversationId) || null;
    if (created) {
      setActiveConversation(created);
      safeStorage.set(STORAGE_LAST_ACTIVE_KEY, created.id);
      return created;
    }
    return null;
  }, [refreshConversations]);

  const createGroupConversation = useCallback(async (name: string, usernames: string[]) => {
    const data = await apiFetch<{ conversationId: string }>('/api/conversations/group', {
      method: 'POST',
      body: JSON.stringify({ name, usernames }),
    });
    const updated = await refreshConversations();
    const created = updated.find(conv => conv.id === data.conversationId) || null;
    if (created) {
      setActiveConversation(created);
      safeStorage.set(STORAGE_LAST_ACTIVE_KEY, created.id);
      return created;
    }
    return null;
  }, [refreshConversations]);

  const addGroupMembers = useCallback(async (conversationId: string, usernames: string[]) => {
    await apiFetch(`/api/conversations/${conversationId}/members`, {
      method: 'POST',
      body: JSON.stringify({ usernames }),
    });
    await refreshConversations();
  }, [refreshConversations]);

  const leaveGroup = useCallback(async (conversationId: string, delegateUserId?: string) => {
    await apiFetch(`/api/conversations/${conversationId}/leave`, {
      method: 'POST',
      body: delegateUserId ? JSON.stringify({ delegateUserId }) : undefined,
    });
    const leftAt = new Date();
    setConversations(prev => {
      const next = prev.map(conversation => (
        conversation.id === conversationId
          ? { ...conversation, unreadCount: 0, leftAt }
          : conversation
      ));
      schedulePersistConversations(next);
      return next;
    });
    setActiveConversation(prev => (
      prev?.id === conversationId
        ? { ...prev, unreadCount: 0, leftAt }
        : prev
    ));
    await refreshConversations();
  }, [refreshConversations, schedulePersistConversations]);

  const deleteConversation = useCallback(async (conversationId: string) => {
    await apiFetch(`/api/conversations/${conversationId}`, { method: 'DELETE' });
    setConversations(prev => prev.filter(conversation => conversation.id !== conversationId));
    setActiveConversation(prev => (prev?.id === conversationId ? null : prev));
    if (safeStorage.get(STORAGE_LAST_ACTIVE_KEY) === conversationId) {
      safeStorage.remove(STORAGE_LAST_ACTIVE_KEY);
    }
    safeStorage.remove(`${STORAGE_MESSAGES_PREFIX}${conversationId}`);
    await refreshConversations();
  }, [refreshConversations]);

  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  useEffect(() => {
    return () => {
      if (persistTimeoutRef.current) {
        window.clearTimeout(persistTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (didInitialLoadRef.current) return;
    didInitialLoadRef.current = true;
    const timeoutId = window.setTimeout(() => {
      refreshConversations();
    }, 0);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [refreshConversations]);

  useEffect(() => {
    const handleFocus = () => refreshConversations();
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        refreshConversations();
      }
    };
    const intervalId = window.setInterval(() => {
      if (!socket?.connected) {
        refreshConversations();
      }
    }, 10000);

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [refreshConversations, socket]);

  useEffect(() => {
    if (!socket || !socket.connected) return;
    conversations.forEach((conversation) => {
      if (conversation.leftAt) return;
      if (joinedConversationsRef.current.has(conversation.id)) return;
      emit('conversation:join', conversation.id);
      joinedConversationsRef.current.add(conversation.id);
    });
    if (activeConversation && !activeConversation.leftAt && !joinedConversationsRef.current.has(activeConversation.id)) {
      emit('conversation:join', activeConversation.id);
      joinedConversationsRef.current.add(activeConversation.id);
    }
  }, [conversations, socket, emit, activeConversation]);

  useEffect(() => {
    if (!socket) return;
    const handleConnect = () => {
      joinedConversationsRef.current.clear();
      const conversationIds = new Set(
        conversationsRef.current.filter(conversation => !conversation.leftAt).map(conversation => conversation.id)
      );
      if (activeConversation?.id && !activeConversation.leftAt) {
        conversationIds.add(activeConversation.id);
      }
      conversationIds.forEach((conversationId) => {
        emit('conversation:join', conversationId);
        joinedConversationsRef.current.add(conversationId);
      });
    };
    const handleDisconnect = () => {
      joinedConversationsRef.current.clear();
    };
    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    if (socket.connected) {
      handleConnect();
    }
    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
    };
  }, [socket, emit, activeConversation]);

  useEffect(() => {
    const handlePresenceUpdate = (payload: { userId: string; status: 'online' | 'offline' | 'away'; lastSeen?: string | null }) => {
      setConversations(prev =>
        prev.map(conversation => ({
          ...conversation,
          participants: conversation.participants.map(participant =>
            participant.id === payload.userId
              ? {
                  ...participant,
                  status: payload.status,
                  lastSeen: payload.lastSeen ? new Date(payload.lastSeen) : participant.lastSeen,
                }
              : participant
          ),
        }))
      );
      setActiveConversation(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          participants: prev.participants.map(participant =>
            participant.id === payload.userId
              ? {
                  ...participant,
                  status: payload.status,
                  lastSeen: payload.lastSeen ? new Date(payload.lastSeen) : participant.lastSeen,
                }
              : participant
          ),
        };
      });
    };

    const handleConversationCreated = (payload: { conversationId?: string }) => {
      refreshConversations();
      if (payload?.conversationId) {
        emit('conversation:join', payload.conversationId);
      }
    };

    const handleConversationUpdated = (_payload: { conversationId?: string }) => {
      refreshConversations();
    };

    const handleConversationRemoved = (payload: { conversationId: string; name?: string | null }) => {
      const conversationName = payload.name || 'the group chat';
      setConversations(prev => prev.filter(conversation => conversation.id !== payload.conversationId));
      setActiveConversation(prev => (prev?.id === payload.conversationId ? null : prev));
      if (safeStorage.get(STORAGE_LAST_ACTIVE_KEY) === payload.conversationId) {
        safeStorage.remove(STORAGE_LAST_ACTIVE_KEY);
      }
      safeStorage.remove(`${STORAGE_MESSAGES_PREFIX}${payload.conversationId}`);
      toast({
        title: 'Removed from chat',
        description: `You were removed from ${conversationName}.`,
        variant: 'destructive',
      });
    };

    on('presence:update', handlePresenceUpdate);
    on('conversation:created', handleConversationCreated);
    on('conversation:updated', handleConversationUpdated);
    on('conversation:removed', handleConversationRemoved);
    return () => {
      off('presence:update', handlePresenceUpdate);
      off('conversation:created', handleConversationCreated);
      off('conversation:updated', handleConversationUpdated);
      off('conversation:removed', handleConversationRemoved);
    };
  }, [on, off, emit, refreshConversations]);

  const conversationsValue = useMemo(() => ({
    conversations,
    activeConversation,
    setActiveConversation: handleSetActiveConversation,
    markAsRead,
    applyMessageUpdates,
    createDirectConversation,
    createGroupConversation,
    addGroupMembers,
    leaveGroup,
    deleteConversation,
    refreshConversations,
  }), [
    conversations,
    activeConversation,
    handleSetActiveConversation,
    markAsRead,
    applyMessageUpdates,
    createDirectConversation,
    createGroupConversation,
    addGroupMembers,
    leaveGroup,
    deleteConversation,
    refreshConversations,
  ]);

  return (
    <ChatConversationsContext.Provider value={conversationsValue}>
      {children}
    </ChatConversationsContext.Provider>
  );
};
