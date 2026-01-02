export const normalizeUsername = (value: unknown): string => String(value || '').trim().replace(/^@+/, '').toLowerCase();
export const isValidUsername = (value: string): boolean => /^[a-z0-9._]{3,30}$/.test(value);
export const normalizeUsernameSql = "regexp_replace(lower(trim(username)), '^@+', '')";
export const allowedReactions = new Set(['❤️', '👍', '😂', '🔥', '😮', '😢']);

export const MAX_MESSAGE_LENGTH = Number(process.env.MAX_MESSAGE_LENGTH || 4000);
export const MAX_ATTACHMENT_URL_LENGTH = Number(process.env.MAX_ATTACHMENT_URL_LENGTH || 2048);
export const MAX_DATA_URL_BYTES = Number(process.env.MAX_DATA_URL_BYTES || 2 * 1024 * 1024);

const getDataUrlSizeBytes = (value: unknown): number | null => {
  if (!value || typeof value !== 'string' || !value.startsWith('data:')) return null;
  const commaIndex = value.indexOf(',');
  if (commaIndex === -1) return null;
  const meta = value.slice(5, commaIndex).toLowerCase();
  const data = value.slice(commaIndex + 1);
  if (meta.includes(';base64')) {
    const padding = data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0;
    return Math.floor((data.length * 3) / 4) - padding;
  }
  return data.length;
};

export const isMessageTooLong = (value: unknown): boolean =>
  typeof value === 'string' && value.length > MAX_MESSAGE_LENGTH;

export const isAttachmentUrlTooLong = (value: unknown): boolean =>
  typeof value === 'string' && value.length > MAX_ATTACHMENT_URL_LENGTH;

export const isDataUrlTooLarge = (value: unknown): boolean => {
  const size = getDataUrlSizeBytes(value);
  return size !== null && size > MAX_DATA_URL_BYTES;
};
