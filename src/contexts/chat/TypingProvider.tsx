import React, { useEffect, useMemo, useState } from 'react';
import { TypingIndicator } from '@/types';
import { useAuth } from '@/contexts/useAuth';
import { useSocket } from '@/contexts/useSocket';
import { ChatTypingContext } from '@/contexts/chat-typing-context';

export const ChatTypingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const { on, off } = useSocket();
  const [typingIndicators, setTypingIndicators] = useState<TypingIndicator[]>([]);
  const currentUserId = useMemo(() => user?.id, [user?.id]);

  useEffect(() => {
    const handleTyping = (indicator: TypingIndicator) => {
      if (import.meta.env.DEV) {
        console.log('[ChatTyping] Received typing:indicator', indicator);
      }
      if (indicator.userId === currentUserId) {
        if (import.meta.env.DEV) {
          console.log('[ChatTyping] Ignoring own typing indicator');
        }
        return;
      }
      setTypingIndicators(prev => {
        const exists = prev.some(t => t.userId === indicator.userId && t.conversationId === indicator.conversationId);
        if (exists) {
          if (import.meta.env.DEV) {
            console.log('[ChatTyping] Typing indicator already exists');
          }
          return prev;
        }
        if (import.meta.env.DEV) {
          console.log('[ChatTyping] Adding typing indicator', [...prev, indicator]);
        }
        return [...prev, indicator];
      });
    };

    const handleTypingStop = (payload: { conversationId: string; userId: string }) => {
      if (import.meta.env.DEV) {
        console.log('[ChatTyping] Received typing:stop', payload);
      }
      setTypingIndicators(prev => {
        const filtered = prev.filter(t => !(t.conversationId === payload.conversationId && t.userId === payload.userId));
        if (import.meta.env.DEV) {
          console.log('[ChatTyping] Typing indicators after stop:', filtered);
        }
        return filtered;
      });
    };

    on('typing:indicator', handleTyping);
    on('typing:stop', handleTypingStop);
    return () => {
      off('typing:indicator', handleTyping);
      off('typing:stop', handleTypingStop);
    };
  }, [on, off, currentUserId]);

  return (
    <ChatTypingContext.Provider value={{ typingIndicators }}>
      {children}
    </ChatTypingContext.Provider>
  );
};
