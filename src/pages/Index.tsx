import { useAuth } from '@/contexts/useAuth';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { MessageSquare, ArrowRight, Users, Shield, Zap } from 'lucide-react';

const Index = () => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-12 h-12 rounded-xl gradient-primary flex items-center justify-center animate-pulse">
          <MessageSquare className="h-6 w-6 text-primary-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        {/* Background gradient */}
        <div className="absolute inset-0 gradient-primary opacity-5" />
        <div className="absolute top-0 right-0 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-72 h-72 bg-primary/5 rounded-full blur-3xl" />

        <div className="relative max-w-6xl mx-auto px-4 py-20 sm:py-32">
          <div className="text-center animate-fade-in">
            {/* Logo */}
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl gradient-primary shadow-glow mb-8">
              <MessageSquare className="h-10 w-10 text-primary-foreground" />
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-foreground mb-6">
              Connect with anyone,
              <br />
              <span className="text-primary">anywhere</span>
            </h1>

            <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto mb-10">
              A modern messaging experience designed for seamless communication.
              Fast, secure, and beautifully crafted.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              {isAuthenticated ? (
                <Button size="lg" asChild className="text-base px-8">
                  <Link to="/chat">
                    Open Messages
                    <ArrowRight className="h-5 w-5 ml-2" />
                  </Link>
                </Button>
              ) : (
                <>
                  <Button size="lg" asChild className="text-base px-8">
                    <Link to="/register">
                      Get Started
                      <ArrowRight className="h-5 w-5 ml-2" />
                    </Link>
                  </Button>
                  <Button size="lg" variant="outline" asChild className="text-base px-8">
                    <Link to="/login">Sign In</Link>
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Features Section */}
      <section className="py-20 bg-card border-t border-border">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
              Why choose Strand Chat?
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Built with modern technology for a seamless messaging experience
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center p-6 rounded-2xl bg-background border border-border hover:border-primary/50 transition-colors animate-slide-up" style={{ animationDelay: '0ms' }}>
              <div className="w-14 h-14 rounded-xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-4">
                <Zap className="h-7 w-7" />
              </div>
              <h3 className="text-xl font-semibold text-foreground mb-2">Lightning Fast</h3>
              <p className="text-muted-foreground">
                Real-time messaging with instant delivery. Never miss a beat in your conversations.
              </p>
            </div>

            <div className="text-center p-6 rounded-2xl bg-background border border-border hover:border-primary/50 transition-colors animate-slide-up" style={{ animationDelay: '100ms' }}>
              <div className="w-14 h-14 rounded-xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-4">
                <Users className="h-7 w-7" />
              </div>
              <h3 className="text-xl font-semibold text-foreground mb-2">Group Chats</h3>
              <p className="text-muted-foreground">
                Create groups for teams, friends, or projects. Stay organized and connected.
              </p>
            </div>

            <div className="text-center p-6 rounded-2xl bg-background border border-border hover:border-primary/50 transition-colors animate-slide-up" style={{ animationDelay: '200ms' }}>
              <div className="w-14 h-14 rounded-xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-4">
                <Shield className="h-7 w-7" />
              </div>
              <h3 className="text-xl font-semibold text-foreground mb-2">Secure & Private</h3>
              <p className="text-muted-foreground">
                Your conversations are protected. Privacy and security are our top priorities.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 border-t border-border">
        <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            <span className="font-semibold text-foreground">Strand Chat</span>
          </div>
          <p className="text-sm text-muted-foreground">
            Built with React, TypeScript, and Tailwind CSS
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
