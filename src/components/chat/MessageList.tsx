import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useChatConversations } from '@/contexts/useChatConversations';
import { useChatMessages } from '@/contexts/useChatMessages';
import { useChatTyping } from '@/contexts/useChatTyping';
import { useAuth } from '@/contexts/useAuth';
import { MessageBubble } from './MessageBubble';
import { TypingIndicator } from './TypingIndicator';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useKeyboardInset } from '@/hooks/useKeyboardInset';
import { fetchImageToCache, getCachedImageUrl } from '@/lib/image-cache';

interface MessageListProps {
  className?: string;
}

export const MessageList = ({ className }: MessageListProps) => {
  const SCROLL_THRESHOLD_PX = 80;
  const { activeConversation } = useChatConversations();
  const {
    messages,
    replyToMessage,
    setReplyToMessage,
    toggleReaction,
    loadOlderMessages,
    hasMoreMessages,
    isLoadingOlder,
  } = useChatMessages();
  const { typingIndicators } = useChatTyping();
  const { user } = useAuth();
  const containerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [highlightMessageId, setHighlightMessageId] = useState<string | null>(null);
  const [selectionState, setSelectionState] = useState<{
    conversationId: string | null;
    messageId: string | null;
  }>({ conversationId: null, messageId: null });
  const [lastSeenState, setLastSeenState] = useState<{
    conversationId: string | null;
    messageId: string | null;
  }>({ conversationId: null, messageId: null });
  const [isAtBottom, setIsAtBottom] = useState(true);
  const isAtBottomRef = useRef(true);
  const isPrependingRef = useRef(false);
  const isAutoScrollingRef = useRef(false);
  const forceScrollRef = useRef(false);
  const lastMessageIdRef = useRef<string | null>(null);
  const lastViewportHeightRef = useRef<number | null>(null);
  const keyboardInset = useKeyboardInset();
  const conversationId = activeConversation?.id ?? null;
  const activeTyping = typingIndicators.filter(
    t => t.conversationId === activeConversation?.id
  );
  const preloadObserverRef = useRef<IntersectionObserver | null>(null);
  const currentUserId = user?.id;

  const getInputHeight = () => {
    if (typeof window === 'undefined') return 0;
    const raw = window.getComputedStyle(document.documentElement)
      .getPropertyValue('--chat-input-height')
      .trim();
    const value = parseFloat(raw);
    return Number.isFinite(value) ? value : 0;
  };

  const loadOlder = useCallback(async () => {
    if (!containerRef.current || isLoadingOlder || !hasMoreMessages) return;
    const container = containerRef.current;
    const prevScrollHeight = container.scrollHeight;
    const prevScrollTop = container.scrollTop;
    isPrependingRef.current = true;
    const loaded = await loadOlderMessages();
    if (loaded > 0) {
      requestAnimationFrame(() => {
        if (!containerRef.current) return;
        const nextScrollHeight = containerRef.current.scrollHeight;
        const nextTop = prevScrollTop + (nextScrollHeight - prevScrollHeight);
        const maxTop = Math.max(0, nextScrollHeight - containerRef.current.clientHeight);
        containerRef.current.scrollTop = Math.min(nextTop, maxTop);
      });
    }
    isPrependingRef.current = false;
  }, [hasMoreMessages, isLoadingOlder, loadOlderMessages]);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  }, []);

  const handleImageLoad = useCallback(() => {
    if (!isAtBottomRef.current) return;
    requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' });
    });
  }, []);

  const updateScrollState = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (el.scrollTop < 120 && !isAutoScrollingRef.current) {
      loadOlder();
    }
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const nextIsAtBottom = distanceFromBottom < SCROLL_THRESHOLD_PX;
    const wasAtBottom = isAtBottomRef.current;
    isAtBottomRef.current = nextIsAtBottom;
    setIsAtBottom(nextIsAtBottom);
    const latestMessageId = messages[messages.length - 1]?.id ?? null;
    if (nextIsAtBottom || wasAtBottom) {
      setLastSeenState({ conversationId, messageId: latestMessageId });
    }
  }, [conversationId, loadOlder, messages, SCROLL_THRESHOLD_PX]);

  const jumpToMessage = (messageId: string) => {
    const target = messageRefs.current[messageId];
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightMessageId(messageId);
      window.setTimeout(() => setHighlightMessageId(null), 1600);
    }
  };

  useEffect(() => {
    const latestMessage = messages[messages.length - 1];
    const latestMessageId = latestMessage?.id ?? null;
    const isNewMessage = Boolean(latestMessageId && latestMessageId !== lastMessageIdRef.current);
    const shouldStick = forceScrollRef.current
      || isAtBottomRef.current
      || (isNewMessage && latestMessage?.senderId === currentUserId);

    if (shouldStick) {
      isAtBottomRef.current = true;
      isAutoScrollingRef.current = true;
      const behavior: ScrollBehavior = forceScrollRef.current ? 'smooth' : 'auto';
      queueMicrotask(() => setIsAtBottom(true));
      requestAnimationFrame(() => {
        scrollToBottom(behavior);
        requestAnimationFrame(() => {
          forceScrollRef.current = false;
          isAutoScrollingRef.current = false;
        });
      });
    }

    lastMessageIdRef.current = latestMessageId;
  }, [currentUserId, messages, scrollToBottom]);

  useEffect(() => {
    if (!isAtBottomRef.current) return;
    if (activeTyping.length === 0) return;
    isAutoScrollingRef.current = true;
    requestAnimationFrame(() => {
      scrollToBottom('auto');
      requestAnimationFrame(() => {
        isAutoScrollingRef.current = false;
      });
    });
  }, [activeTyping.length, scrollToBottom]);

  useEffect(() => {
    const handleInputFocus = () => {
      const container = containerRef.current;
      if (!container || !messagesEndRef.current) return;
      const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
      const shouldStick = replyToMessage !== null || distanceFromBottom < 160 || isAtBottomRef.current;

      if (shouldStick) {
        isAtBottomRef.current = true;
        // Delay scroll to allow keyboard animation to complete
        setTimeout(() => {
          requestAnimationFrame(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
          });
        }, 150);
      }
    };

    const handleKeyboardOpen = () => {
      const container = containerRef.current;
      if (!container || !messagesEndRef.current) return;
      const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
      const shouldStick = replyToMessage !== null || distanceFromBottom < 160 || isAtBottomRef.current;

      if (shouldStick) {
        isAtBottomRef.current = true;
        // Scroll to bottom when keyboard opens to ensure messages are visible
        setTimeout(() => {
          requestAnimationFrame(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
          });
        }, 100);
      }
    };

    const handleKeyboardClose = () => {
      // Ensure proper scroll position when keyboard closes
      setTimeout(() => {
        requestAnimationFrame(() => {
          if (isAtBottomRef.current && messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'auto', block: 'end' });
          }
        });
      }, 100);
    };

    window.addEventListener('chat:input-focus', handleInputFocus);
    window.addEventListener('chat:keyboard-open', handleKeyboardOpen);
    window.addEventListener('chat:keyboard-close', handleKeyboardClose);
    return () => {
      window.removeEventListener('chat:input-focus', handleInputFocus);
      window.removeEventListener('chat:keyboard-open', handleKeyboardOpen);
      window.removeEventListener('chat:keyboard-close', handleKeyboardClose);
    };
  }, [replyToMessage]);

  useEffect(() => {
    const handleScrollToBottom = (event: Event) => {
      const detail = (event as CustomEvent<{ conversationId?: string }>).detail;
      if (detail?.conversationId && detail.conversationId !== conversationId) return;
      forceScrollRef.current = true;
      isAtBottomRef.current = true;
      setIsAtBottom(true);
      requestAnimationFrame(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
      });
    };
    window.addEventListener('chat:scroll-bottom', handleScrollToBottom);
    return () => {
      window.removeEventListener('chat:scroll-bottom', handleScrollToBottom);
    };
  }, [conversationId]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !messagesEndRef.current) return;

    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    const inputHeight = getInputHeight();
    const threshold = Math.max(160, inputHeight + 40);
    const shouldStick = replyToMessage !== null || distanceFromBottom < threshold || isAtBottomRef.current;

    if (keyboardInset > 0 && shouldStick) {
      requestAnimationFrame(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' });
      });
    }
  }, [keyboardInset, replyToMessage]);

  useEffect(() => {
    const visualViewport = window.visualViewport;
    if (!visualViewport) return undefined;

    const updateViewport = () => {
      const prevHeight = lastViewportHeightRef.current;
      const nextHeight = visualViewport.height;
      lastViewportHeightRef.current = nextHeight;

      if (prevHeight && nextHeight < prevHeight && messagesEndRef.current) {
        isAtBottomRef.current = true;
        requestAnimationFrame(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' });
        });
      }
    };

    updateViewport();
    visualViewport.addEventListener('resize', updateViewport);
    return () => visualViewport.removeEventListener('resize', updateViewport);
  }, []);

  const observePreloadTargets = useCallback(() => {
    const container = containerRef.current;
    const observer = preloadObserverRef.current;
    if (!container || !observer) return;
    container.querySelectorAll('[data-preload-image="true"]').forEach((node) => {
      observer.observe(node);
    });
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof IntersectionObserver === 'undefined') return;
    preloadObserverRef.current?.disconnect();
    preloadObserverRef.current = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const target = entry.target as HTMLElement;
        const messageId = target.dataset.messageId || '';
        const attachmentUrl = target.dataset.attachmentUrl || '';
        const thumbnailUrl = target.dataset.thumbnailUrl || '';
        if (messageId && attachmentUrl) {
          const cacheKey = `${messageId}:${attachmentUrl}`;
          if (!getCachedImageUrl(cacheKey)) {
            fetchImageToCache(cacheKey, `/api/uploads/messages/${messageId}`).catch(() => undefined);
          }
        }
        if (messageId && thumbnailUrl) {
          const cacheKey = `thumb:${messageId}:${thumbnailUrl}`;
          if (!getCachedImageUrl(cacheKey)) {
            fetchImageToCache(cacheKey, `/api/uploads/messages/${messageId}/thumbnail`).catch(() => undefined);
          }
        }
        preloadObserverRef.current?.unobserve(entry.target);
      });
    }, {
      root: container,
      rootMargin: '400px 0px',
      threshold: 0.1,
    });
    observePreloadTargets();
    return () => {
      preloadObserverRef.current?.disconnect();
      preloadObserverRef.current = null;
    };
  }, [conversationId, observePreloadTargets]);

  useEffect(() => {
    observePreloadTargets();
  }, [messages, observePreloadTargets]);

  const selectedMessageId = selectionState.conversationId === conversationId
    ? selectionState.messageId
    : null;
  const lastSeenMessageId = lastSeenState.conversationId === conversationId
    ? lastSeenState.messageId
    : null;
  const latestMessageId = messages[messages.length - 1]?.id ?? null;
  const effectiveLastSeenMessageId = isAtBottom ? latestMessageId : lastSeenMessageId;
  const unseenCount = useMemo(() => {
    if (!effectiveLastSeenMessageId) return 0;
    const index = messages.findIndex(message => message.id === effectiveLastSeenMessageId);
    if (index === -1) return 0;
    return Math.max(0, messages.length - index - 1);
  }, [effectiveLastSeenMessageId, messages]);
  const showNewMessageIndicator = unseenCount > 0 && !isAtBottom;

  // Group messages by date
  const groupedMessages = useMemo(() => (
    messages.reduce((groups, message) => {
      const dateKey = message.timestamp.toDateString();
      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      groups[dateKey].push(message);
      return groups;
    }, {} as Record<string, typeof messages>)
  ), [messages]);

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

  return (
    <div
      className={cn('relative flex-1 min-h-0', className)}
    >
      <div
        ref={containerRef}
        data-message-list
        onScroll={updateScrollState}
        className="h-full overflow-y-auto overscroll-contain p-3 sm:p-4 pb-28 sm:pb-28"
        style={{
          WebkitOverflowScrolling: 'touch',
          touchAction: 'pan-y',
          height: 'calc(100% - var(--chat-input-height, 0px))',
          paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)',
          transition: 'height 0.2s ease-out, padding-bottom 0.2s ease-out',
        }}
      >
        <div className="max-w-3xl mx-auto space-y-4 sm:space-y-6">
        {hasMoreMessages && (
          <div className="flex justify-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={loadOlder}
              disabled={isLoadingOlder}
            >
              {isLoadingOlder ? 'Loading...' : 'Load earlier messages'}
            </Button>
          </div>
        )}
        {Object.entries(groupedMessages).map(([dateKey, msgs]) => (
          <div key={dateKey} className="space-y-3">
            {/* Date separator */}
            <div className="flex items-center justify-center">
              <span className="px-3 py-1 text-xs font-medium text-muted-foreground bg-muted rounded-full">
                {formatDateHeader(dateKey)}
              </span>
            </div>

            {/* Messages */}
            {msgs.map((message) => {
              const isSent = currentUserId ? message.senderId === currentUserId : false;
              const isGroupChat = activeConversation?.type === 'group';
              const sender = activeConversation?.participants.find(
                p => p.id === message.senderId
              );
              const senderName = message.senderUsername
                ? `@${message.senderUsername}`
                : sender?.username
                ? `@${sender.username}`
                : undefined;

              return (
                <div
                  key={message.id}
                  ref={(node) => {
                    messageRefs.current[message.id] = node;
                  }}
                >
                  {message.type === 'image' && message.attachmentUrl && (
                    <div
                      data-preload-image="true"
                      data-message-id={message.id}
                      data-attachment-url={message.attachmentUrl}
                      data-thumbnail-url={message.attachmentMeta?.thumbnailUrl || ''}
                      className="h-0 w-0 overflow-hidden"
                    />
                  )}
                  <MessageBubble
                    message={message}
                    isSent={isSent}
                    senderName={isGroupChat && !isSent ? senderName : undefined}
                    onReply={setReplyToMessage}
                    onJumpToMessage={jumpToMessage}
                    isHighlighted={highlightMessageId === message.id}
                    onToggleReaction={toggleReaction}
                    isSelected={selectedMessageId === message.id}
                    onSelect={(messageId) => {
                      setSelectionState(prev => {
                        const isSameConversation = prev.conversationId === conversationId;
                        const nextId = isSameConversation && prev.messageId === messageId ? null : messageId;
                        return { conversationId, messageId: nextId };
                      });
                    }}
                    onImageLoad={handleImageLoad}
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
          <Button onClick={() => scrollToBottom('smooth')} size="sm" className="pointer-events-auto shadow-md">
            {unseenCount > 0 ? `${unseenCount} new message${unseenCount === 1 ? '' : 's'} · Back to chat` : 'Back to chat'}
          </Button>
        </div>
      )}
    </div>
  );
};
