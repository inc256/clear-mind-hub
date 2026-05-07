import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/AppLayout";
import { AuthGuard } from "@/components/AuthGuard";
import Index from "./pages/Index.tsx";
import Research from "./pages/Research.tsx";
import History from "./pages/History.tsx";
import Profile from "./pages/Profile.tsx";
import Subscription from "./pages/Subscription.tsx";
import NotFound from "./pages/NotFound.tsx";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/store/auth";
import { useUserProfile } from "@/store/userProfile";

const queryClient = new QueryClient();

const App = () => {
  const setAuth = useAuth((state) => state.setAuth);
  const { fetchProfile, setupRealtimeListeners } = useUserProfile();

  useEffect(() => {
    let mounted = true;
    let unsubscribeRealtime: (() => void) | null = null;

    const initAuth = async () => {
      const { data } = await supabase.auth.getSession();
      if (mounted) {
        setAuth(data.session ?? null);
        // Load user profile if session exists
        if (data.session?.user) {
          await fetchProfile();
          // Set up real-time listeners for instant updates
          unsubscribeRealtime = setupRealtimeListeners(data.session.user.id);
        }
      }
    };

    initAuth();

    const { data: authListener } = supabase.auth.onAuthStateChange(async (_, session) => {
      if (mounted) {
        setAuth(session);
        // Load or clear user profile based on session
        if (session?.user) {
          await fetchProfile();
          // Set up real-time listeners for instant updates
          unsubscribeRealtime = setupRealtimeListeners(session.user.id);
        } else {
          // Clean up listeners on logout
          unsubscribeRealtime?.();
        }
      }
    });

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
      unsubscribeRealtime?.();
    };
  }, [setAuth, fetchProfile, setupRealtimeListeners]);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthGuard>
            <AppLayout>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/research" element={<Research />} />
              <Route path="/history" element={<History />} />
              <Route path="/history/:entryId" element={<History />} />
              <Route path="/subscription" element={<Subscription />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
            </AppLayout>
          </AuthGuard>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
