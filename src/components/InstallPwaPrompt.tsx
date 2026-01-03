import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

const isStandalone = () => {
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia('(display-mode: standalone)').matches || Boolean(nav.standalone);
};

export const InstallPwaPrompt = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (isStandalone()) return undefined;

    const handler = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  if (dismissed || isStandalone()) return null;

  if (isIOS()) {
    return (
      <div className="rounded-lg border border-border p-3 bg-muted/30">
        <p className="text-sm text-foreground font-medium">Install the app</p>
        <p className="text-xs text-muted-foreground">
          On iOS, open Share and choose “Add to Home Screen”.
        </p>
      </div>
    );
  }

  if (!deferredPrompt) return null;

  const handleInstall = async () => {
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    if (choice.outcome !== 'accepted') {
      setDismissed(true);
    }
  };

  return (
    <div className="rounded-lg border border-border p-3 bg-muted/30 flex items-center justify-between gap-3">
      <div>
        <p className="text-sm text-foreground font-medium">Install the app</p>
        <p className="text-xs text-muted-foreground">Get a faster, full-screen experience.</p>
      </div>
      <Button size="sm" onClick={handleInstall}>
        Install
      </Button>
    </div>
  );
};
