export type SocketServer = {
  to: (room: string) => { emit: (event: string, payload: unknown) => void };
  in: (room: string) => {
    fetchSockets: () => Promise<Array<{ data: { conversationIds?: Set<string> }; join: (id: string) => void; leave: (id: string) => void }>>;
  };
};

export type SocketManager = {
  io: SocketServer;
  addConversationToUserSockets: (userId: string, conversationId: string) => Promise<void>;
  removeConversationFromUserSockets: (userId: string, conversationId: string) => Promise<void>;
  emitToConversation: (conversationId: string, event: string, payload: unknown) => void;
  emitToUser: (userId: string, event: string, payload: unknown) => void;
};

export const createSocketManager = (io: SocketServer): SocketManager => {
  const addConversationToUserSockets = async (userId: string, conversationId: string) => {
    const sockets = await io.in(`user:${userId}`).fetchSockets();
    sockets.forEach((socket) => {
      if (!socket.data.conversationIds) {
        socket.data.conversationIds = new Set();
      }
      socket.data.conversationIds.add(conversationId);
      socket.join(conversationId);
    });
  };

  const removeConversationFromUserSockets = async (userId: string, conversationId: string) => {
    const sockets = await io.in(`user:${userId}`).fetchSockets();
    sockets.forEach((socket) => {
      if (socket.data.conversationIds) {
        socket.data.conversationIds.delete(conversationId);
      }
      socket.leave(conversationId);
    });
  };

  return {
    io,
    addConversationToUserSockets,
    removeConversationFromUserSockets,
    emitToConversation: (conversationId: string, event: string, payload: unknown) =>
      io.to(conversationId).emit(event, payload),
    emitToUser: (userId: string, event: string, payload: unknown) =>
      io.to(`user:${userId}`).emit(event, payload),
  };
};
