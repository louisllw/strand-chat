import { useState } from 'react';
import { ChatSidebar } from '@/components/chat/ChatSidebar';
import { ChatHeader } from '@/components/chat/ChatHeader';
import { MessageList } from '@/components/chat/MessageList';
import { MessageInput } from '@/components/chat/MessageInput';
import { EmptyState } from '@/components/chat/EmptyState';
import { useChat } from '@/contexts/ChatContext';

const Chat = () => {
  const { activeConversation } = useChat();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    <div className="h-screen flex bg-background">
      {/* Sidebar */}
      <ChatSidebar 
        isMobileOpen={isSidebarOpen}
        onMobileClose={() => setIsSidebarOpen(false)}
      />

      {/* Main Chat Area */}
      <main className="flex-1 flex flex-col min-w-0">
        {activeConversation ? (
          <>
            <ChatHeader onMobileMenuClick={() => setIsSidebarOpen(true)} />
            <MessageList className="flex-1" />
            <MessageInput />
          </>
        ) : (
          <EmptyState onMobileMenuClick={() => setIsSidebarOpen(true)} />
        )}
      </main>
    </div>
  );
};

export default Chat;
