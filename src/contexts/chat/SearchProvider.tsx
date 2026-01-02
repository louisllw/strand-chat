import React, { useMemo, useState } from 'react';
import { ChatSearchContext } from '@/contexts/chat-search-context';

export const ChatSearchProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const value = useMemo(() => ({ searchQuery, setSearchQuery }), [searchQuery]);

  return (
    <ChatSearchContext.Provider value={value}>
      {children}
    </ChatSearchContext.Provider>
  );
};
