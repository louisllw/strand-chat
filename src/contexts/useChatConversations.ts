import { useContext } from 'react';
import { ChatConversationsContext } from '@/contexts/chat-conversations-context';

export const useChatConversations = () => {
  const context = useContext(ChatConversationsContext);
  if (context === undefined) {
    throw new Error('useChatConversations must be used within a ChatProvider');
  }
  return context;
};
