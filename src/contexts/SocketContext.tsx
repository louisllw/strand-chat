import React, { createContext, useContext, useEffect, useState } from 'react';

// Placeholder for Socket.io integration
// Replace with actual socket.io-client implementation when backend is ready

interface SocketContextType {
  isConnected: boolean;
  emit: (event: string, data: unknown) => void;
  on: (event: string, callback: (data: unknown) => void) => void;
  off: (event: string) => void;
}

const SocketContext = createContext<SocketContextType | undefined>(undefined);

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // Simulate connection
    // Replace with actual Socket.io connection:
    // const socket = io('your-backend-url', {
    //   auth: { token: localStorage.getItem('auth_token') }
    // });
    
    const connectionTimer = setTimeout(() => {
      setIsConnected(true);
      console.log('[Socket] Connected (mock)');
    }, 1000);

    return () => {
      clearTimeout(connectionTimer);
      setIsConnected(false);
      console.log('[Socket] Disconnected');
    };
  }, []);

  const emit = (event: string, data: unknown) => {
    console.log('[Socket] Emit:', event, data);
    // socket.emit(event, data);
  };

  const on = (event: string, callback: (data: unknown) => void) => {
    console.log('[Socket] Listening to:', event);
    // socket.on(event, callback);
  };

  const off = (event: string) => {
    console.log('[Socket] Stopped listening to:', event);
    // socket.off(event);
  };

  return (
    <SocketContext.Provider value={{ isConnected, emit, on, off }}>
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
