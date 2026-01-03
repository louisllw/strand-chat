import { query } from '../../db.js';
import { insertUser } from '../../models/userModel.js';
import { createGroupConversation, createDirectConversation } from '../../models/conversationModel.js';

export const shouldRunIntegration = process.env.RUN_INTEGRATION_TESTS === 'true';

const randomSuffix = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const resetDb = async () => {
  await query(
    `truncate table
      message_reactions,
      message_reads,
      messages,
      conversation_members,
      conversations,
      user_emoji_recents,
      users
     restart identity cascade`
  );
};

export const createUser = async (overrides?: { username?: string; email?: string }) => {
  const suffix = randomSuffix();
  const username = overrides?.username ?? `user_${suffix}`;
  const email = overrides?.email ?? `user_${suffix}@example.com`;
  return insertUser({
    username,
    email,
    passwordHash: 'test_hash',
  });
};

export const createDirectConversationFor = async (userId: string, otherUserId: string) => {
  const directKey = userId < otherUserId ? `${userId}:${otherUserId}` : `${otherUserId}:${userId}`;
  return createDirectConversation({ userId, otherUserId, directKey }, null);
};

export const createGroupConversationFor = async (
  userId: string,
  memberIds: string[],
  name = 'Test Group'
) => {
  return createGroupConversation({ name, memberIds: [userId, ...memberIds], adminId: userId }, null);
};
