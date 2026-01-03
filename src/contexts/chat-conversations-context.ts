import { createContext } from 'react';
import { Conversation, Message } from '@/types';

export interface ChatConversationsContextType {
  conversations: Conversation[];
  activeConversation: Conversation | null;
  setActiveConversation: (conversation: Conversation | null) => void;
  markAsRead: (conversationId: string) => void;
  applyMessageUpdates: (
    updates: Record<string, { lastMessage: Message; unreadInc: number }>,
    activeConversationId: string | null
  ) => void;
  createDirectConversation: (username: string) => Promise<Conversation | null>;
  createGroupConversation: (name: string, usernames: string[]) => Promise<Conversation | null>;
  addGroupMembers: (conversationId: string, usernames: string[]) => Promise<void>;
  leaveGroup: (conversationId: string, delegateUserId?: string) => Promise<void>;
  deleteConversation: (conversationId: string) => Promise<void>;
  refreshConversations: () => Promise<Conversation[]>;
}

export const ChatConversationsContext = createContext<ChatConversationsContextType | undefined>(undefined);
