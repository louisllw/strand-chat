import React from 'react';
import { Message } from '@/types';
import { cn } from '@/lib/utils';
import { Check, CheckCheck, Image as ImageIcon, File, SmilePlus } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface MessageBubbleProps {
  message: Message;
  isSent: boolean;
  senderName?: string;
  onReply?: (message: Message) => void;
  onJumpToMessage?: (messageId: string) => void;
  isHighlighted?: boolean;
  onToggleReaction?: (messageId: string, emoji: string) => void;
  isSelected?: boolean;
  onSelect?: (messageId: string) => void;
}

const formatTime = (date: Date) => {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const highlightMentions = (text: string) => {
  const parts = text.split(/(@[a-z0-9._]+)/gi);
  return parts.map((part, index) => {
    if (/^@[a-z0-9._]+$/i.test(part)) {
      return (
        <span key={index} className="text-primary font-medium">
          {part}
        </span>
      );
    }
    return <span key={index}>{part}</span>;
  });
};

const MessageBubbleComponent = (props: MessageBubbleProps) => {
  const {
    message,
    isSent,
    senderName,
    onReply,
    onJumpToMessage,
    isHighlighted,
    onToggleReaction,
    isSelected,
    onSelect,
  } = props;
  const [isPickerOpen, setIsPickerOpen] = React.useState(false);
  const pickerRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!isPickerOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (pickerRef.current && pickerRef.current.contains(event.target as Node)) {
        return;
      }
      setIsPickerOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [isPickerOpen]);
  if (message.type === 'system') {
    return (
      <div className="flex justify-center">
        <div className="rounded-full bg-muted/70 px-3 py-1 text-xs text-muted-foreground">
          {highlightMentions(message.content)}
        </div>
      </div>
    );
  }
  return (
    <div
      className={cn(
        'flex gap-2 animate-slide-up group',
        isSent ? 'justify-end' : 'justify-start'
      )}
      onClick={() => onSelect?.(message.id)}
    >
      <div className="flex max-w-[75%] lg:max-w-[60%] flex-col">
        <div
          className={cn(
            'rounded-2xl px-4 py-2.5 shadow-sm',
            isHighlighted && 'ring-2 ring-primary/60',
            isSent
              ? 'bg-message-sent text-message-sent-foreground rounded-br-md'
              : 'bg-message-received text-message-received-foreground rounded-bl-md'
          )}
        >
        {message.replyTo && (
          <button
            type="button"
            onClick={() => onJumpToMessage?.(message.replyTo!.id)}
            className={cn(
              'mb-2 w-full rounded-lg border px-2 py-1 text-left text-xs transition-colors',
              isSent
                ? 'border-primary-foreground/30 bg-white/90 text-slate-900 hover:bg-white dark:bg-slate-200/90 dark:text-slate-900'
                : 'border-border bg-white/80 text-slate-900 hover:bg-white dark:bg-slate-200/90 dark:text-slate-900'
            )}
          >
            <p className="font-medium opacity-80">Replying to</p>
            <p className="truncate opacity-70">{message.replyTo.content}</p>
          </button>
        )}

        {/* Group chat: show sender name */}
        {!isSent && senderName && (
          <p className="text-xs font-medium mb-1 opacity-80">{senderName}</p>
        )}

        {/* Message content based on type */}
        {message.type === 'text' && (
          <p className="text-sm leading-relaxed break-words whitespace-pre-wrap">
            {highlightMentions(message.content)}
          </p>
        )}

        {message.type === 'image' && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 opacity-80">
              <ImageIcon className="h-4 w-4" />
              <span className="text-xs">Image</span>
            </div>
            {message.attachmentUrl && (
              <img
                src={message.attachmentUrl}
                alt="Attachment"
                className="rounded-lg max-w-full"
              />
            )}
          </div>
        )}

        {message.type === 'file' && (
          <div className="flex items-center gap-2">
            <File className="h-4 w-4" />
            <span className="text-sm">{message.content}</span>
          </div>
        )}

          {/* Timestamp and read status */}
          <div
            className={cn(
              'flex items-center gap-1 mt-1',
              isSent ? 'justify-end' : 'justify-start'
            )}
          >
            <span className="text-[10px] opacity-70">
              {formatTime(message.timestamp)}
            </span>
            {isSent && (
              <span className="opacity-70">
                {message.read ? (
                  <CheckCheck className="h-3.5 w-3.5" />
                ) : (
                  <Check className="h-3.5 w-3.5" />
                )}
              </span>
            )}
          </div>
        </div>

        {message.reactions?.length ? (
          <div
            className={cn(
              'mt-1 flex w-full items-center gap-2 text-xs max-w-full pb-1',
              isSent ? 'justify-end' : 'justify-start'
            )}
          >
            <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto">
              {message.reactions?.map((reaction) => {
                const names = reaction.usernames?.length
                  ? `@${reaction.usernames.join(', @')}`
                  : 'No reactions yet';
                return (
                  <Tooltip key={reaction.emoji}>
                    <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => onToggleReaction?.(message.id, reaction.emoji)}
                      onMouseDown={(event) => event.stopPropagation()}
                      onTouchStart={(event) => event.stopPropagation()}
                      className={cn(
                        'rounded-full border px-2 py-0.5 transition-colors flex-shrink-0',
                        reaction.reactedByMe
                          ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border'
                        )}
                      >
                        {reaction.emoji} {reaction.count}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      {names}
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          </div>
        ) : null}
        {onToggleReaction ? (
          <div
            className={cn(
              'mt-1 flex items-center gap-2 text-xs max-w-full',
              isSelected ? 'flex' : 'hidden',
              'sm:flex',
              isSent ? 'justify-end' : 'justify-start'
            )}
          >
            <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto">
              {!message.reactions?.length && (
                <span className="text-[11px] text-muted-foreground flex-shrink-0">
                  Add a reaction
                </span>
              )}
            </div>
            <div className="flex-shrink-0">
              <div className="relative" ref={pickerRef}>
                <button
                  type="button"
                  className="rounded-full border border-transparent p-1 text-muted-foreground opacity-100 transition-opacity hover:border-border hover:text-foreground"
                  onClick={(event) => {
                    event.stopPropagation();
                    setIsPickerOpen(prev => !prev);
                  }}
                  onMouseDown={(event) => event.stopPropagation()}
                  onTouchStart={(event) => event.stopPropagation()}
                  aria-label="Add reaction"
                >
                  <SmilePlus className="h-4 w-4" />
                </button>
                {isPickerOpen && (
                  <div className={cn(
                    'absolute flex items-center gap-1 rounded-full border border-border bg-background px-2 py-1 shadow-md max-w-[min(85vw,320px)] overflow-x-auto',
                    isSent ? 'right-0 bottom-full mb-2' : 'left-0 top-full mt-2'
                  )}>
                  <button
                    type="button"
                    onClick={() => onToggleReaction(message.id, '❤️')}
                    className="px-1.5 py-0.5 text-sm hover:scale-105"
                  >
                    ❤️
                  </button>
                  <button
                    type="button"
                    onClick={() => onToggleReaction(message.id, '👍')}
                    className="px-1.5 py-0.5 text-sm hover:scale-105"
                  >
                    👍
                  </button>
                  <button
                    type="button"
                    onClick={() => onToggleReaction(message.id, '😂')}
                    className="px-1.5 py-0.5 text-sm hover:scale-105"
                  >
                    😂
                  </button>
                  <button
                    type="button"
                    onClick={() => onToggleReaction(message.id, '🔥')}
                    className="px-1.5 py-0.5 text-sm hover:scale-105"
                  >
                    🔥
                  </button>
                  <button
                    type="button"
                    onClick={() => onToggleReaction(message.id, '😮')}
                    className="px-1.5 py-0.5 text-sm hover:scale-105"
                  >
                    😮
                  </button>
                  <button
                    type="button"
                    onClick={() => onToggleReaction(message.id, '😢')}
                    className="px-1.5 py-0.5 text-sm hover:scale-105"
                  >
                    😢
                  </button>
                </div>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </div>
      {onReply && (
        <button
          onClick={(event) => {
            event.stopPropagation();
            onReply(message);
          }}
          className={cn(
            'self-center text-xs text-muted-foreground transition-opacity',
            isSelected ? 'opacity-100' : 'opacity-0',
            'sm:opacity-0 sm:group-hover:opacity-100',
            isSent && 'order-first sm:order-none'
          )}
        >
          Reply
        </button>
      )}
    </div>
  );
};

const areMessageReactionsEqual = (prev?: MessageReaction[], next?: MessageReaction[]) => {
  if (prev === next) return true;
  if (!prev || !next) return false;
  if (prev.length !== next.length) return false;
  return prev.every((reaction, index) => {
    const other = next[index];
    if (!other) return false;
    if (
      reaction.emoji !== other.emoji
      || reaction.count !== other.count
      || reaction.reactedByMe !== other.reactedByMe
    ) {
      return false;
    }
    const prevNames = reaction.usernames;
    const nextNames = other.usernames;
    if (!prevNames && !nextNames) return true;
    if (!prevNames || !nextNames) return false;
    if (prevNames.length !== nextNames.length) return false;
    return prevNames.every((name, nameIndex) => name === nextNames[nameIndex]);
  });
};

const areMessagesEqual = (prev: Message, next: Message) => {
  if (prev === next) return true;
  if (prev.id !== next.id) return false;
  if (prev.read !== next.read) return false;
  if (prev.type !== next.type) return false;
  if (prev.content !== next.content) return false;
  if (prev.attachmentUrl !== next.attachmentUrl) return false;
  if (prev.timestamp.getTime() !== next.timestamp.getTime()) return false;
  const prevReply = prev.replyTo;
  const nextReply = next.replyTo;
  if (!prevReply && !nextReply) {
    return areMessageReactionsEqual(prev.reactions, next.reactions);
  }
  if (!prevReply || !nextReply) return false;
  if (
    prevReply.id !== nextReply.id
    || prevReply.content !== nextReply.content
    || prevReply.senderId !== nextReply.senderId
  ) {
    return false;
  }
  return areMessageReactionsEqual(prev.reactions, next.reactions);
};

export const MessageBubble = React.memo(
  MessageBubbleComponent,
  (prev, next) => (
    prev.isSent === next.isSent
    && prev.senderName === next.senderName
    && prev.isHighlighted === next.isHighlighted
    && prev.isSelected === next.isSelected
    && areMessagesEqual(prev.message, next.message)
  )
);
