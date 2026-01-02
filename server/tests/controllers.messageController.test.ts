import test from 'node:test';
import assert from 'node:assert/strict';
import type { Request, Response } from 'express';
import type { SocketManager } from '../socket/manager.js';
import { createMessageController } from '../controllers/messageController.js';
import { ServiceError } from '../utils/errors.js';

const createRes = () => ({
  json: () => {},
});

test('toggleReaction rejects invalid emoji', async () => {
  const socketManager = {
    io: {
      to: () => ({ emit: () => {} }),
      in: () => ({ fetchSockets: async () => [] }),
    },
    emitToConversation: () => {},
    emitToUser: () => {},
    addConversationToUserSockets: async () => {},
    removeConversationFromUserSockets: async () => {},
  } as SocketManager;
  const controller = createMessageController(socketManager);
  const req = { user: { userId: 'u1' }, params: { id: 'm1' }, body: { emoji: '💥' } } as unknown as Request;
  const res = createRes() as unknown as Response;
  await assert.rejects(
    () => controller.toggleReaction(req, res),
    (err) => err instanceof ServiceError && err.status === 400
  );
});
