import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Conversation, Message, MessageReaction } from '@/types';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/contexts/useAuth';
import { useSocket } from '@/contexts/useSocket';
import { ChatMessagesContext } from '@/contexts/chat-messages-context';
import { useChatConversations } from '@/contexts/useChatConversations';
import { STORAGE_MESSAGES_PREFIX, safeStorage } from '@/contexts/chat/storage';
import { toast } from '@/hooks/use-toast';

export const ChatMessagesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const { socket, on, off, emit } = useSocket();
  const {
    activeConversation,
    markAsRead,
    refreshConversations,
    applyMessageUpdates,
    conversations,
  } = useChatConversations();
  const [messages, setMessages] = useState<Message[]>([]);
  const [replyToMessage, setReplyToMessage] = useState<Message | null>(null);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const activeConversationIdRef = useRef<string | null>(null);
  const messagePageSizeRef = useRef(50);
  const messageQueueRef = useRef<Record<string, Message[]>>({});
  const flushMessagesRef = useRef<number | null>(null);
  const isFlushingRef = useRef(false);
  const markReadTimersRef = useRef<Record<string, number>>({});
  const lastReadAtRef = useRef<Record<string, number>>({});
  const persistTimersRef = useRef<Record<string, number>>({});
  const conversationsRef = useRef<Conversation[]>([]);
  const currentUsername = useMemo(() => (user?.username || '').toLowerCase(), [user?.username]);

  const reportError = useCallback((title: string, description: string, error: unknown) => {
    void error;
    toast({
      title,
      description,
      variant: 'destructive',
    });
  }, []);

  const serializeMessage = useCallback((message: Message) => ({
    ...message,
    timestamp: message.timestamp instanceof Date ? message.timestamp.toISOString() : message.timestamp,
  }), []);

  const persistMessages = useCallback((conversationId: string, messagesToStore: Message[]) => {
    if (persistTimersRef.current[conversationId]) {
      window.clearTimeout(persistTimersRef.current[conversationId]);
    }
    persistTimersRef.current[conversationId] = window.setTimeout(() => {
      safeStorage.set(
        `${STORAGE_MESSAGES_PREFIX}${conversationId}`,
        JSON.stringify(messagesToStore.map(serializeMessage))
      );
      delete persistTimersRef.current[conversationId];
    }, 500);
  }, [serializeMessage]);

  const scheduleMarkAsRead = useCallback((conversationId: string) => {
    if (markReadTimersRef.current[conversationId]) {
      window.clearTimeout(markReadTimersRef.current[conversationId]);
    }
    markReadTimersRef.current[conversationId] = window.setTimeout(() => {
      delete markReadTimersRef.current[conversationId];
      markAsRead(conversationId);
    }, 300);
  }, [markAsRead]);

  const shouldMarkRead = useCallback((conversationId: string, unreadCount?: number) => {
    if (!conversationId) return false;
    if (!unreadCount || unreadCount <= 0) return false;
    const now = Date.now();
    const lastAt = lastReadAtRef.current[conversationId] || 0;
    if (now - lastAt < 5000) return false;
    lastReadAtRef.current[conversationId] = now;
    return true;
  }, []);

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

  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  useEffect(() => {
    return () => {
      Object.values(persistTimersRef.current).forEach((timerId) => {
        window.clearTimeout(timerId);
      });
      persistTimersRef.current = {};
    };
  }, []);

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
        if (!activeConversation.leftAt && shouldMarkRead(activeConversation.id, activeConversation.unreadCount)) {
          scheduleMarkAsRead(activeConversation.id);
        }
      } catch (error) {
        reportError('Failed to load messages', 'Please try again in a moment.', error);
        setMessages([]);
      }
    };
    loadMessages();
    if (socket?.connected && !activeConversation.leftAt) {
      emit('conversation:join', activeConversation.id);
    }
  }, [
    activeConversation,
    normalizeMessage,
    emit,
    markAsRead,
    persistMessages,
    reportError,
    scheduleMarkAsRead,
    shouldMarkRead,
    socket,
  ]);

  const loadOlderMessages = useCallback(async () => {
    if (!activeConversation || isLoadingOlder || !hasMoreMessages) return 0;
    const oldest = messages[0];
    if (!oldest) return 0;
    setIsLoadingOlder(true);
    try {
      const data = await apiFetch<{ messages: Message[] }>(
        `/api/conversations/${activeConversation.id}/messages?limit=${messagePageSizeRef.current}&beforeId=${encodeURIComponent(oldest.id)}`
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
    } catch (error) {
      reportError('Failed to load older messages', 'Please try again.', error);
      return 0;
    } finally {
      setIsLoadingOlder(false);
    }
  }, [activeConversation, hasMoreMessages, isLoadingOlder, messages, normalizeMessage, persistMessages, reportError]);

  useEffect(() => {
    if (!socket) return;
    // Batch inbound messages to minimize re-renders and storage writes.
    const flushQueuedMessages = () => {
      if (isFlushingRef.current) return;
      isFlushingRef.current = true;
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
        const activeMeta = conversationsRef.current.find(conv => conv.id === activeId);
        if (activeId && !activeMeta?.leftAt && shouldMarkRead(activeId, activeMeta?.unreadCount)) {
          scheduleMarkAsRead(activeId);
        }
      }

      applyMessageUpdates(updates, activeId);

      if (hasMissingConversation) {
        refreshConversations();
      }

      if (Object.keys(messageQueueRef.current).length > 0) {
        flushMessagesRef.current = window.requestAnimationFrame(flushQueuedMessages);
      } else {
        isFlushingRef.current = false;
      }
    };

    const MAX_QUEUED_MESSAGES = 1000;
    const queueMessage = (message: Message) => {
      let totalQueued = 0;
      Object.values(messageQueueRef.current).forEach((items) => {
        totalQueued += items.length;
      });
      if (totalQueued >= MAX_QUEUED_MESSAGES) {
        messageQueueRef.current = {};
        totalQueued = 0;
      }
      const list = messageQueueRef.current[message.conversationId] || [];
      list.push(message);
      messageQueueRef.current[message.conversationId] = list;
      if (flushMessagesRef.current || isFlushingRef.current) return;
      flushMessagesRef.current = window.requestAnimationFrame(flushQueuedMessages);
    };

    const handleNewMessage = (message: Message) => {
      const normalized = normalizeMessage(message);
      queueMessage(normalized);
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

    on('message:new', handleNewMessage);
    on('reaction:update', handleReactionUpdate);
    return () => {
      if (flushMessagesRef.current) {
        window.cancelAnimationFrame(flushMessagesRef.current);
        flushMessagesRef.current = null;
      }
      off('message:new', handleNewMessage);
      off('reaction:update', handleReactionUpdate);
    };
  }, [
    socket,
    on,
    off,
    normalizeMessage,
    normalizeReactions,
    user?.id,
    refreshConversations,
    persistMessages,
    scheduleMarkAsRead,
    applyMessageUpdates,
    shouldMarkRead,
  ]);

  const sendMessage = useCallback((
    content: string,
    type: 'text' | 'image' | 'file' = 'text',
    attachmentUrl?: string,
    attachmentMeta?: {
      width?: number;
      height?: number;
      thumbnailUrl?: string;
      thumbnailWidth?: number;
      thumbnailHeight?: number;
    }
  ) => {
    if (!activeConversation || !content.trim()) return;
    const clientMessageId = typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const payload = {
      conversationId: activeConversation.id,
      content,
      type,
      attachmentUrl,
      attachmentMeta,
      replyToId: replyToMessage?.id,
      clientMessageId,
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
      .catch((error) => {
        reportError('Failed to send message', 'Please try again.', error);
      });
    setReplyToMessage(null);
  }, [activeConversation, socket, normalizeMessage, replyToMessage, persistMessages, reportError]);

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

  const messagesValue = useMemo(() => ({
    messages,
    replyToMessage,
    isLoadingOlder,
    hasMoreMessages,
    setReplyToMessage,
    sendMessage,
    toggleReaction,
    loadOlderMessages,
  }), [
    messages,
    replyToMessage,
    isLoadingOlder,
    hasMoreMessages,
    setReplyToMessage,
    sendMessage,
    toggleReaction,
    loadOlderMessages,
  ]);

  return (
    <ChatMessagesContext.Provider value={messagesValue}>
      {children}
    </ChatMessagesContext.Provider>
  );
};
