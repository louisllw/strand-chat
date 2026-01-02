import React from 'react';
import { ChatConversationsProvider } from '@/contexts/chat/ConversationsProvider';
import { ChatMessagesProvider } from '@/contexts/chat/MessagesProvider';
import { ChatTypingProvider } from '@/contexts/chat/TypingProvider';
import { ChatSearchProvider } from '@/contexts/chat/SearchProvider';

export const ChatProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ChatConversationsProvider>
    <ChatMessagesProvider>
      <ChatTypingProvider>
        <ChatSearchProvider>
          {children}
        </ChatSearchProvider>
      </ChatTypingProvider>
    </ChatMessagesProvider>
  </ChatConversationsProvider>
);
