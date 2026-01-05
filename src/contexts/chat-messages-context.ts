import { createContext } from 'react';
import { Message } from '@/types';

export interface ChatMessagesContextType {
  messages: Message[];
  replyToMessage: Message | null;
  isLoadingOlder: boolean;
  hasMoreMessages: boolean;
  setReplyToMessage: (message: Message | null) => void;
  sendMessage: (
    content: string,
    type?: 'text' | 'image' | 'file',
    attachmentUrl?: string,
    attachmentMeta?: {
      width?: number;
      height?: number;
      thumbnailUrl?: string;
      thumbnailWidth?: number;
      thumbnailHeight?: number;
    }
  ) => void;
  toggleReaction: (messageId: string, emoji: string) => Promise<void>;
  loadOlderMessages: () => Promise<number>;
}

export const ChatMessagesContext = createContext<ChatMessagesContextType | undefined>(undefined);
