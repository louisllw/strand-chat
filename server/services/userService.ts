import { query } from '../db.js';
import {
  findUserPublicById,
  getUsernameMeta,
  isEmailTaken,
  isUsernameTaken,
} from '../models/userModel.js';
import { getEmojiRecents, upsertEmojiRecent } from '../models/emojiModel.js';
import { normalizeUsername, isValidUsername } from '../utils/validation.js';
import { sanitizeProfileField } from '../utils/sanitize.js';
import { ServiceError } from '../utils/errors.js';

type UserRow = {
  id: string;
  username: string;
  email: string;
  avatar_url?: string | null;
  banner_url?: string | null;
  phone?: string | null;
  bio?: string | null;
  website_url?: string | null;
  social_x?: string | null;
  social_instagram?: string | null;
  social_linkedin?: string | null;
  social_tiktok?: string | null;
  social_youtube?: string | null;
  social_facebook?: string | null;
  social_github?: string | null;
  status?: string | null;
  theme?: string | null;
  last_seen?: string | null;
  updated_at?: string | null;
};

type UpdateUserPayload = {
  username?: string | null;
  email?: string | null;
  avatar?: string | null;
  banner?: string | null;
  status?: string | null;
  theme?: string | null;
  phone?: string | null;
  bio?: string | null;
  website?: string | null;
  socialX?: string | null;
  socialInstagram?: string | null;
  socialLinkedin?: string | null;
  socialTiktok?: string | null;
  socialYoutube?: string | null;
  socialFacebook?: string | null;
  socialGithub?: string | null;
};

export const mapUser = (row: UserRow) => ({
  id: row.id,
  username: row.username,
  email: row.email,
  avatar: row.avatar_url || null,
  banner: row.banner_url || null,
  phone: row.phone || null,
  bio: sanitizeProfileField(row.bio) || null,
  website: sanitizeProfileField(row.website_url) || null,
  socialX: sanitizeProfileField(row.social_x) || null,
  socialInstagram: sanitizeProfileField(row.social_instagram) || null,
  socialLinkedin: sanitizeProfileField(row.social_linkedin) || null,
  socialTiktok: sanitizeProfileField(row.social_tiktok) || null,
  socialYoutube: sanitizeProfileField(row.social_youtube) || null,
  socialFacebook: sanitizeProfileField(row.social_facebook) || null,
  socialGithub: sanitizeProfileField(row.social_github) || null,
  status: row.status || 'offline',
  theme: row.theme || 'light',
  lastSeen: row.last_seen || row.updated_at || null,
});

export const checkUsernameAvailability = async (userId: string, username: string) => {
  const normalizedUsername = normalizeUsername(username);

  if (!normalizedUsername || !isValidUsername(normalizedUsername)) {
    return {
      valid: false,
      available: false,
      canChange: false,
      cooldownDaysRemaining: null,
      message: 'Username must be 3-30 characters, one word (letters, numbers, . or _).',
    };
  }

  const current = await getUsernameMeta(userId);
  if (!current) {
    throw new ServiceError(404, 'USER_NOT_FOUND', 'User not found');
  }
  const normalizedCurrent = normalizeUsername(current.username);
  if (normalizedUsername === normalizedCurrent) {
    return {
      valid: true,
      available: true,
      canChange: false,
      cooldownDaysRemaining: null,
      current: true,
    };
  }

  const usernameTaken = await isUsernameTaken(normalizedUsername, userId);
  if (usernameTaken) {
    return {
      valid: true,
      available: false,
      canChange: false,
      cooldownDaysRemaining: null,
    };
  }

  const lastUpdated = new Date(current.username_updated_at);
  const now = new Date();
  const cooldownMs = 7 * 24 * 60 * 60 * 1000;
  const remainingMs = Math.max(0, cooldownMs - (now.getTime() - lastUpdated.getTime()));
  const cooldownDaysRemaining = remainingMs > 0 ? Math.ceil(remainingMs / (24 * 60 * 60 * 1000)) : null;

  return {
    valid: true,
    available: true,
    canChange: remainingMs === 0,
    cooldownDaysRemaining,
    current: false,
  };
};

export const updateUserProfile = async (userId: string, payload: UpdateUserPayload) => {
  const {
    username,
    email,
    avatar,
    banner,
    status,
    theme,
    phone,
    bio,
    website,
    socialX,
    socialInstagram,
    socialLinkedin,
    socialTiktok,
    socialYoutube,
    socialFacebook,
    socialGithub,
  } = payload || {};

  const updates: string[] = [];
  const values: Array<string | null> = [];
  let idx = 1;

  if (username || email) {
    const current = await getUsernameMeta(userId);
    if (!current) {
      throw new ServiceError(404, 'USER_NOT_FOUND', 'User not found');
    }

    if (email && email.toLowerCase() !== current.email) {
      const emailTaken = await isEmailTaken(email.toLowerCase(), userId);
      if (emailTaken) {
        throw new ServiceError(409, 'USER_EMAIL_TAKEN', 'Email already registered');
      }
    }

    if (username) {
      const normalizedUsername = normalizeUsername(username);
      if (!normalizedUsername || !isValidUsername(normalizedUsername)) {
        throw new ServiceError(
          400,
          'USERNAME_INVALID',
          'Username must be 3-30 characters, one word (letters, numbers, . or _).'
        );
      }
      if (normalizedUsername !== current.username) {
        const usernameTaken = await isUsernameTaken(normalizedUsername, userId);
        if (usernameTaken) {
          throw new ServiceError(409, 'USERNAME_TAKEN', 'Username already taken');
        }

        const lastUpdated = new Date(current.username_updated_at);
        const now = new Date();
        const cooldownMs = 7 * 24 * 60 * 60 * 1000;
        if (now.getTime() - lastUpdated.getTime() < cooldownMs) {
          throw new ServiceError(429, 'USERNAME_COOLDOWN', 'Username can only be changed every 7 days');
        }
        updates.push(`username = $${idx++}`);
        values.push(normalizedUsername);
        updates.push('username_updated_at = now()');
      }
    }
  }

  if (email) {
    updates.push(`email = $${idx++}`);
    values.push(email.toLowerCase());
  }
  if (avatar !== undefined) {
    const normalizedAvatar = String(avatar || '').trim();
    updates.push(`avatar_url = $${idx++}`);
    values.push(normalizedAvatar.length > 0 ? normalizedAvatar : null);
  }
  if (banner !== undefined) {
    const normalizedBanner = String(banner || '').trim();
    updates.push(`banner_url = $${idx++}`);
    values.push(normalizedBanner.length > 0 ? normalizedBanner : null);
  }
  if (phone !== undefined) {
    const normalizedPhone = String(phone || '').trim();
    updates.push(`phone = $${idx++}`);
    values.push(normalizedPhone.length > 0 ? normalizedPhone : null);
  }
  if (bio !== undefined) {
    const normalizedBio = sanitizeProfileField(bio);
    updates.push(`bio = $${idx++}`);
    values.push(normalizedBio.length > 0 ? normalizedBio : null);
  }
  if (website !== undefined) {
    const normalizedWebsite = sanitizeProfileField(website);
    updates.push(`website_url = $${idx++}`);
    values.push(normalizedWebsite.length > 0 ? normalizedWebsite : null);
  }
  if (socialX !== undefined) {
    const normalized = sanitizeProfileField(socialX);
    updates.push(`social_x = $${idx++}`);
    values.push(normalized.length > 0 ? normalized : null);
  }
  if (socialInstagram !== undefined) {
    const normalized = sanitizeProfileField(socialInstagram);
    updates.push(`social_instagram = $${idx++}`);
    values.push(normalized.length > 0 ? normalized : null);
  }
  if (socialLinkedin !== undefined) {
    const normalized = sanitizeProfileField(socialLinkedin);
    updates.push(`social_linkedin = $${idx++}`);
    values.push(normalized.length > 0 ? normalized : null);
  }
  if (socialTiktok !== undefined) {
    const normalized = sanitizeProfileField(socialTiktok);
    updates.push(`social_tiktok = $${idx++}`);
    values.push(normalized.length > 0 ? normalized : null);
  }
  if (socialYoutube !== undefined) {
    const normalized = sanitizeProfileField(socialYoutube);
    updates.push(`social_youtube = $${idx++}`);
    values.push(normalized.length > 0 ? normalized : null);
  }
  if (socialFacebook !== undefined) {
    const normalized = sanitizeProfileField(socialFacebook);
    updates.push(`social_facebook = $${idx++}`);
    values.push(normalized.length > 0 ? normalized : null);
  }
  if (socialGithub !== undefined) {
    const normalized = sanitizeProfileField(socialGithub);
    updates.push(`social_github = $${idx++}`);
    values.push(normalized.length > 0 ? normalized : null);
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
    throw new ServiceError(400, 'USER_NO_UPDATES', 'No updates provided');
  }

  values.push(userId);
  const result = await query(
    `update users set ${updates.join(', ')}, updated_at = now()
     where id = $${idx}
     returning id, username, email, avatar_url, banner_url, phone, bio, website_url,
               social_x, social_instagram, social_linkedin, social_tiktok, social_youtube,
               social_facebook, social_github, status, theme, last_seen, created_at`,
    values
  );
  return result.rows[0] || null;
};

export const getPublicUserProfile = async (id: string) => {
  const row = await findUserPublicById(id);
  if (!row) {
    throw new ServiceError(404, 'USER_NOT_FOUND', 'User not found');
  }
  return row;
};

export const listEmojiRecents = async (userId: string, limit: number) => {
  return getEmojiRecents(userId, limit);
};

export const saveEmojiRecent = async (userId: string, emoji: string) => {
  if (!emoji || typeof emoji !== 'string') {
    throw new ServiceError(400, 'USER_EMOJI_REQUIRED', 'Emoji is required');
  }
  await upsertEmojiRecent(userId, emoji);
};
