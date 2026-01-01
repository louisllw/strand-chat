import { useState } from 'react';
import { useChatConversations } from '@/contexts/useChatConversations';
import { useChatSearch } from '@/contexts/useChatSearch';
import { useAuth } from '@/contexts/useAuth';
import { useTheme } from '@/contexts/useTheme';
import { ConversationItem } from './ConversationItem';
import { UserAvatar } from './UserAvatar';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { 
  Search, 
  Settings, 
  Moon, 
  Sun, 
  LogOut,
  MessageSquarePlus,
  Users,
  X
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Link } from 'react-router-dom';

interface ChatSidebarProps {
  isMobileOpen: boolean;
  onMobileClose: () => void;
}

export const ChatSidebar = ({ isMobileOpen, onMobileClose }: ChatSidebarProps) => {
  const {
    conversations,
    activeConversation,
    setActiveConversation,
    markAsRead,
    createDirectConversation,
    createGroupConversation,
  } = useChatConversations();
  const { searchQuery, setSearchQuery } = useChatSearch();
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { toast } = useToast();
  const [showNewChat, setShowNewChat] = useState(false);
  const [newChatUsername, setNewChatUsername] = useState('');
  const [isCreatingChat, setIsCreatingChat] = useState(false);
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupUsernames, setNewGroupUsernames] = useState('');
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);

  const filteredConversations = conversations.filter(conv => {
    const name = conv.type === 'group' ? conv.name : conv.participants[0]?.username;
    return name?.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const handleConversationClick = (conversation: typeof conversations[0]) => {
    setActiveConversation(conversation);
    markAsRead(conversation.id);
    onMobileClose();
  };

  const handleCreateChat = async () => {
    const normalizedUsername = newChatUsername.trim().replace(/^@+/, '');
    if (!normalizedUsername) {
      toast({
        title: 'Username required',
        description: 'Enter a username to start a chat.',
        variant: 'destructive',
      });
      return;
    }
    setIsCreatingChat(true);
    try {
      await createDirectConversation(normalizedUsername);
      setShowNewChat(false);
      setNewChatUsername('');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not create conversation.';
      toast({
        title: 'Unable to start chat',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setIsCreatingChat(false);
    }
  };

  const handleCreateGroup = async () => {
    const raw = newGroupUsernames
      .split(',')
      .map(value => value.trim())
      .filter(Boolean)
      .map(value => value.replace(/^@+/, ''));

    if (raw.length === 0) {
      toast({
        title: 'Usernames required',
        description: 'Add at least one username to create a group.',
        variant: 'destructive',
      });
      return;
    }

    setIsCreatingGroup(true);
    try {
      await createGroupConversation(newGroupName.trim(), raw);
      setShowNewGroup(false);
      setNewGroupName('');
      setNewGroupUsernames('');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not create group.';
      toast({
        title: 'Unable to create group',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setIsCreatingGroup(false);
    }
  };

  return (
    <>
      {/* Mobile overlay */}
      {isMobileOpen && (
        <div 
          className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 lg:hidden"
          onClick={onMobileClose}
        />
      )}

      <aside
        className={cn(
          'fixed lg:relative inset-y-0 left-0 z-50 w-72 sm:w-80 bg-card border-r border-border flex flex-col transition-transform duration-300 lg:translate-x-0',
          isMobileOpen
            ? 'translate-x-0 pointer-events-auto'
            : 'hidden -translate-x-full pointer-events-none lg:pointer-events-auto lg:translate-x-0 lg:flex'
        )}
      >
        {/* Header */}
        <div className="p-3 sm:p-4 border-b border-border">
          <div className="flex items-center justify-between mb-3 sm:mb-4">
            <h1 className="text-xl font-semibold text-foreground">Messages</h1>
            <div className="flex items-center gap-1">
              <Button variant="icon" size="iconSm" onClick={toggleTheme}>
                {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>
              <Button variant="icon" size="iconSm" className="lg:hidden" onClick={onMobileClose}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
          
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        {/* New Chat Buttons */}
        <div className="p-3 flex gap-2">
          <Button variant="outline" size="sm" className="flex-1" onClick={() => setShowNewChat(true)}>
            <MessageSquarePlus className="h-4 w-4 mr-2" />
            New Chat
          </Button>
          <Button variant="outline" size="sm" className="flex-1" onClick={() => setShowNewGroup(true)}>
            <Users className="h-4 w-4 mr-2" />
            New Group
          </Button>
        </div>

        {/* Conversations List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1" data-chat-scroll>
          {filteredConversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <MessageSquarePlus className="h-12 w-12 mb-4 opacity-50" />
              <p className="text-sm">No conversations found</p>
            </div>
          ) : (
            filteredConversations.map(conversation => (
              <ConversationItem
                key={conversation.id}
                conversation={conversation}
                isActive={activeConversation?.id === conversation.id}
                onClick={() => handleConversationClick(conversation)}
              />
            ))
          )}
        </div>

        {/* User Profile Footer */}
        <div className="p-3 border-t border-border">
          <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors">
            <UserAvatar
              username={user?.username || 'User'}
              avatar={user?.avatar}
              status={user?.status || 'online'}
            />
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{user?.username ? `@${user.username}` : ''}</p>
              <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="icon" size="iconSm" asChild>
                <Link to="/profile">
                  <Settings className="h-4 w-4" />
                </Link>
              </Button>
              <Button variant="icon" size="iconSm" onClick={logout}>
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </aside>

      <Dialog open={showNewChat} onOpenChange={setShowNewChat}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start a new chat</DialogTitle>
            <DialogDescription>
              Find someone by their username to begin a direct conversation.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="new-chat-username">Username</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">@</span>
              <Input
                id="new-chat-username"
                placeholder="e.g. alex"
                value={newChatUsername}
                onChange={(e) => setNewChatUsername(e.target.value)}
                className="pl-7"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewChat(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateChat} disabled={isCreatingChat}>
              {isCreatingChat ? 'Starting...' : 'Start chat'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showNewGroup} onOpenChange={setShowNewGroup}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start a new group</DialogTitle>
            <DialogDescription>
              Add usernames separated by commas to create a group chat.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-group-name">Group name</Label>
              <Input
                id="new-group-name"
                placeholder="e.g. Project Team"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-group-users">Usernames</Label>
              <Input
                id="new-group-users"
                placeholder="@alex, @jordan, @sam"
                value={newGroupUsernames}
                onChange={(e) => setNewGroupUsernames(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Usernames are one word and can include . or _.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewGroup(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateGroup} disabled={isCreatingGroup}>
              {isCreatingGroup ? 'Creating...' : 'Create group'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
