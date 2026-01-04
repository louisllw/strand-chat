import { useChatConversations } from '@/contexts/useChatConversations';
import { useChatTyping } from '@/contexts/useChatTyping';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserAvatar } from './UserAvatar';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { apiFetch } from '@/lib/api';
import type { ConversationMember } from '@/types';
import { useAuth } from '@/contexts/useAuth';
import { useToast } from '@/hooks/use-toast';
import { getDirectParticipant } from './utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  MoreVertical,
  Users,
  ArrowLeft,
  Info,
  Trash2,
  UserPlus,
  LogOut,
} from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface ChatHeaderProps {
  onMobileMenuClick: () => void;
  className?: string;
}

export const ChatHeader = ({ onMobileMenuClick, className }: ChatHeaderProps) => {
  const { activeConversation, deleteConversation, addGroupMembers, leaveGroup, refreshConversations } = useChatConversations();
  const { typingIndicators } = useChatTyping();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [showAddMembers, setShowAddMembers] = useState(false);
  const [showManageMembers, setShowManageMembers] = useState(false);
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [newMembers, setNewMembers] = useState('');
  const [isAddingMembers, setIsAddingMembers] = useState(false);
  const [members, setMembers] = useState<ConversationMember[]>([]);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [delegateUserId, setDelegateUserId] = useState('');
  const [memberActionId, setMemberActionId] = useState<string | null>(null);

  const conversation = activeConversation;
  const directParticipant = conversation?.type === 'direct'
    ? getDirectParticipant(conversation.participants, user?.id)
    : null;

  const displayName = conversation?.type === 'group'
    ? conversation.name
    : directParticipant?.username
    ? `@${directParticipant.username}`
    : undefined;

  const displayStatus = conversation?.type === 'direct'
    ? directParticipant?.status
    : undefined;

  const isTyping = conversation?.type === 'direct'
    ? typingIndicators.some(
        indicator => indicator.conversationId === conversation.id
          && indicator.userId === directParticipant?.id
      )
    : false;

  const lastSeen = directParticipant?.lastSeen
    || conversation?.updatedAt;
  const statusText = isTyping
    ? 'Typing...'
    : lastSeen
    ? `Last seen ${lastSeen.toLocaleString()}`
    : displayStatus === 'online'
    ? 'Online'
    : displayStatus === 'away'
    ? 'Away'
    : 'Offline';

  const participantCount = conversation
    ? (conversation.participantCount ?? conversation.participants.length)
    : 0;
  const isGroup = conversation?.type === 'group';
  const profileUser = !isGroup ? directParticipant : null;
  const isLeftConversation = Boolean(conversation?.leftAt);
  const adminCount = members.filter(member => member.role === 'admin').length;
  const currentMember = members.find(member => member.id === user?.id);
  const isCurrentUserAdmin = currentMember?.role === 'admin';
  const delegateOptions = members.filter(member => member.id !== user?.id);
  const isLastMember = isGroup && members.length === 1;
  const requiresDelegate = isGroup && isCurrentUserAdmin && delegateOptions.length > 0;

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

  const loadMembers = useCallback(async () => {
    if (!activeConversation || !isGroup) return;
    setIsLoadingMembers(true);
    setMembersError(null);
    try {
      const data = await apiFetch<{ members: ConversationMember[] }>(
        `/api/conversations/${activeConversation.id}/members`
      );
      setMembers(data.members);
    } catch (error) {
      void error;
      setMembersError('Unable to load members right now.');
    } finally {
      setIsLoadingMembers(false);
    }
  }, [activeConversation, isGroup]);

  useEffect(() => {
    if (!showManageMembers && !showLeaveDialog) return;
    void loadMembers();
  }, [showManageMembers, showLeaveDialog, loadMembers]);

  useEffect(() => {
    if (!showLeaveDialog) {
      setDelegateUserId('');
    }
  }, [showLeaveDialog]);

  const handleToggleAdmin = async (member: ConversationMember) => {
    if (!activeConversation) return;
    const nextRole = member.role === 'admin' ? 'member' : 'admin';
    setMemberActionId(member.id);
    try {
      await apiFetch(`/api/conversations/${activeConversation.id}/members/role`, {
        method: 'POST',
        body: JSON.stringify({ userId: member.id, role: nextRole }),
      });
      setMembers(prev => prev.map(item => (
        item.id === member.id ? { ...item, role: nextRole } : item
      )));
      await refreshConversations();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to update role.';
      toast({
        title: 'Role update failed',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setMemberActionId(null);
    }
  };

  const handleRemoveMember = async (member: ConversationMember) => {
    if (!activeConversation) return;
    setMemberActionId(member.id);
    try {
      await apiFetch(`/api/conversations/${activeConversation.id}/members/remove`, {
        method: 'POST',
        body: JSON.stringify({ usernames: [member.username] }),
      });
      setMembers(prev => prev.filter(item => item.id !== member.id));
      await refreshConversations();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to remove member.';
      toast({
        title: 'Remove failed',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setMemberActionId(null);
    }
  };

  if (!conversation) return null;

  return (
    <header className={cn('sticky top-0 z-20 bg-card border-b border-border px-3 py-2 sm:px-4 sm:py-3', className)}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          {/* Mobile back button */}
          <Button 
            variant="icon" 
            size="iconSm" 
            className="lg:hidden"
            onClick={onMobileMenuClick}
          >
            <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" />
          </Button>

          {/* Avatar */}
          {activeConversation.type === 'group' ? (
            <div className="relative h-9 w-9 sm:h-10 sm:w-10 flex items-center justify-center rounded-full bg-primary/10 text-primary">
              <Users className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
          ) : (
            <UserAvatar
              username={directParticipant?.username || 'Unknown'}
              avatar={directParticipant?.avatar}
              status={displayStatus}
            />
          )}

          {/* Info */}
          <div className="min-w-0">
            <h2 className="font-semibold text-foreground truncate">{displayName}</h2>
            <p className="text-xs sm:text-sm text-muted-foreground truncate">
              {activeConversation.type === 'group' 
                ? `${participantCount} members`
                : statusText
              }
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="icon" size="icon" className="h-9 w-9 sm:h-10 sm:w-10">
                <MoreVertical className="h-4 w-4 sm:h-5 sm:w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {!isLeftConversation && profileUser ? (
                <DropdownMenuItem onSelect={() => navigate(`/users/${profileUser.id}`)}>
                  <Info className="mr-2 h-4 w-4" />
                  View profile
                </DropdownMenuItem>
              ) : null}
              {!isLeftConversation && isGroup ? (
                <>
                  <DropdownMenuItem onSelect={() => setShowAddMembers(true)}>
                    <UserPlus className="mr-2 h-4 w-4" />
                    Add members
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setShowManageMembers(true)}>
                    <Users className="mr-2 h-4 w-4" />
                    {isCurrentUserAdmin ? 'Manage members' : 'View members'}
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setShowLeaveDialog(true)}>
                    <LogOut className="mr-2 h-4 w-4" />
                    Leave group
                  </DropdownMenuItem>
                </>
              ) : null}
              {isLeftConversation ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => setShowDeleteDialog(true)}>
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete conversation
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
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

      <Dialog open={showManageMembers} onOpenChange={setShowManageMembers}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{isCurrentUserAdmin ? 'Manage members' : 'View members'}</DialogTitle>
            <DialogDescription>
              {isCurrentUserAdmin
                ? 'Admins can update roles or remove members from the group.'
                : 'View the current group members.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 max-h-[60vh] overflow-y-auto">
            {isLoadingMembers ? (
              <p className="text-sm text-muted-foreground">Loading members...</p>
            ) : membersError ? (
              <p className="text-sm text-destructive">{membersError}</p>
            ) : (
              members.map(member => {
                const isSelf = member.id === user?.id;
                const isLastAdmin = member.role === 'admin' && adminCount <= 1;
                return (
                  <div key={member.id} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <UserAvatar username={member.username} avatar={member.avatar} status={member.status} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">@{member.username}</p>
                        <span className="text-xs text-muted-foreground uppercase tracking-wide">
                          {member.role === 'admin' ? 'Admin' : 'Member'}
                        </span>
                      </div>
                    </div>
                    {isCurrentUserAdmin ? (
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={memberActionId === member.id || isLastAdmin || (isSelf && member.role !== 'admin')}
                          onClick={() => handleToggleAdmin(member)}
                        >
                          {member.role === 'admin'
                            ? (isSelf ? 'Step down' : 'Remove admin')
                            : 'Make admin'}
                        </Button>
                        {!isSelf ? (
                          <Button
                            variant="destructive"
                            size="sm"
                            disabled={memberActionId === member.id || isLastAdmin}
                            onClick={() => handleRemoveMember(member)}
                          >
                            Remove
                          </Button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showLeaveDialog} onOpenChange={setShowLeaveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Leave group?</DialogTitle>
            <DialogDescription>
              {isLastMember
                ? 'You are the last member. Leaving will delete this chat permanently.'
                : 'You will be removed from this group and won&apos;t receive new messages.'}
            </DialogDescription>
          </DialogHeader>
          {requiresDelegate ? (
            <div className="space-y-2">
              <Label>Delegate admin</Label>
              <Select value={delegateUserId} onValueChange={setDelegateUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a new admin" />
                </SelectTrigger>
                <SelectContent>
                  {delegateOptions.map(option => (
                    <SelectItem key={option.id} value={option.id}>
                      @{option.username}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                An admin is required to manage this group.
              </p>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLeaveDialog(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (!activeConversation) return;
                const delegate = requiresDelegate ? delegateUserId : undefined;
                leaveGroup(activeConversation.id, delegate || undefined);
                setShowLeaveDialog(false);
              }}
              disabled={requiresDelegate && !delegateUserId}
            >
              Leave group
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </header>
  );
};
