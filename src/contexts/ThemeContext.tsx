import React, { useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { ThemeContext, Theme } from '@/contexts/theme-context';

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const hasHydrated = useRef(false);
  const [theme, setTheme] = useState<Theme>(() => {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(theme);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      const themeColor = theme === 'dark' ? '#0f172a' : '#f8fafc';
      meta.setAttribute('content', themeColor);
    }
  }, [theme]);

  useEffect(() => {
    if (!hasHydrated.current) {
      hasHydrated.current = true;
      return;
    }
    apiFetch('/api/users/me', {
      method: 'PATCH',
      body: JSON.stringify({ theme }),
    }).catch((error) => {
      void error;
    });
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'light' ? 'dark' : 'light'));
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};
