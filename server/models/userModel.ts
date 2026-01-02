import { query } from '../db.js';
import { normalizeUsernameSql } from '../utils/validation.js';

export const findUserByEmail = async (email: string) => {
  const result = await query(
    `select id, username, email, avatar_url, banner_url, phone, bio, website_url,
            social_x, social_instagram, social_linkedin, social_tiktok, social_youtube,
            social_facebook, social_github, status, theme, password_hash, created_at
     from users
     where email = $1`,
    [email]
  );
  return result.rows[0] || null;
};

export const findUserById = async (id: string) => {
  const result = await query(
    `select id, username, email, avatar_url, banner_url, phone, bio, website_url,
            social_x, social_instagram, social_linkedin, social_tiktok, social_youtube,
            social_facebook, social_github, status, theme, last_seen, updated_at, created_at
     from users
     where id = $1`,
    [id]
  );
  return result.rows[0] || null;
};

export const findUserPublicById = async (id: string) => {
  const result = await query(
    `select id, username, avatar_url, banner_url, phone, bio, website_url,
            social_x, social_instagram, social_linkedin, social_tiktok, social_youtube,
            social_facebook, social_github, status, last_seen, created_at
     from users
     where id = $1`,
    [id]
  );
  return result.rows[0] || null;
};

export const findUserForAuth = async (id: string) => {
  const result = await query(
    `select id, username, email, avatar_url, banner_url, phone, bio, website_url,
            social_x, social_instagram, social_linkedin, social_tiktok, social_youtube,
            social_facebook, social_github, status, theme, last_seen, updated_at, created_at
     from users
     where id = $1`,
    [id]
  );
  return result.rows[0] || null;
};

export const isEmailTaken = async (email: string, excludeId: string | null = null) => {
  const result = await query(
    'select id from users where email = $1 and ($2::uuid is null or id <> $2)',
    [email, excludeId]
  );
  return (result.rowCount ?? 0) > 0;
};

export const isUsernameTaken = async (normalizedUsername: string, excludeId: string | null = null) => {
  const result = await query(
    `select id from users where ${normalizeUsernameSql} = $1 and ($2::uuid is null or id <> $2)`,
    [normalizedUsername, excludeId]
  );
  return (result.rowCount ?? 0) > 0;
};

export const getUsernameMeta = async (id: string) => {
  const result = await query(
    'select username, email, username_updated_at from users where id = $1',
    [id]
  );
  return result.rows[0] || null;
};

export const findUserIdByNormalizedUsername = async (normalizedUsername: string) => {
  const result = await query(
    `select id
     from users
     where ${normalizeUsernameSql} = $1`,
    [normalizedUsername]
  );
  return result.rows[0]?.id || null;
};

export const findUsersByNormalizedUsernames = async (normalizedUsernames: string[]) => {
  const result = await query(
    `select id, username, ${normalizeUsernameSql} as normalized
     from users
     where ${normalizeUsernameSql} = any($1::text[])`,
    [normalizedUsernames]
  );
  return result.rows;
};

export const insertUser = async ({
  username,
  email,
  passwordHash,
}: {
  username: string;
  email: string;
  passwordHash: string;
}) => {
  const result = await query(
    `insert into users (username, email, password_hash, status, last_seen)
     values ($1, $2, $3, 'offline', now())
     returning id, username, email, avatar_url, banner_url, phone, bio, website_url,
               social_x, social_instagram, social_linkedin, social_tiktok, social_youtube,
               social_facebook, social_github, status, theme, last_seen, created_at`,
    [username, email, passwordHash]
  );
  return result.rows[0] || null;
};

export const updateUserStatus = async (id: string, status: string) => {
  await query(
    'update users set status = $1, last_seen = now(), updated_at = now() where id = $2',
    [status, id]
  );
};

export const updateUserStatusWithProfile = async (id: string, status: string) => {
  const result = await query(
    `update users
     set status = $2, last_seen = now(), updated_at = now()
     where id = $1
     returning id, username`,
    [id, status]
  );
  return result.rows[0] || null;
};
