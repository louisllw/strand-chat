import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { ChatSidebar } from './ChatSidebar';
import type { Conversation, User } from '@/types';

const setActiveConversation = vi.fn();
const markAsRead = vi.fn();
const createDirectConversation = vi.fn();
const createGroupConversation = vi.fn();
const setSearchQuery = vi.fn();
const logout = vi.fn();
const toggleTheme = vi.fn();

const user: User = {
  id: 'user-1',
  username: 'me',
  email: 'me@example.com',
  status: 'online',
};

const conversations: Conversation[] = [
  {
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
  },
  {
    id: 'conv-2',
    type: 'direct',
    participants: [
      {
        id: 'user-3',
        username: 'bob',
        email: 'bob@example.com',
        status: 'offline',
        lastSeen: new Date(),
      },
    ],
    unreadCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

vi.mock('@/contexts/useChatConversations', () => ({
  useChatConversations: () => ({
    conversations,
    activeConversation: conversations[0],
    setActiveConversation,
    markAsRead,
    createDirectConversation,
    createGroupConversation,
  }),
}));

vi.mock('@/contexts/useChatSearch', () => ({
  useChatSearch: () => ({
    searchQuery: 'ali',
    setSearchQuery,
  }),
}));

vi.mock('@/contexts/useAuth', () => ({
  useAuth: () => ({
    user,
    logout,
  }),
}));

vi.mock('@/contexts/useTheme', () => ({
  useTheme: () => ({
    theme: 'light',
    toggleTheme,
  }),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

test('ChatSidebar filters conversations by search query', () => {
  render(
    <MemoryRouter>
      <ChatSidebar isMobileOpen={true} onMobileClose={() => {}} />
    </MemoryRouter>
  );
  expect(screen.getByText('@alice')).toBeInTheDocument();
  expect(screen.queryByText('@bob')).not.toBeInTheDocument();
});
