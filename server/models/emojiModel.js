import { query } from '../db.js';

export const getEmojiRecents = async (userId, limit) => {
  const result = await query(
    `select emoji
     from user_emoji_recents
     where user_id = $1
     order by last_used_at desc
     limit $2`,
    [userId, limit]
  );
  return result.rows.map((row) => row.emoji);
};

export const upsertEmojiRecent = async (userId, emoji) => {
  await query(
    `insert into user_emoji_recents (user_id, emoji)
     values ($1, $2)
     on conflict (user_id, emoji)
     do update set last_used_at = now()`,
    [userId, emoji]
  );
};
