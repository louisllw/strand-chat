import {
  createMessageWithMembership,
  createSystemMessage as createSystemMessageRow,
  getConversationMessages,
  toggleReaction as toggleReactionModel,
} from '../models/messageModel.js';
import type { CreateMessageRow } from '../models/messageModel.js';
import { sanitizeText } from '../utils/sanitize.js';

type MessageRow = {
  id: string;
  content: string;
  sender_id: string;
  sender_username?: string | null;
  conversation_id: string;
  created_at: string;
  type: string;
  attachment_url?: string | null;
  attachment_meta?: {
    width?: number;
    height?: number;
    thumbnailUrl?: string;
    thumbnailWidth?: number;
    thumbnailHeight?: number;
  } | null;
  reply_id?: string | null;
  reply_content?: string | null;
  reply_sender_id?: string | null;
  reactions?: unknown;
  is_member?: boolean;
  reply_ok?: boolean;
  unhidden_user_ids?: string[];
};

const isInsertedMessageRow = (row: CreateMessageRow | null): row is CreateMessageRow & {
  id: string;
  content: string;
  sender_id: string;
  conversation_id: string;
  created_at: string;
  type: string;
} => Boolean(
  row
  && row.id
  && row.content
  && row.sender_id
  && row.conversation_id
  && row.created_at
  && row.type
);

export const mapMessageRow = (row: MessageRow) => ({
  id: row.id,
  content: sanitizeText(row.content),
  senderId: row.sender_id,
  senderUsername: row.sender_username || null,
  conversationId: row.conversation_id,
  timestamp: row.created_at,
  read: false,
  type: row.type,
  attachmentUrl: row.attachment_url,
  attachmentMeta: row.attachment_meta ?? undefined,
  replyTo: row.reply_id
    ? {
        id: row.reply_id,
        content: sanitizeText(row.reply_content),
        senderId: row.reply_sender_id,
      }
    : undefined,
  reactions: row.reactions || [],
});

export const mapInsertedMessageRow = (row: MessageRow) => ({
  id: row.id,
  content: sanitizeText(row.content),
  senderId: row.sender_id,
  senderUsername: row.sender_username || null,
  conversationId: row.conversation_id,
  timestamp: row.created_at,
  read: false,
  type: row.type,
  attachmentUrl: row.attachment_url,
  attachmentMeta: row.attachment_meta ?? undefined,
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
  attachmentMeta,
  replyToId,
}: {
  conversationId: string;
  userId: string;
  content: string;
  type: string;
  attachmentUrl?: string | null;
  attachmentMeta?: {
    width?: number;
    height?: number;
    thumbnailUrl?: string;
    thumbnailWidth?: number;
    thumbnailHeight?: number;
  } | null;
  replyToId?: string | null;
}): Promise<{
  isMember: boolean;
  replyOk: boolean;
  message: ReturnType<typeof mapInsertedMessageRow> | null;
  unhiddenUserIds: string[];
}> => {
  const row = await createMessageWithMembership({
    conversationId,
    userId,
    content,
    type,
    attachmentUrl,
    attachmentMeta,
    replyToId,
  });
  return {
    isMember: row?.is_member ?? false,
    replyOk: row?.reply_ok ?? true,
    message: isInsertedMessageRow(row)
      ? mapInsertedMessageRow({
          ...row,
          id: row.id,
          content: row.content,
          sender_id: row.sender_id,
          conversation_id: row.conversation_id,
          created_at: row.created_at,
          type: row.type,
        } as MessageRow)
      : null,
    unhiddenUserIds: row?.unhidden_user_ids || [],
  };
};

export const createSystemMessage = async (conversationId: string, senderId: string, content: string) => {
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
  joinedAt,
  leftAt,
  beforeCreatedAt,
  beforeId,
}: {
  conversationId: string;
  userId: string;
  limit: number;
  clearedAt?: string | null;
  joinedAt?: string | null;
  leftAt?: string | null;
  beforeCreatedAt?: string | null;
  beforeId?: string | null;
}) => {
  const rows = await getConversationMessages({
    conversationId,
    userId,
    limit,
    clearedAt,
    joinedAt,
    leftAt,
    beforeCreatedAt,
    beforeId,
  });
  return rows.map(mapMessageRow);
};

export const toggleReaction = async ({
  messageId,
  userId,
  emoji,
}: {
  messageId: string;
  userId: string;
  emoji: string;
}) => {
  const row = await toggleReactionModel({ messageId, userId, emoji });
  return row;
};
