import { cn } from '@/lib/utils';

interface TypingIndicatorProps {
  username: string;
  className?: string;
}

export const TypingIndicator = ({ username, className }: TypingIndicatorProps) => {
  return (
    <div className={cn('flex items-center gap-2 text-sm text-muted-foreground', className)}>
      <span>{username} is typing</span>
      <div className="flex gap-1">
        <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-typing" style={{ animationDelay: '0ms' }} />
        <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-typing" style={{ animationDelay: '150ms' }} />
        <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-typing" style={{ animationDelay: '300ms' }} />
      </div>
    </div>
  );
};
