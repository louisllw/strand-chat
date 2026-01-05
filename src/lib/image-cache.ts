const MAX_CACHE_ENTRIES = 80;

type CacheEntry = {
  url: string;
  lastUsed: number;
};

const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<string | null>>();

const touch = (key: string) => {
  const entry = cache.get(key);
  if (entry) {
    entry.lastUsed = Date.now();
  }
};

const evictIfNeeded = () => {
  if (cache.size <= MAX_CACHE_ENTRIES) return;
  const entries = Array.from(cache.entries())
    .sort((a, b) => a[1].lastUsed - b[1].lastUsed);
  const overflow = entries.length - MAX_CACHE_ENTRIES;
  for (let i = 0; i < overflow; i += 1) {
    const [key, entry] = entries[i];
    cache.delete(key);
    URL.revokeObjectURL(entry.url);
  }
};

export const getCachedImageUrl = (key: string) => {
  const entry = cache.get(key);
  if (!entry) return null;
  touch(key);
  return entry.url;
};

export const fetchImageToCache = async (key: string, src: string) => {
  const existing = getCachedImageUrl(key);
  if (existing) return existing;
  const running = inFlight.get(key);
  if (running) return running;
  const promise = (async () => {
    try {
      const response = await fetch(src, { credentials: 'include' });
      if (!response.ok) return null;
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      cache.set(key, { url, lastUsed: Date.now() });
      evictIfNeeded();
      return url;
    } finally {
      inFlight.delete(key);
    }
  })();
  inFlight.set(key, promise);
  return promise;
};
