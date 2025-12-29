import React from 'react';
import { Message } from '@/types';
import { cn } from '@/lib/utils';
import { Check, CheckCheck, Image as ImageIcon, File, SmilePlus } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface MessageBubbleProps {
  message: Message;
  isSent: boolean;
  showAvatar?: boolean;
  senderName?: string;
  onReply?: (message: Message) => void;
  onJumpToMessage?: (messageId: string) => void;
  isHighlighted?: boolean;
  onToggleReaction?: (messageId: string, emoji: string) => void;
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

export const MessageBubble = (props: MessageBubbleProps) => {
  const {
    message,
    isSent,
    showAvatar,
    senderName,
    onReply,
    onJumpToMessage,
    isHighlighted,
    onToggleReaction,
  } = props;
  const [isPickerOpen, setIsPickerOpen] = React.useState(false);
  const pickerRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!isPickerOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
        setIsPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
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
    >
      <div
        className={cn(
          'max-w-[75%] lg:max-w-[60%] rounded-2xl px-4 py-2.5 shadow-sm',
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

        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
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
                    className={cn(
                      'rounded-full border px-2 py-0.5 transition-colors',
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
          {onToggleReaction && (
            <div className="ml-auto">
              <div className="relative" ref={pickerRef}>
                <button
                  type="button"
                  className="rounded-full border border-transparent p-1 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:border-border hover:text-foreground"
                  onClick={(event) => {
                    event.stopPropagation();
                    setIsPickerOpen(prev => !prev);
                  }}
                  aria-label="Add reaction"
                >
                  <SmilePlus className="h-4 w-4" />
                </button>
                {isPickerOpen && (
                  <div className="absolute right-0 top-full mt-2 flex items-center gap-1 rounded-full border border-border bg-background px-2 py-1 shadow-md">
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
          )}
        </div>

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
      {onReply && (
        <button
          onClick={() => onReply(message)}
          className="self-center text-xs text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
        >
          Reply
        </button>
      )}
    </div>
  );
};
