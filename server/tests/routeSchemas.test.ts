import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createConversationSchema,
  idParams,
  leaveSchema,
  listMessagesSchema,
  sendMessageSchema,
} from '../routes/conversations.js';
import { toggleReactionSchema } from '../routes/messages.js';
import { updateMeSchema, userIdSchema } from '../routes/users.js';

const validUuid = '00000000-0000-0000-0000-000000000000';

test('conversation id params rejects non-uuid', () => {
  const result = idParams.safeParse({ id: 'not-a-uuid' });
  assert.equal(result.success, false);
});

test('listMessagesSchema rejects invalid beforeId', () => {
  const result = listMessagesSchema.safeParse({
    body: {},
    params: { id: validUuid },
    query: { beforeId: 'bad-id' },
  });
  assert.equal(result.success, false);
});

test('sendMessageSchema rejects invalid replyToId', () => {
  const result = sendMessageSchema.safeParse({
    body: { content: 'hi', replyToId: 'nope' },
    params: { id: validUuid },
    query: {},
  });
  assert.equal(result.success, false);
});

test('createConversationSchema rejects invalid participantIds', () => {
  const result = createConversationSchema.safeParse({
    body: { participantIds: ['bad-id'] },
    params: {},
    query: {},
  });
  assert.equal(result.success, false);
});

test('leaveSchema rejects invalid delegateUserId', () => {
  const result = leaveSchema.safeParse({
    body: { delegateUserId: 'nope' },
    params: { id: validUuid },
    query: {},
  });
  assert.equal(result.success, false);
});

test('toggleReactionSchema rejects invalid message id', () => {
  const result = toggleReactionSchema.safeParse({
    body: { emoji: '🔥' },
    params: { id: 'not-a-uuid' },
    query: {},
  });
  assert.equal(result.success, false);
});

test('updateMeSchema rejects invalid theme', () => {
  const result = updateMeSchema.safeParse({
    body: { theme: 'neon' },
    params: {},
    query: {},
  });
  assert.equal(result.success, false);
});

test('userIdSchema rejects invalid user id', () => {
  const result = userIdSchema.safeParse({
    body: {},
    params: { id: 'bad-id' },
    query: {},
  });
  assert.equal(result.success, false);
});
