import { useState, useRef, KeyboardEvent } from 'react';
import { useChat } from '@/contexts/ChatContext';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Send, Paperclip, Image, Smile, Mic } from 'lucide-react';

interface MessageInputProps {
  className?: string;
}

export const MessageInput = ({ className }: MessageInputProps) => {
  const [message, setMessage] = useState('');
  const { sendMessage, activeConversation } = useChat();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSend = () => {
    if (message.trim()) {
      sendMessage(message.trim());
      setMessage('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value);
    // Auto-resize textarea
    const textarea = e.target;
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 150) + 'px';
  };

  const handleFileClick = () => {
    fileInputRef.current?.click();
  };

  if (!activeConversation) return null;

  return (
    <div className={cn('border-t border-border bg-card p-4', className)}>
      <div className="max-w-3xl mx-auto">
        <div className="flex items-end gap-2">
          {/* Attachment buttons */}
          <div className="flex gap-1 pb-2">
            <Button variant="icon" size="iconSm" onClick={handleFileClick}>
              <Paperclip className="h-5 w-5" />
            </Button>
            <Button variant="icon" size="iconSm">
              <Image className="h-5 w-5" />
            </Button>
          </div>

          {/* Message input */}
          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              value={message}
              onChange={handleTextareaChange}
              onKeyDown={handleKeyDown}
              placeholder="Type a message..."
              rows={1}
              className="w-full resize-none rounded-xl border border-input bg-background px-4 py-3 pr-24 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 transition-all duration-200 max-h-36"
            />
            
            {/* Emoji and mic buttons inside input */}
            <div className="absolute right-2 bottom-2 flex items-center gap-1">
              <Button variant="icon" size="iconSm">
                <Smile className="h-5 w-5" />
              </Button>
              <Button variant="icon" size="iconSm">
                <Mic className="h-5 w-5" />
              </Button>
            </div>
          </div>

          {/* Send button */}
          <Button
            onClick={handleSend}
            disabled={!message.trim()}
            className="rounded-xl h-11 w-11 p-0"
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
