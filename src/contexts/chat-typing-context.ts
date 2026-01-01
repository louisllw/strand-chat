import { createContext } from 'react';
import { TypingIndicator } from '@/types';

export interface ChatTypingContextType {
  typingIndicators: TypingIndicator[];
}

export const ChatTypingContext = createContext<ChatTypingContextType | undefined>(undefined);
