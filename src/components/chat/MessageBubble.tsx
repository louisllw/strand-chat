import { Message } from '@/types';
import { cn } from '@/lib/utils';
import { Check, CheckCheck, Image as ImageIcon, File } from 'lucide-react';

interface MessageBubbleProps {
  message: Message;
  isSent: boolean;
  showAvatar?: boolean;
  senderName?: string;
}

const formatTime = (date: Date) => {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

export const MessageBubble = ({ message, isSent, showAvatar, senderName }: MessageBubbleProps) => {
  return (
    <div
      className={cn(
        'flex gap-2 animate-slide-up',
        isSent ? 'justify-end' : 'justify-start'
      )}
    >
      <div
        className={cn(
          'max-w-[75%] lg:max-w-[60%] rounded-2xl px-4 py-2.5 shadow-sm',
          isSent
            ? 'bg-message-sent text-message-sent-foreground rounded-br-md'
            : 'bg-message-received text-message-received-foreground rounded-bl-md'
        )}
      >
        {/* Group chat: show sender name */}
        {!isSent && senderName && (
          <p className="text-xs font-medium mb-1 opacity-80">{senderName}</p>
        )}

        {/* Message content based on type */}
        {message.type === 'text' && (
          <p className="text-sm leading-relaxed break-words whitespace-pre-wrap">
            {message.content}
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
    </div>
  );
};
