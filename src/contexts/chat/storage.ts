const STORAGE_CONVERSATIONS_KEY = 'strand:chat:conversations';
const STORAGE_LAST_ACTIVE_KEY = 'strand:chat:last-active';
const STORAGE_MESSAGES_PREFIX = 'strand:chat:messages:';
const STORAGE_PREFIX = 'strand:chat:';
const STORAGE_LRU_KEY = 'strand:chat:lru';
const LRU_MAX_ENTRIES = 200;

const isTrackedKey = (key: string) => key.startsWith(STORAGE_PREFIX);
const isMessageKey = (key: string) => key.startsWith(STORAGE_MESSAGES_PREFIX);

const readLru = () => {
  try {
    const raw = window.localStorage.getItem(STORAGE_LRU_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry) => typeof entry === 'string');
  } catch {
    // Ignore malformed LRU cache entries.
    void 0;
    return [];
  }
};

const writeLru = (entries: string[]) => {
  try {
    window.localStorage.setItem(STORAGE_LRU_KEY, JSON.stringify(entries));
  } catch {
    // Ignore storage write failures (private mode / quota).
    void 0;
  }
};

const touchKey = (key: string) => {
  if (!isTrackedKey(key)) return;
  const lru = readLru();
  const next = [key, ...lru.filter((entry) => entry !== key)].slice(0, LRU_MAX_ENTRIES);
  writeLru(next);
};

const evictKeys = (predicate: (key: string) => boolean) => {
  const lru = readLru();
  let changed = false;
  lru.forEach((key) => {
    if (!predicate(key)) return;
    try {
      window.localStorage.removeItem(key);
      changed = true;
    } catch {
      // Ignore failed removals (storage unavailable).
      void 0;
    }
  });
  if (changed) {
    const next = lru.filter((key) => {
      if (!predicate(key)) return true;
      try {
        return window.localStorage.getItem(key) !== null;
      } catch {
        // Treat unreadable items as evicted.
        void 0;
        return false;
      }
    });
    writeLru(next);
  }
};

const trySetWithEviction = (key: string, value: string) => {
  try {
    window.localStorage.setItem(key, value);
    touchKey(key);
    return;
  } catch {
    // Ignore write failure and attempt eviction.
    void 0;
  }

  evictKeys(isMessageKey);
  try {
    window.localStorage.setItem(key, value);
    touchKey(key);
    return;
  } catch {
    // Ignore write failure and attempt final eviction.
    void 0;
  }

  evictKeys((entry) => entry === STORAGE_CONVERSATIONS_KEY);
  try {
    window.localStorage.setItem(key, value);
    touchKey(key);
  } catch {
    // Ignore storage failures after eviction attempts.
    void 0;
  }
};

const safeStorage = {
  get(key: string) {
    try {
      const value = window.localStorage.getItem(key);
      if (value !== null) {
        touchKey(key);
      }
      return value;
    } catch {
      // Ignore read failures (storage unavailable).
      void 0;
      return null;
    }
  },
  set(key: string, value: string) {
    trySetWithEviction(key, value);
  },
  remove(key: string) {
    try {
      window.localStorage.removeItem(key);
      if (isTrackedKey(key)) {
        const lru = readLru().filter((entry) => entry !== key);
        writeLru(lru);
      }
    } catch {
      // Ignore removal failures (storage unavailable).
      void 0;
    }
  },
};

export {
  STORAGE_CONVERSATIONS_KEY,
  STORAGE_LAST_ACTIVE_KEY,
  STORAGE_MESSAGES_PREFIX,
  safeStorage,
};
