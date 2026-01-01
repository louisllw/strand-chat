import { createContext } from 'react';
import { Socket } from 'socket.io-client';

export interface SocketContextType {
  isConnected: boolean;
  socket: Socket | null;
  presenceStatus: 'online' | 'away' | 'offline';
  emit: (event: string, data: unknown) => void;
  on: (event: string, callback: (data: unknown) => void) => void;
  off: (event: string, callback: (data: unknown) => void) => void;
}

export const SocketContext = createContext<SocketContextType | undefined>(undefined);
