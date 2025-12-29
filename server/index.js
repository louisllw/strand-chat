import express from 'express';
import http from 'http';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import './env.js';
import bcrypt from 'bcryptjs';
import { Server as SocketIOServer } from 'socket.io';
import { query, getClient } from './db.js';
import { signToken, verifyToken, authCookieOptions, getAuthCookieName } from './auth.js';
import rateLimit from 'express-rate-limit';

const app = express();
const server = http.createServer(app);
const clientOrigins = (process.env.CLIENT_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);
const io = new SocketIOServer(server, {
  cors: {
    origin: clientOrigins,
    credentials: true,
  },
});

const COOKIE_NAME = getAuthCookieName();

const normalizeUsername = (value) => value.trim().replace(/^@+/, '').toLowerCase();
const isValidUsername = (value) => /^[a-z0-9._]{3,30}$/.test(value);
const normalizeUsernameSql = "regexp_replace(lower(trim(username)), '^@+', '')";
const allowedReactions = new Set(['❤️', '👍', '😂', '🔥', '😮', '😢']);
const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts, please try again later.' },
});

const createSystemMessage = async (conversationId, senderId, content) => {
  const insertResult = await query(
    `insert into messages (conversation_id, sender_id, content, type)
     values ($1, $2, $3, 'system')
     returning id`,
    [conversationId, senderId, content]
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
  const row = messageResult.rows[0];
  return {
    id: row.id,
    content: row.content,
    senderId: row.sender_id,
    conversationId: row.conversation_id,
    timestamp: row.created_at,
    read: false,
    type: row.type,
    attachmentUrl: null,
    reactions: [],
  };
};

const getMessageReactions = async (messageId, userId) => {
  const result = await query(
    `select emoji,
            count(*)::int as count,
            bool_or(user_id = $2) as reacted_by_me,
            json_agg(u.username order by u.username) as usernames
     from message_reactions mr
     join users u on u.id = mr.user_id
     where mr.message_id = $1
     group by emoji`,
    [messageId, userId]
  );
  return result.rows.map((row) => ({
    emoji: row.emoji,
    count: row.count,
    reactedByMe: row.reacted_by_me,
    usernames: row.usernames || [],
  }));
};

app.use(
  cors({
    origin: clientOrigins,
    credentials: true,
  })
);
app.use(express.json({ limit: '200kb' }));
app.use(cookieParser());

const getUserFromRequest = (req) => {
  const token = req.cookies[COOKIE_NAME];
  if (!token) return null;
  try {
    return verifyToken(token);
  } catch {
    return null;
  }
};

const requireAuth = (req, res, next) => {
  const user = getUserFromRequest(req);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  req.user = user;
  next();
};

const mapUser = (row) => ({
  id: row.id,
  username: row.username,
  email: row.email,
  avatar: row.avatar_url || null,
  status: row.status || 'offline',
  theme: row.theme || 'light',
  lastSeen: row.last_seen || row.updated_at || null,
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.post('/api/auth/register', authRateLimiter, async (req, res) => {
  const { username, email, password } = req.body || {};
  if (!username || !email || !password) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  const normalizedUsername = normalizeUsername(username);
  if (!normalizedUsername || !isValidUsername(normalizedUsername)) {
    return res.status(400).json({ error: 'Username must be 3-30 characters, one word (letters, numbers, . or _).' });
  }

  const existing = await query('select id from users where email = $1', [email.toLowerCase()]);
  if (existing.rowCount > 0) {
    return res.status(409).json({ error: 'Email already registered' });
  }
  const usernameExisting = await query(
    `select id from users where ${normalizeUsernameSql} = $1`,
    [normalizedUsername]
  );
  if (usernameExisting.rowCount > 0) {
    return res.status(409).json({ error: 'Username already taken' });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const result = await query(
    `insert into users (username, email, password_hash, status, last_seen)
     values ($1, $2, $3, 'offline', now())
     returning id, username, email, avatar_url, status, theme, last_seen`,
    [normalizedUsername, email.toLowerCase(), passwordHash]
  );

  const user = mapUser(result.rows[0]);
  const token = signToken({ userId: user.id });
  res.cookie(COOKIE_NAME, token, authCookieOptions());
  res.json({ user });
});

app.post('/api/auth/login', authRateLimiter, async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  const result = await query(
    'select id, username, email, avatar_url, status, theme, password_hash from users where email = $1',
    [email.toLowerCase()]
  );
  if (result.rowCount === 0) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const row = result.rows[0];
  const match = await bcrypt.compare(password, row.password_hash);
  if (!match) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  await query('update users set status = $1, last_seen = now(), updated_at = now() where id = $2', ['offline', row.id]);
  const user = mapUser(row);
  const token = signToken({ userId: user.id });
  res.cookie(COOKIE_NAME, token, authCookieOptions());
  res.json({ user });
});

app.post('/api/auth/logout', requireAuth, async (req, res) => {
  await query(
    'update users set status = $1, last_seen = now(), updated_at = now() where id = $2',
    ['offline', req.user.userId]
  );
  res.clearCookie(COOKIE_NAME, { path: '/' });
  res.json({ ok: true });
});

app.get('/api/auth/me', requireAuth, async (req, res) => {
  const result = await query(
    'select id, username, email, avatar_url, status, theme, last_seen, updated_at from users where id = $1',
    [req.user.userId]
  );
  if (result.rowCount === 0) {
    return res.status(404).json({ error: 'User not found' });
  }
  res.json({ user: mapUser(result.rows[0]) });
});

app.get('/api/users/username-availability', requireAuth, async (req, res) => {
  const username = typeof req.query.username === 'string' ? req.query.username : '';
  const normalizedUsername = normalizeUsername(username);

  if (!normalizedUsername || !isValidUsername(normalizedUsername)) {
    return res.json({
      valid: false,
      available: false,
      canChange: false,
      cooldownDaysRemaining: null,
      message: 'Username must be 3-30 characters, one word (letters, numbers, . or _).',
    });
  }

  const currentResult = await query(
    'select username, username_updated_at from users where id = $1',
    [req.user.userId]
  );
  if (currentResult.rowCount === 0) {
    return res.status(404).json({ error: 'User not found' });
  }
  const current = currentResult.rows[0];
  const normalizedCurrent = normalizeUsername(current.username);

  const lastUpdated = new Date(current.username_updated_at);
  const now = new Date();
  const cooldownMs = 7 * 24 * 60 * 60 * 1000;
  const remainingMs = Math.max(0, cooldownMs - (now.getTime() - lastUpdated.getTime()));
  const cooldownDaysRemaining = remainingMs > 0 ? Math.ceil(remainingMs / (24 * 60 * 60 * 1000)) : 0;

  if (normalizedUsername === normalizedCurrent) {
    return res.json({
      valid: true,
      available: true,
      canChange: true,
      cooldownDaysRemaining,
      current: true,
    });
  }

  const usernameExisting = await query(
    `select id from users where ${normalizeUsernameSql} = $1`,
    [normalizedUsername]
  );
  const available = usernameExisting.rowCount === 0;
  if (!available) {
    return res.json({
      valid: true,
      available: false,
      canChange: false,
      cooldownDaysRemaining: null,
      current: false,
    });
  }

  const canChange = remainingMs === 0;
  res.json({
    valid: true,
    available: true,
    canChange,
    cooldownDaysRemaining,
    current: false,
  });
});

app.patch('/api/users/me', requireAuth, async (req, res) => {
  const { username, email, avatar, status, theme } = req.body || {};
  const updates = [];
  const values = [];
  let idx = 1;

  if (username || email) {
    const currentResult = await query(
      'select username, email, username_updated_at from users where id = $1',
      [req.user.userId]
    );
    if (currentResult.rowCount === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    const current = currentResult.rows[0];

    if (email && email.toLowerCase() !== current.email) {
      const emailExisting = await query(
        'select id from users where email = $1 and id <> $2',
        [email.toLowerCase(), req.user.userId]
      );
      if (emailExisting.rowCount > 0) {
        return res.status(409).json({ error: 'Email already registered' });
      }
    }

    if (username) {
      const normalizedUsername = normalizeUsername(username);
      if (!normalizedUsername || !isValidUsername(normalizedUsername)) {
        return res.status(400).json({ error: 'Username must be 3-30 characters, one word (letters, numbers, . or _).' });
      }
      if (normalizedUsername !== current.username) {
        const usernameExisting = await query(
          `select id from users where ${normalizeUsernameSql} = $1 and id <> $2`,
          [normalizedUsername, req.user.userId]
        );
        if (usernameExisting.rowCount > 0) {
          return res.status(409).json({ error: 'Username already taken' });
        }

        const lastUpdated = new Date(current.username_updated_at);
        const now = new Date();
        const cooldownMs = 7 * 24 * 60 * 60 * 1000;
        if (now.getTime() - lastUpdated.getTime() < cooldownMs) {
          return res.status(429).json({ error: 'Username can only be changed every 7 days' });
        }
        updates.push(`username = $${idx++}`);
        values.push(normalizedUsername);
        updates.push(`username_updated_at = now()`);
      }
    }
  }

  if (email) {
    updates.push(`email = $${idx++}`);
    values.push(email.toLowerCase());
  }
  if (avatar !== undefined) {
    updates.push(`avatar_url = $${idx++}`);
    values.push(avatar);
  }
  if (status) {
    updates.push(`status = $${idx++}`);
    values.push(status);
  }
  if (theme) {
    updates.push(`theme = $${idx++}`);
    values.push(theme);
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'No updates provided' });
  }

  values.push(req.user.userId);
  const result = await query(
    `update users set ${updates.join(', ')}, updated_at = now()
     where id = $${idx}
     returning id, username, email, avatar_url, status, theme, last_seen`,
    values
  );

  res.json({ user: mapUser(result.rows[0]) });
});

app.get('/api/conversations', requireAuth, async (req, res) => {
  const userId = req.user.userId;
  const result = await query(
    `select
       c.id,
       c.name,
       c.type,
       c.created_at,
       c.updated_at,
       p.participants as participants,
       lm.last_message as last_message,
       (
         select count(*)
         from messages m
         left join message_reads mr
           on mr.message_id = m.id and mr.user_id = $1
         where m.conversation_id = c.id
           and m.sender_id <> $1
           and mr.message_id is null
           and (cm.cleared_at is null or m.created_at > cm.cleared_at)
       ) as unread_count
     from conversations c
     join conversation_members cm on cm.conversation_id = c.id
     left join lateral (
       select json_agg(
         json_build_object(
           'id', u.id,
           'username', u.username,
           'email', u.email,
           'avatar', u.avatar_url,
           'status', u.status,
           'lastSeen', coalesce(u.last_seen, u.updated_at)
         )
         order by (u.id = $1), u.username
       ) as participants
       from conversation_members cm2
       join users u on u.id = cm2.user_id
       where cm2.conversation_id = c.id
     ) p on true
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
       order by m.created_at desc
       limit 1
     ) lm on true
     where cm.user_id = $1 and cm.hidden_at is null
     order by coalesce(lm.last_message_created_at, c.updated_at) desc`,
    [userId]
  );

  const conversations = result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    type: row.type,
    participants: row.participants || [],
    lastMessage: row.last_message || null,
    unreadCount: Number(row.unread_count || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));

  res.json({ conversations });
});

app.get('/api/conversations/:id/messages', requireAuth, async (req, res) => {
  const userId = req.user.userId;
  const conversationId = req.params.id;
  const limit = Math.min(Number(req.query.limit || 200), 500);

  const membership = await query(
    `select cleared_at
     from conversation_members
     where conversation_id = $1 and user_id = $2 and hidden_at is null`,
    [conversationId, userId]
  );
  if (membership.rowCount === 0) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const clearedAt = membership.rows[0].cleared_at;

  const result = await query(
    `select
       m.id,
       m.content,
       m.sender_id,
       m.conversation_id,
       m.created_at,
       m.type,
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
       order by created_at desc
       limit $3
     ) m
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
     order by m.created_at asc`,
    [conversationId, userId, limit, clearedAt]
  );

  const messages = result.rows.map((row) => ({
    id: row.id,
    content: row.content,
    senderId: row.sender_id,
    conversationId: row.conversation_id,
    timestamp: row.created_at,
    read: false,
    type: row.type,
    attachmentUrl: row.attachment_url,
    replyTo: row.reply_id
      ? {
          id: row.reply_id,
          content: row.reply_content,
          senderId: row.reply_sender_id,
        }
      : undefined,
    reactions: row.reactions || [],
  }));

  res.json({ messages });
});

app.post('/api/conversations/:id/messages', requireAuth, async (req, res) => {
  const userId = req.user.userId;
  const conversationId = req.params.id;
  const { content, type = 'text', attachmentUrl, replyToId } = req.body || {};

  if (!content?.trim()) {
    return res.status(400).json({ error: 'Message content required' });
  }
  if (replyToId) {
    const replyCheck = await query(
      'select 1 from messages where id = $1 and conversation_id = $2',
      [replyToId, conversationId]
    );
    if (replyCheck.rowCount === 0) {
      return res.status(400).json({ error: 'Invalid reply target' });
    }
  }

  const membership = await query(
    'select 1 from conversation_members where conversation_id = $1 and user_id = $2 and hidden_at is null',
    [conversationId, userId]
  );
  if (membership.rowCount === 0) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const insertResult = await query(
    `insert into messages (conversation_id, sender_id, content, type, attachment_url, reply_to_id)
     values ($1, $2, $3, $4, $5, $6)
     returning id`,
    [conversationId, userId, content, type, attachmentUrl || null, replyToId || null]
  );
  await query('update conversations set updated_at = now() where id = $1', [conversationId]);

  const messageResult = await query(
    `select
       m.id,
       m.content,
       m.sender_id,
       m.conversation_id,
       m.created_at,
       m.type,
       m.attachment_url,
       rm.id as reply_id,
       rm.content as reply_content,
       rm.sender_id as reply_sender_id
     from messages m
     left join messages rm on rm.id = m.reply_to_id
     where m.id = $1`,
    [insertResult.rows[0].id]
  );
  await query(
    'update conversation_members set hidden_at = null where conversation_id = $1',
    [conversationId]
  );
  const memberRows = await query(
    'select user_id from conversation_members where conversation_id = $1',
    [conversationId]
  );
  memberRows.rows.forEach((member) => {
    io.to(`user:${member.user_id}`).emit('conversation:created', { conversationId });
  });
  const row = messageResult.rows[0];
  const message = {
    id: row.id,
    content: row.content,
    senderId: row.sender_id,
    conversationId: row.conversation_id,
    timestamp: row.created_at,
    read: false,
    type: row.type,
    attachmentUrl: row.attachment_url,
    replyTo: row.reply_id
      ? {
          id: row.reply_id,
          content: row.reply_content,
          senderId: row.reply_sender_id,
        }
      : undefined,
    reactions: [],
  };

  io.to(conversationId).emit('message:new', message);

  res.json({ message });
});

app.post('/api/conversations/:id/read', requireAuth, async (req, res) => {
  const userId = req.user.userId;
  const conversationId = req.params.id;

  const membership = await query(
    'select 1 from conversation_members where conversation_id = $1 and user_id = $2 and hidden_at is null',
    [conversationId, userId]
  );
  if (membership.rowCount === 0) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  await query(
    `insert into message_reads (message_id, user_id)
     select m.id, $2
     from messages m
     where m.conversation_id = $1
       and m.sender_id <> $2
     on conflict (message_id, user_id) do nothing`,
    [conversationId, userId]
  );

  res.json({ ok: true });
});

app.post('/api/conversations', requireAuth, async (req, res) => {
  const userId = req.user.userId;
  const { type = 'direct', name, participantIds } = req.body || {};

  if (!Array.isArray(participantIds) || participantIds.length === 0) {
    return res.status(400).json({ error: 'Participants required' });
  }

  const client = await getClient();
  try {
    await client.query('begin');
    const convoResult = await client.query(
      `insert into conversations (name, type)
       values ($1, $2)
       returning id, name, type, created_at, updated_at`,
      [name || null, type]
    );
    const conversation = convoResult.rows[0];
    const members = [userId, ...participantIds];
    for (const memberId of members) {
      await client.query(
        `insert into conversation_members (conversation_id, user_id)
         values ($1, $2)
         on conflict do nothing`,
        [conversation.id, memberId]
      );
    }
    await client.query(
      'update conversation_members set hidden_at = null where conversation_id = $1',
      [conversation.id]
    );
    await client.query('commit');
    members.forEach((memberId) => {
      io.to(`user:${memberId}`).emit('conversation:created', { conversationId: conversation.id });
    });
    res.json({ conversationId: conversation.id });
  } catch (error) {
    await client.query('rollback');
    res.status(500).json({ error: 'Failed to create conversation' });
  } finally {
    client.release();
  }
});

app.post('/api/conversations/direct', requireAuth, async (req, res) => {
  const userId = req.user.userId;
  const { username } = req.body || {};
  if (!username) {
    return res.status(400).json({ error: 'Username is required' });
  }

  const normalizedUsername = normalizeUsername(username);
  if (!normalizedUsername || !isValidUsername(normalizedUsername)) {
    return res.status(400).json({ error: 'Username must be 3-30 characters, one word (letters, numbers, . or _).' });
  }

  const userResult = await query(
    `select id from users where ${normalizeUsernameSql} = $1`,
    [normalizedUsername]
  );
  if (userResult.rowCount === 0) {
    return res.status(404).json({ error: 'User not found' });
  }
  const otherUserId = userResult.rows[0].id;
  if (otherUserId === userId) {
    return res.status(400).json({ error: 'Cannot start a conversation with yourself' });
  }

  const existing = await query(
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
  if (existing.rowCount > 0) {
    await query(
      'update conversation_members set hidden_at = null where conversation_id = $1 and user_id = $2',
      [existing.rows[0].id, userId]
    );
    return res.json({ conversationId: existing.rows[0].id });
  }

  const client = await getClient();
  try {
    await client.query('begin');
    const convoResult = await client.query(
      `insert into conversations (type)
       values ('direct')
       returning id`,
      []
    );
    const conversationId = convoResult.rows[0].id;
    await client.query(
      `insert into conversation_members (conversation_id, user_id)
       values ($1, $2), ($1, $3)
       on conflict do nothing`,
      [conversationId, userId, otherUserId]
    );
    await client.query('commit');
    [userId, otherUserId].forEach((memberId) => {
      io.to(`user:${memberId}`).emit('conversation:created', { conversationId });
    });
    res.json({ conversationId });
  } catch (error) {
    await client.query('rollback');
    res.status(500).json({ error: 'Failed to create conversation' });
  } finally {
    client.release();
  }
});

app.post('/api/conversations/group', requireAuth, async (req, res) => {
  const userId = req.user.userId;
  const { name, usernames } = req.body || {};

  if (!Array.isArray(usernames) || usernames.length === 0) {
    return res.status(400).json({ error: 'Usernames are required' });
  }

  const normalizedUsernames = Array.from(new Set(
    usernames
      .map((value) => normalizeUsername(String(value || '')))
      .filter((value) => value && isValidUsername(value))
  ));

  if (normalizedUsernames.length === 0) {
    return res.status(400).json({ error: 'No valid usernames provided' });
  }

  const userResult = await query(
    `select id, ${normalizeUsernameSql} as normalized
     from users
     where ${normalizeUsernameSql} = any($1::text[])`,
    [normalizedUsernames]
  );

  const participantIds = userResult.rows
    .map((row) => row.id)
    .filter((id) => id !== userId);

  if (participantIds.length === 0) {
    return res.status(404).json({ error: 'No matching users found' });
  }

  const client = await getClient();
  try {
    await client.query('begin');
    const convoResult = await client.query(
      `insert into conversations (name, type)
       values ($1, 'group')
       returning id`,
      [name || null]
    );
    const conversationId = convoResult.rows[0].id;
    const members = [userId, ...participantIds];
    for (const memberId of members) {
      await client.query(
        `insert into conversation_members (conversation_id, user_id)
         values ($1, $2)
         on conflict do nothing`,
        [conversationId, memberId]
      );
    }
    await client.query('commit');
    members.forEach((memberId) => {
      io.to(`user:${memberId}`).emit('conversation:created', { conversationId });
    });
    res.json({ conversationId });
  } catch (error) {
    await client.query('rollback');
    res.status(500).json({ error: 'Failed to create group' });
  } finally {
    client.release();
  }
});

app.delete('/api/conversations/:id', requireAuth, async (req, res) => {
  const userId = req.user.userId;
  const conversationId = req.params.id;

  const membership = await query(
    'select 1 from conversation_members where conversation_id = $1 and user_id = $2',
    [conversationId, userId]
  );
  if (membership.rowCount === 0) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  await query(
    'update conversation_members set hidden_at = now(), cleared_at = now() where conversation_id = $1 and user_id = $2',
    [conversationId, userId]
  );

  res.json({ ok: true });
});

app.post('/api/conversations/:id/leave', requireAuth, async (req, res) => {
  const userId = req.user.userId;
  const conversationId = req.params.id;

  const membership = await query(
    `select c.type
     from conversations c
     join conversation_members cm on cm.conversation_id = c.id
     where c.id = $1 and cm.user_id = $2 and cm.hidden_at is null`,
    [conversationId, userId]
  );
  if (membership.rowCount === 0) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  if (membership.rows[0].type !== 'group') {
    return res.status(400).json({ error: 'Only group chats can be left' });
  }

  await query(
    'delete from conversation_members where conversation_id = $1 and user_id = $2',
    [conversationId, userId]
  );

  const actorResult = await query('select username from users where id = $1', [userId]);
  const actorUsername = actorResult.rows[0]?.username || 'Someone';
  const systemMessage = await createSystemMessage(
    conversationId,
    userId,
    `@${actorUsername} left the group`
  );
  io.to(conversationId).emit('message:new', systemMessage);

  const remaining = await query(
    'select user_id from conversation_members where conversation_id = $1',
    [conversationId]
  );
  remaining.rows.forEach((member) => {
    io.to(`user:${member.user_id}`).emit('conversation:updated', { conversationId });
  });

  res.json({ ok: true });
});

app.post('/api/conversations/:id/members', requireAuth, async (req, res) => {
  const userId = req.user.userId;
  const conversationId = req.params.id;
  const { usernames } = req.body || {};

  if (!Array.isArray(usernames) || usernames.length === 0) {
    return res.status(400).json({ error: 'Usernames are required' });
  }

  const membership = await query(
    `select c.type
     from conversations c
     join conversation_members cm on cm.conversation_id = c.id
     where c.id = $1 and cm.user_id = $2 and cm.hidden_at is null`,
    [conversationId, userId]
  );
  if (membership.rowCount === 0) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  if (membership.rows[0].type !== 'group') {
    return res.status(400).json({ error: 'Only group chats can add members' });
  }

  const normalizedUsernames = Array.from(new Set(
    usernames
      .map((value) => normalizeUsername(String(value || '')))
      .filter((value) => value && isValidUsername(value))
  ));
  if (normalizedUsernames.length === 0) {
    return res.status(400).json({ error: 'No valid usernames provided' });
  }

  const userResult = await query(
    `select id, username
     from users
     where ${normalizeUsernameSql} = any($1::text[])`,
    [normalizedUsernames]
  );

  const candidateIds = userResult.rows.map((row) => row.id);
  if (candidateIds.length === 0) {
    return res.status(404).json({ error: 'No matching users found' });
  }

  const existing = await query(
    'select user_id from conversation_members where conversation_id = $1 and user_id = any($2::uuid[])',
    [conversationId, candidateIds]
  );
  const existingIds = new Set(existing.rows.map((row) => row.user_id));
  const newIds = candidateIds.filter((id) => !existingIds.has(id));

  if (newIds.length === 0) {
    return res.json({ added: 0 });
  }

  const client = await getClient();
  try {
    await client.query('begin');
    for (const memberId of newIds) {
      await client.query(
        `insert into conversation_members (conversation_id, user_id)
         values ($1, $2)
         on conflict do nothing`,
        [conversationId, memberId]
      );
    }
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    return res.status(500).json({ error: 'Failed to add members' });
  } finally {
    client.release();
  }

  const addedNames = userResult.rows
    .filter((row) => newIds.includes(row.id))
    .map((row) => `@${row.username}`);
  if (addedNames.length > 0) {
    const actorResult = await query('select username from users where id = $1', [userId]);
    const actorUsername = actorResult.rows[0]?.username || 'Someone';
    const systemMessage = await createSystemMessage(
      conversationId,
      userId,
      `@${actorUsername} added ${addedNames.join(', ')}`
    );
    io.to(conversationId).emit('message:new', systemMessage);
  }

  newIds.forEach((memberId) => {
    io.to(`user:${memberId}`).emit('conversation:created', { conversationId });
  });
  const currentMembers = await query(
    'select user_id from conversation_members where conversation_id = $1',
    [conversationId]
  );
  currentMembers.rows.forEach((member) => {
    io.to(`user:${member.user_id}`).emit('conversation:updated', { conversationId });
  });

  res.json({ added: newIds.length });
});

app.post('/api/messages/:id/reactions', requireAuth, async (req, res) => {
  const userId = req.user.userId;
  const messageId = req.params.id;
  const { emoji } = req.body || {};

  if (!allowedReactions.has(emoji)) {
    return res.status(400).json({ error: 'Invalid reaction' });
  }

  const membership = await query(
    `select m.conversation_id
     from messages m
     join conversation_members cm on cm.conversation_id = m.conversation_id
     where m.id = $1 and cm.user_id = $2 and cm.hidden_at is null`,
    [messageId, userId]
  );
  if (membership.rowCount === 0) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const conversationId = membership.rows[0].conversation_id;
  const existing = await query(
    'select 1 from message_reactions where message_id = $1 and user_id = $2 and emoji = $3',
    [messageId, userId, emoji]
  );
  if (existing.rowCount > 0) {
    await query(
      'delete from message_reactions where message_id = $1 and user_id = $2 and emoji = $3',
      [messageId, userId, emoji]
    );
  } else {
    await query(
      'insert into message_reactions (message_id, user_id, emoji) values ($1, $2, $3)',
      [messageId, userId, emoji]
    );
  }

  const reactions = await getMessageReactions(messageId, userId);
  io.to(conversationId).emit('reaction:update', { messageId, reactions });
  res.json({ messageId, reactions });
});

app.get('/api/users/me/emoji-recents', requireAuth, async (req, res) => {
  const userId = req.user.userId;
  const limit = Math.min(Number(req.query.limit || 24), 50);
  const result = await query(
    `select emoji
     from user_emoji_recents
     where user_id = $1
     order by last_used_at desc
     limit $2`,
    [userId, limit]
  );
  res.json({ emojis: result.rows.map(row => row.emoji) });
});

app.post('/api/users/me/emoji-recents', requireAuth, async (req, res) => {
  const userId = req.user.userId;
  const { emoji } = req.body || {};
  if (!emoji || typeof emoji !== 'string') {
    return res.status(400).json({ error: 'Emoji is required' });
  }

  await query(
    `insert into user_emoji_recents (user_id, emoji)
     values ($1, $2)
     on conflict (user_id, emoji)
     do update set last_used_at = now()`,
    [userId, emoji]
  );

  res.json({ ok: true });
});

const parseCookie = (cookieHeader) => {
  if (!cookieHeader) return {};
  return cookieHeader.split(';').reduce((acc, part) => {
    const [key, ...rest] = part.trim().split('=');
    acc[key] = decodeURIComponent(rest.join('='));
    return acc;
  }, {});
};

io.use((socket, next) => {
  const cookies = parseCookie(socket.request.headers.cookie || '');
  const token = cookies[COOKIE_NAME];
  if (!token) return next(new Error('Unauthorized'));
  try {
    const decoded = verifyToken(token);
    socket.user = { userId: decoded.userId };
    return next();
  } catch {
    return next(new Error('Unauthorized'));
  }
});

io.on('connection', async (socket) => {
  const { userId } = socket.user;
  socket.join(`user:${userId}`);

  const userResult = await query(
    'select id, username from users where id = $1',
    [userId]
  );
  const userProfile = userResult.rows[0];

  const conversationResult = await query(
    'select conversation_id from conversation_members where user_id = $1 and hidden_at is null',
    [userId]
  );
  conversationResult.rows.forEach((row) => {
    socket.join(row.conversation_id);
  });

  await query(
    'update users set status = $1, last_seen = now(), updated_at = now() where id = $2',
    ['online', userId]
  );
  conversationResult.rows.forEach((row) => {
    socket.to(row.conversation_id).emit('presence:update', {
      userId,
      status: 'online',
      lastSeen: new Date().toISOString(),
    });
  });

  socket.on('conversation:join', async (conversationId) => {
    const membership = await query(
      'select 1 from conversation_members where conversation_id = $1 and user_id = $2 and hidden_at is null',
      [conversationId, userId]
    );
    if (membership.rowCount > 0) {
      socket.join(conversationId);
    }
  });

  socket.on('message:send', async (payload, callback) => {
    const { conversationId, content, type = 'text', attachmentUrl, replyToId } = payload || {};
    if (!conversationId || !content?.trim()) {
      if (callback) callback({ error: 'Invalid message' });
      return;
    }

    const membership = await query(
      'select 1 from conversation_members where conversation_id = $1 and user_id = $2 and hidden_at is null',
      [conversationId, userId]
    );
    if (membership.rowCount === 0) {
      if (callback) callback({ error: 'Forbidden' });
      return;
    }
    if (replyToId) {
      const replyCheck = await query(
        'select 1 from messages where id = $1 and conversation_id = $2',
        [replyToId, conversationId]
      );
      if (replyCheck.rowCount === 0) {
        if (callback) callback({ error: 'Invalid reply target' });
        return;
      }
    }

    const insertResult = await query(
      `insert into messages (conversation_id, sender_id, content, type, attachment_url, reply_to_id)
       values ($1, $2, $3, $4, $5, $6)
       returning id`,
      [conversationId, userId, content, type, attachmentUrl || null, replyToId || null]
    );
    await query('update conversations set updated_at = now() where id = $1', [conversationId]);

    const messageResult = await query(
      `select
         m.id,
         m.content,
         m.sender_id,
         m.conversation_id,
         m.created_at,
         m.type,
         m.attachment_url,
         rm.id as reply_id,
         rm.content as reply_content,
         rm.sender_id as reply_sender_id
       from messages m
       left join messages rm on rm.id = m.reply_to_id
       where m.id = $1`,
      [insertResult.rows[0].id]
    );
    await query(
      'update conversation_members set hidden_at = null where conversation_id = $1',
      [conversationId]
    );
    const memberRows = await query(
      'select user_id from conversation_members where conversation_id = $1',
      [conversationId]
    );
    memberRows.rows.forEach((member) => {
      io.to(`user:${member.user_id}`).emit('conversation:created', { conversationId });
    });
    const row = messageResult.rows[0];
    const message = {
      id: row.id,
      content: row.content,
      senderId: row.sender_id,
      conversationId: row.conversation_id,
      timestamp: row.created_at,
      read: false,
      type: row.type,
      attachmentUrl: row.attachment_url,
      replyTo: row.reply_id
        ? {
            id: row.reply_id,
            content: row.reply_content,
            senderId: row.reply_sender_id,
          }
        : undefined,
      reactions: [],
    };

    io.to(conversationId).emit('message:new', message);
    if (callback) callback({ message });
  });

  socket.on('typing:start', (payload) => {
    const { conversationId } = payload || {};
    if (!conversationId || !userProfile) return;
    socket.to(conversationId).emit('typing:indicator', {
      conversationId,
      userId: userProfile.id,
      username: userProfile.username,
    });
  });

  socket.on('typing:stop', (payload) => {
    const { conversationId } = payload || {};
    if (!conversationId || !userProfile) return;
    socket.to(conversationId).emit('typing:stop', {
      conversationId,
      userId: userProfile.id,
    });
  });

  socket.on('reaction:toggle', async (payload, callback) => {
    const { messageId, emoji } = payload || {};
    if (!messageId || !allowedReactions.has(emoji)) {
      if (callback) callback({ error: 'Invalid reaction' });
      return;
    }

    const membership = await query(
      `select m.conversation_id
       from messages m
       join conversation_members cm on cm.conversation_id = m.conversation_id
       where m.id = $1 and cm.user_id = $2 and cm.hidden_at is null`,
      [messageId, userId]
    );
    if (membership.rowCount === 0) {
      if (callback) callback({ error: 'Forbidden' });
      return;
    }

    const conversationId = membership.rows[0].conversation_id;
    const existing = await query(
      'select 1 from message_reactions where message_id = $1 and user_id = $2 and emoji = $3',
      [messageId, userId, emoji]
    );
    if (existing.rowCount > 0) {
      await query(
        'delete from message_reactions where message_id = $1 and user_id = $2 and emoji = $3',
        [messageId, userId, emoji]
      );
    } else {
      await query(
        'insert into message_reactions (message_id, user_id, emoji) values ($1, $2, $3)',
        [messageId, userId, emoji]
      );
    }

    const reactions = await getMessageReactions(messageId, userId);
    io.to(conversationId).emit('reaction:update', { messageId, reactions });
    if (callback) callback({ messageId, reactions });
  });

  socket.on('presence:active', async () => {
    const lastSeen = new Date().toISOString();
    await query(
      'update users set status = $1, last_seen = now(), updated_at = now() where id = $2',
      ['online', userId]
    );
    const convoResult = await query(
      'select conversation_id from conversation_members where user_id = $1',
      [userId]
    );
    convoResult.rows.forEach((row) => {
      socket.to(row.conversation_id).emit('presence:update', {
        userId,
        status: 'online',
        lastSeen,
      });
    });
  });

  socket.on('presence:away', async () => {
    const lastSeen = new Date().toISOString();
    await query(
      'update users set status = $1, last_seen = now(), updated_at = now() where id = $2',
      ['away', userId]
    );
    const convoResult = await query(
      'select conversation_id from conversation_members where user_id = $1',
      [userId]
    );
    convoResult.rows.forEach((row) => {
      socket.to(row.conversation_id).emit('presence:update', {
        userId,
        status: 'away',
        lastSeen,
      });
    });
  });

  socket.on('disconnect', async () => {
    await query(
      'update users set status = $1, last_seen = now(), updated_at = now() where id = $2',
      ['offline', userId]
    );
    const convoResult = await query(
      'select conversation_id from conversation_members where user_id = $1',
      [userId]
    );
    convoResult.rows.forEach((row) => {
      socket.to(row.conversation_id).emit('presence:update', {
        userId,
        status: 'offline',
        lastSeen: new Date().toISOString(),
      });
    });
  });
});

const port = Number(process.env.PORT || 3001);
server.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
