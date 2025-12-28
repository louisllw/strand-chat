import React, { createContext, useContext, useState, useCallback } from 'react';
import { Message, Conversation, User, TypingIndicator } from '@/types';

// Mock data
const mockUsers: User[] = [
  { id: '2', username: 'Alice Smith', email: 'alice@example.com', status: 'online' },
  { id: '3', username: 'Bob Johnson', email: 'bob@example.com', status: 'away' },
  { id: '4', username: 'Carol White', email: 'carol@example.com', status: 'offline', lastSeen: new Date(Date.now() - 3600000) },
  { id: '5', username: 'David Brown', email: 'david@example.com', status: 'online' },
  { id: '6', username: 'Emma Davis', email: 'emma@example.com', status: 'online' },
];

const mockConversations: Conversation[] = [
  {
    id: '1',
    type: 'direct',
    participants: [mockUsers[0]],
    lastMessage: {
      id: 'm1',
      content: 'Hey! How are you doing?',
      senderId: '2',
      conversationId: '1',
      timestamp: new Date(Date.now() - 300000),
      read: false,
      type: 'text',
    },
    unreadCount: 2,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: '2',
    type: 'direct',
    participants: [mockUsers[1]],
    lastMessage: {
      id: 'm2',
      content: 'The meeting is at 3pm',
      senderId: '1',
      conversationId: '2',
      timestamp: new Date(Date.now() - 1800000),
      read: true,
      type: 'text',
    },
    unreadCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: '3',
    name: 'Project Team',
    type: 'group',
    participants: [mockUsers[0], mockUsers[1], mockUsers[2], mockUsers[3]],
    lastMessage: {
      id: 'm3',
      content: 'Great progress everyone! 🎉',
      senderId: '4',
      conversationId: '3',
      timestamp: new Date(Date.now() - 7200000),
      read: true,
      type: 'text',
    },
    unreadCount: 5,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: '4',
    type: 'direct',
    participants: [mockUsers[2]],
    lastMessage: {
      id: 'm4',
      content: 'Thanks for the update!',
      senderId: '1',
      conversationId: '4',
      timestamp: new Date(Date.now() - 86400000),
      read: true,
      type: 'text',
    },
    unreadCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: '5',
    name: 'Design Review',
    type: 'group',
    participants: [mockUsers[3], mockUsers[4]],
    lastMessage: {
      id: 'm5',
      content: 'I love the new mockups!',
      senderId: '6',
      conversationId: '5',
      timestamp: new Date(Date.now() - 172800000),
      read: true,
      type: 'text',
    },
    unreadCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

const generateMockMessages = (conversationId: string): Message[] => {
  const messages: Message[] = [
    {
      id: 'msg1',
      content: 'Hey there! 👋',
      senderId: '2',
      conversationId,
      timestamp: new Date(Date.now() - 3600000),
      read: true,
      type: 'text',
    },
    {
      id: 'msg2',
      content: 'Hi! How are you doing?',
      senderId: '1',
      conversationId,
      timestamp: new Date(Date.now() - 3500000),
      read: true,
      type: 'text',
    },
    {
      id: 'msg3',
      content: "I'm doing great! Just finished working on that project we discussed.",
      senderId: '2',
      conversationId,
      timestamp: new Date(Date.now() - 3400000),
      read: true,
      type: 'text',
    },
    {
      id: 'msg4',
      content: "That's awesome! Can't wait to see it.",
      senderId: '1',
      conversationId,
      timestamp: new Date(Date.now() - 3300000),
      read: true,
      type: 'text',
    },
    {
      id: 'msg5',
      content: "I'll send you the details shortly. Are you free for a quick call later?",
      senderId: '2',
      conversationId,
      timestamp: new Date(Date.now() - 300000),
      read: false,
      type: 'text',
    },
  ];
  return messages;
};

interface ChatContextType {
  conversations: Conversation[];
  activeConversation: Conversation | null;
  messages: Message[];
  typingIndicators: TypingIndicator[];
  searchQuery: string;
  setActiveConversation: (conversation: Conversation | null) => void;
  sendMessage: (content: string, type?: 'text' | 'image' | 'file') => void;
  setSearchQuery: (query: string) => void;
  markAsRead: (conversationId: string) => void;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export const ChatProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [conversations, setConversations] = useState<Conversation[]>(mockConversations);
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [typingIndicators, setTypingIndicators] = useState<TypingIndicator[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  const handleSetActiveConversation = useCallback((conversation: Conversation | null) => {
    setActiveConversation(conversation);
    if (conversation) {
      setMessages(generateMockMessages(conversation.id));
      // Simulate typing indicator
      if (conversation.participants[0]?.status === 'online') {
        setTimeout(() => {
          setTypingIndicators([{
            conversationId: conversation.id,
            userId: conversation.participants[0].id,
            username: conversation.participants[0].username,
          }]);
          setTimeout(() => setTypingIndicators([]), 3000);
        }, 2000);
      }
    } else {
      setMessages([]);
    }
  }, []);

  const sendMessage = useCallback((content: string, type: 'text' | 'image' | 'file' = 'text') => {
    if (!activeConversation || !content.trim()) return;

    const newMessage: Message = {
      id: 'msg_' + Date.now(),
      content,
      senderId: '1', // Current user
      conversationId: activeConversation.id,
      timestamp: new Date(),
      read: false,
      type,
    };

    setMessages(prev => [...prev, newMessage]);
    
    // Update conversation's last message
    setConversations(prev => prev.map(conv => 
      conv.id === activeConversation.id
        ? { ...conv, lastMessage: newMessage, updatedAt: new Date() }
        : conv
    ));
  }, [activeConversation]);

  const markAsRead = useCallback((conversationId: string) => {
    setConversations(prev => prev.map(conv =>
      conv.id === conversationId
        ? { ...conv, unreadCount: 0 }
        : conv
    ));
  }, []);

  return (
    <ChatContext.Provider
      value={{
        conversations,
        activeConversation,
        messages,
        typingIndicators,
        searchQuery,
        setActiveConversation: handleSetActiveConversation,
        sendMessage,
        setSearchQuery,
        markAsRead,
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
