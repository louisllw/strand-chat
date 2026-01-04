import type { PoolClient, QueryResult } from 'pg';
import { query } from '../db.js';

const runQuery = (
  client: PoolClient | null,
  text: string,
  params?: unknown[]
): Promise<QueryResult> => (client ? client.query(text, params) : query(text, params));

const baseConversationsSelect = `
  select
    c.id,
    c.name,
    c.type,
    c.created_at,
    c.updated_at,
    ou.other_user as other_user,
    pc.participant_count as participant_count,
    lm.last_message as last_message,
    cm.unread_count as unread_count,
    cm.left_at as left_at,
    coalesce(lm.last_message_created_at, c.updated_at) as sort_ts
  from conversations c
  join conversation_members cm on cm.conversation_id = c.id
  left join lateral (
    select json_build_object(
      'id', u.id,
      'username', u.username,
      'email', u.email,
      'avatar', u.avatar_url,
      'status', u.status,
      'lastSeen', coalesce(u.last_seen, u.updated_at)
    ) as other_user
    from conversation_members cm2
    join users u on u.id = cm2.user_id
    where cm2.conversation_id = c.id
      and c.type = 'direct'
      and u.id <> $1
    order by u.username
    limit 1
  ) ou on true
  left join lateral (
    select count(*)::int as participant_count
    from conversation_members cm3
    where cm3.conversation_id = c.id
      and cm3.hidden_at is null
      and cm3.left_at is null
  ) pc on true
  left join lateral (
    select json_build_object(
      'id', m.id,
      'content', m.content,
      'senderId', m.sender_id,
      'conversationId', m.conversation_id,
      'timestamp', m.created_at,
      'read', false,
      'type', m.type,
      'attachmentUrl', m.attachment_url
    ) as last_message,
    m.created_at as last_message_created_at
    from messages m
    where m.conversation_id = c.id
      and (cm.cleared_at is null or m.created_at > cm.cleared_at)
      and (cm.joined_at is null or m.created_at >= cm.joined_at)
      and (cm.left_at is null or m.created_at <= cm.left_at)
    order by m.created_at desc
    limit 1
  ) lm on true`;

export const listConversationsForUser = async (userId: string) => {
  const result = await query(
    `${baseConversationsSelect}
     where cm.user_id = $1 and cm.hidden_at is null
     order by coalesce(lm.last_message_created_at, c.updated_at) desc`,
    [userId]
  );
  return result.rows;
};

export const listConversationsForUserPaginated = async ({
  userId,
  limit,
  cursor,
}: {
  userId: string;
  limit: number;
  cursor?: { sortTs: string; id: string } | null;
}) => {
  const result = await query(
    `${baseConversationsSelect}
     where cm.user_id = $1
       and cm.hidden_at is null
       and (
         $2::timestamptz is null
         or coalesce(lm.last_message_created_at, c.updated_at) < $2::timestamptz
         or (coalesce(lm.last_message_created_at, c.updated_at) = $2::timestamptz and c.id < $3)
       )
     order by sort_ts desc, c.id desc
     limit $4`,
    [userId, cursor?.sortTs ?? null, cursor?.id ?? null, limit]
  );
  return result.rows;
};

export const getConversationMembership = async ({
  conversationId,
  userId,
  requireVisible,
}: {
  conversationId: string;
  userId: string;
  requireVisible: boolean;
}) => {
  const result = await query(
    `select 1 as ok
     from conversation_members
     where conversation_id = $1 and user_id = $2${requireVisible ? ' and hidden_at is null and left_at is null' : ''}`,
    [conversationId, userId]
  );
  return (result.rowCount ?? 0) > 0;
};

export const getConversationMembershipMeta = async ({
  conversationId,
  userId,
}: {
  conversationId: string;
  userId: string;
}) => {
  const result = await query(
    `select cleared_at, joined_at, left_at
     from conversation_members
     where conversation_id = $1 and user_id = $2 and hidden_at is null`,
    [conversationId, userId]
  );
  return result.rows[0] || null;
};

export const getConversationTypeForMember = async ({
  conversationId,
  userId,
}: {
  conversationId: string;
  userId: string;
}) => {
  const result = await query(
    `select c.type
     from conversations c
     join conversation_members cm on cm.conversation_id = c.id
     where c.id = $1 and cm.user_id = $2 and cm.hidden_at is null and cm.left_at is null`,
    [conversationId, userId]
  );
  return result.rows[0]?.type || null;
};

export const getConversationMemberRole = async ({
  conversationId,
  userId,
}: {
  conversationId: string;
  userId: string;
}) => {
  const result = await query(
    `select role
     from conversation_members
     where conversation_id = $1 and user_id = $2 and hidden_at is null and left_at is null`,
    [conversationId, userId]
  );
  return result.rows[0]?.role || null;
};

export const hasConversationAdmin = async ({
  conversationId,
}: {
  conversationId: string;
}) => {
  const result = await query(
    `select 1
     from conversation_members
     where conversation_id = $1 and role = 'admin' and left_at is null
     limit 1`,
    [conversationId]
  );
  return (result.rowCount ?? 0) > 0;
};

export const listConversationIdsForUser = async (
  userId: string,
  client: PoolClient | null = null
): Promise<string[]> => {
  const result = await runQuery(
    client,
    `select conversation_id
     from conversation_members
     where user_id = $1 and hidden_at is null`,
    [userId]
  );
  return result.rows.map((row) => row.conversation_id as string);
};

export const revealConversationMembership = async ({
  conversationId,
  userId,
}: {
  conversationId: string;
  userId: string;
}) => {
  await query(
    'update conversation_members set hidden_at = null where conversation_id = $1 and user_id = $2',
    [conversationId, userId]
  );
};

export const markConversationRead = async ({
  conversationId,
  userId,
}: {
  conversationId: string;
  userId: string;
}) => {
  await query(
    `update conversation_members
     set unread_count = 0
     where conversation_id = $1 and user_id = $2`,
    [conversationId, userId]
  );
};

export const hideConversationForUser = async ({
  conversationId,
  userId,
}: {
  conversationId: string;
  userId: string;
}) => {
  await query(
    'update conversation_members set hidden_at = now(), cleared_at = now(), unread_count = 0 where conversation_id = $1 and user_id = $2',
    [conversationId, userId]
  );
};

export const markConversationLeft = async ({
  conversationId,
  userId,
}: {
  conversationId: string;
  userId: string;
}) => {
  await query(
    'update conversation_members set left_at = now(), unread_count = 0 where conversation_id = $1 and user_id = $2',
    [conversationId, userId]
  );
};

export const removeConversationMember = async ({
  conversationId,
  userId,
}: {
  conversationId: string;
  userId: string;
}) => {
  await query(
    'delete from conversation_members where conversation_id = $1 and user_id = $2',
    [conversationId, userId]
  );
};

export const deleteConversation = async ({
  conversationId,
}: {
  conversationId: string;
}) => {
  await query('delete from conversations where id = $1', [conversationId]);
};

export const listConversationMembers = async (conversationId: string) => {
  const result = await query(
    `select user_id
     from conversation_members
     where conversation_id = $1 and hidden_at is null and left_at is null`,
    [conversationId]
  );
  return result.rows.map((row) => row.user_id);
};

export const listConversationMembersDetailed = async (conversationId: string) => {
  const result = await query(
    `select
       u.id,
       u.username,
       u.avatar_url as avatar,
       u.status,
       u.last_seen as last_seen,
       cm.role
     from conversation_members cm
     join users u on u.id = cm.user_id
     where cm.conversation_id = $1 and cm.hidden_at is null and cm.left_at is null
     order by (cm.role = 'admin') desc, u.username`,
    [conversationId]
  );
  return result.rows;
};

export const countConversationAdmins = async (conversationId: string) => {
  const result = await query(
    `select count(*)::int as count
     from conversation_members
     where conversation_id = $1 and role = 'admin' and left_at is null`,
    [conversationId]
  );
  return result.rows[0]?.count ?? 0;
};

export const getConversationName = async (conversationId: string) => {
  const result = await query('select name from conversations where id = $1', [conversationId]);
  return result.rows[0]?.name ?? null;
};

export const findDirectConversation = async ({
  userId,
  otherUserId,
}: {
  userId: string;
  otherUserId: string;
}) => {
  const result = await query(
    `select c.id
     from conversations c
     join conversation_members cm on cm.conversation_id = c.id
     where c.type = 'direct'
     group by c.id
     having sum(case when cm.user_id = $1 then 1 else 0 end) > 0
        and sum(case when cm.user_id = $2 then 1 else 0 end) > 0
        and count(*) = 2
     limit 1`,
    [userId, otherUserId]
  );
  return result.rows[0]?.id || null;
};

export const createConversation = async (
  {
    name,
    type,
    memberIds,
    adminId,
    directKey,
  }: {
    name?: string | null;
    type: string;
    memberIds: string[];
    adminId?: string | null;
    directKey?: string | null;
  },
  client: PoolClient | null
) => {
  const convoResult = directKey
    ? await runQuery(
      client,
      `insert into conversations (name, type, direct_key)
       values ($1, $2, $3)
       returning id, name, type, created_at, updated_at`,
      [name || null, type, directKey]
    )
    : await runQuery(
      client,
      `insert into conversations (name, type)
       values ($1, $2)
       returning id, name, type, created_at, updated_at`,
      [name || null, type]
    );
  const conversation = convoResult.rows[0];
  await runQuery(
    client,
    `insert into conversation_members (conversation_id, user_id)
     select $1, unnest($2::uuid[])
     on conflict do nothing`,
    [conversation.id, memberIds]
  );
  await runQuery(
    client,
    'update conversation_members set hidden_at = null where conversation_id = $1',
    [conversation.id]
  );
  if (adminId) {
    await runQuery(
      client,
      `update conversation_members
       set role = 'admin'
       where conversation_id = $1 and user_id = $2`,
      [conversation.id, adminId]
    );
  }
  return conversation;
};

export const createDirectConversation = async (
  {
    userId,
    otherUserId,
    directKey,
  }: {
    userId: string;
    otherUserId: string;
    directKey: string;
  },
  client: PoolClient | null
) => {
  const convoResult = await runQuery(
    client,
    `insert into conversations (type, direct_key)
     values ('direct', $1)
     returning id`,
    [directKey]
  );
  const conversationId = convoResult.rows[0].id;
  await runQuery(
    client,
    `insert into conversation_members (conversation_id, user_id)
     values ($1, $2), ($1, $3)
     on conflict do nothing`,
    [conversationId, userId, otherUserId]
  );
  return conversationId;
};

export const createGroupConversation = async (
  {
    name,
    memberIds,
    adminId,
  }: {
    name?: string | null;
    memberIds: string[];
    adminId?: string | null;
  },
  client: PoolClient | null
) => {
  const convoResult = await runQuery(
    client,
    `insert into conversations (name, type)
     values ($1, 'group')
     returning id`,
    [name || null]
  );
  const conversationId = convoResult.rows[0].id;
  await runQuery(
    client,
    `insert into conversation_members (conversation_id, user_id)
     select $1, unnest($2::uuid[])
     on conflict do nothing`,
    [conversationId, memberIds]
  );
  if (adminId) {
    await runQuery(
      client,
      `update conversation_members
       set role = 'admin'
       where conversation_id = $1 and user_id = $2`,
      [conversationId, adminId]
    );
  }
  return conversationId;
};

export const listExistingConversationMembers = async ({
  conversationId,
  userIds,
}: {
  conversationId: string;
  userIds: string[];
}) => {
  const result = await query(
    `select user_id
     from conversation_members
     where conversation_id = $1
       and user_id = any($2::uuid[])
       and left_at is null`,
    [conversationId, userIds]
  );
  return result.rows.map((row) => row.user_id);
};

export const addConversationMembers = async (
  {
    conversationId,
    userIds,
  }: {
    conversationId: string;
    userIds: string[];
  },
  client: PoolClient | null
) => {
  await runQuery(
    client,
    `insert into conversation_members (conversation_id, user_id)
     select $1, unnest($2::uuid[])
     on conflict do nothing`,
    [conversationId, userIds]
  );
  await runQuery(
    client,
    `update conversation_members
     set left_at = null,
         hidden_at = null,
         joined_at = now(),
         cleared_at = now(),
         unread_count = 0
     where conversation_id = $1 and user_id = any($2::uuid[])`,
    [conversationId, userIds]
  );
};

export const removeConversationMembers = async ({
  conversationId,
  userIds,
}: {
  conversationId: string;
  userIds: string[];
}) => {
  if (userIds.length === 0) return;
  await query(
    'delete from conversation_members where conversation_id = $1 and user_id = any($2::uuid[])',
    [conversationId, userIds]
  );
};

export const setConversationMemberRole = async (
  {
    conversationId,
    userId,
    role,
  }: {
    conversationId: string;
    userId: string;
    role: 'admin' | 'member';
  },
  client: PoolClient | null
) => {
  await runQuery(
    client,
    `update conversation_members
     set role = $3
     where conversation_id = $1 and user_id = $2`,
    [conversationId, userId, role]
  );
};
