import { useContext } from 'react';
import { ChatTypingContext } from '@/contexts/chat-typing-context';

export const useChatTyping = () => {
  const context = useContext(ChatTypingContext);
  if (context === undefined) {
    throw new Error('useChatTyping must be used within a ChatProvider');
  }
  return context;
};
