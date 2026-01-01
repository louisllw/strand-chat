import { useChatConversations } from '@/contexts/useChatConversations';
import { useChatMessages } from '@/contexts/useChatMessages';
import { useChatTyping } from '@/contexts/useChatTyping';
import { useChatSearch } from '@/contexts/useChatSearch';

export const useChat = () => {
  return {
    ...useChatConversations(),
    ...useChatMessages(),
    ...useChatTyping(),
    ...useChatSearch(),
  };
};
