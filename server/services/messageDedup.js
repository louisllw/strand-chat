const TTL_MS = 60 * 1000;
const dedupStore = new Map();

const cleanup = () => {
  const now = Date.now();
  for (const [key, entry] of dedupStore.entries()) {
    if (entry.expiresAt <= now) {
      dedupStore.delete(key);
    }
  }
};

const getKey = (userId, clientMessageId) => `${userId}:${clientMessageId}`;

export const getMessageDedup = (userId, clientMessageId) => {
  if (!clientMessageId) return null;
  cleanup();
  const entry = dedupStore.get(getKey(userId, clientMessageId));
  return entry?.message || null;
};

export const setMessageDedup = (userId, clientMessageId, message) => {
  if (!clientMessageId || !message) return;
  cleanup();
  dedupStore.set(getKey(userId, clientMessageId), {
    message,
    expiresAt: Date.now() + TTL_MS,
  });
};
