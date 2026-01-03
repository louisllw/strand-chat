import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { apiFetch } from '@/lib/api';
import { UserProfile } from '@/types';
import { useAuth } from '@/contexts/useAuth';
import { UserAvatar } from '@/components/chat/UserAvatar';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ArrowLeft, Link2, User as UserIcon } from 'lucide-react';

const UserProfilePage = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAvatarOpen, setIsAvatarOpen] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const loadProfile = async () => {
      if (!id) {
        setError('Missing user id.');
        setIsLoading(false);
        return;
      }
      try {
        const data = await apiFetch<{ user: UserProfile }>(`/api/users/${id}`);
        if (!isMounted) return;
        setProfile({
          ...data.user,
          lastSeen: data.user.lastSeen ? new Date(data.user.lastSeen) : null,
          createdAt: data.user.createdAt ? new Date(data.user.createdAt) : null,
        });
        setError(null);
      } catch (err) {
        if (!isMounted) return;
        const message = err instanceof Error ? err.message : 'Unable to load profile.';
        setError(message);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };
    loadProfile();
    return () => {
      isMounted = false;
    };
  }, [id]);

  const isSelf = useMemo(() => profile?.id && user?.id && profile.id === user.id, [profile?.id, user?.id]);

  const statusLabel = profile?.status === 'online'
    ? 'Online'
    : profile?.status === 'away'
    ? 'Away'
    : 'Offline';
  const websiteHref = profile?.website
    ? (/^https?:\/\//i.test(profile.website) ? profile.website : `https://${profile.website}`)
    : '';

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 bg-card border-b border-border px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center gap-4">
          <Button variant="icon" size="icon" onClick={() => navigate('/chat')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-lg font-semibold text-foreground">Profile</h1>
            <p className="text-sm text-muted-foreground">
              {isSelf ? 'Your public profile' : 'User details'}
            </p>
          </div>
          {isSelf ? (
            <Button variant="outline" asChild>
              <Link to="/profile">Edit</Link>
            </Button>
          ) : null}
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-4 space-y-6">
        {isLoading ? (
          <section className="bg-card rounded-xl border border-border p-6">
            <p className="text-sm text-muted-foreground">Loading profile...</p>
          </section>
        ) : error ? (
          <section className="bg-card rounded-xl border border-border p-6">
            <p className="text-sm text-destructive">{error}</p>
          </section>
        ) : profile ? (
          <>
            <section className="bg-card rounded-xl border border-border overflow-hidden">
              {profile.banner ? (
                <img src={profile.banner} alt="Profile banner" className="h-32 w-full object-cover" loading="lazy" decoding="async" />
              ) : (
                <div className="h-32 w-full bg-muted" />
              )}
            </section>
            <section className="bg-card rounded-xl border border-border p-6">
              <div className="flex items-center gap-6">
                <button
                  type="button"
                  onClick={() => setIsAvatarOpen(true)}
                  className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  aria-label="Expand profile image"
                  disabled={!profile.avatar}
                >
                  <UserAvatar
                    username={profile.username}
                    avatar={profile.avatar || undefined}
                    status={profile.status}
                    size="xl"
                    className={profile.avatar ? 'cursor-zoom-in' : undefined}
                  />
                </button>
                <div className="flex-1">
                  <p className="text-lg font-semibold text-foreground">@{profile.username}</p>
                  <p className="text-sm text-muted-foreground flex items-center gap-2 mt-1">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        profile.status === 'online'
                          ? 'bg-status-online'
                          : profile.status === 'away'
                          ? 'bg-status-away'
                          : 'bg-status-offline'
                      }`}
                    />
                    {statusLabel}
                    {profile.lastSeen ? `· Last seen ${profile.lastSeen.toLocaleString()}` : ''}
                  </p>
                </div>
              </div>
            </section>

            <section className="bg-card rounded-xl border border-border p-6 space-y-4">
              <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                <UserIcon className="h-5 w-5 text-primary" />
                About
              </h2>
              <div className="space-y-3">
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Bio</p>
                  <p className="text-sm text-foreground">
                    {profile.bio ? profile.bio : 'No bio yet.'}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Phone</p>
                  <p className="text-sm text-foreground">
                    {profile.phone ? profile.phone : 'Not shared.'}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Website</p>
                  {profile.website ? (
                    <a
                      className="text-sm text-primary hover:underline flex items-center gap-2"
                      href={websiteHref}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Link2 className="h-4 w-4" />
                      {profile.website}
                    </a>
                  ) : (
                    <p className="text-sm text-foreground">Not shared.</p>
                  )}
                </div>
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Member since</p>
                  <p className="text-sm text-foreground">
                    {profile.createdAt ? profile.createdAt.toLocaleDateString() : 'Unknown'}
                  </p>
                </div>
              </div>
            </section>

            <section className="bg-card rounded-xl border border-border p-6 space-y-4">
              <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                <Link2 className="h-5 w-5 text-primary" />
                Socials
              </h2>
              <div className="grid gap-3 md:grid-cols-2 text-sm">
                <div>
                  <p className="text-xs uppercase text-muted-foreground">X / Twitter</p>
                  <p className="text-foreground">{profile.socialX ? `@${profile.socialX}` : 'Not shared.'}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Instagram</p>
                  <p className="text-foreground">{profile.socialInstagram ? `@${profile.socialInstagram}` : 'Not shared.'}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-muted-foreground">LinkedIn</p>
                  <p className="text-foreground">{profile.socialLinkedin ? `@${profile.socialLinkedin}` : 'Not shared.'}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-muted-foreground">TikTok</p>
                  <p className="text-foreground">{profile.socialTiktok ? `@${profile.socialTiktok}` : 'Not shared.'}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-muted-foreground">YouTube</p>
                  <p className="text-foreground">{profile.socialYoutube ? `@${profile.socialYoutube}` : 'Not shared.'}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Facebook</p>
                  <p className="text-foreground">{profile.socialFacebook ? `@${profile.socialFacebook}` : 'Not shared.'}</p>
                </div>
                <div className="md:col-span-2">
                  <p className="text-xs uppercase text-muted-foreground">GitHub</p>
                  <p className="text-foreground">{profile.socialGithub ? `@${profile.socialGithub}` : 'Not shared.'}</p>
                </div>
              </div>
            </section>
          </>
        ) : null}

        {!isLoading && !error ? (
          <section className="bg-card rounded-xl border border-border p-6">
            <Button variant="outline" className="w-full" onClick={() => navigate('/chat')}>
              Back to chat
            </Button>
          </section>
        ) : null}
      </main>

      <Dialog open={isAvatarOpen} onOpenChange={setIsAvatarOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Profile image</DialogTitle>
            <DialogDescription className="sr-only">
              Enlarged view of the selected profile avatar.
            </DialogDescription>
          </DialogHeader>
          {profile?.avatar ? (
            <img src={profile.avatar} alt={`${profile.username} avatar`} className="w-full rounded-lg" loading="lazy" decoding="async" />
          ) : (
            <p className="text-sm text-muted-foreground">No profile image to display.</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default UserProfilePage;
