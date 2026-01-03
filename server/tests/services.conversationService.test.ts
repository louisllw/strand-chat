import test from 'node:test';
import assert from 'node:assert/strict';
import { createConversationWithParticipants, createDirectChat, addMembersToConversation, createGroupChat } from '../services/conversationService.js';
import { ServiceError } from '../utils/errors.js';
import { createUser, shouldRunIntegration } from './helpers/db.js';

test('createConversationWithParticipants rejects empty participants', async () => {
  await assert.rejects(
    () => createConversationWithParticipants({ userId: 'u1', type: 'direct', name: undefined, participantIds: [] }),
    (err) => err instanceof ServiceError && err.status === 400
  );
});

test('createConversationWithParticipants rejects direct self conversation', async () => {
  await assert.rejects(
    () => createConversationWithParticipants({ userId: 'u1', type: 'direct', name: undefined, participantIds: ['u1'] }),
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

test('createDirectChat creates a conversation for valid users', { skip: !shouldRunIntegration }, async () => {
  const userA = await createUser();
  const userB = await createUser();

  const result = await createDirectChat({ userId: userA.id, username: userB.username });
  assert.ok(result.conversationId);
  assert.equal(result.memberIds.includes(userA.id), true);
  assert.equal(result.memberIds.includes(userB.id), true);
});

test('createGroupChat returns a group conversation id', { skip: !shouldRunIntegration }, async () => {
  const admin = await createUser();
  const member = await createUser();

  const result = await createGroupChat({ userId: admin.id, name: 'Team', usernames: [member.username] });
  assert.ok(result.conversationId);
  assert.equal(result.memberIds.length, 2);
});
