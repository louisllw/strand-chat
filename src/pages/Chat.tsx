import { useEffect, useState } from 'react';
import { ChatSidebar } from '@/components/chat/ChatSidebar';
import { ChatHeader } from '@/components/chat/ChatHeader';
import { MessageList } from '@/components/chat/MessageList';
import { MessageInput } from '@/components/chat/MessageInput';
import { EmptyState } from '@/components/chat/EmptyState';
import { useChatConversations } from '@/contexts/useChatConversations';

const Chat = () => {
  const { activeConversation, conversations, setActiveConversation } = useChatConversations();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [pendingConversationId, setPendingConversationId] = useState<string | null>(null);

  useEffect(() => {
    // Lock both html and body to prevent any scrolling
    document.documentElement.classList.add('chat-locked');
    document.body.classList.add('chat-locked');

    // Store current scroll position and lock it
    const scrollY = window.scrollY;
    document.body.style.top = `-${scrollY}px`;

    // Prevent any scroll events on window/document
    const preventScroll = (e: Event) => {
      // Allow scrolling only within approved chat scroll containers
      const target = e.target;
      const element = target instanceof Element ? target : null;
      const isAllowedScroll = element?.closest('[data-message-list], [data-chat-scroll]');

      if (!isAllowedScroll && e.cancelable) {
        e.preventDefault();
      }
    };

    // Prevent touchmove on document unless it's in message list
    const preventTouchMove = (e: TouchEvent) => {
      const target = e.target;
      const element = target instanceof Element ? target : null;
      const isAllowedScroll = element?.closest('[data-message-list], [data-chat-scroll]');

      if (!isAllowedScroll && e.cancelable) {
        e.preventDefault();
      }
    };

    document.addEventListener('scroll', preventScroll, { passive: false });
    document.addEventListener('touchmove', preventTouchMove, { passive: false });
    window.addEventListener('scroll', preventScroll, { passive: false });

    return () => {
      document.documentElement.classList.remove('chat-locked');
      document.body.classList.remove('chat-locked');
      document.body.style.top = '';
      document.documentElement.style.removeProperty('--chat-vvh');
      window.scrollTo(0, scrollY);

      document.removeEventListener('scroll', preventScroll);
      document.removeEventListener('touchmove', preventTouchMove);
      window.removeEventListener('scroll', preventScroll);
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const conversationId = params.get('conversationId');
    if (conversationId) {
      setPendingConversationId(conversationId);
    }
  }, []);

  useEffect(() => {
    if (!pendingConversationId) return;
    const match = conversations.find(conversation => (
      conversation.id === pendingConversationId && !conversation.leftAt
    ));
    if (!match) return;
    if (activeConversation?.id !== match.id) {
      setActiveConversation(match);
    }
    setPendingConversationId(null);
  }, [pendingConversationId, conversations, activeConversation, setActiveConversation]);

  useEffect(() => {
    const visualViewport = window.visualViewport;
    if (!visualViewport) {
      document.documentElement.style.setProperty('--chat-vvh', `${window.innerHeight}px`);
      return undefined;
    }

    const updateViewportHeight = () => {
      document.documentElement.style.setProperty('--chat-vvh', `${visualViewport.height}px`);
      window.scrollTo(0, 0);
    };

    updateViewportHeight();
    visualViewport.addEventListener('resize', updateViewportHeight);
    visualViewport.addEventListener('scroll', updateViewportHeight);

    return () => {
      visualViewport.removeEventListener('resize', updateViewportHeight);
      visualViewport.removeEventListener('scroll', updateViewportHeight);
    };
  }, []);

  return (
    <div className="fixed left-0 top-0 w-full h-[var(--chat-vvh,100svh)] flex bg-background overflow-hidden overscroll-contain">
      {/* Sidebar */}
      <ChatSidebar 
        isMobileOpen={isSidebarOpen}
        onMobileClose={() => setIsSidebarOpen(false)}
      />

      {/* Main Chat Area */}
      <main className="relative flex-1 flex flex-col min-w-0">
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
