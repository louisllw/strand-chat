import { useState } from 'react';
import { useChat } from '@/contexts/ChatContext';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { ConversationItem } from './ConversationItem';
import { UserAvatar } from './UserAvatar';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { 
  Search, 
  Plus, 
  Settings, 
  Moon, 
  Sun, 
  LogOut,
  MessageSquarePlus,
  Users,
  Menu,
  X
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Link } from 'react-router-dom';

interface ChatSidebarProps {
  isMobileOpen: boolean;
  onMobileClose: () => void;
}

export const ChatSidebar = ({ isMobileOpen, onMobileClose }: ChatSidebarProps) => {
  const { conversations, activeConversation, setActiveConversation, searchQuery, setSearchQuery, markAsRead } = useChat();
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [showNewChat, setShowNewChat] = useState(false);

  const filteredConversations = conversations.filter(conv => {
    const name = conv.type === 'group' ? conv.name : conv.participants[0]?.username;
    return name?.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const handleConversationClick = (conversation: typeof conversations[0]) => {
    setActiveConversation(conversation);
    markAsRead(conversation.id);
    onMobileClose();
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
          'fixed lg:relative inset-y-0 left-0 z-50 w-80 bg-card border-r border-border flex flex-col transition-transform duration-300 lg:translate-x-0',
          isMobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Header */}
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between mb-4">
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
          <Button variant="outline" size="sm" className="flex-1">
            <MessageSquarePlus className="h-4 w-4 mr-2" />
            New Chat
          </Button>
          <Button variant="outline" size="sm" className="flex-1">
            <Users className="h-4 w-4 mr-2" />
            New Group
          </Button>
        </div>

        {/* Conversations List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
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
              <p className="font-medium truncate">{user?.username}</p>
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
    </>
  );
};
