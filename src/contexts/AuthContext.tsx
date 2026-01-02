import React, { useState, useCallback, useEffect, useRef } from 'react';
import { User, AuthState } from '@/types';
import { apiFetch } from '@/lib/api';
import { useTheme } from '@/contexts/useTheme';
import { useSocket } from '@/contexts/useSocket';
import { AuthContext } from '@/contexts/auth-context';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { setTheme } = useTheme();
  const { isConnected, presenceStatus, socket } = useSocket();
  const [state, setState] = useState<AuthState>({
    user: null,
    isAuthenticated: false,
    isLoading: true,
  });
  const isRefreshingRef = useRef(false);

  useEffect(() => {
    const loadSession = async () => {
      try {
        const data = await apiFetch<{ user: User }>('/api/auth/me');
        if (!data?.user) {
          setState({
            user: null,
            isAuthenticated: false,
            isLoading: false,
          });
          return;
        }
        setState({
          user: data.user,
          isAuthenticated: true,
          isLoading: false,
        });
        if (data.user.theme) {
          setTheme(data.user.theme);
        }
      } catch {
        setState(prev => ({ ...prev, isLoading: false }));
      }
    };
    loadSession();
  }, [setTheme]);

  useEffect(() => {
    if (!state.isAuthenticated) return;
    let isMounted = true;
    const refreshSession = async () => {
      if (document.visibilityState !== 'visible') return;
      if (isRefreshingRef.current) return;
      isRefreshingRef.current = true;
      try {
        const data = await apiFetch<{ user: User }>('/api/auth/me');
        if (!isMounted) return;
        if (!data?.user) {
          setState(prev => ({
            ...prev,
            user: null,
            isAuthenticated: false,
            isLoading: false,
          }));
          return;
        }
        setState(prev => ({
          ...prev,
          user: data.user,
          isAuthenticated: true,
          isLoading: false,
        }));
        if (data.user.theme) {
          setTheme(data.user.theme);
        }
      } catch {
        // ignore refresh errors
      } finally {
        isRefreshingRef.current = false;
      }
    };

    refreshSession();
    window.addEventListener('focus', refreshSession);
    document.addEventListener('visibilitychange', refreshSession);
    return () => {
      isMounted = false;
      window.removeEventListener('focus', refreshSession);
      document.removeEventListener('visibilitychange', refreshSession);
    };
  }, [state.isAuthenticated, isConnected, setTheme]);

  useEffect(() => {
    if (!socket) return;
    if (state.isAuthenticated) {
      socket.connect();
    } else {
      socket.disconnect();
    }
  }, [socket, state.isAuthenticated]);

  useEffect(() => {
    if (!state.isAuthenticated || !state.user) return;
    if (state.user.status === presenceStatus) return;
    setState(prev => ({
      ...prev,
      user: {
        ...prev.user!,
        status: presenceStatus,
      },
    }));
  }, [presenceStatus, state.isAuthenticated, state.user]);

  const login = useCallback(async (email: string, password: string) => {
    const data = await apiFetch<{ user: User }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    setState({
      user: data.user,
      isAuthenticated: true,
      isLoading: false,
    });
    if (data.user.theme) {
      setTheme(data.user.theme);
    }
  }, [setTheme]);

  const register = useCallback(async (username: string, email: string, password: string) => {
    const data = await apiFetch<{ user: User }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, email, password }),
    });

    setState({
      user: data.user,
      isAuthenticated: true,
      isLoading: false,
    });
    if (data.user.theme) {
      setTheme(data.user.theme);
    }
  }, [setTheme]);

  const logout = useCallback(async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Ignore network errors and clear local state anyway.
    }
    setState({
      user: null,
      isAuthenticated: false,
      isLoading: false,
    });
  }, []);

  const updateUser = useCallback(async (updates: Partial<User>) => {
    if (!state.user) return;
    const data = await apiFetch<{ user: User }>('/api/users/me', {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
    setState(prev => ({ ...prev, user: data.user }));
    if (data.user.theme) {
      setTheme(data.user.theme);
    }
  }, [state.user, setTheme]);

  return (
    <AuthContext.Provider value={{ ...state, login, register, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
};
