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
import LanguageWatcher from "@/components/LanguageWatcher";

const queryClient = new QueryClient();

const App = () => {
  const setAuth = useAuth((state) => state.setAuth);
  const authUser = useAuth((state) => state.user);
  const { profile, loading, fetchProfile, setupRealtimeListeners } = useUserProfile();

  useEffect(() => {
    let mounted = true;
    let unsubscribeRealtime: (() => void) | null = null;
    let lastFetchedUserId: string | null = null;

    const initAuth = async () => {
      console.warn("[App] initializing auth session");
      const { data } = await supabase.auth.getSession();
      console.warn("[App] supabase session loaded", { userId: data.session?.user?.id ?? null });
      if (mounted) {
        setAuth(data.session ?? null);
        if (data.session?.user) {
          lastFetchedUserId = data.session.user.id;
          console.warn("[App] triggering fetchProfile for user", data.session.user.id);
          console.warn("[App] fetchProfile function type", typeof fetchProfile);
          fetchProfile().catch((error) => console.error("[App] initAuth fetchProfile failed", error));
          console.warn("[App] auth state setting up realtime listeners for user", data.session.user.id);
          unsubscribeRealtime = setupRealtimeListeners(data.session.user.id);
        }
      }
    };

    initAuth();

    const { data: authListener } = supabase.auth.onAuthStateChange(async (_, session) => {
      console.warn("[App] auth state changed", { userId: session?.user?.id ?? null });
      if (mounted) {
        setAuth(session);
        unsubscribeRealtime?.();
        if (session?.user) {
          if (session.user.id !== lastFetchedUserId) {
            lastFetchedUserId = session.user.id;
            console.warn("[App] auth state triggers fetchProfile for user", session.user.id);
            console.warn("[App] fetchProfile function type", typeof fetchProfile);
            fetchProfile().catch((error) => console.error("[App] authListener fetchProfile failed", error));
          }
          console.warn("[App] auth state setting up realtime listeners for user", session.user.id);
          unsubscribeRealtime = setupRealtimeListeners(session.user.id);
        } else {
          console.warn("[App] auth state logout, clearing realtime listeners");
          unsubscribeRealtime = null;
          lastFetchedUserId = null;
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
        <LanguageWatcher />
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
