import { Conversation } from '@/types';
import { UserAvatar } from './UserAvatar';
import { cn } from '@/lib/utils';
import { Users } from 'lucide-react';
import { getDirectParticipant } from './utils';

interface ConversationItemProps {
  conversation: Conversation;
  isActive: boolean;
  onClick: () => void;
  currentUserId?: string;
}

const formatTime = (date: Date) => {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } else if (days === 1) {
    return 'Yesterday';
  } else if (days < 7) {
    return date.toLocaleDateString([], { weekday: 'short' });
  } else {
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }
};

export const ConversationItem = ({
  conversation,
  isActive,
  onClick,
  currentUserId,
}: ConversationItemProps) => {
  const directParticipant = conversation.type === 'direct'
    ? getDirectParticipant(conversation.participants, currentUserId)
    : null;
  const displayName = conversation.type === 'group'
    ? conversation.name
    : directParticipant?.username
    ? `@${directParticipant.username}`
    : undefined;

  const displayStatus = conversation.type === 'direct'
    ? directParticipant?.status
    : undefined;
  const lastSeen = directParticipant?.lastSeen || conversation.updatedAt;

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-3 p-3 rounded-lg transition-all duration-200 text-left group',
        isActive
          ? 'bg-accent text-accent-foreground'
          : 'hover:bg-muted/50'
      )}
    >
      {conversation.type === 'group' ? (
        <div className="relative h-10 w-10 flex items-center justify-center rounded-full bg-primary/10 text-primary">
          <Users className="h-5 w-5" />
        </div>
      ) : (
        <UserAvatar
          username={directParticipant?.username || 'Unknown'}
          avatar={directParticipant?.avatar}
          status={displayStatus}
          showStatus={true}
        />
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium truncate">{displayName}</span>
          {conversation.lastMessage && (
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {formatTime(conversation.lastMessage.timestamp)}
            </span>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 mt-0.5">
          <p className="text-sm text-muted-foreground truncate">
            {conversation.lastMessage?.content || 'No messages yet'}
          </p>
          {conversation.unreadCount > 0 ? (
            <span className="flex-shrink-0 h-5 min-w-5 px-1.5 flex items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-medium">
              {conversation.unreadCount > 99 ? '99+' : conversation.unreadCount}
            </span>
          ) : (
            displayStatus && lastSeen && (
              <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                {`Last seen ${lastSeen.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
              </span>
            )
          )}
        </div>
      </div>
    </button>
  );
};
