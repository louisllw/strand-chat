import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { Message, Conversation, TypingIndicator, MessageReaction } from '@/types';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useSocket } from '@/contexts/SocketContext';

interface ChatContextType {
  conversations: Conversation[];
  activeConversation: Conversation | null;
  messages: Message[];
  typingIndicators: TypingIndicator[];
  searchQuery: string;
  replyToMessage: Message | null;
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
  const activeConversationIdRef = useRef<string | null>(null);

  const markAsRead = useCallback((conversationId: string) => {
    setConversations(prev => prev.map(conv =>
      conv.id === conversationId
        ? { ...conv, unreadCount: 0 }
        : conv
    ));
    apiFetch(`/api/conversations/${conversationId}/read`, { method: 'POST' }).catch(() => {});
  }, []);

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
  }), [normalizeMessage]);

  const refreshConversations = useCallback(async () => {
    try {
      const data = await apiFetch<{ conversations: Conversation[] }>('/api/conversations');
      const normalized = data.conversations.map(normalizeConversation);
      setConversations(normalized);
      return normalized;
    } catch {
      setConversations([]);
      return [];
    }
  }, [normalizeConversation]);

  useEffect(() => {
    refreshConversations();
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
    if (!activeConversation) {
      setMessages([]);
      setReplyToMessage(null);
      activeConversationIdRef.current = null;
      return;
    }
    activeConversationIdRef.current = activeConversation.id;
    const loadMessages = async () => {
      try {
        const data = await apiFetch<{ messages: Message[] }>(
          `/api/conversations/${activeConversation.id}/messages`
        );
        setMessages(data.messages.map(normalizeMessage));
        markAsRead(activeConversation.id);
      } catch {
        setMessages([]);
      }
    };
    loadMessages();
    emit('conversation:join', activeConversation.id);
  }, [activeConversation, normalizeMessage, emit, markAsRead]);

  useEffect(() => {
    if (!socket) return;
    const handleNewMessage = (message: Message) => {
      const normalized = normalizeMessage(message);
      const activeId = activeConversationIdRef.current;
      setConversations(prev => {
        let found = false;
        const next = prev.map(conv =>
          conv.id === normalized.conversationId
            ? (() => {
                found = true;
                return {
                  ...conv,
                  lastMessage: normalized,
                  updatedAt: normalized.timestamp,
                  unreadCount:
                    conv.id === activeConversation?.id || normalized.senderId === user?.id
                      ? conv.unreadCount
                      : conv.unreadCount + 1,
                };
              })()
            : conv
        );
        if (!found) {
          refreshConversations();
          return prev;
        }
        return next;
      });

      if (activeId === normalized.conversationId) {
        setMessages(prev => (prev.some(msg => msg.id === normalized.id) ? prev : [...prev, normalized]));
        markAsRead(normalized.conversationId);
      }
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
      off('message:new');
      off('typing:indicator');
      off('typing:stop');
      off('reaction:update');
      off('presence:update');
      off('conversation:created');
      off('conversation:updated');
    };
  }, [socket, on, off, normalizeMessage, user?.id, refreshConversations, emit, markAsRead]);

  const handleSetActiveConversation = useCallback((conversation: Conversation | null) => {
    setActiveConversation(conversation);
    setReplyToMessage(null);
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
          setMessages(prev => (prev.some(msg => msg.id === normalized.id) ? prev : [...prev, normalized]));
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
        setMessages(prev => (prev.some(msg => msg.id === normalized.id) ? prev : [...prev, normalized]));
      })
      .catch(() => {});
    setReplyToMessage(null);
  }, [activeConversation, socket, normalizeMessage, replyToMessage]);

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
    await refreshConversations();
  }, [refreshConversations]);

  const deleteConversation = useCallback(async (conversationId: string) => {
    await apiFetch(`/api/conversations/${conversationId}`, { method: 'DELETE' });
    setConversations(prev => prev.filter(conversation => conversation.id !== conversationId));
    setActiveConversation(prev => (prev?.id === conversationId ? null : prev));
    setMessages(prev => (activeConversationIdRef.current === conversationId ? [] : prev));
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
