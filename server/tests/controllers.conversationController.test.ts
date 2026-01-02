import test from 'node:test';
import assert from 'node:assert/strict';
import type { Request, Response } from 'express';
import type { SocketManager } from '../socket/manager.js';
import { createConversationController } from '../controllers/conversationController.js';
import { ServiceError } from '../utils/errors.js';

const createRes = () => ({
  json: () => {},
});

test('createDirectConversation rejects missing username', async () => {
  const socketManager = {
    io: {
      to: () => ({ emit: () => {} }),
      in: () => ({ fetchSockets: async () => [] }),
    },
    emitToUser: () => {},
    emitToConversation: () => {},
    addConversationToUserSockets: async () => {},
    removeConversationFromUserSockets: async () => {},
  } as SocketManager;
  const controller = createConversationController(socketManager);
  const req = { user: { userId: 'u1' }, body: {} } as unknown as Request;
  const res = createRes() as unknown as Response;
  await assert.rejects(
    () => controller.createDirectConversation(req, res),
    (err) => err instanceof ServiceError && err.status === 400
  );
});
