import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { getSocketUrl } from '@/lib/api';

interface SocketContextType {
  isConnected: boolean;
  socket: Socket | null;
  presenceStatus: 'online' | 'away' | 'offline';
  emit: (event: string, data: unknown) => void;
  on: (event: string, callback: (data: unknown) => void) => void;
  off: (event: string) => void;
}

const SocketContext = createContext<SocketContextType | undefined>(undefined);

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isConnected, setIsConnected] = useState(false);
  const [presenceStatus, setPresenceStatus] = useState<'online' | 'away' | 'offline'>('offline');
  const socket = useMemo(
    () =>
      io(getSocketUrl(), {
        withCredentials: true,
        autoConnect: true,
      }),
    []
  );
  const idleTimeoutMs = 30 * 1000;

  useEffect(() => {
    const handleConnect = () => {
      setIsConnected(true);
      setPresenceStatus('online');
    };
    const handleDisconnect = () => {
      setIsConnected(false);
      setPresenceStatus('offline');
    };
    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.disconnect();
    };
  }, [socket]);

  useEffect(() => {
    if (!socket) return;
    let idleTimer: number | undefined;
    let lastState: 'active' | 'away' = 'active';

    const setAway = () => {
      if (lastState !== 'away') {
        socket.emit('presence:away');
        lastState = 'away';
        setPresenceStatus('away');
      }
    };

    const setActive = () => {
      if (lastState !== 'active') {
        socket.emit('presence:active');
        lastState = 'active';
        setPresenceStatus('online');
      }
      if (idleTimer) window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(setAway, idleTimeoutMs);
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        setActive();
      } else {
        setAway();
      }
    };

    const activityEvents = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'];
    activityEvents.forEach(event => window.addEventListener(event, setActive, { passive: true }));
    document.addEventListener('visibilitychange', handleVisibility);

    setActive();

    return () => {
      if (idleTimer) window.clearTimeout(idleTimer);
      activityEvents.forEach(event => window.removeEventListener(event, setActive));
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [socket]);

  const emit = (event: string, data: unknown) => {
    if (socket.connected) {
      socket.emit(event, data);
    }
  };

  const on = (event: string, callback: (data: unknown) => void) => {
    socket.on(event, callback);
  };

  const off = (event: string) => {
    socket.off(event);
  };

  return (
    <SocketContext.Provider value={{ isConnected, socket, presenceStatus, emit, on, off }}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (context === undefined) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
};
