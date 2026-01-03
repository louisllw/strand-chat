import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createMessageWithMembership,
  getConversationMessages,
  toggleReaction,
} from '../models/messageModel.js';
import {
  createUser,
  createDirectConversationFor,
  shouldRunIntegration,
} from './helpers/db.js';

test('messageModel creates messages and lists them', { skip: !shouldRunIntegration }, async () => {
  const userA = await createUser();
  const userB = await createUser();
  const conversationId = await createDirectConversationFor(userA.id, userB.id);

  const created = await createMessageWithMembership({
    conversationId,
    userId: userA.id,
    content: 'hello',
    type: 'text',
    attachmentUrl: null,
    replyToId: null,
  });
  assert.equal(created?.is_member, true);
  assert.ok(created?.id);

  const messages = await getConversationMessages({
    conversationId,
    userId: userA.id,
    limit: 10,
  });
  assert.equal(messages.length, 1);
  assert.equal(messages[0].content, 'hello');
});

test('messageModel toggles reactions and returns summary', { skip: !shouldRunIntegration }, async () => {
  const userA = await createUser();
  const userB = await createUser();
  const conversationId = await createDirectConversationFor(userA.id, userB.id);

  const created = await createMessageWithMembership({
    conversationId,
    userId: userA.id,
    content: 'react me',
    type: 'text',
    attachmentUrl: null,
    replyToId: null,
  });
  assert.ok(created?.id);

  const result = await toggleReaction({ messageId: created.id as string, userId: userB.id, emoji: '👍' });
  console.log('[DEBUG] toggleReaction result:', JSON.stringify(result, null, 2));
  assert.equal(result.conversation_id, conversationId);
  const reactions = result.reactions as Array<{ emoji: string; count: number; usernames: string[] }>;
  console.log('[DEBUG] reactions:', JSON.stringify(reactions, null, 2));
  assert.equal(reactions.length, 1);
  assert.equal(reactions[0].emoji, '👍');
  console.log('[DEBUG] reactions[0].count:', reactions[0].count, 'type:', typeof reactions[0].count);
  assert.equal(reactions[0].count, 1);
  assert.deepEqual(reactions[0].usernames, [userB.username]);
});
