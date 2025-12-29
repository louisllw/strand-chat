import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { Message, Conversation, TypingIndicator, MessageReaction } from '@/types';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useSocket } from '@/contexts/SocketContext';

const STORAGE_CONVERSATIONS_KEY = 'strand:chat:conversations';
const STORAGE_LAST_ACTIVE_KEY = 'strand:chat:last-active';
const STORAGE_MESSAGES_PREFIX = 'strand:chat:messages:';

const safeStorage = {
  get(key: string) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string) {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Ignore storage errors (quota, privacy mode).
    }
  },
  remove(key: string) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Ignore storage errors.
    }
  },
};

interface ChatContextType {
  conversations: Conversation[];
  activeConversation: Conversation | null;
  messages: Message[];
  typingIndicators: TypingIndicator[];
  searchQuery: string;
  replyToMessage: Message | null;
  isLoadingOlder: boolean;
  hasMoreMessages: boolean;
  setActiveConversation: (conversation: Conversation | null) => void;
  sendMessage: (content: string, type?: 'text' | 'image' | 'file') => void;
  setSearchQuery: (query: string) => void;
  markAsRead: (conversationId: string) => void;
  createDirectConversation: (username: string) => Promise<Conversation | null>;
  createGroupConversation: (name: string, usernames: string[]) => Promise<Conversation | null>;
  addGroupMembers: (conversationId: string, usernames: string[]) => Promise<void>;
  leaveGroup: (conversationId: string) => Promise<void>;
  refreshConversations: () => Promise<Conversation[]>;
  setReplyToMessage: (message: Message | null) => void;
  toggleReaction: (messageId: string, emoji: string) => Promise<void>;
  deleteConversation: (conversationId: string) => Promise<void>;
  loadOlderMessages: () => Promise<number>;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export const ChatProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const { socket, on, off, emit } = useSocket();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [typingIndicators, setTypingIndicators] = useState<TypingIndicator[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [replyToMessage, setReplyToMessage] = useState<Message | null>(null);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const activeConversationIdRef = useRef<string | null>(null);
  const messagePageSizeRef = useRef(50);
  const conversationsRef = useRef<Conversation[]>([]);
  const messageQueueRef = useRef<Record<string, Message[]>>({});
  const flushMessagesRef = useRef<number | null>(null);
  const markReadTimersRef = useRef<Record<string, number>>({});

  const serializeMessage = useCallback((message: Message) => ({
    ...message,
    timestamp: message.timestamp instanceof Date ? message.timestamp.toISOString() : message.timestamp,
  }), []);

  const persistMessages = useCallback((conversationId: string, messagesToStore: Message[]) => {
    safeStorage.set(
      `${STORAGE_MESSAGES_PREFIX}${conversationId}`,
      JSON.stringify(messagesToStore.map(serializeMessage))
    );
  }, [serializeMessage]);

  const markAsRead = useCallback((conversationId: string) => {
    setConversations(prev => prev.map(conv =>
      conv.id === conversationId
        ? { ...conv, unreadCount: 0 }
        : conv
    ));
    apiFetch(`/api/conversations/${conversationId}/read`, { method: 'POST' }).catch(() => {});
  }, []);

  const scheduleMarkAsRead = useCallback((conversationId: string) => {
    if (markReadTimersRef.current[conversationId]) {
      window.clearTimeout(markReadTimersRef.current[conversationId]);
    }
    markReadTimersRef.current[conversationId] = window.setTimeout(() => {
      delete markReadTimersRef.current[conversationId];
      markAsRead(conversationId);
    }, 300);
  }, [markAsRead]);

  const normalizeReactions = useCallback((reactions: MessageReaction[] | undefined) => {
    const currentUsername = (user?.username || '').toLowerCase();
    return (reactions || []).map((reaction) => ({
      ...reaction,
      reactedByMe: reaction.usernames
        ? reaction.usernames.map(name => name.toLowerCase()).includes(currentUsername)
        : reaction.reactedByMe,
    }));
  }, [user?.username]);

  const normalizeMessage = useCallback((message: Message) => ({
    ...message,
    timestamp: new Date(message.timestamp),
    reactions: normalizeReactions(message.reactions),
  }), [normalizeReactions]);

  const normalizeConversation = useCallback((conversation: Conversation) => ({
    ...conversation,
    createdAt: new Date(conversation.createdAt),
    updatedAt: new Date(conversation.updatedAt),
    lastMessage: conversation.lastMessage
      ? normalizeMessage(conversation.lastMessage)
      : undefined,
    participants: (conversation.participants || []).map(participant => ({
      ...participant,
      lastSeen: participant.lastSeen ? new Date(participant.lastSeen) : undefined,
    })),
    participantCount: conversation.participantCount ?? conversation.participants?.length ?? 0,
  }), [normalizeMessage]);

  const refreshConversations = useCallback(async () => {
    try {
      const data = await apiFetch<{ conversations: Conversation[] }>('/api/conversations');
      const normalized = data.conversations.map(normalizeConversation);
      setConversations(normalized);
      safeStorage.set(STORAGE_CONVERSATIONS_KEY, JSON.stringify(data.conversations));
      return normalized;
    } catch {
      setConversations([]);
      return [];
    }
  }, [normalizeConversation]);

  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  useEffect(() => {
    const cached = safeStorage.get(STORAGE_CONVERSATIONS_KEY);
    if (!cached) return;
    try {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed)) {
        setConversations(parsed.map(normalizeConversation));
      }
    } catch {
      // Ignore malformed cache.
    }
  }, [normalizeConversation]);

  useEffect(() => {
    refreshConversations();
  }, [refreshConversations]);

  useEffect(() => {
    if (activeConversation || conversations.length === 0) return;
    const lastActiveId = safeStorage.get(STORAGE_LAST_ACTIVE_KEY);
    if (!lastActiveId) return;
    const cachedConversation = conversations.find(conv => conv.id === lastActiveId);
    if (cachedConversation) {
      setActiveConversation(cachedConversation);
    }
  }, [activeConversation, conversations]);

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
    if (!activeConversation) {
      setMessages([]);
      setReplyToMessage(null);
      activeConversationIdRef.current = null;
      setHasMoreMessages(true);
      return;
    }
    activeConversationIdRef.current = activeConversation.id;
    const cachedMessages = safeStorage.get(`${STORAGE_MESSAGES_PREFIX}${activeConversation.id}`);
    if (cachedMessages) {
      try {
        const parsed = JSON.parse(cachedMessages);
        if (Array.isArray(parsed)) {
          setMessages(parsed.map(normalizeMessage));
        }
      } catch {
        // Ignore malformed cache.
      }
    }
    const loadMessages = async () => {
      try {
        const data = await apiFetch<{ messages: Message[] }>(
          `/api/conversations/${activeConversation.id}/messages?limit=${messagePageSizeRef.current}`
        );
        const normalized = data.messages.map(normalizeMessage);
        setMessages(normalized);
        persistMessages(activeConversation.id, normalized);
        setHasMoreMessages(data.messages.length >= messagePageSizeRef.current);
        markAsRead(activeConversation.id);
      } catch {
        setMessages([]);
      }
    };
    loadMessages();
    emit('conversation:join', activeConversation.id);
  }, [activeConversation, normalizeMessage, emit, markAsRead, persistMessages]);

  const loadOlderMessages = useCallback(async () => {
    if (!activeConversation || isLoadingOlder || !hasMoreMessages) return 0;
    const oldest = messages[0];
    if (!oldest) return 0;
    setIsLoadingOlder(true);
    try {
      const data = await apiFetch<{ messages: Message[] }>(
        `/api/conversations/${activeConversation.id}/messages?limit=${messagePageSizeRef.current}&before=${encodeURIComponent(oldest.timestamp.toISOString())}`
      );
      const normalized = data.messages.map(normalizeMessage);
      if (normalized.length === 0) {
        setHasMoreMessages(false);
        return 0;
      }
      setMessages(prev => {
        const next = [...normalized, ...prev];
        persistMessages(activeConversation.id, next);
        return next;
      });
      if (data.messages.length < messagePageSizeRef.current) {
        setHasMoreMessages(false);
      }
      return normalized.length;
    } catch {
      return 0;
    } finally {
      setIsLoadingOlder(false);
    }
  }, [activeConversation, hasMoreMessages, isLoadingOlder, messages, normalizeMessage, persistMessages]);

  useEffect(() => {
    if (!socket) return;
    const flushQueuedMessages = () => {
      flushMessagesRef.current = null;
      const queue = messageQueueRef.current;
      messageQueueRef.current = {};
      const activeId = activeConversationIdRef.current;
      const activeBatch: Message[] = [];
      const updates: Record<string, { lastMessage: Message; unreadInc: number }> = {};
      let hasMissingConversation = false;

      Object.entries(queue).forEach(([conversationId, items]) => {
        if (!items.length) return;
        let lastMessage = items[0];
        let unreadInc = 0;
        items.forEach((item) => {
          if (item.timestamp > lastMessage.timestamp) {
            lastMessage = item;
          }
          if (conversationId !== activeId && item.senderId !== user?.id) {
            unreadInc += 1;
          }
        });
        updates[conversationId] = { lastMessage, unreadInc };
        if (conversationId === activeId) {
          activeBatch.push(...items);
        }
        if (!conversationsRef.current.some(conv => conv.id === conversationId)) {
          hasMissingConversation = true;
        }
      });

      if (activeBatch.length > 0 && activeId) {
        const uniqueMap = new Map(activeBatch.map(message => [message.id, message]));
        const uniqueBatch = Array.from(uniqueMap.values());
        setMessages(prev => {
          const existing = new Set(prev.map(msg => msg.id));
          const appended = uniqueBatch.filter(msg => !existing.has(msg.id));
          if (appended.length === 0) return prev;
          const next = [...prev, ...appended];
          persistMessages(activeId, next);
          return next;
        });
        scheduleMarkAsRead(activeId);
      }

      const updateKeys = Object.keys(updates);
      if (updateKeys.length > 0) {
        setConversations(prev => {
          const next = prev.map(conv => {
            const update = updates[conv.id];
            if (!update) return conv;
            const unreadCount = conv.id === activeId ? 0 : conv.unreadCount + update.unreadInc;
            return {
              ...conv,
              lastMessage: update.lastMessage,
              updatedAt: update.lastMessage.timestamp,
              unreadCount,
            };
          });
          safeStorage.set(STORAGE_CONVERSATIONS_KEY, JSON.stringify(next));
          return next;
        });
      }

      if (hasMissingConversation) {
        refreshConversations();
      }
    };

    const queueMessage = (message: Message) => {
      const list = messageQueueRef.current[message.conversationId] || [];
      list.push(message);
      messageQueueRef.current[message.conversationId] = list;
      if (flushMessagesRef.current) return;
      flushMessagesRef.current = window.requestAnimationFrame(flushQueuedMessages);
    };

    const handleNewMessage = (message: Message) => {
      const normalized = normalizeMessage(message);
      queueMessage(normalized);
    };

    const handleTyping = (indicator: TypingIndicator) => {
      if (indicator.userId === user?.id) return;
      setTypingIndicators(prev => {
        const exists = prev.some(t => t.userId === indicator.userId && t.conversationId === indicator.conversationId);
        if (exists) return prev;
        return [...prev, indicator];
      });
    };

    const handleTypingStop = (payload: { conversationId: string; userId: string }) => {
      setTypingIndicators(prev =>
        prev.filter(t => !(t.conversationId === payload.conversationId && t.userId === payload.userId))
      );
    };

    const handleReactionUpdate = (payload: { messageId: string; reactions: MessageReaction[] }) => {
      setMessages(prev =>
        prev.map(message =>
          message.id === payload.messageId
            ? { ...message, reactions: normalizeReactions(payload.reactions) }
            : message
        )
      );
    };

    const handleConversationCreated = (payload: { conversationId?: string }) => {
      refreshConversations();
      if (payload?.conversationId) {
        emit('conversation:join', payload.conversationId);
      }
    };

    const handleConversationUpdated = () => {
      refreshConversations();
    };

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

    on('message:new', handleNewMessage);
    on('typing:indicator', handleTyping);
    on('typing:stop', handleTypingStop);
    on('reaction:update', handleReactionUpdate);
    on('presence:update', handlePresenceUpdate);
    on('conversation:created', handleConversationCreated);
    on('conversation:updated', handleConversationUpdated);
    return () => {
      if (flushMessagesRef.current) {
        window.cancelAnimationFrame(flushMessagesRef.current);
        flushMessagesRef.current = null;
      }
      off('message:new');
      off('typing:indicator');
      off('typing:stop');
      off('reaction:update');
      off('presence:update');
      off('conversation:created');
      off('conversation:updated');
    };
  }, [socket, on, off, normalizeMessage, user?.id, refreshConversations, emit, persistMessages, scheduleMarkAsRead]);

  const handleSetActiveConversation = useCallback((conversation: Conversation | null) => {
    setActiveConversation(conversation);
    setReplyToMessage(null);
    if (conversation) {
      safeStorage.set(STORAGE_LAST_ACTIVE_KEY, conversation.id);
    }
  }, []);

  const sendMessage = useCallback((content: string, type: 'text' | 'image' | 'file' = 'text') => {
    if (!activeConversation || !content.trim()) return;
    const payload = {
      conversationId: activeConversation.id,
      content,
      type,
      replyToId: replyToMessage?.id,
    };
    if (socket?.connected) {
      socket.emit('message:send', payload, (response: { message?: Message; error?: string }) => {
        if (response?.message) {
          const normalized = normalizeMessage(response.message);
          setMessages(prev => {
            const next = prev.some(msg => msg.id === normalized.id) ? prev : [...prev, normalized];
            persistMessages(normalized.conversationId, next);
            return next;
          });
        }
      });
      setReplyToMessage(null);
      return;
    }

    apiFetch<{ message: Message }>(`/api/conversations/${activeConversation.id}/messages`, {
      method: 'POST',
      body: JSON.stringify(payload),
    })
      .then(({ message }) => {
        const normalized = normalizeMessage(message);
        setMessages(prev => {
          const next = prev.some(msg => msg.id === normalized.id) ? prev : [...prev, normalized];
          persistMessages(normalized.conversationId, next);
          return next;
        });
      })
      .catch(() => {});
    setReplyToMessage(null);
  }, [activeConversation, socket, normalizeMessage, replyToMessage, persistMessages]);

  const toggleReaction = useCallback(async (messageId: string, emoji: string) => {
    if (socket?.connected) {
      socket.emit('reaction:toggle', { messageId, emoji }, (response: { reactions?: MessageReaction[]; error?: string }) => {
        if (response?.reactions) {
          setMessages(prev =>
            prev.map(message =>
              message.id === messageId
                ? { ...message, reactions: normalizeReactions(response.reactions) }
                : message
            )
          );
        }
      });
      return;
    }

    const data = await apiFetch<{ messageId: string; reactions: MessageReaction[] }>(
      `/api/messages/${messageId}/reactions`,
      {
        method: 'POST',
        body: JSON.stringify({ emoji }),
      }
    );
    setMessages(prev =>
      prev.map(message =>
        message.id === data.messageId
          ? { ...message, reactions: normalizeReactions(data.reactions) }
          : message
      )
    );
  }, [socket, normalizeReactions]);

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

  const leaveGroup = useCallback(async (conversationId: string) => {
    await apiFetch(`/api/conversations/${conversationId}/leave`, { method: 'POST' });
    setConversations(prev => prev.filter(conversation => conversation.id !== conversationId));
    setActiveConversation(prev => (prev?.id === conversationId ? null : prev));
    setMessages(prev => (activeConversationIdRef.current === conversationId ? [] : prev));
    if (safeStorage.get(STORAGE_LAST_ACTIVE_KEY) === conversationId) {
      safeStorage.remove(STORAGE_LAST_ACTIVE_KEY);
    }
    safeStorage.remove(`${STORAGE_MESSAGES_PREFIX}${conversationId}`);
    await refreshConversations();
  }, [refreshConversations]);

  const deleteConversation = useCallback(async (conversationId: string) => {
    await apiFetch(`/api/conversations/${conversationId}`, { method: 'DELETE' });
    setConversations(prev => prev.filter(conversation => conversation.id !== conversationId));
    setActiveConversation(prev => (prev?.id === conversationId ? null : prev));
    setMessages(prev => (activeConversationIdRef.current === conversationId ? [] : prev));
    if (safeStorage.get(STORAGE_LAST_ACTIVE_KEY) === conversationId) {
      safeStorage.remove(STORAGE_LAST_ACTIVE_KEY);
    }
    safeStorage.remove(`${STORAGE_MESSAGES_PREFIX}${conversationId}`);
    await refreshConversations();
  }, [refreshConversations]);

  return (
    <ChatContext.Provider
      value={{
        conversations,
        activeConversation,
        messages,
        typingIndicators,
        searchQuery,
        replyToMessage,
        isLoadingOlder,
        hasMoreMessages,
        setActiveConversation: handleSetActiveConversation,
        sendMessage,
        setSearchQuery,
        markAsRead,
        createDirectConversation,
        createGroupConversation,
        addGroupMembers,
        leaveGroup,
        refreshConversations,
        setReplyToMessage,
        toggleReaction,
        deleteConversation,
        loadOlderMessages,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
};

export const useChat = () => {
  const context = useContext(ChatContext);
  if (context === undefined) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return context;
};
