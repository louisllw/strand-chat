import { createContext } from 'react';
import type { Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@/types/socket-events';

export type StrandSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export interface SocketContextType {
  isConnected: boolean;
  socket: StrandSocket | null;
  presenceStatus: 'online' | 'away' | 'offline';
  emit: <K extends keyof ClientToServerEvents>(
    event: K,
    ...args: Parameters<ClientToServerEvents[K]>
  ) => void;
  on: <K extends keyof ServerToClientEvents>(
    event: K,
    callback: ServerToClientEvents[K]
  ) => void;
  off: <K extends keyof ServerToClientEvents>(
    event: K,
    callback: ServerToClientEvents[K]
  ) => void;
}

export const SocketContext = createContext<SocketContextType | undefined>(undefined);
