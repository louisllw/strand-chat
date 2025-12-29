export interface User {
  id: string;
  username: string;
  email: string;
  avatar?: string;
  status: 'online' | 'offline' | 'away';
  lastSeen?: Date;
  theme?: 'light' | 'dark';
}

export interface Message {
  id: string;
  content: string;
  senderId: string;
  conversationId: string;
  timestamp: Date;
  read: boolean;
  type: 'text' | 'image' | 'file' | 'system';
  attachmentUrl?: string;
  replyTo?: {
    id: string;
    content: string;
    senderId: string;
  };
  reactions?: MessageReaction[];
}

export interface MessageReaction {
  emoji: string;
  count: number;
  reactedByMe: boolean;
  usernames?: string[];
}

export interface Conversation {
  id: string;
  name?: string;
  type: 'direct' | 'group';
  participants: User[];
  lastMessage?: Message;
  unreadCount: number;
  avatar?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

export interface TypingIndicator {
  conversationId: string;
  userId: string;
  username: string;
}
