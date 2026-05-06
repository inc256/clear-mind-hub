import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";

export function AuthScreen() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [loadingAuth, setLoadingAuth] = useState(false);

  const authRedirectUrl = import.meta.env.VITE_AUTH_REDIRECT_URL || window.location.origin;

  // OAuth providers are always shown - errors are handled gracefully when clicked

  const handleProviderSignIn = async (provider: "google") => {
    setLoadingAuth(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: authRedirectUrl,
      },
    });
    if (error) {
      if (error.message.includes('Unsupported provider')) {
        toast.error(t('auth.errors.providerNotConfigured', { provider: provider.charAt(0).toUpperCase() + provider.slice(1) }));
      } else {
        toast.error(t('auth.errors.oauthFailed', { provider: provider.charAt(0).toUpperCase() + provider.slice(1) }));
      }
    }
    setLoadingAuth(false);
  };

  const handleEmailSubmit = async () => {
    if (!email || !password) {
      toast.error(t('auth.errors.missingFields'));
      return;
    }

    if (password.length < 6) {
      toast.error(t('auth.errors.passwordTooShort'));
      return;
    }

    setLoadingAuth(true);
    try {
      // First try to sign in (works for both existing and new users when confirmations are disabled)
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (signInError) {
        // If sign in fails and we're in register mode, try sign up
        if (authMode === "register") {
          const { error: signUpError } = await supabase.auth.signUp({
            email,
            password,
            options: {
              emailRedirectTo: authRedirectUrl,
            },
          });
          if (signUpError) throw signUpError;
          toast.success(t('auth.success.signUp'));
        } else {
          // Sign in failed and we're not in register mode
          throw signInError;
        }
      } else {
        // Sign in successful
        toast.success(t('auth.success.signIn'));
      }
    } catch (error: any) {
      console.error('Auth error:', error);
      toast.error(error?.message ?? t('auth.errors.generic'));
    }
    setLoadingAuth(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-accent/20 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8">
        {/* Header */}
        <div className="text-center space-y-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              {t('app.name')}
            </h1>
            <p className="text-muted-foreground mt-2">
              {t('auth.welcome.subtitle')}
            </p>
          </div>
        </div>

        {/* Auth Form */}
        <div className="glass-card rounded-2xl p-6 space-y-6">
          <div className="space-y-4">
            <div className="text-center space-y-2">
              <h2 className="text-xl font-semibold">
                {t('auth.welcome.title')}
              </h2>
              <p className="text-sm text-muted-foreground">
                {t('auth.welcome.description')}
              </p>
            </div>

            {/* OAuth Buttons */}
            <div className="space-y-3">
              <Button
                onClick={() => handleProviderSignIn("google")}
                disabled={loadingAuth}
                variant="outline"
                className="w-full h-11"
              >
                <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24">
                  <path
                    fill="currentColor"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="currentColor"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                {t('auth.signIn.google')}
              </Button>
            </div>

            {/* Divider */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">
                  {t('auth.divider')}
                </span>
              </div>
            </div>

            {/* Email/Password Form */}
            <div className="space-y-4">
              <div className="flex gap-2">
                <Button
                  variant={authMode === "login" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setAuthMode("login")}
                  className="flex-1"
                >
                  {t('auth.signIn.title')}
                </Button>
                <Button
                  variant={authMode === "register" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setAuthMode("register")}
                  className="flex-1"
                >
                  {t('auth.signUp.title')}
                </Button>
              </div>

              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="email">{t('auth.email')}</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={loadingAuth}
                    placeholder={t('auth.emailPlaceholder')}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">{t('auth.password')}</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={loadingAuth}
                    placeholder={t('auth.passwordPlaceholder')}
                  />
                </div>
                <Button
                  onClick={handleEmailSubmit}
                  disabled={loadingAuth}
                  className="w-full"
                >
                  {authMode === "login" ? t('auth.signIn.title') : t('auth.signUp.title')}
                </Button>
              </div>

              <p className="text-xs text-muted-foreground text-center">
                {t('auth.terms')}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}