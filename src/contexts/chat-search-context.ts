import { createContext } from 'react';

export interface ChatSearchContextType {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
}

export const ChatSearchContext = createContext<ChatSearchContextType | undefined>(undefined);
