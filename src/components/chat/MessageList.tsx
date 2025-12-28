import { useEffect, useRef } from 'react';
import { useChat } from '@/contexts/ChatContext';
import { MessageBubble } from './MessageBubble';
import { TypingIndicator } from './TypingIndicator';
import { cn } from '@/lib/utils';

interface MessageListProps {
  className?: string;
}

export const MessageList = ({ className }: MessageListProps) => {
  const { messages, typingIndicators, activeConversation } = useChat();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, typingIndicators]);

  const currentUserId = '1'; // Replace with actual user ID from auth

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
    <div className={cn('flex-1 overflow-y-auto p-4', className)}>
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
              const isSent = message.senderId === currentUserId;
              const isGroupChat = activeConversation?.type === 'group';
              const sender = activeConversation?.participants.find(
                p => p.id === message.senderId
              );

              return (
                <MessageBubble
                  key={message.id}
                  message={message}
                  isSent={isSent}
                  senderName={isGroupChat && !isSent ? sender?.username : undefined}
                />
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
  );
};
