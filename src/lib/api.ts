const API_BASE = import.meta.env.VITE_API_BASE || '';
const SOCKET_BASE = import.meta.env.VITE_SOCKET_URL || '';

const getStatusMessage = (status: number) => {
  if (status === 401) return 'Unauthorized';
  if (status === 403) return 'Forbidden';
  if (status === 404) return 'Not found';
  if (status === 409) return 'Conflict';
  if (status === 429) return 'Too many requests';
  if (status >= 500) return 'Server error';
  return 'Request failed';
};

export class ApiError extends Error {
  status: number;
  data?: unknown;

  constructor(status: number, message: string, data?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

const parseJson = async (response: Response) => {
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);
const AUTH_REFRESH_PATH = '/api/auth/refresh';
let csrfToken: string | null = null;
let csrfPromise: Promise<string> | null = null;
let authRefreshPromise: Promise<boolean> | null = null;

export const AUTH_UNAUTHORIZED_EVENT = 'auth:unauthorized';

const isAuthEndpoint = (path: string) => path.startsWith('/api/auth/');

const shouldNotifyUnauthorized = (path: string) => {
  return !isAuthEndpoint(path);
};

const notifyUnauthorized = (path: string) => {
  if (typeof window === 'undefined') return;
  if (!shouldNotifyUnauthorized(path)) return;
  window.dispatchEvent(new CustomEvent(AUTH_UNAUTHORIZED_EVENT, { detail: { path, status: 401 } }));
};

const refreshAuth = async () => {
  if (authRefreshPromise) return authRefreshPromise;
  authRefreshPromise = (async () => {
    try {
      const headers = new Headers();
      headers.set('Content-Type', 'application/json');
      const token = await getCsrfToken();
      headers.set('x-csrf-token', token);
      const response = await fetch(`${API_BASE}${AUTH_REFRESH_PATH}`, {
        method: 'POST',
        headers,
        credentials: 'include',
      });
      if (!response.ok) return false;
      const data = await parseJson(response);
      return Boolean(data && typeof data === 'object' && 'user' in data);
    } catch {
      return false;
    } finally {
      authRefreshPromise = null;
    }
  })();
  return authRefreshPromise;
};

const getCsrfToken = async (): Promise<string> => {
  if (csrfToken) return csrfToken;
  if (!csrfPromise) {
    csrfPromise = fetch(`${API_BASE}/api/auth/csrf`, { credentials: 'include' })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error('Failed to fetch CSRF token');
        }
        const data = await parseJson(response);
        if (data && typeof data === 'object' && 'csrfToken' in data && typeof data.csrfToken === 'string') {
          const token = data.csrfToken;
          csrfToken = token;
          return token;
        }
        throw new Error('Invalid CSRF token response');
      })
      .finally(() => {
        csrfPromise = null;
      });
  }
  return csrfPromise!;
};

type ApiFetchOptions = RequestInit & {
  retry?: number;
  retryDelayMs?: number;
};

const getRetryDelayMs = (response: Response | null, attempt: number, baseDelay?: number) => {
  if (response) {
    const retryAfter = response.headers.get('Retry-After');
    if (retryAfter) {
      const parsed = Number(retryAfter);
      if (!Number.isNaN(parsed)) {
        return Math.min(parsed * 1000, 10_000);
      }
      const dateMs = Date.parse(retryAfter);
      if (!Number.isNaN(dateMs)) {
        return Math.min(Math.max(dateMs - Date.now(), 0), 10_000);
      }
    }
  }
  const initialDelay = baseDelay ?? 250;
  const delay = initialDelay * Math.pow(2, attempt);
  return Math.min(delay, 2000);
};

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const isAbortError = (error: unknown) => {
  return error instanceof DOMException && error.name === 'AbortError';
};

export const apiFetch = async <T>(path: string, options: ApiFetchOptions = {}): Promise<T> => {
  const { retry, retryDelayMs, ...fetchOptions } = options;
  const method = fetchOptions.method?.toUpperCase() || 'GET';
  const headers = new Headers(fetchOptions.headers || {});
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (!SAFE_METHODS.has(method) && !headers.has('x-csrf-token')) {
    const token = await getCsrfToken();
    headers.set('x-csrf-token', token);
  }
  const maxRetries = SAFE_METHODS.has(method) ? (retry ?? 2) : 0;
  let attempt = 0;
  let attemptedAuthRefresh = false;

  while (true) {
    try {
      const response = await fetch(`${API_BASE}${path}`, {
        ...fetchOptions,
        headers,
        credentials: 'include',
      });

      if (response.status === 401) {
        if (!attemptedAuthRefresh && !isAuthEndpoint(path)) {
          attemptedAuthRefresh = true;
          const refreshed = await refreshAuth();
          if (refreshed) {
            continue;
          }
        }
        notifyUnauthorized(path);
      }

      if (!response.ok) {
        if (attempt < maxRetries && RETRYABLE_STATUSES.has(response.status)) {
          const delayMs = getRetryDelayMs(response, attempt, retryDelayMs);
          attempt += 1;
          await wait(delayMs);
          continue;
        }
        const data = await parseJson(response);
        const errorMessage =
          data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
            ? data.error
            : data && typeof data === 'object' && 'message' in data && typeof data.message === 'string'
              ? data.message
              : getStatusMessage(response.status);
        throw new ApiError(response.status, errorMessage, data);
      }

      if (response.status === 204) {
        return undefined as T;
      }

      return (await parseJson(response)) as T;
    } catch (error) {
      if (isAbortError(error)) {
        throw error;
      }
      if (attempt < maxRetries) {
        const delayMs = getRetryDelayMs(null, attempt, retryDelayMs);
        attempt += 1;
        await wait(delayMs);
        continue;
      }
      throw error;
    }
  }
};

export const getSocketUrl = () => {
  if (SOCKET_BASE) {
    return SOCKET_BASE;
  }
  if (API_BASE && !API_BASE.startsWith('/')) {
    try {
      const apiUrl = new URL(API_BASE);
      return `${apiUrl.protocol}//${apiUrl.host}`;
    } catch {
      return API_BASE;
    }
  }
  if (API_BASE && API_BASE.startsWith('/')) return window.location.origin;
  const { protocol, hostname, port } = window.location;
  if (!port || port === '3001') {
    return window.location.origin;
  }
  return `${protocol}//${hostname}:3001`;
};
