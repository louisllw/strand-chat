import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

interface UserAvatarProps {
  username: string;
  avatar?: string;
  status?: 'online' | 'offline' | 'away';
  size?: 'sm' | 'default' | 'lg' | 'xl';
  showStatus?: boolean;
  className?: string;
}

const getInitials = (name: string) => {
  return name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
};

const statusColors = {
  online: 'bg-status-online',
  offline: 'bg-status-offline',
  away: 'bg-status-away',
};

const statusSizes = {
  sm: 'h-2.5 w-2.5',
  default: 'h-3 w-3',
  lg: 'h-3.5 w-3.5',
  xl: 'h-4 w-4',
};

export const UserAvatar = ({
  username,
  avatar,
  status,
  size = 'default',
  showStatus = true,
  className,
}: UserAvatarProps) => {
  return (
    <div className={cn('relative', className)}>
      <Avatar size={size}>
        {avatar ? (
          <AvatarImage src={avatar} alt={username} />
        ) : null}
        <AvatarFallback>{getInitials(username)}</AvatarFallback>
      </Avatar>
      {showStatus && status && (
        <span
          className={cn(
            'absolute bottom-0 right-0 rounded-full ring-2 ring-background',
            statusColors[status],
            statusSizes[size]
          )}
        />
      )}
    </div>
  );
};
