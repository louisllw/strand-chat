import { MessageSquare, Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface EmptyStateProps {
  onMobileMenuClick: () => void;
}

export const EmptyState = ({ onMobileMenuClick }: EmptyStateProps) => {
  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-background text-center p-6 sm:p-8 pt-[calc(1.5rem+env(safe-area-inset-top))]">
      {/* Mobile menu button */}
      <Button 
        variant="icon" 
        size="icon" 
        className="absolute top-[calc(1rem+env(safe-area-inset-top))] left-4 lg:hidden"
        onClick={onMobileMenuClick}
      >
        <Menu className="h-5 w-5" />
      </Button>

      <div className="relative mb-6">
        <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center">
          <MessageSquare className="h-12 w-12 text-primary" />
        </div>
        <div className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-status-online flex items-center justify-center">
          <span className="text-lg">👋</span>
        </div>
      </div>

      <h2 className="text-xl sm:text-2xl font-semibold text-foreground mb-2">
        Welcome to Strand
      </h2>
      <p className="text-sm sm:text-base text-muted-foreground max-w-md">
        Select a conversation from the sidebar to start chatting, or create a new conversation to connect with friends and colleagues.
      </p>
    </div>
  );
};
