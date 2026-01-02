const STORAGE_CONVERSATIONS_KEY = 'strand:chat:conversations';
const STORAGE_LAST_ACTIVE_KEY = 'strand:chat:last-active';
const STORAGE_MESSAGES_PREFIX = 'strand:chat:messages:';

const safeStorage = {
  get(key: string) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string) {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Ignore storage errors (quota, privacy mode).
    }
  },
  remove(key: string) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Ignore storage errors.
    }
  },
};

export {
  STORAGE_CONVERSATIONS_KEY,
  STORAGE_LAST_ACTIVE_KEY,
  STORAGE_MESSAGES_PREFIX,
  safeStorage,
};
