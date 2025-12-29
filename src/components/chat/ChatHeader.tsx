import { useChat } from '@/contexts/ChatContext';
import { useState } from 'react';
import { UserAvatar } from './UserAvatar';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  Phone,
  Video,
  MoreVertical,
  Users,
  ArrowLeft,
  Info,
  Trash2,
  UserPlus,
  LogOut,
} from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface ChatHeaderProps {
  onMobileMenuClick: () => void;
  className?: string;
}

export const ChatHeader = ({ onMobileMenuClick, className }: ChatHeaderProps) => {
  const { activeConversation, typingIndicators, deleteConversation, addGroupMembers, leaveGroup } = useChat();
  const [showAddMembers, setShowAddMembers] = useState(false);
  const [newMembers, setNewMembers] = useState('');
  const [isAddingMembers, setIsAddingMembers] = useState(false);

  if (!activeConversation) return null;

  const displayName = activeConversation.type === 'group'
    ? activeConversation.name
    : activeConversation.participants[0]?.username
    ? `@${activeConversation.participants[0].username}`
    : undefined;

  const displayStatus = activeConversation.type === 'direct'
    ? activeConversation.participants[0]?.status
    : undefined;

  const isTyping = activeConversation.type === 'direct'
    ? typingIndicators.some(
        indicator => indicator.conversationId === activeConversation.id
          && indicator.userId === activeConversation.participants[0]?.id
      )
    : false;

  const lastSeen = activeConversation.participants[0]?.lastSeen
    || activeConversation.updatedAt;
  const statusText = isTyping
    ? 'Typing...'
    : lastSeen
    ? `Last seen ${lastSeen.toLocaleString()}`
    : displayStatus === 'online'
    ? 'Online'
    : displayStatus === 'away'
    ? 'Away'
    : 'Offline';

  const participantCount = activeConversation.participants.length;
  const isGroup = activeConversation.type === 'group';

  const handleAddMembers = async () => {
    if (!activeConversation || !isGroup) return;
    const usernames = newMembers
      .split(',')
      .map(value => value.trim())
      .filter(Boolean)
      .map(value => value.replace(/^@/, ''));
    if (usernames.length === 0) return;
    setIsAddingMembers(true);
    try {
      await addGroupMembers(activeConversation.id, usernames);
      setNewMembers('');
      setShowAddMembers(false);
    } finally {
      setIsAddingMembers(false);
    }
  };

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
          {isGroup ? (
            <>
              <Button variant="icon" size="icon" onClick={() => setShowAddMembers(true)}>
                <UserPlus className="h-5 w-5" />
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="icon" size="icon">
                    <LogOut className="h-5 w-5" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Leave group?</AlertDialogTitle>
                    <AlertDialogDescription>
                      You will be removed from this group and won&apos;t receive new messages.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => leaveGroup(activeConversation.id)}>
                      Leave group
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          ) : null}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="icon" size="icon">
                <Trash2 className="h-5 w-5" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete conversation?</AlertDialogTitle>
                <AlertDialogDescription>
                  This removes the thread from your list. Other participants will still keep the chat.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => deleteConversation(activeConversation.id)}>
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Button variant="icon" size="icon">
            <MoreVertical className="h-5 w-5" />
          </Button>
        </div>
      </div>

      <Dialog open={showAddMembers} onOpenChange={setShowAddMembers}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add members</DialogTitle>
            <DialogDescription>
              Add usernames separated by commas to invite them to this group.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="add-group-members">Usernames</Label>
            <Input
              id="add-group-members"
              placeholder="@alex, @jordan"
              value={newMembers}
              onChange={(e) => setNewMembers(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddMembers(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddMembers} disabled={isAddingMembers}>
              {isAddingMembers ? 'Adding...' : 'Add members'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </header>
  );
};
