import 'socket.io';

declare module 'socket.io' {
  interface Socket {
    user?: {
      userId: string;
    };
  }

  interface SocketData {
    conversationIds?: Set<string>;
    rateLimits?: Map<string, { count: number; resetAt: number }>;
    connectionCounted?: boolean;
    activeConversationId?: string | null;
    activeConversationAt?: number;
  }
}
