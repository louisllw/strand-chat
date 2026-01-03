import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { MessageList } from './MessageList';
import type { Conversation, Message, TypingIndicator, User } from '@/types';

const currentUser: User = {
  id: 'user-1',
  username: 'me',
  email: 'me@example.com',
  status: 'online',
};

const messages: Message[] = [
  {
    id: 'msg-1',
    content: 'Hello',
    senderId: 'user-1',
    senderUsername: 'me',
    conversationId: 'conv-1',
    timestamp: new Date(),
    read: false,
    type: 'text',
    reactions: [],
  },
  {
    id: 'msg-2',
    content: 'Hi back',
    senderId: 'user-2',
    senderUsername: 'alice',
    conversationId: 'conv-1',
    timestamp: new Date(),
    read: false,
    type: 'text',
    reactions: [],
  },
];

const activeConversation: Conversation = {
  id: 'conv-1',
  type: 'direct',
  participants: [
    {
      id: 'user-2',
      username: 'alice',
      email: 'alice@example.com',
      status: 'online',
      lastSeen: new Date(),
    },
  ],
  unreadCount: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const typingIndicators: TypingIndicator[] = [
  {
    conversationId: 'conv-1',
    userId: 'user-2',
    username: 'alice',
  },
];

vi.mock('@/contexts/useChatMessages', () => ({
  useChatMessages: () => ({
    messages,
    replyToMessage: null,
    setReplyToMessage: vi.fn(),
    toggleReaction: vi.fn(),
    loadOlderMessages: vi.fn().mockResolvedValue(0),
    hasMoreMessages: false,
    isLoadingOlder: false,
  }),
}));

vi.mock('@/contexts/useChatConversations', () => ({
  useChatConversations: () => ({
    activeConversation,
  }),
}));

vi.mock('@/contexts/useChatTyping', () => ({
  useChatTyping: () => ({
    typingIndicators,
  }),
}));

vi.mock('@/contexts/useAuth', () => ({
  useAuth: () => ({
    user: currentUser,
  }),
}));

vi.mock('@/hooks/useKeyboardInset', () => ({
  useKeyboardInset: () => 0,
}));

test('MessageList renders messages, date headers, and typing indicator', () => {
  render(<MessageList />);
  expect(screen.getByText('Hello')).toBeInTheDocument();
  expect(screen.getByText('Hi back')).toBeInTheDocument();
  expect(screen.getByText('Today')).toBeInTheDocument();
  expect(screen.getByText('alice is typing')).toBeInTheDocument();
});
