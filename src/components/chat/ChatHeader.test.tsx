import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { ChatHeader } from './ChatHeader';
import type { Conversation, TypingIndicator } from '@/types';

const navigateMock = vi.fn();
const deleteConversation = vi.fn();
const addGroupMembers = vi.fn();
const leaveGroup = vi.fn();

const directConversation: Conversation = {
  id: 'conv-1',
  type: 'direct',
  participants: [
    {
      id: 'user-2',
      username: 'alice',
      email: 'alice@example.com',
      status: 'online',
      lastSeen: new Date('2024-01-01T12:00:00Z'),
    },
  ],
  unreadCount: 0,
  createdAt: new Date('2024-01-01T10:00:00Z'),
  updatedAt: new Date('2024-01-01T11:00:00Z'),
};

const typingIndicators: TypingIndicator[] = [
  {
    conversationId: 'conv-1',
    userId: 'user-2',
    username: 'alice',
  },
];

vi.mock('@/contexts/useChatConversations', () => ({
  useChatConversations: () => ({
    activeConversation: directConversation,
    deleteConversation,
    addGroupMembers,
    leaveGroup,
    refreshConversations: vi.fn(),
  }),
}));

vi.mock('@/contexts/useChatTyping', () => ({
  useChatTyping: () => ({
    typingIndicators,
  }),
}));

vi.mock('@/contexts/useAuth', () => ({
  useAuth: () => ({
    user: {
      id: 'user-1',
      username: 'bob',
    },
  }),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

test('ChatHeader shows direct conversation info and typing state', () => {
  render(<ChatHeader onMobileMenuClick={() => {}} />);
  expect(screen.getByText('@alice')).toBeInTheDocument();
  expect(screen.getByText('Typing...')).toBeInTheDocument();
});
