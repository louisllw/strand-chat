import { createContext } from 'react';
import { Message, Conversation, TypingIndicator } from '@/types';

export interface ChatContextType {
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

export const ChatContext = createContext<ChatContextType | undefined>(undefined);
