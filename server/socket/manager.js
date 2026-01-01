export const createSocketManager = (io) => {
  const addConversationToUserSockets = async (userId, conversationId) => {
    const sockets = await io.in(`user:${userId}`).fetchSockets();
    sockets.forEach((socket) => {
      if (!socket.data.conversationIds) {
        socket.data.conversationIds = new Set();
      }
      socket.data.conversationIds.add(conversationId);
      socket.join(conversationId);
    });
  };

  const removeConversationFromUserSockets = async (userId, conversationId) => {
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
    emitToConversation: (conversationId, event, payload) =>
      io.to(conversationId).emit(event, payload),
    emitToUser: (userId, event, payload) =>
      io.to(`user:${userId}`).emit(event, payload),
  };
};
