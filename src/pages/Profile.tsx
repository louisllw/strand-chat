import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/contexts/useAuth';
import { useTheme } from '@/contexts/useTheme';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { UserAvatar } from '@/components/chat/UserAvatar';
import { useToast } from '@/hooks/use-toast';
import { apiFetch } from '@/lib/api';
import Cropper, { type Area } from 'react-easy-crop';
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
  MessageSquare,
  Link2,
  Globe,
} from 'lucide-react';

interface ProfileFormData {
  username: string;
  email: string;
  phone: string;
  bio: string;
  website: string;
  avatar: string;
  banner: string;
  socialX: string;
  socialInstagram: string;
  socialLinkedin: string;
  socialTiktok: string;
  socialYoutube: string;
  socialFacebook: string;
  socialGithub: string;
}

type ProfileFormField = keyof ProfileFormData;

const readFileAsDataUrl = (file: File) => {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
};

const loadImage = (src: string) => {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Invalid image'));
    img.src = src;
  });
};

const getCroppedDataUrl = async (
  imageSrc: string,
  cropPixels: Area,
  maxWidth: number,
  maxHeight: number,
  quality = 0.85
) => {
  const image = await loadImage(imageSrc);
  const cropCanvas = document.createElement('canvas');
  cropCanvas.width = Math.max(1, Math.floor(cropPixels.width));
  cropCanvas.height = Math.max(1, Math.floor(cropPixels.height));
  const cropCtx = cropCanvas.getContext('2d');
  if (!cropCtx) {
    throw new Error('Canvas not supported');
  }
  cropCtx.drawImage(
    image,
    cropPixels.x,
    cropPixels.y,
    cropPixels.width,
    cropPixels.height,
    0,
    0,
    cropCanvas.width,
    cropCanvas.height
  );

  const scale = Math.min(maxWidth / cropCanvas.width, maxHeight / cropCanvas.height, 1);
  if (scale < 1) {
    const scaledCanvas = document.createElement('canvas');
    scaledCanvas.width = Math.max(1, Math.round(cropCanvas.width * scale));
    scaledCanvas.height = Math.max(1, Math.round(cropCanvas.height * scale));
    const scaledCtx = scaledCanvas.getContext('2d');
    if (!scaledCtx) {
      throw new Error('Canvas not supported');
    }
    scaledCtx.drawImage(cropCanvas, 0, 0, scaledCanvas.width, scaledCanvas.height);
    return scaledCanvas.toDataURL('image/jpeg', quality);
  }

  return cropCanvas.toDataURL('image/jpeg', quality);
};

const Profile = () => {
  const { user, updateUser, logout, reportCompromised } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState<ProfileFormData>({
    username: user?.username || '',
    email: user?.email || '',
    phone: user?.phone || '',
    bio: user?.bio || '',
    website: user?.website || '',
    avatar: user?.avatar || '',
    banner: user?.banner || '',
    socialX: user?.socialX || '',
    socialInstagram: user?.socialInstagram || '',
    socialLinkedin: user?.socialLinkedin || '',
    socialTiktok: user?.socialTiktok || '',
    socialYoutube: user?.socialYoutube || '',
    socialFacebook: user?.socialFacebook || '',
    socialGithub: user?.socialGithub || '',
  });
  const avatarFileRef = useRef<HTMLInputElement | null>(null);
  const bannerFileRef = useRef<HTMLInputElement | null>(null);
  const [cropImage, setCropImage] = useState<string | null>(null);
  const [cropField, setCropField] = useState<'avatar' | 'banner'>('avatar');
  const [cropAspect, setCropAspect] = useState(1);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [isCropping, setIsCropping] = useState(false);
  const [isCompromisedOpen, setIsCompromisedOpen] = useState(false);
  const [isCompromisedLoading, setIsCompromisedLoading] = useState(false);
  const dirtyRef = useRef<Partial<Record<ProfileFormField, boolean>>>({});

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
    const dirty = dirtyRef.current;
    setFormData(prev => ({
      ...prev,
      username: dirty.username ? prev.username : user.username,
      email: dirty.email ? prev.email : user.email,
      phone: dirty.phone ? prev.phone : user.phone || '',
      bio: dirty.bio ? prev.bio : user.bio || '',
      website: dirty.website ? prev.website : user.website || '',
      avatar: dirty.avatar ? prev.avatar : user.avatar || '',
      banner: dirty.banner ? prev.banner : user.banner || '',
      socialX: dirty.socialX ? prev.socialX : user.socialX || '',
      socialInstagram: dirty.socialInstagram ? prev.socialInstagram : user.socialInstagram || '',
      socialLinkedin: dirty.socialLinkedin ? prev.socialLinkedin : user.socialLinkedin || '',
      socialTiktok: dirty.socialTiktok ? prev.socialTiktok : user.socialTiktok || '',
      socialYoutube: dirty.socialYoutube ? prev.socialYoutube : user.socialYoutube || '',
      socialFacebook: dirty.socialFacebook ? prev.socialFacebook : user.socialFacebook || '',
      socialGithub: dirty.socialGithub ? prev.socialGithub : user.socialGithub || '',
    }));
  }, [user]);

  const markDirty = (field: ProfileFormField) => {
    dirtyRef.current = { ...dirtyRef.current, [field]: true };
  };

  const clearDirty = (fields: ProfileFormField[]) => {
    const next = { ...dirtyRef.current };
    fields.forEach((field) => delete next[field]);
    dirtyRef.current = next;
  };

  const normalizedUsername = useMemo(() => formData.username.trim().replace(/^@+/, '').toLowerCase(), [formData.username]);
  const isUsernameValid = useMemo(() => /^[a-z0-9._]{3,30}$/.test(normalizedUsername), [normalizedUsername]);
  const isUsernameChanged = normalizedUsername !== (user?.username || '').toLowerCase();
  const isEmailChanged = formData.email.trim().toLowerCase() !== (user?.email || '').toLowerCase();
  const isPhoneChanged = formData.phone.trim() !== (user?.phone || '');
  const isBioChanged = formData.bio.trim() !== (user?.bio || '');
  const isWebsiteChanged = formData.website.trim() !== (user?.website || '');
  const isAvatarChanged = formData.avatar.trim() !== (user?.avatar || '');
  const isBannerChanged = formData.banner.trim() !== (user?.banner || '');
  const isSocialXChanged = formData.socialX.trim() !== (user?.socialX || '');
  const isSocialInstagramChanged = formData.socialInstagram.trim() !== (user?.socialInstagram || '');
  const isSocialLinkedinChanged = formData.socialLinkedin.trim() !== (user?.socialLinkedin || '');
  const isSocialTiktokChanged = formData.socialTiktok.trim() !== (user?.socialTiktok || '');
  const isSocialYoutubeChanged = formData.socialYoutube.trim() !== (user?.socialYoutube || '');
  const isSocialFacebookChanged = formData.socialFacebook.trim() !== (user?.socialFacebook || '');
  const isSocialGithubChanged = formData.socialGithub.trim() !== (user?.socialGithub || '');

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
  const isUsernameDirty = Boolean(dirtyRef.current.username);
  const hasDirtyFields = Object.keys(dirtyRef.current).length > 0;
  const canSaveChanges = hasDirtyFields && (!isUsernameDirty || !isUsernameChanged || canSaveUsername);

  const handleCropComplete = (_: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels);
  };

  const openCropper = (field: 'avatar' | 'banner', imageSrc: string) => {
    setCropField(field);
    setCropAspect(field === 'avatar' ? 1 : 4);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
    setCropImage(imageSrc);
  };

  const closeCropper = () => {
    if (isCropping) return;
    setCropImage(null);
  };

  const applyCrop = async () => {
    if (!cropImage || !croppedAreaPixels) return;
    setIsCropping(true);
    try {
      const max = cropField === 'avatar'
        ? { width: 512, height: 512 }
        : { width: 1600, height: 400 };
      const value = await getCroppedDataUrl(cropImage, croppedAreaPixels, max.width, max.height);
      setFormData(prev => ({ ...prev, [cropField]: value }));
      markDirty(cropField);
      setCropImage(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to crop image.';
      toast({
        title: 'Crop failed',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setIsCropping(false);
    }
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>, field: 'avatar' | 'banner') => {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = '';
    try {
      const imageSrc = await readFileAsDataUrl(file);
      openCropper(field, imageSrc);
    } catch {
      // Ignore image resize errors.
    }
  };

  const handleSave = async () => {
    if (!canSaveChanges) {
      toast({
        title: 'Nothing to save',
        description: usernameStatus.message || 'Please update your details before saving.',
        variant: 'destructive',
      });
      return;
    }
    if (isUsernameDirty && isUsernameChanged && !canSaveUsername) {
      toast({
        title: 'Username locked',
        description: usernameStatus.message || 'Username can only be changed every 7 days.',
        variant: 'destructive',
      });
    }
    setIsLoading(true);
    try {
      const updates: {
        username?: string;
        email?: string;
        phone?: string;
        bio?: string;
        website?: string;
        avatar?: string;
        banner?: string;
        socialX?: string;
        socialInstagram?: string;
        socialLinkedin?: string;
        socialTiktok?: string;
        socialYoutube?: string;
        socialFacebook?: string;
        socialGithub?: string;
      } = {};
      if (dirtyRef.current.email && isEmailChanged) {
        updates.email = formData.email;
      }
      if (isUsernameDirty && isUsernameChanged && canSaveUsername) {
        updates.username = formData.username;
      }
      if (dirtyRef.current.phone && isPhoneChanged) {
        updates.phone = formData.phone;
      }
      if (dirtyRef.current.bio && isBioChanged) {
        updates.bio = formData.bio;
      }
      if (dirtyRef.current.website && isWebsiteChanged) {
        updates.website = formData.website;
      }
      if (dirtyRef.current.avatar && isAvatarChanged) {
        updates.avatar = formData.avatar;
      }
      if (dirtyRef.current.banner && isBannerChanged) {
        updates.banner = formData.banner;
      }
      if (dirtyRef.current.socialX && isSocialXChanged) {
        updates.socialX = formData.socialX;
      }
      if (dirtyRef.current.socialInstagram && isSocialInstagramChanged) {
        updates.socialInstagram = formData.socialInstagram;
      }
      if (dirtyRef.current.socialLinkedin && isSocialLinkedinChanged) {
        updates.socialLinkedin = formData.socialLinkedin;
      }
      if (dirtyRef.current.socialTiktok && isSocialTiktokChanged) {
        updates.socialTiktok = formData.socialTiktok;
      }
      if (dirtyRef.current.socialYoutube && isSocialYoutubeChanged) {
        updates.socialYoutube = formData.socialYoutube;
      }
      if (dirtyRef.current.socialFacebook && isSocialFacebookChanged) {
        updates.socialFacebook = formData.socialFacebook;
      }
      if (dirtyRef.current.socialGithub && isSocialGithubChanged) {
        updates.socialGithub = formData.socialGithub;
      }
      if (Object.keys(updates).length === 0) {
        toast({
          title: 'Nothing to save',
          description: 'No valid changes to update.',
          variant: 'destructive',
        });
        return;
      }
      await updateUser(updates);
      clearDirty(Object.keys(updates) as ProfileFormField[]);
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

  const handleCompromised = async () => {
    setIsCompromisedLoading(true);
    try {
      await reportCompromised();
      setIsCompromisedOpen(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Please try again.';
      toast({
        title: 'Security update failed',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setIsCompromisedLoading(false);
    }
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
        {/* Profile Media */}
        <section className="bg-card rounded-xl border border-border p-6 space-y-6">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <User className="h-5 w-5 text-primary" />
            Profile
          </h2>
          <div className="space-y-3">
            <Label>Banner</Label>
            <div className="relative overflow-hidden rounded-xl border border-border">
              {formData.banner ? (
                <img src={formData.banner} alt="Profile banner" className="h-32 w-full object-cover" loading="lazy" decoding="async" />
              ) : (
                <div className="h-32 w-full bg-muted flex items-center justify-center text-sm text-muted-foreground">
                  Add a banner
                </div>
              )}
              <button
                className="absolute bottom-3 right-3 w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg hover:bg-primary/90 transition-colors"
                onClick={() => bannerFileRef.current?.click()}
              >
                <Camera className="h-4 w-4" />
              </button>
            </div>
            <Input
              placeholder="Paste banner image URL"
              value={formData.banner}
              autoComplete="off"
              onChange={(e) => {
                setFormData(prev => ({ ...prev, banner: e.target.value }));
                markDirty('banner');
              }}
            />
          </div>

          <div className="flex items-center gap-6">
            <div className="relative">
              <UserAvatar
                username={user?.username || 'User'}
                avatar={formData.avatar || undefined}
                status={user?.status || 'online'}
                size="xl"
              />
              <button
                className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg hover:bg-primary/90 transition-colors"
                onClick={() => avatarFileRef.current?.click()}
              >
                <Camera className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 space-y-2">
              <div>
                <p className="font-medium text-foreground">{user?.username ? `@${user.username}` : ''}</p>
                <p className="text-sm text-muted-foreground">{user?.email}</p>
                <p className="text-sm mt-1 flex items-center gap-1 text-muted-foreground">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      user?.status === 'online'
                        ? 'bg-status-online'
                        : user?.status === 'away'
                        ? 'bg-status-away'
                        : 'bg-status-offline'
                    }`}
                  />
                  {user?.status === 'online' ? 'Online' : user?.status === 'away' ? 'Away' : 'Offline'}
                </p>
              </div>
              <Input
                placeholder="Paste avatar image URL"
                value={formData.avatar}
                autoComplete="off"
                onChange={(e) => {
                  setFormData(prev => ({ ...prev, avatar: e.target.value }));
                  markDirty('avatar');
                }}
              />
            </div>
          </div>
          <input
            ref={avatarFileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => handleFileChange(e, 'avatar')}
          />
          <input
            ref={bannerFileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => handleFileChange(e, 'banner')}
          />
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
                autoComplete="off"
                onChange={(e) => {
                  setFormData(prev => ({ ...prev, username: e.target.value }));
                  markDirty('username');
                }}
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
              autoComplete="off"
              onChange={(e) => {
                setFormData(prev => ({ ...prev, email: e.target.value }));
                markDirty('email');
              }}
              placeholder="you@example.com"
            />
          </div>

        </section>

        {/* Profile Details */}
        <section className="bg-card rounded-xl border border-border p-6 space-y-4">
          <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
            <User className="h-5 w-5 text-primary" />
            Profile Details
          </h2>

          <div className="space-y-2">
            <Label htmlFor="bio">Bio</Label>
            <Input
              id="bio"
              value={formData.bio}
              autoComplete="off"
              onChange={(e) => {
                setFormData(prev => ({ ...prev, bio: e.target.value }));
                markDirty('bio');
              }}
              placeholder="Tell us about yourself"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Phone Number</Label>
            <Input
              id="phone"
              type="tel"
              value={formData.phone}
              autoComplete="off"
              onChange={(e) => {
                setFormData(prev => ({ ...prev, phone: e.target.value }));
                markDirty('phone');
              }}
              placeholder="+1 (555) 123-4567"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="website">Website</Label>
            <div className="relative">
              <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="website"
                value={formData.website}
                autoComplete="off"
                onChange={(e) => {
                  setFormData(prev => ({ ...prev, website: e.target.value }));
                  markDirty('website');
                }}
                placeholder="https://your-site.com"
                className="pl-9"
              />
            </div>
          </div>

          <div className="space-y-4">
            <Label>Social handles</Label>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">@</span>
                <Input
                  value={formData.socialX}
                  autoComplete="off"
                  onChange={(e) => {
                    setFormData(prev => ({ ...prev, socialX: e.target.value }));
                    markDirty('socialX');
                  }}
                  placeholder="X / Twitter"
                  className="pl-7"
                />
              </div>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">@</span>
                <Input
                  value={formData.socialInstagram}
                  autoComplete="off"
                  onChange={(e) => {
                    setFormData(prev => ({ ...prev, socialInstagram: e.target.value }));
                    markDirty('socialInstagram');
                  }}
                  placeholder="Instagram"
                  className="pl-7"
                />
              </div>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">@</span>
                <Input
                  value={formData.socialLinkedin}
                  autoComplete="off"
                  onChange={(e) => {
                    setFormData(prev => ({ ...prev, socialLinkedin: e.target.value }));
                    markDirty('socialLinkedin');
                  }}
                  placeholder="LinkedIn"
                  className="pl-7"
                />
              </div>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">@</span>
                <Input
                  value={formData.socialTiktok}
                  autoComplete="off"
                  onChange={(e) => {
                    setFormData(prev => ({ ...prev, socialTiktok: e.target.value }));
                    markDirty('socialTiktok');
                  }}
                  placeholder="TikTok"
                  className="pl-7"
                />
              </div>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">@</span>
                <Input
                  value={formData.socialYoutube}
                  autoComplete="off"
                  onChange={(e) => {
                    setFormData(prev => ({ ...prev, socialYoutube: e.target.value }));
                    markDirty('socialYoutube');
                  }}
                  placeholder="YouTube"
                  className="pl-7"
                />
              </div>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">@</span>
                <Input
                  value={formData.socialFacebook}
                  autoComplete="off"
                  onChange={(e) => {
                    setFormData(prev => ({ ...prev, socialFacebook: e.target.value }));
                    markDirty('socialFacebook');
                  }}
                  placeholder="Facebook"
                  className="pl-7"
                />
              </div>
              <div className="relative md:col-span-2">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">@</span>
                <Input
                  value={formData.socialGithub}
                  autoComplete="off"
                  onChange={(e) => {
                    setFormData(prev => ({ ...prev, socialGithub: e.target.value }));
                    markDirty('socialGithub');
                  }}
                  placeholder="GitHub"
                  className="pl-7"
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground flex items-center gap-2">
              <Link2 className="h-3.5 w-3.5" />
              Handles only (no full URLs).
            </p>
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
            <button
              className="w-full text-left p-3 rounded-lg border border-destructive/30 hover:bg-destructive/10 transition-colors"
              onClick={() => setIsCompromisedOpen(true)}
            >
              <p className="font-medium text-destructive">Account Compromised</p>
              <p className="text-sm text-muted-foreground">Sign out of other sessions and secure your account</p>
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
      <Dialog open={isCompromisedOpen} onOpenChange={setIsCompromisedOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Secure your account</DialogTitle>
            <DialogDescription>
              This will sign you out of other sessions and keep you signed in here.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCompromisedOpen(false)} disabled={isCompromisedLoading}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleCompromised} disabled={isCompromisedLoading}>
              {isCompromisedLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Secure account'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(cropImage)} onOpenChange={(open) => { if (!open) closeCropper(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {cropField === 'avatar' ? 'Crop profile photo' : 'Crop banner'}
            </DialogTitle>
          </DialogHeader>
          <div className="relative h-72 w-full overflow-hidden rounded-lg bg-muted sm:h-96">
            {cropImage && (
              <Cropper
                image={cropImage}
                crop={crop}
                zoom={zoom}
                aspect={cropAspect}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={handleCropComplete}
              />
            )}
          </div>
          <div className="flex items-center gap-3">
            <Label className="text-sm text-muted-foreground">Zoom</Label>
            <input
              type="range"
              min="1"
              max="3"
              step="0.05"
              value={zoom}
              onChange={(event) => setZoom(Number(event.target.value))}
              className="w-full accent-primary"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeCropper} disabled={isCropping}>
              Cancel
            </Button>
            <Button onClick={applyCrop} disabled={isCropping || !croppedAreaPixels}>
              {isCropping ? 'Cropping...' : 'Use image'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Profile;
