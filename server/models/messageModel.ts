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
  replyToId,
}: {
  conversationId: string;
  userId: string;
  content: string;
  type: string;
  attachmentUrl?: string | null;
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
         where id = $6 and conversation_id = $1
       ),
       inserted as (
         insert into messages (conversation_id, sender_id, content, type, attachment_url, reply_to_id)
         select $1, $2, $3, $4, $5, $6
         where exists (select 1 from membership)
           and ($6::uuid is null or exists (select 1 from reply_check))
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
           ($6::uuid is null or exists(select 1 from reply_check)) as reply_ok
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
       u.username,
       rm.id,
       rm.content,
       rm.sender_id`;
  const normalizedReplyToId = replyToId || null;
  const params: [string, string, string, string, string | null, string | null] = [
    conversationId,
    userId,
    content,
    type,
    attachmentUrl || null,
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
         returning 1
       ),
       inserted as (
         insert into message_reactions (message_id, user_id, emoji)
         select $1, $2, $3
         where exists (select 1 from membership)
           and not exists (select 1 from deleted)
         returning 1
       ),
       reactions as (
         select
           mr.emoji,
           count(*)::int as count,
           bool_or(mr.user_id = $2) as reacted_by_me,
           json_agg(u.username order by u.username) as usernames
         from message_reactions mr
         join users u on u.id = mr.user_id
         where mr.message_id = $1
           and exists (select 1 from membership)
         group by mr.emoji
       ),
       convo as (
         select conversation_id from membership
       )
     select
       (select conversation_id from convo) as conversation_id,
       coalesce(
         (select json_agg(row_to_json(r)) from reactions r),
         '[]'::json
       ) as reactions`,
    [messageId, userId, emoji]
  );
  return result.rows[0] || null;
};
