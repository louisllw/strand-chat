import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { UserAvatar } from '@/components/chat/UserAvatar';
import { useToast } from '@/hooks/use-toast';
import { apiFetch } from '@/lib/api';
import {
  ArrowLeft,
  Camera,
  Bell,
  Shield,
  Moon,
  Sun,
  LogOut,
  Save,
  Loader2,
  User,
  Mail,
  Phone,
  MessageSquare,
} from 'lucide-react';

const Profile = () => {
  const { user, updateUser, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    username: user?.username || '',
    email: user?.email || '',
    phone: '',
    bio: '',
  });

  const [notifications, setNotifications] = useState({
    messages: true,
    sounds: true,
    desktop: false,
  });
  const [usernameStatus, setUsernameStatus] = useState({
    state: 'idle' as 'idle' | 'checking' | 'available' | 'taken' | 'invalid' | 'cooldown',
    message: '',
    daysRemaining: 0,
    canChange: true,
    lastChecked: '',
  });
  const latestUsernameRef = useRef('');

  useEffect(() => {
    if (!user) return;
    setFormData(prev => ({
      ...prev,
      username: user.username,
      email: user.email,
    }));
  }, [user]);

  const normalizedUsername = useMemo(() => formData.username.trim().replace(/^@+/, '').toLowerCase(), [formData.username]);
  const isUsernameValid = useMemo(() => /^[a-z0-9._]{3,30}$/.test(normalizedUsername), [normalizedUsername]);
  const isUsernameChanged = normalizedUsername !== (user?.username || '').toLowerCase();
  const isEmailChanged = formData.email.trim().toLowerCase() !== (user?.email || '').toLowerCase();

  useEffect(() => {
    if (!user) return;
    if (!normalizedUsername) {
      latestUsernameRef.current = normalizedUsername;
      setUsernameStatus({
        state: 'invalid',
        message: 'Username is required.',
        daysRemaining: 0,
        canChange: false,
        lastChecked: normalizedUsername,
      });
      return;
    }
    if (!isUsernameValid) {
      latestUsernameRef.current = normalizedUsername;
      setUsernameStatus({
        state: 'invalid',
        message: 'One word, 3-30 chars. Letters, numbers, . or _',
        daysRemaining: 0,
        canChange: false,
        lastChecked: normalizedUsername,
      });
      return;
    }

    latestUsernameRef.current = normalizedUsername;
    setUsernameStatus(prev => ({
      ...prev,
      state: 'checking',
      message: 'Checking availability...',
    }));

    const timer = window.setTimeout(async () => {
      const requestUsername = normalizedUsername;
      try {
        const data = await apiFetch<{
          valid: boolean;
          available: boolean;
          canChange: boolean;
          cooldownDaysRemaining: number;
          current?: boolean;
          message?: string;
        }>(`/api/users/username-availability?username=${encodeURIComponent(requestUsername)}`);

        if (latestUsernameRef.current !== requestUsername) {
          return;
        }

        if (!data.valid) {
          setUsernameStatus({
            state: 'invalid',
            message: data.message || 'Username is invalid.',
            daysRemaining: 0,
            canChange: false,
            lastChecked: normalizedUsername,
          });
          return;
        }

        if (!data.available) {
          setUsernameStatus({
            state: 'taken',
            message: 'Username is already taken.',
            daysRemaining: 0,
            canChange: false,
            lastChecked: normalizedUsername,
          });
          return;
        }

        if (isUsernameChanged && !data.canChange) {
          setUsernameStatus({
            state: 'cooldown',
            message: `You can change your username again in ${data.cooldownDaysRemaining} day${data.cooldownDaysRemaining === 1 ? '' : 's'}.`,
            daysRemaining: data.cooldownDaysRemaining || 0,
            canChange: false,
            lastChecked: normalizedUsername,
          });
          return;
        }

        setUsernameStatus({
          state: 'available',
          message: isUsernameChanged ? 'Username is available.' : '',
          daysRemaining: data.cooldownDaysRemaining || 0,
          canChange: true,
          lastChecked: normalizedUsername,
        });
      } catch {
        if (latestUsernameRef.current !== requestUsername) {
          return;
        }
        setUsernameStatus({
          state: 'idle',
          message: '',
          daysRemaining: 0,
          canChange: false,
          lastChecked: '',
        });
      }
    }, 400);

    return () => window.clearTimeout(timer);
  }, [normalizedUsername, isUsernameValid, isUsernameChanged, user]);

  const canSaveUsername = !isUsernameChanged
    || (usernameStatus.state === 'available'
      && usernameStatus.canChange
      && usernameStatus.lastChecked === normalizedUsername);
  const canSaveChanges = isEmailChanged || (isUsernameChanged && canSaveUsername);

  const handleSave = async () => {
    if (!canSaveChanges) {
      toast({
        title: 'Nothing to save',
        description: usernameStatus.message || 'Please update your details before saving.',
        variant: 'destructive',
      });
      return;
    }
    setIsLoading(true);
    try {
      const updates: { username?: string; email?: string } = {};
      if (isEmailChanged) {
        updates.email = formData.email;
      }
      if (isUsernameChanged && canSaveUsername) {
        updates.username = formData.username;
      }
      await updateUser(updates);
      toast({
        title: 'Profile updated',
        description: 'Your changes have been saved.',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Please try again.';
      toast({
        title: 'Update failed',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-card border-b border-border px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center gap-4">
          <Button variant="icon" size="icon" onClick={() => navigate('/chat')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-lg font-semibold text-foreground">Settings</h1>
            <p className="text-sm text-muted-foreground">Manage your account</p>
          </div>
          <Button onClick={handleSave} disabled={isLoading || !canSaveChanges}>
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Save
              </>
            )}
          </Button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-4 space-y-6">
        {/* Profile Picture Section */}
        <section className="bg-card rounded-xl border border-border p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
            <User className="h-5 w-5 text-primary" />
            Profile
          </h2>
          <div className="flex items-center gap-6">
            <div className="relative">
              <UserAvatar
                username={user?.username || 'User'}
                avatar={user?.avatar}
                status={user?.status || 'online'}
                size="xl"
              />
              <button className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg hover:bg-primary/90 transition-colors">
                <Camera className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1">
              <p className="font-medium text-foreground">{user?.username ? `@${user.username}` : ''}</p>
              <p className="text-sm text-muted-foreground">{user?.email}</p>
              <p className="text-sm text-status-online mt-1 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-status-online" />
                Online
              </p>
            </div>
          </div>
        </section>

        {/* Account Details */}
        <section className="bg-card rounded-xl border border-border p-6 space-y-4">
          <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            Account Details
          </h2>

          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">@</span>
              <Input
                id="username"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                placeholder="your_username"
                className="pl-7"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              One word, 3-30 chars. Letters, numbers, . or _. Change once every 7 days.
            </p>
            {usernameStatus.state === 'cooldown' && usernameStatus.daysRemaining > 0 && (
              <p className="text-xs text-destructive">
                {`Username changes are locked for ${usernameStatus.daysRemaining} more day${usernameStatus.daysRemaining === 1 ? '' : 's'}.`}
              </p>
            )}
            {(usernameStatus.state === 'checking' || usernameStatus.message) && (
              <p className={`text-xs ${usernameStatus.state === 'available' ? 'text-status-online' : 'text-destructive'}`}>
                {usernameStatus.state === 'checking' ? 'Checking availability...' : usernameStatus.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email Address</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="you@example.com"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Phone Number</Label>
            <Input
              id="phone"
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              placeholder="+1 (555) 123-4567"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="bio">Bio</Label>
            <Input
              id="bio"
              value={formData.bio}
              onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
              placeholder="Tell us about yourself"
            />
          </div>
        </section>

        {/* Notifications */}
        <section className="bg-card rounded-xl border border-border p-6 space-y-4">
          <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            Notifications
          </h2>

          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-foreground">Message Notifications</p>
              <p className="text-sm text-muted-foreground">Get notified about new messages</p>
            </div>
            <Switch
              checked={notifications.messages}
              onCheckedChange={(checked) => setNotifications({ ...notifications, messages: checked })}
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-foreground">Sound Effects</p>
              <p className="text-sm text-muted-foreground">Play sounds for notifications</p>
            </div>
            <Switch
              checked={notifications.sounds}
              onCheckedChange={(checked) => setNotifications({ ...notifications, sounds: checked })}
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-foreground">Desktop Notifications</p>
              <p className="text-sm text-muted-foreground">Show desktop push notifications</p>
            </div>
            <Switch
              checked={notifications.desktop}
              onCheckedChange={(checked) => setNotifications({ ...notifications, desktop: checked })}
            />
          </div>
        </section>

        {/* Appearance */}
        <section className="bg-card rounded-xl border border-border p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
            {theme === 'dark' ? <Moon className="h-5 w-5 text-primary" /> : <Sun className="h-5 w-5 text-primary" />}
            Appearance
          </h2>

          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-foreground">Dark Mode</p>
              <p className="text-sm text-muted-foreground">Use dark theme for the app</p>
            </div>
            <Switch checked={theme === 'dark'} onCheckedChange={toggleTheme} />
          </div>
        </section>

        {/* Privacy & Security */}
        <section className="bg-card rounded-xl border border-border p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Privacy & Security
          </h2>

          <div className="space-y-3">
            <button className="w-full text-left p-3 rounded-lg hover:bg-muted/50 transition-colors">
              <p className="font-medium text-foreground">Change Password</p>
              <p className="text-sm text-muted-foreground">Update your account password</p>
            </button>
            <button className="w-full text-left p-3 rounded-lg hover:bg-muted/50 transition-colors">
              <p className="font-medium text-foreground">Two-Factor Authentication</p>
              <p className="text-sm text-muted-foreground">Add an extra layer of security</p>
            </button>
            <button className="w-full text-left p-3 rounded-lg hover:bg-muted/50 transition-colors">
              <p className="font-medium text-foreground">Active Sessions</p>
              <p className="text-sm text-muted-foreground">Manage your logged in devices</p>
            </button>
          </div>
        </section>

        {/* Logout */}
        <section className="bg-card rounded-xl border border-border p-6">
          <Button variant="destructive" className="w-full" onClick={handleLogout}>
            <LogOut className="h-4 w-4 mr-2" />
            Sign Out
          </Button>
        </section>

        {/* App Info */}
        <footer className="text-center text-sm text-muted-foreground pb-8">
          <MessageSquare className="h-5 w-5 mx-auto mb-2 opacity-50" />
          <p>Messenger v1.0.0</p>
          <p className="mt-1">Built with React + TypeScript</p>
        </footer>
      </main>
    </div>
  );
};

export default Profile;
