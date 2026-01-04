import { query, withTransaction } from '../db.js';
import {
  addConversationMembers,
  createConversation,
  createDirectConversation,
  createGroupConversation,
  findDirectConversation,
  getConversationMemberRole,
  getConversationMembership,
  getConversationMembershipMeta,
  getConversationTypeForMember,
  hasConversationAdmin,
  countConversationAdmins,
  getConversationName,
  hideConversationForUser,
  listConversationIdsForUser,
  listConversationMembers,
  listConversationMembersDetailed,
  listConversationsForUserPaginated,
  listExistingConversationMembers,
  markConversationRead,
  markConversationLeft,
  removeConversationMembers,
  revealConversationMembership,
  setConversationMemberRole,
} from '../models/conversationModel.js';
import {
  findUserIdByNormalizedUsername,
  findUsersByNormalizedUsernames,
} from '../models/userModel.js';
import { createSystemMessage } from './messageService.js';
import { normalizeUsername, isValidUsername } from '../utils/validation.js';
import { sanitizeText } from '../utils/sanitize.js';
import { ServiceError } from '../utils/errors.js';

type ConversationType = 'direct' | 'group';

type ConversationCursor = { sortTs: string; id: string };

const mapConversationRow = (row: {
  id: string;
  name?: string | null;
  type: string;
  created_at: string;
  updated_at: string;
  other_user?: unknown;
  participant_count?: number | null;
  last_message?: { content: string } | null;
  unread_count?: number | null;
  left_at?: string | null;
}) => ({
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
    leftAt: row.left_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });

const getDirectKey = (userId: string, otherUserId: string) => {
  return userId < otherUserId
    ? `${userId}:${otherUserId}`
    : `${otherUserId}:${userId}`;
};

export const listConversations = async ({
  userId,
  limit,
  cursor,
}: {
  userId: string;
  limit?: number;
  cursor?: ConversationCursor | null;
}): Promise<{ conversations: ReturnType<typeof mapConversationRow>[]; nextCursor: ConversationCursor | null }> => {
  const pageSize = Math.min(Math.max(limit ?? 50, 1), 200);
  const rows = cursor
    ? await listConversationsForUserPaginated({ userId, limit: pageSize, cursor })
    : await listConversationsForUserPaginated({ userId, limit: pageSize, cursor: null });
  const conversations = rows.map(mapConversationRow);
  const lastRow = rows[rows.length - 1] as { sort_ts?: string; id?: string } | undefined;
  const nextCursor = lastRow?.sort_ts && lastRow?.id
    ? { sortTs: new Date(lastRow.sort_ts).toISOString(), id: lastRow.id }
    : null;
  return { conversations, nextCursor };
};

export const listMessagesForConversation = async ({
  conversationId,
  userId,
}: {
  conversationId: string;
  userId: string;
}) => {
  const membership = await getConversationMembershipMeta({ conversationId, userId });
  if (!membership) {
    throw new ServiceError(403, 'CONVERSATION_FORBIDDEN', 'Forbidden');
  }
  return {
    clearedAt: membership.cleared_at,
    joinedAt: membership.joined_at,
    leftAt: membership.left_at,
  };
};

export const createConversationWithParticipants = async ({
  userId,
  type,
  name,
  participantIds,
}: {
  userId: string;
  type?: ConversationType;
  name?: string;
  participantIds: string[];
}): Promise<{ conversationId: string; memberIds: string[] }> => {
  if (!Array.isArray(participantIds) || participantIds.length === 0) {
    throw new ServiceError(400, 'CONVERSATION_PARTICIPANTS_REQUIRED', 'Participants required');
  }
  if (type === 'direct' && participantIds.length !== 1) {
    throw new ServiceError(400, 'CONVERSATION_DIRECT_TWO_REQUIRED', 'Direct chats require exactly one participant');
  }

  const conversationType: ConversationType = type ?? 'direct';
  if (conversationType === 'direct') {
    const otherUserId = participantIds[0];
    if (otherUserId === userId) {
      throw new ServiceError(400, 'CONVERSATION_SELF', 'Cannot start a conversation with yourself');
    }
    const existingConversationId = await findDirectConversation({ userId, otherUserId });
    if (existingConversationId) {
      await revealConversationMembership({ conversationId: existingConversationId, userId });
      return { conversationId: existingConversationId, memberIds: [userId] };
    }
  }

  try {
    return await withTransaction(async (client) => {
      const members = Array.from(new Set([userId, ...participantIds]));
      const directKey = conversationType === 'direct'
        ? getDirectKey(userId, participantIds[0])
        : null;
      const conversation = await createConversation({
        name,
        type: conversationType,
        memberIds: members,
        adminId: conversationType === 'group' ? userId : null,
        directKey,
      }, client);
      return { conversationId: conversation.id, memberIds: members };
    });
  } catch (error) {
    if (conversationType === 'direct') {
      const err = error as { code?: string; constraint?: string };
      if (err.code === '23505' && err.constraint === 'idx_conversations_direct_key_unique') {
        const existing = await findDirectConversation({ userId, otherUserId: participantIds[0] });
        if (existing) {
          await revealConversationMembership({ conversationId: existing, userId });
          return { conversationId: existing, memberIds: [userId] };
        }
      }
    }
    throw new ServiceError(500, 'CONVERSATION_CREATE_FAILED', 'Failed to create conversation');
  }
};

export const createDirectChat = async ({
  userId,
  username,
}: {
  userId: string;
  username: string;
}): Promise<{ conversationId: string; memberIds: string[] }> => {
  if (!username) {
    throw new ServiceError(400, 'CONVERSATION_USERNAME_REQUIRED', 'Username is required');
  }

  const normalizedUsername = normalizeUsername(username);
  if (!normalizedUsername || !isValidUsername(normalizedUsername)) {
    throw new ServiceError(
      400,
      'CONVERSATION_USERNAME_INVALID',
      'Username must be 3-30 characters, one word (letters, numbers, . or _).'
    );
  }

  const otherUserId = await findUserIdByNormalizedUsername(normalizedUsername);
  if (!otherUserId) {
    throw new ServiceError(404, 'CONVERSATION_USER_NOT_FOUND', 'User not found');
  }
  if (otherUserId === userId) {
    throw new ServiceError(400, 'CONVERSATION_SELF', 'Cannot start a conversation with yourself');
  }

  const existingConversationId = await findDirectConversation({ userId, otherUserId });
  if (existingConversationId) {
    await revealConversationMembership({ conversationId: existingConversationId, userId });
    return { conversationId: existingConversationId, memberIds: [userId] };
  }

  try {
    return await withTransaction(async (client) => {
      const conversationId = await createDirectConversation({
        userId,
        otherUserId,
        directKey: getDirectKey(userId, otherUserId),
      }, client);
      return { conversationId, memberIds: [userId, otherUserId] };
    });
  } catch (error) {
    const err = error as { code?: string; constraint?: string };
    if (err.code === '23505' && err.constraint === 'idx_conversations_direct_key_unique') {
      const existing = await findDirectConversation({ userId, otherUserId });
      if (existing) {
        await revealConversationMembership({ conversationId: existing, userId });
        return { conversationId: existing, memberIds: [userId] };
      }
    }
    throw new ServiceError(500, 'CONVERSATION_CREATE_FAILED', 'Failed to create conversation');
  }
};

export const createGroupChat = async ({
  userId,
  name,
  usernames,
}: {
  userId: string;
  name?: string;
  usernames: string[];
}): Promise<{ conversationId: string; memberIds: string[] }> => {
  if (!Array.isArray(usernames) || usernames.length === 0) {
    throw new ServiceError(400, 'CONVERSATION_GROUP_USERNAMES_REQUIRED', 'Usernames are required');
  }

  const normalizedUsernames = Array.from(new Set(
    usernames
      .map((value) => normalizeUsername(String(value || '')))
      .filter((value) => value && isValidUsername(value))
  ));

  if (normalizedUsernames.length === 0) {
    throw new ServiceError(400, 'CONVERSATION_GROUP_NO_VALID_USERNAMES', 'No valid usernames provided');
  }

  const userRows = await findUsersByNormalizedUsernames(normalizedUsernames);
  const participantIds = userRows
    .map((row) => row.id)
    .filter((id) => id !== userId);

  if (participantIds.length === 0) {
    throw new ServiceError(404, 'CONVERSATION_GROUP_NO_MATCHING_USERS', 'No matching users found');
  }

  const members = [userId, ...participantIds];
  try {
    return await withTransaction(async (client) => {
      const conversationId = await createGroupConversation({ name, memberIds: members, adminId: userId }, client);
      return { conversationId, memberIds: members };
    });
  } catch {
    throw new ServiceError(500, 'CONVERSATION_GROUP_CREATE_FAILED', 'Failed to create group');
  }
};

export const hideConversation = async ({
  conversationId,
  userId,
}: {
  conversationId: string;
  userId: string;
}) => {
  const isMember = await getConversationMembership({
    conversationId,
    userId,
    requireVisible: false,
  });
  if (!isMember) {
    throw new ServiceError(403, 'CONVERSATION_FORBIDDEN', 'Forbidden');
  }
  await hideConversationForUser({ conversationId, userId });
};

export const leaveConversation = async ({
  conversationId,
  userId,
  delegateUserId,
}: {
  conversationId: string;
  userId: string;
  delegateUserId?: string | null;
}): Promise<{
  systemMessages: Awaited<ReturnType<typeof createSystemMessage>>[];
  remainingMemberIds: string[];
}> => {
  const conversationType = await getConversationTypeForMember({ conversationId, userId });
  if (!conversationType) {
    throw new ServiceError(403, 'CONVERSATION_FORBIDDEN', 'Forbidden');
  }
  if (conversationType !== 'group') {
    throw new ServiceError(400, 'CONVERSATION_GROUP_ONLY_LEAVE', 'Only group chats can be left');
  }

  const role = await getConversationMemberRole({ conversationId, userId });
  if (role === 'admin') {
    const remainingMembers = await listConversationMembers(conversationId);
    const others = remainingMembers.filter((memberId) => memberId !== userId);
    if (others.length === 0) {
      await markConversationLeft({ conversationId, userId });
      const systemMessages: Awaited<ReturnType<typeof createSystemMessage>>[] = [];
      const remainingMemberIds = await listConversationMembers(conversationId);
      return { systemMessages, remainingMemberIds };
    }
    if (!delegateUserId || delegateUserId === userId) {
      throw new ServiceError(400, 'CONVERSATION_ADMIN_DELEGATE_REQUIRED', 'Delegate admin before leaving');
    }
    if (!others.includes(delegateUserId)) {
      throw new ServiceError(400, 'CONVERSATION_ADMIN_DELEGATE_INVALID', 'Delegate must be a member');
    }
    await setConversationMemberRole({ conversationId, userId: delegateUserId, role: 'admin' }, null);
  }

  await markConversationLeft({ conversationId, userId });
  const actorResult = await query('select username from users where id = $1', [userId]);
  const actorUsername = actorResult.rows[0]?.username || 'Someone';
  const systemMessages: Awaited<ReturnType<typeof createSystemMessage>>[] = [];
  if (role === 'admin' && delegateUserId) {
    const delegateResult = await query('select username from users where id = $1', [delegateUserId]);
    const delegateUsername = delegateResult.rows[0]?.username || 'someone';
    systemMessages.push(
      await createSystemMessage(
        conversationId,
        userId,
        `@${actorUsername} made @${delegateUsername} an admin`
      )
    );
  }
  systemMessages.push(
    await createSystemMessage(
      conversationId,
      userId,
      `@${actorUsername} left the group`
    )
  );
  const remainingMemberIds = await listConversationMembers(conversationId);
  return { systemMessages, remainingMemberIds };
};

export const addMembersToConversation = async ({
  conversationId,
  userId,
  usernames,
}: {
  conversationId: string;
  userId: string;
  usernames: string[];
}): Promise<{
  added: number;
  addedIds?: string[];
  systemMessage?: Awaited<ReturnType<typeof createSystemMessage>> | null;
  currentMembers?: string[];
}> => {
  if (!Array.isArray(usernames) || usernames.length === 0) {
    throw new ServiceError(400, 'CONVERSATION_GROUP_USERNAMES_REQUIRED', 'Usernames are required');
  }

  const conversationType = await getConversationTypeForMember({ conversationId, userId });
  if (!conversationType) {
    throw new ServiceError(403, 'CONVERSATION_FORBIDDEN', 'Forbidden');
  }
  if (conversationType !== 'group') {
    throw new ServiceError(400, 'CONVERSATION_GROUP_ONLY_ADD', 'Only group chats can add members');
  }

  const role = await getConversationMemberRole({ conversationId, userId });
  if (role !== 'admin') {
    const hasAdmin = await hasConversationAdmin({ conversationId });
    if (hasAdmin) {
      throw new ServiceError(403, 'CONVERSATION_ADMIN_REQUIRED', 'Admin role required');
    }
    await setConversationMemberRole({ conversationId, userId, role: 'admin' }, null);
  }

  const normalizedUsernames = Array.from(new Set(
    usernames
      .map((value) => normalizeUsername(String(value || '')))
      .filter((value) => value && isValidUsername(value))
  ));
  if (normalizedUsernames.length === 0) {
    throw new ServiceError(400, 'CONVERSATION_GROUP_NO_VALID_USERNAMES', 'No valid usernames provided');
  }

  const userRows = await findUsersByNormalizedUsernames(normalizedUsernames);
  const candidateIds = userRows.map((row) => row.id);
  if (candidateIds.length === 0) {
    throw new ServiceError(404, 'CONVERSATION_GROUP_NO_MATCHING_USERS', 'No matching users found');
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
  } catch {
    throw new ServiceError(500, 'CONVERSATION_GROUP_ADD_FAILED', 'Failed to add members');
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

export const removeMembersFromConversation = async ({
  conversationId,
  userId,
  usernames,
}: {
  conversationId: string;
  userId: string;
  usernames: string[];
}): Promise<{
  removed: number;
  removedIds?: string[];
  systemMessage?: Awaited<ReturnType<typeof createSystemMessage>> | null;
  currentMembers?: string[];
  conversationName?: string | null;
}> => {
  if (!Array.isArray(usernames) || usernames.length === 0) {
    throw new ServiceError(400, 'CONVERSATION_GROUP_USERNAMES_REQUIRED', 'Usernames are required');
  }

  const conversationType = await getConversationTypeForMember({ conversationId, userId });
  if (!conversationType) {
    throw new ServiceError(403, 'CONVERSATION_FORBIDDEN', 'Forbidden');
  }
  if (conversationType !== 'group') {
    throw new ServiceError(400, 'CONVERSATION_GROUP_ONLY_REMOVE', 'Only group chats can remove members');
  }

  const role = await getConversationMemberRole({ conversationId, userId });
  const hasAdmin = await hasConversationAdmin({ conversationId });
  if (hasAdmin && role !== 'admin') {
    throw new ServiceError(403, 'CONVERSATION_ADMIN_REQUIRED', 'Admin role required');
  }

  const normalizedUsernames = Array.from(new Set(
    usernames
      .map((value) => normalizeUsername(String(value || '')))
      .filter((value) => value && isValidUsername(value))
  ));
  if (normalizedUsernames.length === 0) {
    throw new ServiceError(400, 'CONVERSATION_GROUP_NO_VALID_USERNAMES', 'No valid usernames provided');
  }

  const userRows = await findUsersByNormalizedUsernames(normalizedUsernames);
  const candidateIds = userRows.map((row) => row.id);
  if (candidateIds.length === 0) {
    throw new ServiceError(404, 'CONVERSATION_GROUP_NO_MATCHING_USERS', 'No matching users found');
  }

  const existingIds = await listExistingConversationMembers({
    conversationId,
    userIds: candidateIds,
  });
  const existingSet = new Set(existingIds);
  const removeIds = candidateIds.filter((id) => existingSet.has(id));
  if (removeIds.length === 0) {
    return { removed: 0 };
  }
  if (removeIds.includes(userId)) {
    throw new ServiceError(400, 'CONVERSATION_GROUP_REMOVE_SELF', 'Use leave to remove yourself');
  }

  try {
    await removeConversationMembers({ conversationId, userIds: removeIds });
  } catch {
    throw new ServiceError(500, 'CONVERSATION_GROUP_REMOVE_FAILED', 'Failed to remove members');
  }

  const removedNames = userRows
    .filter((row) => removeIds.includes(row.id))
    .map((row) => `@${row.username}`);
  let systemMessage = null;
  if (removedNames.length > 0) {
    const actorResult = await query('select username from users where id = $1', [userId]);
    const actorUsername = actorResult.rows[0]?.username || 'Someone';
    systemMessage = await createSystemMessage(
      conversationId,
      userId,
      `@${actorUsername} removed ${removedNames.join(', ')}`
    );
  }

  const currentMembers = await listConversationMembers(conversationId);
  const conversationName = await getConversationName(conversationId);
  return {
    removed: removeIds.length,
    removedIds: removeIds,
    systemMessage,
    currentMembers,
    conversationName,
  };
};

export const markConversationAsRead = async ({
  conversationId,
  userId,
}: {
  conversationId: string;
  userId: string;
}) => {
  const isMember = await getConversationMembership({
    conversationId,
    userId,
    requireVisible: true,
  });
  if (!isMember) {
    throw new ServiceError(403, 'CONVERSATION_FORBIDDEN', 'Forbidden');
  }
  await markConversationRead({ conversationId, userId });
};

export const listConversationMembersForUser = async ({
  conversationId,
  userId,
}: {
  conversationId: string;
  userId: string;
}) => {
  const conversationType = await getConversationTypeForMember({ conversationId, userId });
  if (!conversationType) {
    throw new ServiceError(403, 'CONVERSATION_FORBIDDEN', 'Forbidden');
  }
  const rows = await listConversationMembersDetailed(conversationId);
  return rows.map((row) => ({
    id: row.id,
    username: row.username,
    avatar: row.avatar,
    status: row.status,
    lastSeen: row.last_seen,
    role: row.role,
  }));
};

export const getConversationInfoForMember = async ({
  conversationId,
  userId,
}: {
  conversationId: string;
  userId: string;
}) => {
  const [type, name] = await Promise.all([
    getConversationTypeForMember({ conversationId, userId }),
    getConversationName(conversationId),
  ]);
  return { type, name };
};

export const listConversationMemberIdsForUser = async ({
  conversationId,
  userId,
}: {
  conversationId: string;
  userId: string;
}) => {
  const conversationType = await getConversationTypeForMember({ conversationId, userId });
  if (!conversationType) {
    throw new ServiceError(403, 'CONVERSATION_FORBIDDEN', 'Forbidden');
  }
  return listConversationMembers(conversationId);
};

export const updateConversationMemberRole = async ({
  conversationId,
  userId,
  targetUserId,
  role,
}: {
  conversationId: string;
  userId: string;
  targetUserId: string;
  role: 'admin' | 'member';
}) => {
  const conversationType = await getConversationTypeForMember({ conversationId, userId });
  if (!conversationType) {
    throw new ServiceError(403, 'CONVERSATION_FORBIDDEN', 'Forbidden');
  }
  if (conversationType !== 'group') {
    throw new ServiceError(400, 'CONVERSATION_GROUP_ONLY_ROLE', 'Only group chats can update roles');
  }
  const requesterRole = await getConversationMemberRole({ conversationId, userId });
  const hasAdmin = await hasConversationAdmin({ conversationId });
  if (hasAdmin && requesterRole !== 'admin') {
    throw new ServiceError(403, 'CONVERSATION_ADMIN_REQUIRED', 'Admin role required');
  }
  const isTargetMember = await getConversationMembership({
    conversationId,
    userId: targetUserId,
    requireVisible: true,
  });
  if (!isTargetMember) {
    throw new ServiceError(404, 'CONVERSATION_MEMBER_NOT_FOUND', 'Member not found');
  }
  if (role === 'member') {
    const currentRole = await getConversationMemberRole({ conversationId, userId: targetUserId });
    if (currentRole === 'admin') {
      const adminCount = await countConversationAdmins(conversationId);
      if (adminCount <= 1) {
        throw new ServiceError(400, 'CONVERSATION_ADMIN_REQUIRED', 'At least one admin is required');
      }
    }
  }
  await setConversationMemberRole({ conversationId, userId: targetUserId, role }, null);
  const actorResult = await query('select username from users where id = $1', [userId]);
  const actorUsername = actorResult.rows[0]?.username || 'Someone';
  const targetResult = await query('select username from users where id = $1', [targetUserId]);
  const targetUsername = targetResult.rows[0]?.username || 'someone';
  const message = role === 'admin'
    ? `@${actorUsername} made @${targetUsername} an admin`
    : `@${actorUsername} removed @${targetUsername} as admin`;
  const systemMessage = await createSystemMessage(conversationId, userId, message);
  const currentMembers = await listConversationMembers(conversationId);
  return { systemMessage, currentMembers };
};

export const getConversationIdsForUser = async (userId: string, client: import('pg').PoolClient | null = null) => {
  return listConversationIdsForUser(userId, client);
};
