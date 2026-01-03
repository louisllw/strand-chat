import { useCallback, useEffect, useMemo, useState, useRef, KeyboardEvent } from 'react';
import { useChatConversations } from '@/contexts/useChatConversations';
import { useChatMessages } from '@/contexts/useChatMessages';
import { useSocket } from '@/contexts/useSocket';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import emojiMartData from '@emoji-mart/data';
import { Send, Paperclip, Image, Smile, Mic } from 'lucide-react';
import { apiFetch } from '@/lib/api';

interface MessageInputProps {
  className?: string;
}

export const MessageInput = ({ className }: MessageInputProps) => {
  const TYPING_TIMEOUT_MS = 1200;
  const [message, setMessage] = useState('');
  const { activeConversation } = useChatConversations();
  const { sendMessage, replyToMessage, setReplyToMessage } = useChatMessages();
  const { socket } = useSocket();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<number | null>(null);
  const emojiPickerRef = useRef<HTMLDivElement | null>(null);
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [emojiQuery, setEmojiQuery] = useState('');
  const [recentEmojis, setRecentEmojis] = useState<string[]>([]);
  const emojiScrollRef = useRef<HTMLDivElement | null>(null);
  const emojiSectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const containerRef = useRef<HTMLDivElement | null>(null);
  const closeEmojiPicker = useCallback(() => {
    setIsEmojiPickerOpen(false);
    setEmojiQuery('');
  }, []);

  const toggleEmojiPicker = useCallback(() => {
    setIsEmojiPickerOpen(prev => {
      const next = !prev;
      if (!next) {
        setEmojiQuery('');
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (!containerRef.current) return undefined;
    const element = containerRef.current;
    const updateHeightVar = () => {
      const height = element.offsetHeight;
      document.documentElement.style.setProperty('--chat-input-height', `${height}px`);
    };
    updateHeightVar();

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(updateHeightVar);
      observer.observe(element);
    }

    window.addEventListener('resize', updateHeightVar);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', updateHeightVar);
      document.documentElement.style.removeProperty('--chat-input-height');
    };
  }, []);

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        window.clearTimeout(typingTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isEmojiPickerOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target as Node)) {
        closeEmojiPicker();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [closeEmojiPicker, isEmojiPickerOpen]);

  useEffect(() => {
    if (!isEmojiPickerOpen) return;
    apiFetch<{ emojis: string[] }>('/api/users/me/emoji-recents')
      .then(data => setRecentEmojis(data.emojis))
      .catch((error) => {
        void error;
      });
  }, [isEmojiPickerOpen]);

  const addEmoji = (emoji: string) => {
    const textarea = textareaRef.current;
    if (!textarea) {
      setMessage(prev => prev + emoji);
    } else {
      const start = textarea.selectionStart || 0;
      const end = textarea.selectionEnd || 0;
      const nextValue = message.slice(0, start) + emoji + message.slice(end);
      setMessage(nextValue);
      requestAnimationFrame(() => {
        textarea.focus();
        const cursor = start + emoji.length;
        textarea.setSelectionRange(cursor, cursor);
      });
    }
    setRecentEmojis(prev => {
      const next = [emoji, ...prev.filter(item => item !== emoji)];
      return next.slice(0, 24);
    });
    apiFetch('/api/users/me/emoji-recents', {
      method: 'POST',
      body: JSON.stringify({ emoji }),
    }).catch((error) => {
      void error;
    });
  };

  const emojiData = emojiMartData as {
    categories: Array<{ id: string; name: string; emojis: string[] }>;
    emojis: Record<string, { id: string; name: string; keywords?: string[]; shortcodes?: string[] | string; skins?: Array<{ native: string }> }>;
  };

  const emojiIndex = useMemo(() => (
    Object.values(emojiData.emojis)
      .map(item => ({
        id: item.id,
        name: item.name,
        keywords: item.keywords || [],
        shortcodes: Array.isArray(item.shortcodes) ? item.shortcodes : item.shortcodes ? [item.shortcodes] : [],
        emoji: item.skins?.[0]?.native,
      }))
      .filter(item => item.emoji)
  ), [emojiData.emojis]);

  const emojiCategories = useMemo(() => (
    emojiData.categories
      .filter(category => category.id !== 'frequent')
      .map(category => ({
        id: category.id,
        label: category.name || category.id,
        emojis: category.emojis
          .map(id => emojiData.emojis[id]?.skins?.[0]?.native)
          .filter(Boolean) as string[],
      }))
  ), [emojiData.categories, emojiData.emojis]);

  const filteredEmojis = useMemo(() => {
    if (!emojiQuery) return [];
    const term = emojiQuery.toLowerCase().trim();

    const categoryMatch = emojiCategories.find(category =>
      (category.label || category.id).toLowerCase().includes(term)
    );
    if (categoryMatch) {
      return categoryMatch.emojis;
    }

    return emojiIndex
      .filter(item =>
        item.emoji?.includes(term)
        || item.name.toLowerCase().includes(term)
        || item.keywords.some(keyword => keyword.toLowerCase().includes(term))
        || item.shortcodes.some(code => code.toLowerCase().includes(term))
      )
      .map(item => item.emoji as string);
  }, [emojiCategories, emojiIndex, emojiQuery]);

  const isLeftConversation = Boolean(activeConversation?.leftAt);

  const handleSend = () => {
    if (message.trim() && !isLeftConversation) {
      sendMessage(message.trim());
      setMessage('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
      if (activeConversation && socket?.connected) {
        socket.emit('typing:stop', { conversationId: activeConversation.id });
      }
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (isLeftConversation) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (isLeftConversation) return;
    setMessage(e.target.value);
    // Auto-resize textarea
    const textarea = e.target;
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 150) + 'px';

    if (activeConversation && socket?.connected) {
      socket.emit('typing:start', { conversationId: activeConversation.id });
      if (typingTimeoutRef.current) {
        window.clearTimeout(typingTimeoutRef.current);
      }
      typingTimeoutRef.current = window.setTimeout(() => {
        socket.emit('typing:stop', { conversationId: activeConversation.id });
      }, TYPING_TIMEOUT_MS);
    }
  };

  const handleFileClick = () => {
    fileInputRef.current?.click();
  };

  if (!activeConversation) return null;

  return (
    <div
      ref={containerRef}
      className={cn(
        'absolute bottom-0 left-0 right-0 z-20 border-t border-border bg-card p-3 sm:p-4 pb-[calc(env(safe-area-inset-bottom)+6px)]',
        isLeftConversation && 'opacity-70',
        className
      )}
    >
      <div className="max-w-3xl mx-auto">
        {replyToMessage && (
          <div className="mb-3 flex items-center justify-between rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs">
            <div className="min-w-0">
              <p className="text-muted-foreground">Replying to</p>
              <p className="truncate">{replyToMessage.content}</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setReplyToMessage(null)}>
              Cancel
            </Button>
          </div>
        )}
        <div className="flex items-end gap-2">
          {/* Attachment buttons */}
          <div className="flex gap-1 pb-2">
            <Button variant="icon" size="iconSm" onClick={handleFileClick}>
              <Paperclip className="h-5 w-5" />
            </Button>
            <Button variant="icon" size="iconSm" className="hidden sm:inline-flex">
              <Image className="h-5 w-5" />
            </Button>
          </div>

          {/* Message input */}
          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              value={message}
              onChange={handleTextareaChange}
              onFocus={() => {
                window.dispatchEvent(new CustomEvent('chat:input-focus'));
              }}
              onKeyDown={handleKeyDown}
              placeholder={isLeftConversation ? 'You left this conversation.' : 'Type a message...'}
              rows={1}
              className="w-full resize-none rounded-xl border border-input bg-background px-3 sm:px-4 py-2.5 sm:py-3 pr-20 sm:pr-24 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 transition-all duration-200 max-h-36"
              disabled={isLeftConversation}
            />
            
            {/* Emoji and mic buttons inside input */}
            <div className="absolute right-2 bottom-2 flex items-center gap-1">
              <div className="relative" ref={emojiPickerRef}>
                <Button
                  variant="icon"
                  size="iconSm"
                  onClick={toggleEmojiPicker}
                  disabled={isLeftConversation}
                >
                  <Smile className="h-5 w-5" />
                </Button>
                {isEmojiPickerOpen && (
                  <div className="absolute bottom-11 right-0 z-20 w-72 sm:w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-background p-2 shadow-lg">
                    <input
                      type="text"
                      value={emojiQuery}
                      onChange={(e) => setEmojiQuery(e.target.value)}
                      placeholder="Search emoji..."
                      className="mb-2 w-full rounded-lg border border-input bg-background px-2 py-1 text-xs"
                    />
                    {!emojiQuery && (
                      <div className="mb-2 flex flex-wrap gap-1">
                        {recentEmojis.length > 0 && (
                          <button
                            type="button"
                            className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-muted"
                            onClick={() => {
                              const target = emojiSectionRefs.current.recent;
                              if (target && emojiScrollRef.current) {
                                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                              }
                            }}
                          >
                            Recent
                          </button>
                        )}
                        {emojiCategories.map(category => (
                          <button
                            key={category.id}
                            type="button"
                            className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-muted"
                            onClick={() => {
                              const target = emojiSectionRefs.current[category.id];
                              if (target && emojiScrollRef.current) {
                                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                              }
                            }}
                          >
                            {category.label}
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="max-h-56 overflow-y-auto pr-1" ref={emojiScrollRef}>
                      {emojiQuery ? (
                        <>
                          <div className="grid grid-cols-8 gap-1 text-lg">
                            {filteredEmojis.map(emoji => (
                              <button
                                key={emoji}
                                type="button"
                                className="h-8 w-8 rounded-lg hover:bg-muted"
                                onClick={() => addEmoji(emoji)}
                              >
                                {emoji}
                              </button>
                            ))}
                          </div>
                          {filteredEmojis.length === 0 && (
                            <p className="p-2 text-xs text-muted-foreground">No results</p>
                          )}
                        </>
                      ) : (
                        <div className="space-y-4">
                          {recentEmojis.length > 0 && (
                            <div ref={(node) => { emojiSectionRefs.current.recent = node; }}>
                              <p className="mb-2 text-xs font-medium text-muted-foreground">Recent</p>
                              <div className="grid grid-cols-8 gap-1 text-lg">
                                {recentEmojis.map(emoji => (
                                  <button
                                    key={emoji}
                                    type="button"
                                    className="h-8 w-8 rounded-lg hover:bg-muted"
                                    onClick={() => addEmoji(emoji)}
                                  >
                                    {emoji}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                          {emojiCategories.map(category => (
                            <div key={category.id} ref={(node) => { emojiSectionRefs.current[category.id] = node; }}>
                              <p className="mb-2 text-xs font-medium text-muted-foreground">{category.label}</p>
                              <div className="grid grid-cols-8 gap-1 text-lg">
                                {category.emojis.map(emoji => (
                                  <button
                                    key={emoji}
                                    type="button"
                                    className="h-8 w-8 rounded-lg hover:bg-muted"
                                    onClick={() => addEmoji(emoji)}
                                  >
                                    {emoji}
                                  </button>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
              <Button variant="icon" size="iconSm" className="hidden sm:inline-flex">
                <Mic className="h-5 w-5" />
              </Button>
            </div>
          </div>

          {/* Send button */}
          <Button
            onClick={handleSend}
            disabled={!message.trim() || isLeftConversation}
            className="rounded-xl h-10 w-10 sm:h-11 sm:w-11 p-0"
          >
            <Send className="h-5 w-5" />
          </Button>
        </div>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept="image/*,.pdf,.doc,.docx"
        />
      </div>
    </div>
  );
};
