import { query, withTransaction } from '../db.js';
import {
  addConversationMembers,
  createConversation,
  createDirectConversation,
  createGroupConversation,
  findDirectConversation,
  getConversationMembership,
  getConversationMembershipMeta,
  getConversationTypeForMember,
  hideConversationForUser,
  listConversationIdsForUser,
  listConversationMembers,
  listConversationsForUser,
  listExistingConversationMembers,
  markConversationRead,
  removeConversationMember,
  revealConversationMembership,
} from '../models/conversationModel.js';
import {
  findUserIdByNormalizedUsername,
  findUsersByNormalizedUsernames,
} from '../models/userModel.js';
import { createSystemMessage } from './messageService.js';
import { normalizeUsername, isValidUsername } from '../utils/validation.js';
import { sanitizeText } from '../utils/sanitize.js';
import { ServiceError } from '../utils/errors.js';

export const listConversations = async (userId) => {
  const rows = await listConversationsForUser(userId);
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    type: row.type,
    participants: row.other_user ? [row.other_user] : [],
    participantCount: Number(row.participant_count || 0),
    lastMessage: row.last_message
      ? {
          ...row.last_message,
          content: sanitizeText(row.last_message.content),
        }
      : null,
    unreadCount: Number(row.unread_count || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
};

export const listMessagesForConversation = async ({ conversationId, userId }) => {
  const membership = await getConversationMembershipMeta({ conversationId, userId });
  if (!membership) {
    throw new ServiceError(403, 'Forbidden');
  }
  return {
    clearedAt: membership.cleared_at,
  };
};

export const createConversationWithParticipants = async ({ userId, type, name, participantIds }) => {
  if (!Array.isArray(participantIds) || participantIds.length === 0) {
    throw new ServiceError(400, 'Participants required');
  }

  try {
    return await withTransaction(async (client) => {
      const members = Array.from(new Set([userId, ...participantIds]));
      const conversation = await createConversation({ name, type, memberIds: members }, client);
      return { conversationId: conversation.id, memberIds: members };
    });
  } catch (error) {
    throw new ServiceError(500, 'Failed to create conversation');
  }
};

export const createDirectChat = async ({ userId, username }) => {
  if (!username) {
    throw new ServiceError(400, 'Username is required');
  }

  const normalizedUsername = normalizeUsername(username);
  if (!normalizedUsername || !isValidUsername(normalizedUsername)) {
    throw new ServiceError(400, 'Username must be 3-30 characters, one word (letters, numbers, . or _).');
  }

  const otherUserId = await findUserIdByNormalizedUsername(normalizedUsername);
  if (!otherUserId) {
    throw new ServiceError(404, 'User not found');
  }
  if (otherUserId === userId) {
    throw new ServiceError(400, 'Cannot start a conversation with yourself');
  }

  const existingConversationId = await findDirectConversation({ userId, otherUserId });
  if (existingConversationId) {
    await revealConversationMembership({ conversationId: existingConversationId, userId });
    return { conversationId: existingConversationId, memberIds: [userId] };
  }

  try {
    return await withTransaction(async (client) => {
      const conversationId = await createDirectConversation({ userId, otherUserId }, client);
      return { conversationId, memberIds: [userId, otherUserId] };
    });
  } catch (error) {
    throw new ServiceError(500, 'Failed to create conversation');
  }
};

export const createGroupChat = async ({ userId, name, usernames }) => {
  if (!Array.isArray(usernames) || usernames.length === 0) {
    throw new ServiceError(400, 'Usernames are required');
  }

  const normalizedUsernames = Array.from(new Set(
    usernames
      .map((value) => normalizeUsername(String(value || '')))
      .filter((value) => value && isValidUsername(value))
  ));

  if (normalizedUsernames.length === 0) {
    throw new ServiceError(400, 'No valid usernames provided');
  }

  const userRows = await findUsersByNormalizedUsernames(normalizedUsernames);
  const participantIds = userRows
    .map((row) => row.id)
    .filter((id) => id !== userId);

  if (participantIds.length === 0) {
    throw new ServiceError(404, 'No matching users found');
  }

  const members = [userId, ...participantIds];
  try {
    return await withTransaction(async (client) => {
      const conversationId = await createGroupConversation({ name, memberIds: members }, client);
      return { conversationId, memberIds: members };
    });
  } catch (error) {
    throw new ServiceError(500, 'Failed to create group');
  }
};

export const hideConversation = async ({ conversationId, userId }) => {
  const isMember = await getConversationMembership({
    conversationId,
    userId,
    requireVisible: false,
  });
  if (!isMember) {
    throw new ServiceError(403, 'Forbidden');
  }
  await hideConversationForUser({ conversationId, userId });
};

export const leaveConversation = async ({ conversationId, userId }) => {
  const conversationType = await getConversationTypeForMember({ conversationId, userId });
  if (!conversationType) {
    throw new ServiceError(403, 'Forbidden');
  }
  if (conversationType !== 'group') {
    throw new ServiceError(400, 'Only group chats can be left');
  }

  await removeConversationMember({ conversationId, userId });
  const actorResult = await query('select username from users where id = $1', [userId]);
  const actorUsername = actorResult.rows[0]?.username || 'Someone';
  const systemMessage = await createSystemMessage(
    conversationId,
    userId,
    `@${actorUsername} left the group`
  );
  const remainingMemberIds = await listConversationMembers(conversationId);
  return { systemMessage, remainingMemberIds };
};

export const addMembersToConversation = async ({ conversationId, userId, usernames }) => {
  if (!Array.isArray(usernames) || usernames.length === 0) {
    throw new ServiceError(400, 'Usernames are required');
  }

  const conversationType = await getConversationTypeForMember({ conversationId, userId });
  if (!conversationType) {
    throw new ServiceError(403, 'Forbidden');
  }
  if (conversationType !== 'group') {
    throw new ServiceError(400, 'Only group chats can add members');
  }

  const normalizedUsernames = Array.from(new Set(
    usernames
      .map((value) => normalizeUsername(String(value || '')))
      .filter((value) => value && isValidUsername(value))
  ));
  if (normalizedUsernames.length === 0) {
    throw new ServiceError(400, 'No valid usernames provided');
  }

  const userRows = await findUsersByNormalizedUsernames(normalizedUsernames);
  const candidateIds = userRows.map((row) => row.id);
  if (candidateIds.length === 0) {
    throw new ServiceError(404, 'No matching users found');
  }

  const existingIds = await listExistingConversationMembers({
    conversationId,
    userIds: candidateIds,
  });
  const existingSet = new Set(existingIds);
  const newIds = candidateIds.filter((id) => !existingSet.has(id));
  if (newIds.length === 0) {
    return { added: 0 };
  }

  try {
    await withTransaction(async (client) => {
      await addConversationMembers({ conversationId, userIds: newIds }, client);
    });
  } catch (error) {
    throw new ServiceError(500, 'Failed to add members');
  }

  const addedNames = userRows
    .filter((row) => newIds.includes(row.id))
    .map((row) => `@${row.username}`);
  let systemMessage = null;
  if (addedNames.length > 0) {
    const actorResult = await query('select username from users where id = $1', [userId]);
    const actorUsername = actorResult.rows[0]?.username || 'Someone';
    systemMessage = await createSystemMessage(
      conversationId,
      userId,
      `@${actorUsername} added ${addedNames.join(', ')}`
    );
  }

  const currentMembers = await listConversationMembers(conversationId);
  return {
    added: newIds.length,
    addedIds: newIds,
    systemMessage,
    currentMembers,
  };
};

export const markConversationAsRead = async ({ conversationId, userId }) => {
  const isMember = await getConversationMembership({
    conversationId,
    userId,
    requireVisible: true,
  });
  if (!isMember) {
    throw new ServiceError(403, 'Forbidden');
  }
  await markConversationRead({ conversationId, userId });
};

export const getConversationIdsForUser = async (userId, client = null) => {
  return listConversationIdsForUser(userId, client);
};
