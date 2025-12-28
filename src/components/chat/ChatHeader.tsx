import { useChat } from '@/contexts/ChatContext';
import { UserAvatar } from './UserAvatar';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { 
  Phone, 
  Video, 
  MoreVertical, 
  Users, 
  ArrowLeft,
  Info
} from 'lucide-react';

interface ChatHeaderProps {
  onMobileMenuClick: () => void;
  className?: string;
}

export const ChatHeader = ({ onMobileMenuClick, className }: ChatHeaderProps) => {
  const { activeConversation } = useChat();

  if (!activeConversation) return null;

  const displayName = activeConversation.type === 'group'
    ? activeConversation.name
    : activeConversation.participants[0]?.username;

  const displayStatus = activeConversation.type === 'direct'
    ? activeConversation.participants[0]?.status
    : undefined;

  const statusText = displayStatus === 'online' 
    ? 'Online' 
    : displayStatus === 'away' 
    ? 'Away'
    : activeConversation.participants[0]?.lastSeen 
    ? `Last seen ${activeConversation.participants[0].lastSeen.toLocaleString()}`
    : 'Offline';

  const participantCount = activeConversation.participants.length;

  return (
    <header className={cn('bg-card border-b border-border px-4 py-3', className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Mobile back button */}
          <Button 
            variant="icon" 
            size="iconSm" 
            className="lg:hidden"
            onClick={onMobileMenuClick}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>

          {/* Avatar */}
          {activeConversation.type === 'group' ? (
            <div className="relative h-10 w-10 flex items-center justify-center rounded-full bg-primary/10 text-primary">
              <Users className="h-5 w-5" />
            </div>
          ) : (
            <UserAvatar
              username={activeConversation.participants[0]?.username || 'Unknown'}
              avatar={activeConversation.participants[0]?.avatar}
              status={displayStatus}
            />
          )}

          {/* Info */}
          <div>
            <h2 className="font-semibold text-foreground">{displayName}</h2>
            <p className="text-sm text-muted-foreground">
              {activeConversation.type === 'group' 
                ? `${participantCount} members`
                : statusText
              }
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1">
          <Button variant="icon" size="icon">
            <Phone className="h-5 w-5" />
          </Button>
          <Button variant="icon" size="icon">
            <Video className="h-5 w-5" />
          </Button>
          <Button variant="icon" size="icon">
            <Info className="h-5 w-5" />
          </Button>
          <Button variant="icon" size="icon">
            <MoreVertical className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </header>
  );
};
