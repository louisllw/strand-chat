import { query } from '../db.js';

export type CreateMessageRow = {
  is_member: boolean;
  reply_ok: boolean;
  id: string | null;
  content: string | null;
  sender_id: string | null;
  conversation_id: string | null;
  created_at: string | null;
  type: string | null;
  attachment_url: string | null;
  attachment_meta: {
    width?: number;
    height?: number;
    thumbnailUrl?: string;
    thumbnailWidth?: number;
    thumbnailHeight?: number;
  } | null;
  sender_username: string | null;
  reply_id: string | null;
  reply_content: string | null;
  reply_sender_id: string | null;
  unhidden_user_ids: string[];
};

export const createSystemMessage = async (conversationId: string, senderId: string, content: string) => {
  const insertResult = await query(
    `insert into messages (conversation_id, sender_id, content, type)
     values ($1, $2, $3, 'system')
     returning id`,
    [conversationId, senderId, content]
  );
  await query(
    `update conversation_members
     set unread_count = unread_count + 1
     where conversation_id = $1 and user_id <> $2 and left_at is null`,
    [conversationId, senderId]
  );
  await query('update conversations set updated_at = now() where id = $1', [conversationId]);
  const messageResult = await query(
    `select
       m.id,
       m.content,
       m.sender_id,
       m.conversation_id,
       m.created_at,
       m.type
     from messages m
     where m.id = $1`,
    [insertResult.rows[0].id]
  );
  return messageResult.rows[0] || null;
};

export const createMessageWithMembership = async ({
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
  attachmentMeta?: { width?: number; height?: number } | null;
  replyToId?: string | null;
}): Promise<CreateMessageRow | null> => {
  // CTE pipeline: verify membership + reply, insert, update unread counts, unhide, return hydrated row.
  const createMessageSql = `with
       membership as (
         select 1 as ok
         from conversation_members
         where conversation_id = $1 and user_id = $2 and hidden_at is null and left_at is null
       ),
       reply_check as (
         select 1 as ok
         from messages
         where id = $7 and conversation_id = $1
       ),
       inserted as (
         insert into messages (conversation_id, sender_id, content, type, attachment_url, attachment_meta, reply_to_id)
         select $1, $2, $3, $4, $5, $6, $7
         where exists (select 1 from membership)
           and ($7::uuid is null or exists (select 1 from reply_check))
         returning *
       ),
       unread as (
         update conversation_members
         set unread_count = unread_count + 1
         where conversation_id = $1 and user_id <> $2 and left_at is null
           and exists (select 1 from inserted)
         returning 1
       ),
       convo as (
         update conversations
         set updated_at = now()
         where id = $1 and exists (select 1 from inserted)
       ),
       unhidden as (
         update conversation_members
         set hidden_at = null
         where conversation_id = $1 and hidden_at is not null and left_at is null
           and exists (select 1 from inserted)
         returning user_id
       ),
       base as (
         select
           exists(select 1 from membership) as is_member,
           ($7::uuid is null or exists(select 1 from reply_check)) as reply_ok
       )
     select
       base.is_member,
       base.reply_ok,
       m.id,
       m.content,
       m.sender_id,
       m.conversation_id,
       m.created_at,
       m.type,
       m.attachment_url,
       m.attachment_meta,
       u.username as sender_username,
       rm.id as reply_id,
       rm.content as reply_content,
       rm.sender_id as reply_sender_id,
       coalesce(
         json_agg(unhidden.user_id) filter (where unhidden.user_id is not null),
         '[]'::json
       ) as unhidden_user_ids
     from base
     left join inserted m on true
     left join users u on u.id = m.sender_id
     left join messages rm on rm.id = m.reply_to_id
     left join unhidden on true
     group by
       base.is_member,
       base.reply_ok,
       m.id,
       m.content,
       m.sender_id,
       m.conversation_id,
       m.created_at,
       m.type,
       m.attachment_url,
       m.attachment_meta,
       m.attachment_meta,
       u.username,
       rm.id,
       rm.content,
       rm.sender_id`;
  const normalizedReplyToId = replyToId || null;
  const params: [string, string, string, string, string | null, unknown | null, string | null] = [
    conversationId,
    userId,
    content,
    type,
    attachmentUrl || null,
    attachmentMeta || null,
    normalizedReplyToId,
  ];
  const result = await query(
    createMessageSql,
    params
  );
  const row = (result.rows[0] as CreateMessageRow | undefined) ?? null;
  if (!row) return null;
  const unhidden = Array.isArray(row.unhidden_user_ids) ? row.unhidden_user_ids : [];
  return {
    ...row,
    unhidden_user_ids: unhidden.filter((id): id is string => typeof id === 'string'),
  };
};

export const getMessageCursor = async ({
  conversationId,
  messageId,
}: {
  conversationId: string;
  messageId: string;
}) => {
  const result = await query(
    `select id, created_at
     from messages
     where id = $1 and conversation_id = $2`,
    [messageId, conversationId]
  );
  return result.rows[0] || null;
};

export const getMessageAttachment = async (messageId: string) => {
  const result = await query(
    `select id, conversation_id, type, attachment_url, attachment_meta
     from messages
     where id = $1`,
    [messageId]
  );
  const row = result.rows[0] || null;
  if (!row) return null;
  return {
    id: row.id as string,
    conversationId: row.conversation_id as string,
    type: row.type as string,
    attachmentUrl: row.attachment_url as string | null,
    attachmentMeta: row.attachment_meta as { thumbnailUrl?: string } | null,
  };
};

export const getConversationMessages = async ({
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
  const result = await query(
    `select
       m.id,
       m.content,
       m.sender_id,
       m.conversation_id,
       m.created_at,
       m.type,
       su.username as sender_username,
       m.attachment_url,
       m.attachment_meta,
       rm.id as reply_id,
       rm.content as reply_content,
       rm.sender_id as reply_sender_id,
       rx.reactions as reactions
     from (
       select *
       from messages
       where conversation_id = $1
         and ($4::timestamptz is null or created_at > $4)
         and ($5::timestamptz is null or created_at >= $5)
         and ($6::timestamptz is null or created_at <= $6)
         and (
           $7::timestamptz is null
           or created_at < $7
           or (created_at = $7 and id < $8)
         )
       order by created_at desc, id desc
       limit $3
     ) m
     left join users su on su.id = m.sender_id
     left join messages rm on rm.id = m.reply_to_id
     left join lateral (
       select json_agg(
         json_build_object(
           'emoji', emoji,
           'count', count,
           'reactedByMe', reacted_by_me
         )
       ) as reactions
       from (
         select emoji, count(*)::int as count, bool_or(user_id = $2) as reacted_by_me
         from message_reactions
         where message_id = m.id
         group by emoji
       ) reactions_summary
     ) rx on true
     order by m.created_at asc, m.id asc`,
    [conversationId, userId, limit, clearedAt, joinedAt, leftAt, beforeCreatedAt, beforeId]
  );
  return result.rows;
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
  const result = await query(
    `with
       membership as (
         select m.conversation_id
         from messages m
         join conversation_members cm on cm.conversation_id = m.conversation_id
         where m.id = $1 and cm.user_id = $2 and cm.hidden_at is null and cm.left_at is null
       ),
       deleted as (
         delete from message_reactions
         where message_id = $1 and user_id = $2 and emoji = $3
           and exists (select 1 from membership)
         returning message_id, user_id, emoji
       ),
       inserted as (
         insert into message_reactions (message_id, user_id, emoji)
         select $1, $2, $3
         where exists (select 1 from membership)
           and not exists (select 1 from deleted)
         returning message_id, user_id, emoji
       ),
       base as (
         select mr.message_id, mr.user_id, mr.emoji
         from message_reactions mr
         where mr.message_id = $1
           and exists (select 1 from membership)
           and not exists (
             select 1
             from deleted d
             where d.message_id = mr.message_id and d.user_id = mr.user_id and d.emoji = mr.emoji
           )
         union all
         select i.message_id, i.user_id, i.emoji
         from inserted i
         where not exists (
           select 1
           from message_reactions mr
           where mr.message_id = i.message_id and mr.user_id = i.user_id and mr.emoji = i.emoji
         )
       ),
       reactions as (
         select
           b.emoji,
           count(*)::int as count,
           bool_or(b.user_id = $2) as reacted_by_me,
           json_agg(u.username order by u.username) as usernames
         from base b
         join users u on u.id = b.user_id
         group by b.emoji
       )
     select
       (select conversation_id from membership) as conversation_id,
       coalesce(json_agg(reactions), '[]'::json) as reactions
     from reactions`,
    [messageId, userId, emoji]
  );
  return result.rows[0] || null;
};
