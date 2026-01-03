import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { AddressInfo } from 'node:net';
import { Server } from 'socket.io';
import { io as createClient, type Socket as ClientSocket } from 'socket.io-client';
import { registerSocketHandlers } from '../socket/handlers.js';
import { createSocketManager, type SocketServer } from '../socket/manager.js';
import { signToken } from '../auth.js';
import { createUser, createDirectConversationFor, shouldRunIntegration } from './helpers/db.js';

const waitForConnect = (socket: ClientSocket) =>
  new Promise<void>((resolve, reject) => {
    if (socket.connected) {
      resolve();
      return;
    }
    const timeout = setTimeout(() => reject(new Error('Socket connect timeout')), 10000);
    socket.once('connect', () => {
      clearTimeout(timeout);
      resolve();
    });
    socket.once('connect_error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });

const waitForEvent = <T>(socket: ClientSocket, event: string) =>
  new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Timeout waiting for ${event}`)), 10000);
    socket.once(event, (payload: T) => {
      clearTimeout(timeout);
      resolve(payload);
    });
  });

const emitWithAck = <T>(socket: ClientSocket, event: string, payload: unknown) =>
  new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Timeout waiting for ack ${event}`)), 10000);
    socket.emit(event, payload, (response: T & { error?: string }) => {
      if (response?.error) {
        clearTimeout(timeout);
        reject(new Error(response.error));
        return;
      }
      clearTimeout(timeout);
      resolve(response);
    });
  });

test('socket handlers broadcast messages and reactions', { skip: !shouldRunIntegration }, async () => {
  const originalEnv = { ...process.env };
  process.env.JWT_SECRET = 'socket-test-secret';

  const userA = await createUser({ username: 'socketa', email: 'socketa@example.com' });
  const userB = await createUser({ username: 'socketb', email: 'socketb@example.com' });
  const conversationId = await createDirectConversationFor(userA.id, userB.id);

  const httpServer = http.createServer();
  const io = new Server(httpServer, { cors: { origin: true, credentials: true } });
  const manager = createSocketManager(io as unknown as SocketServer);
  registerSocketHandlers(io, manager);

  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  const port = (httpServer.address() as AddressInfo).port;

  const tokenA = signToken({ userId: userA.id });
  const tokenB = signToken({ userId: userB.id });
  const cookieA = `strand_auth=${tokenA}`;
  const cookieB = `strand_auth=${tokenB}`;
  const clientA = createClient(`http://localhost:${port}`, {
    transports: ['websocket'],
    extraHeaders: { Cookie: cookieA },
  });
  const clientB = createClient(`http://localhost:${port}`, {
    transports: ['websocket'],
    extraHeaders: { Cookie: cookieB },
  });

  try {
    await waitForConnect(clientA);
    await waitForConnect(clientB);

    const receivedMessage = waitForEvent<{ id: string; conversationId: string }>(clientB, 'message:new');
    const sendAck = await emitWithAck<{ message: { id: string; conversationId: string } }>(clientA, 'message:send', {
      conversationId,
      content: 'hello from socket',
      type: 'text',
    });
    assert.ok(sendAck.message.id);
    const messageEvent = await receivedMessage;
    assert.equal(messageEvent.id, sendAck.message.id);
    assert.equal(messageEvent.conversationId, conversationId);

    const receivedReaction = waitForEvent<{ messageId: string }>(clientA, 'reaction:update');
    const reactionAck = await emitWithAck<{ messageId: string }>(clientB, 'reaction:toggle', {
      messageId: sendAck.message.id,
      emoji: '👍',
    });
    assert.equal(reactionAck.messageId, sendAck.message.id);
    const reactionEvent = await receivedReaction;
    assert.equal(reactionEvent.messageId, sendAck.message.id);
  } finally {
    clientA.disconnect();
    clientB.disconnect();
    io.close();
    httpServer.close();
    process.env = originalEnv;
  }
});
