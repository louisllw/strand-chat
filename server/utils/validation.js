export const normalizeUsername = (value) => value.trim().replace(/^@+/, '').toLowerCase();
export const isValidUsername = (value) => /^[a-z0-9._]{3,30}$/.test(value);
export const normalizeUsernameSql = "regexp_replace(lower(trim(username)), '^@+', '')";
export const allowedReactions = new Set(['❤️', '👍', '😂', '🔥', '😮', '😢']);
