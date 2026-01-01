import {
  createMessageWithMembership,
  createSystemMessage as createSystemMessageRow,
  getConversationMessages,
  toggleReaction as toggleReactionModel,
} from '../models/messageModel.js';
import { sanitizeText } from '../utils/sanitize.js';

export const mapMessageRow = (row) => ({
  id: row.id,
  content: sanitizeText(row.content),
  senderId: row.sender_id,
  senderUsername: row.sender_username || null,
  conversationId: row.conversation_id,
  timestamp: row.created_at,
  read: false,
  type: row.type,
  attachmentUrl: row.attachment_url,
  replyTo: row.reply_id
    ? {
        id: row.reply_id,
        content: sanitizeText(row.reply_content),
        senderId: row.reply_sender_id,
      }
    : undefined,
  reactions: row.reactions || [],
});

export const mapInsertedMessageRow = (row) => ({
  id: row.id,
  content: sanitizeText(row.content),
  senderId: row.sender_id,
  senderUsername: row.sender_username || null,
  conversationId: row.conversation_id,
  timestamp: row.created_at,
  read: false,
  type: row.type,
  attachmentUrl: row.attachment_url,
  replyTo: row.reply_id
    ? {
        id: row.reply_id,
        content: sanitizeText(row.reply_content),
        senderId: row.reply_sender_id,
      }
    : undefined,
  reactions: [],
});

export const createMessage = async ({
  conversationId,
  userId,
  content,
  type,
  attachmentUrl,
  replyToId,
}) => {
  const row = await createMessageWithMembership({
    conversationId,
    userId,
    content,
    type,
    attachmentUrl,
    replyToId,
  });
  return {
    isMember: row?.is_member ?? false,
    replyOk: row?.reply_ok ?? true,
    message: row?.id ? mapInsertedMessageRow(row) : null,
    unhiddenUserIds: row?.unhidden_user_ids || [],
  };
};

export const createSystemMessage = async (conversationId, senderId, content) => {
  const row = await createSystemMessageRow(conversationId, senderId, content);
  if (!row) return null;
  return {
    id: row.id,
    content: sanitizeText(row.content),
    senderId: row.sender_id,
    conversationId: row.conversation_id,
    timestamp: row.created_at,
    read: false,
    type: row.type,
    attachmentUrl: null,
    reactions: [],
  };
};

export const listMessages = async ({
  conversationId,
  userId,
  limit,
  clearedAt,
  beforeCreatedAt,
  beforeId,
}) => {
  const rows = await getConversationMessages({
    conversationId,
    userId,
    limit,
    clearedAt,
    beforeCreatedAt,
    beforeId,
  });
  return rows.map(mapMessageRow);
};

export const toggleReaction = async ({ messageId, userId, emoji }) => {
  const row = await toggleReactionModel({ messageId, userId, emoji });
  return row;
};
