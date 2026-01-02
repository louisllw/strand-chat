import type { Message, MessageReaction, TypingIndicator } from '@/types';

export type PresenceStatus = 'online' | 'away' | 'offline';

export type MessageSendPayload = {
  conversationId: string;
  content: string;
  type?: 'text' | 'image' | 'file';
  attachmentUrl?: string;
  replyToId?: string | null;
  clientMessageId?: string;
};

export type MessageSendResponse = {
  error?: string;
  message?: Message;
};

export type ReactionTogglePayload = {
  messageId: string;
  emoji: string;
};

export type ReactionToggleResponse = {
  error?: string;
  messageId?: string;
  reactions?: MessageReaction[];
};

export type TypingPayload = { conversationId?: string } | null;

export type PresenceUpdatePayload = {
  userId: string;
  status: PresenceStatus;
  lastSeen?: string | null;
};

export type ConversationCreatedPayload = {
  conversationId?: string;
};

export type SocketErrorPayload = {
  event?: string;
  message?: string;
};

export type ServerToClientEvents = {
  'message:new': (message: Message) => void;
  'reaction:update': (payload: { messageId: string; reactions: MessageReaction[] }) => void;
  'typing:indicator': (indicator: TypingIndicator) => void;
  'typing:stop': (payload: { conversationId: string; userId: string }) => void;
  'presence:update': (payload: PresenceUpdatePayload) => void;
  'conversation:created': (payload: ConversationCreatedPayload) => void;
  'conversation:updated': (payload: ConversationCreatedPayload) => void;
  'error': (payload: SocketErrorPayload) => void;
};

export type ClientToServerEvents = {
  'conversation:join': (conversationId: string) => void;
  'message:send': (payload: MessageSendPayload, callback?: (response: MessageSendResponse) => void) => void;
  'typing:start': (payload: TypingPayload) => void;
  'typing:stop': (payload: TypingPayload) => void;
  'reaction:toggle': (payload: ReactionTogglePayload, callback?: (response: ReactionToggleResponse) => void) => void;
  'presence:active': () => void;
  'presence:away': () => void;
};

