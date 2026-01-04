import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { enablePushNotifications, getPushStatus } from '@/lib/push';

const PUSH_PROMPT_STORAGE_KEY = 'strand_push_prompt_dismissed_v1';

const isStandalone = () => {
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia('(display-mode: standalone)').matches || Boolean(nav.standalone);
};

const readDismissed = () => {
  try {
    return localStorage.getItem(PUSH_PROMPT_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
};

const writeDismissed = () => {
  try {
    localStorage.setItem(PUSH_PROMPT_STORAGE_KEY, 'true');
  } catch {
    // Ignore storage failures.
  }
};

type EnablePushPromptProps = {
  onEnabled?: () => void;
};

export const EnablePushPrompt = ({ onEnabled }: EnablePushPromptProps) => {
  const { toast } = useToast();
  const [visible, setVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let active = true;
    const init = async () => {
      if (!isStandalone()) return;
      if (readDismissed()) return;
      if (typeof Notification !== 'undefined' && Notification.permission === 'denied') return;
      const status = await getPushStatus();
      if (!active) return;
      if (!status.supported || status.subscribed) return;
      setVisible(true);
    };
    void init();
    return () => {
      active = false;
    };
  }, []);

  const handleEnable = async () => {
    setIsLoading(true);
    const result = await enablePushNotifications();
    setIsLoading(false);

    if (result.status === 'subscribed') {
      writeDismissed();
      setVisible(false);
      onEnabled?.();
      return;
    }
    if (result.status === 'unsupported') {
      toast({
        title: 'Push not supported',
        description: 'Your browser does not support push notifications.',
      });
      return;
    }
    if (result.status === 'requires-install') {
      toast({
        title: 'Install required',
        description: 'Add the app to your Home Screen to enable push on iOS.',
      });
      return;
    }
    if (result.status === 'denied') {
      toast({
        title: 'Notifications blocked',
        description: 'Enable notifications in your browser settings to continue.',
      });
      return;
    }
    toast({
      title: 'Push setup failed',
      description: result.status === 'error' ? result.message : 'Push setup failed.',
      variant: 'destructive',
    });
  };

  const handleDismiss = () => {
    writeDismissed();
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="rounded-lg border border-border p-3 bg-muted/30 flex items-center justify-between gap-3">
      <div>
        <p className="text-sm text-foreground font-medium">Enable notifications</p>
        <p className="text-xs text-muted-foreground">
          Get alerts for new messages while the app is closed.
        </p>
        <p className="text-xs text-muted-foreground">
          If it fails, check your browser notification settings and try again.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="ghost" onClick={handleDismiss} disabled={isLoading}>
          Not now
        </Button>
        <Button size="sm" onClick={handleEnable} disabled={isLoading}>
          {isLoading ? 'Enabling...' : 'Enable'}
        </Button>
      </div>
    </div>
  );
};
