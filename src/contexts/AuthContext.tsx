import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { User, AuthState } from '@/types';
import { apiFetch } from '@/lib/api';
import { useTheme } from '@/contexts/ThemeContext';
import { useSocket } from '@/contexts/SocketContext';

interface AuthContextType extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  updateUser: (user: Partial<User>) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { setTheme } = useTheme();
  const { isConnected, presenceStatus } = useSocket();
  const [state, setState] = useState<AuthState>({
    user: null,
    isAuthenticated: false,
    isLoading: true,
  });

  useEffect(() => {
    const loadSession = async () => {
      try {
        const data = await apiFetch<{ user: User }>('/api/auth/me');
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
      try {
        const data = await apiFetch<{ user: User }>('/api/auth/me');
        if (!isMounted) return;
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
        // ignore polling errors
      }
    };

    refreshSession();
    const intervalId = window.setInterval(refreshSession, 30000);
    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
  }, [state.isAuthenticated, isConnected, setTheme]);

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

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
