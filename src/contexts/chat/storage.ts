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
    console.warn('[ChatStorage] Failed to read LRU cache');
    return [];
  }
};

const writeLru = (entries: string[]) => {
  try {
    window.localStorage.setItem(STORAGE_LRU_KEY, JSON.stringify(entries));
  } catch {
    console.warn('[ChatStorage] Failed to persist LRU cache');
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
      console.warn('[ChatStorage] Failed to evict cached item');
    }
  });
  if (changed) {
    const next = lru.filter((key) => {
      if (!predicate(key)) return true;
      try {
        return window.localStorage.getItem(key) !== null;
      } catch {
        console.warn('[ChatStorage] Failed to verify cached item eviction');
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
    console.warn('[ChatStorage] Storage full, evicting message cache');
  }

  evictKeys(isMessageKey);
  try {
    window.localStorage.setItem(key, value);
    touchKey(key);
    return;
  } catch {
    console.warn('[ChatStorage] Storage still full, evicting conversation cache');
  }

  evictKeys((entry) => entry === STORAGE_CONVERSATIONS_KEY);
  try {
    window.localStorage.setItem(key, value);
    touchKey(key);
  } catch {
    console.warn('[ChatStorage] Failed to persist cache entry');
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
      console.warn('[ChatStorage] Failed to read cache entry');
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
      console.warn('[ChatStorage] Failed to remove cache entry');
    }
  },
};

export {
  STORAGE_CONVERSATIONS_KEY,
  STORAGE_LAST_ACTIVE_KEY,
  STORAGE_MESSAGES_PREFIX,
  safeStorage,
};
