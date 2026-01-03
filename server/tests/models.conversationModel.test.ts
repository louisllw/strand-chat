import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getConversationMemberRole,
  getConversationTypeForMember,
  listConversationIdsForUser,
  hasConversationAdmin,
} from '../models/conversationModel.js';
import {
  createUser,
  createDirectConversationFor,
  createGroupConversationFor,
  shouldRunIntegration,
} from './helpers/db.js';

test('conversationModel tracks direct conversations and memberships', { skip: !shouldRunIntegration }, async () => {
  const userA = await createUser();
  const userB = await createUser();

  const conversationId = await createDirectConversationFor(userA.id, userB.id);
  const userAConvos = await listConversationIdsForUser(userA.id);
  const userBConvos = await listConversationIdsForUser(userB.id);
  assert.equal(userAConvos.includes(conversationId), true);
  assert.equal(userBConvos.includes(conversationId), true);

  const type = await getConversationTypeForMember({ conversationId, userId: userA.id });
  assert.equal(type, 'direct');
  const hasAdmin = await hasConversationAdmin({ conversationId });
  assert.equal(hasAdmin, false);
});

test('conversationModel assigns group admin role', { skip: !shouldRunIntegration }, async () => {
  const admin = await createUser();
  const member = await createUser();

  const conversationId = await createGroupConversationFor(admin.id, [member.id], 'Group One');
  const type = await getConversationTypeForMember({ conversationId, userId: admin.id });
  assert.equal(type, 'group');
  const role = await getConversationMemberRole({ conversationId, userId: admin.id });
  assert.equal(role, 'admin');
  const hasAdmin = await hasConversationAdmin({ conversationId });
  assert.equal(hasAdmin, true);
});
