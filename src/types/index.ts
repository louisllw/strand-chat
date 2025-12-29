export interface User {
  id: string;
  username: string;
  email: string;
  avatar?: string;
  banner?: string | null;
  phone?: string | null;
  bio?: string | null;
  website?: string | null;
  socialX?: string | null;
  socialInstagram?: string | null;
  socialLinkedin?: string | null;
  socialTiktok?: string | null;
  socialYoutube?: string | null;
  socialFacebook?: string | null;
  socialGithub?: string | null;
  status: 'online' | 'offline' | 'away';
  lastSeen?: Date;
  theme?: 'light' | 'dark';
  createdAt?: Date;
}

export interface UserProfile {
  id: string;
  username: string;
  avatar?: string | null;
  banner?: string | null;
  phone?: string | null;
  bio?: string | null;
  website?: string | null;
  socialX?: string | null;
  socialInstagram?: string | null;
  socialLinkedin?: string | null;
  socialTiktok?: string | null;
  socialYoutube?: string | null;
  socialFacebook?: string | null;
  socialGithub?: string | null;
  status: 'online' | 'offline' | 'away';
  lastSeen?: Date | null;
  createdAt?: Date | null;
}

export interface Message {
  id: string;
  content: string;
  senderId: string;
  senderUsername?: string;
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
  participantCount?: number;
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
