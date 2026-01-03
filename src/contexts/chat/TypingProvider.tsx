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
      if (indicator.userId === currentUserId) {
        return;
      }
      setTypingIndicators(prev => {
        const exists = prev.some(t => t.userId === indicator.userId && t.conversationId === indicator.conversationId);
        if (exists) {
          return prev;
        }
        return [...prev, indicator];
      });
    };

    const handleTypingStop = (payload: { conversationId: string; userId: string }) => {
      setTypingIndicators(prev => {
        const filtered = prev.filter(t => !(t.conversationId === payload.conversationId && t.userId === payload.userId));
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
