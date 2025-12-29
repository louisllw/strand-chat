const API_BASE = import.meta.env.VITE_API_BASE || '';

export const apiFetch = async <T>(path: string, options: RequestInit = {}): Promise<T> => {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    credentials: 'include',
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Request failed');
  }

  return response.json();
};

export const getSocketUrl = () => {
  if (API_BASE && !API_BASE.startsWith('/')) return API_BASE;
  if (API_BASE && API_BASE.startsWith('/')) return window.location.origin;
  const { protocol, hostname, port } = window.location;
  if (!port || port === '3001') {
    return window.location.origin;
  }
  return `${protocol}//${hostname}:3001`;
};
