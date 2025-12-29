import { useEffect, useRef, useState } from 'react';
import { useChat } from '@/contexts/ChatContext';
import { useAuth } from '@/contexts/AuthContext';
import { MessageBubble } from './MessageBubble';
import { TypingIndicator } from './TypingIndicator';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface MessageListProps {
  className?: string;
}

export const MessageList = ({ className }: MessageListProps) => {
  const { messages, typingIndicators, activeConversation, setReplyToMessage, toggleReaction } = useChat();
  const { user } = useAuth();
  const containerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [highlightMessageId, setHighlightMessageId] = useState<string | null>(null);
  const [showNewMessageIndicator, setShowNewMessageIndicator] = useState(false);
  const [unseenCount, setUnseenCount] = useState(0);
  const isAtBottomRef = useRef(true);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const updateScrollState = () => {
    const el = containerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const isAtBottom = distanceFromBottom < 80;
    isAtBottomRef.current = isAtBottom;
    if (isAtBottom) {
      setShowNewMessageIndicator(false);
      setUnseenCount(0);
    }
  };

  const jumpToMessage = (messageId: string) => {
    const target = messageRefs.current[messageId];
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightMessageId(messageId);
      window.setTimeout(() => setHighlightMessageId(null), 1600);
    }
  };

  useEffect(() => {
    if (isAtBottomRef.current) {
      scrollToBottom();
    } else {
      setShowNewMessageIndicator(true);
      setUnseenCount(prev => prev + 1);
    }
  }, [messages]);

  useEffect(() => {
    updateScrollState();
  }, [typingIndicators]);

  const currentUserId = user?.id;

  // Group messages by date
  const groupedMessages = messages.reduce((groups, message) => {
    const dateKey = message.timestamp.toDateString();
    if (!groups[dateKey]) {
      groups[dateKey] = [];
    }
    groups[dateKey].push(message);
    return groups;
  }, {} as Record<string, typeof messages>);

  const formatDateHeader = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
      });
    }
  };

  const activeTyping = typingIndicators.filter(
    t => t.conversationId === activeConversation?.id
  );

  return (
    <div className={cn('relative flex-1 min-h-0', className)}>
      <div
        ref={containerRef}
        onScroll={updateScrollState}
        className="h-full overflow-y-auto p-4"
      >
        <div className="max-w-3xl mx-auto space-y-6">
        {Object.entries(groupedMessages).map(([dateKey, msgs]) => (
          <div key={dateKey} className="space-y-3">
            {/* Date separator */}
            <div className="flex items-center justify-center">
              <span className="px-3 py-1 text-xs font-medium text-muted-foreground bg-muted rounded-full">
                {formatDateHeader(dateKey)}
              </span>
            </div>

            {/* Messages */}
            {msgs.map((message, index) => {
              const isSent = currentUserId ? message.senderId === currentUserId : false;
              const isGroupChat = activeConversation?.type === 'group';
              const sender = activeConversation?.participants.find(
                p => p.id === message.senderId
              );
              const senderName = sender?.username ? `@${sender.username}` : undefined;

              return (
                <div
                  key={message.id}
                  ref={(node) => {
                    messageRefs.current[message.id] = node;
                  }}
                >
                  <MessageBubble
                    message={message}
                    isSent={isSent}
                    senderName={isGroupChat && !isSent ? senderName : undefined}
                    onReply={setReplyToMessage}
                    onJumpToMessage={jumpToMessage}
                    isHighlighted={highlightMessageId === message.id}
                    onToggleReaction={toggleReaction}
                  />
                </div>
              );
            })}
          </div>
        ))}

        {/* Typing indicator */}
        {activeTyping.length > 0 && (
          <div className="flex justify-start">
            <div className="bg-message-received rounded-2xl rounded-bl-md px-4 py-2.5">
              <TypingIndicator username={activeTyping[0].username} />
            </div>
          </div>
        )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {showNewMessageIndicator && (
        <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2">
          <Button onClick={scrollToBottom} size="sm" className="pointer-events-auto shadow-md">
            {unseenCount > 0 ? `${unseenCount} new message${unseenCount === 1 ? '' : 's'} · Back to chat` : 'Back to chat'}
          </Button>
        </div>
      )}
    </div>
  );
};
