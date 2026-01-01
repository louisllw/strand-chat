import { useContext } from 'react';
import { ChatSearchContext } from '@/contexts/chat-search-context';

export const useChatSearch = () => {
  const context = useContext(ChatSearchContext);
  if (context === undefined) {
    throw new Error('useChatSearch must be used within a ChatProvider');
  }
  return context;
};
