import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ChatProvider } from "@/contexts/ChatContext";
import { SocketProvider } from "@/contexts/SocketContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { useAuth } from "@/contexts/useAuth";

import Index from "./pages/Index";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Chat from "./pages/Chat";
import Profile from "./pages/Profile";
import UserProfile from "./pages/UserProfile";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const LoadingScreen = () => (
  <div className="fixed inset-0 grid place-items-center bg-background overflow-hidden">
    <div className="relative">
      <div className="relative h-16 w-16">
        <div className="absolute inset-0 rounded-full border border-primary/30" />
        <div className="absolute inset-0 rounded-full border-t-2 border-primary animate-spin [animation-duration:1.2s]" />
        <div className="absolute inset-2 rounded-full bg-primary/5" />
      </div>
      <div className="mt-5 text-center text-[11px] font-medium tracking-[0.28em] text-muted-foreground">
        LOADING
      </div>
    </div>
  </div>
);

// Protected route wrapper
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <LoadingScreen />;
  }

  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
};

// Guest route wrapper (redirect to chat if already logged in)
const GuestRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <LoadingScreen />;
  }

  return !isAuthenticated ? <>{children}</> : <Navigate to="/chat" replace />;
};

const AppRoutes = () => {
  return (
    <Routes>
      <Route path="/" element={<Index />} />
      <Route
        path="/login"
        element={
          <GuestRoute>
            <Login />
          </GuestRoute>
        }
      />
      <Route
        path="/register"
        element={
          <GuestRoute>
            <Register />
          </GuestRoute>
        }
      />
      <Route
        path="/chat"
        element={
          <ProtectedRoute>
            <Chat />
          </ProtectedRoute>
        }
      />
      <Route
        path="/profile"
        element={
          <ProtectedRoute>
            <Profile />
          </ProtectedRoute>
        }
      />
      <Route
        path="/users/:id"
        element={
          <ProtectedRoute>
            <UserProfile />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <SocketProvider>
        <AuthProvider>
          <ChatProvider>
            <TooltipProvider>
              <Toaster />
              <Sonner />
              <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
                <AppRoutes />
              </BrowserRouter>
            </TooltipProvider>
          </ChatProvider>
        </AuthProvider>
      </SocketProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
