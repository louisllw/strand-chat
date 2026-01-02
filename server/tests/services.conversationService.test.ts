import test from 'node:test';
import assert from 'node:assert/strict';
import { createConversationWithParticipants, createDirectChat, addMembersToConversation, createGroupChat } from '../services/conversationService.js';
import { ServiceError } from '../utils/errors.js';

test('createConversationWithParticipants rejects empty participants', async () => {
  await assert.rejects(
    () => createConversationWithParticipants({ userId: 'u1', type: 'direct', name: undefined, participantIds: [] }),
    (err) => err instanceof ServiceError && err.status === 400
  );
});

test('createDirectChat rejects missing username', async () => {
  await assert.rejects(
    () => createDirectChat({ userId: 'u1', username: '' }),
    (err) => err instanceof ServiceError && err.status === 400
  );
});

test('createGroupChat rejects empty usernames', async () => {
  await assert.rejects(
    () => createGroupChat({ userId: 'u1', name: 'Group', usernames: [] }),
    (err) => err instanceof ServiceError && err.status === 400
  );
});

test('addMembersToConversation rejects empty usernames', async () => {
  await assert.rejects(
    () => addMembersToConversation({ conversationId: 'c1', userId: 'u1', usernames: [] }),
    (err) => err instanceof ServiceError && err.status === 400
  );
});
