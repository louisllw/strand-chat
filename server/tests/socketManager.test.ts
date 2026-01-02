import test from 'node:test';
import assert from 'node:assert/strict';
import { createSocketManager } from '../socket/manager.js';

const createIo = () => {
  const emitted: Array<{ room: string; event: string; payload: unknown }> = [];
  const to = (room: string) => ({
    emit: (event: string, payload: unknown) => {
      emitted.push({ room, event, payload });
    },
  });
  const sockets: Array<{ data: { conversationIds?: Set<string> }; join: (id: string) => void; leave: (id: string) => void }> = [];
  const io = {
    to,
    in: () => ({
      fetchSockets: async () => sockets,
    }),
    _emitted: emitted,
    _sockets: sockets,
  };
  return io;
};

test('emit helpers target the right rooms', () => {
  const io = createIo();
  const manager = createSocketManager(io);
  manager.emitToConversation('conv-1', 'event-a', { ok: true });
  manager.emitToUser('user-1', 'event-b', { ok: false });
  assert.deepEqual(io._emitted, [
    { room: 'conv-1', event: 'event-a', payload: { ok: true } },
    { room: 'user:user-1', event: 'event-b', payload: { ok: false } },
  ]);
});

test('addConversationToUserSockets joins sockets and sets ids', async () => {
  const io = createIo();
  const socket = {
    data: {} as { conversationIds?: Set<string> },
    joined: [] as string[],
    join(id: string) {
      this.joined.push(id);
    },
    leave() {},
  };
  io._sockets.push(socket);
  const manager = createSocketManager(io);
  await manager.addConversationToUserSockets('user-1', 'conv-1');
  assert.deepEqual(socket.data.conversationIds, new Set(['conv-1']));
  assert.deepEqual(socket.joined, ['conv-1']);
});

test('removeConversationFromUserSockets leaves sockets and removes ids', async () => {
  const io = createIo();
  const socket = {
    data: { conversationIds: new Set(['conv-1']) } as { conversationIds?: Set<string> },
    left: [] as string[],
    join() {},
    leave(id: string) {
      this.left.push(id);
    },
  };
  io._sockets.push(socket);
  const manager = createSocketManager(io);
  await manager.removeConversationFromUserSockets('user-1', 'conv-1');
  assert.deepEqual(socket.data.conversationIds, new Set());
  assert.deepEqual(socket.left, ['conv-1']);
});
