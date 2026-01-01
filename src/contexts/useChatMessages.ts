import { useContext } from 'react';
import { ChatMessagesContext } from '@/contexts/chat-messages-context';

export const useChatMessages = () => {
  const context = useContext(ChatMessagesContext);
  if (context === undefined) {
    throw new Error('useChatMessages must be used within a ChatProvider');
  }
  return context;
};
