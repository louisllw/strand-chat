import React, { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { getSocketUrl } from '@/lib/api';
import { SocketContext } from '@/contexts/socket-context';

const socket = io(getSocketUrl(), {
  withCredentials: true,
  autoConnect: false,
});

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isConnected, setIsConnected] = useState(false);
  const [presenceStatus, setPresenceStatus] = useState<'online' | 'away' | 'offline'>('offline');
  const idleTimeoutMs = 30 * 1000;

  useEffect(() => {
    const handleConnect = () => {
      setIsConnected(true);
      setPresenceStatus('online');
      socket.emit('presence:active');
    };
    const handleDisconnect = () => {
      setIsConnected(false);
      setPresenceStatus('offline');
    };
    const handleConnectError = (error: Error) => {
      if (import.meta.env.DEV) {
        console.error('[socket] connect_error', error.message);
      }
    };
    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect_error', handleConnectError);
    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('connect_error', handleConnectError);
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!socket || !isConnected) return;
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
  }, [idleTimeoutMs, isConnected]);

  const emit = (event: string, data: unknown) => {
    socket.emit(event, data);
  };

  const on = (event: string, callback: (data: unknown) => void) => {
    socket.on(event, callback);
  };

  const off = (event: string, callback: (data: unknown) => void) => {
    socket.off(event, callback);
  };

  return (
    <SocketContext.Provider value={{ isConnected, socket, presenceStatus, emit, on, off }}>
      {children}
    </SocketContext.Provider>
  );
};
