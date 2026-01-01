import {
  checkUsernameAvailability,
  updateUserProfile,
  mapUser,
  getPublicUserProfile,
  listEmojiRecents,
  saveEmojiRecent,
} from '../services/userService.js';
import { sanitizeProfileField } from '../utils/sanitize.js';

export const usernameAvailability = async (req, res) => {
  const username = typeof req.query.username === 'string' ? req.query.username : '';
  const result = await checkUsernameAvailability(req.user.userId, username);
  res.json(result);
};

export const updateMe = async (req, res) => {
  const updatedRow = await updateUserProfile(req.user.userId, req.body);
  res.json({ user: mapUser(updatedRow) });
};

export const getEmojiRecentsForMe = async (req, res) => {
  const limit = Math.min(Number(req.query.limit || 24), 50);
  const emojis = await listEmojiRecents(req.user.userId, limit);
  res.json({ emojis });
};

export const addEmojiRecentForMe = async (req, res) => {
  const { emoji } = req.body || {};
  await saveEmojiRecent(req.user.userId, emoji);
  res.json({ ok: true });
};

export const getUserById = async (req, res) => {
  const { id } = req.params;
  const row = await getPublicUserProfile(id);
  res.json({
    user: {
      id: row.id,
      username: row.username,
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
      lastSeen: row.last_seen || null,
      createdAt: row.created_at || null,
    },
  });
};
