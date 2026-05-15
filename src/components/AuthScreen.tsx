import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Sparkles, Mail, Lock, LogIn, UserPlus, Loader2 } from "lucide-react";
import appLogo from "@/images/Xplainfy-Icon-Rounded-1080px.png";

export function AuthScreen() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [loadingAuth, setLoadingAuth] = useState(false);

  const authRedirectUrl = import.meta.env.VITE_AUTH_REDIRECT_URL || window.location.origin;

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
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (signInError) {
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
          throw signInError;
        }
      } else {
        toast.success(t('auth.success.signIn'));
      }
    } catch (error: any) {
      console.error('Auth error:', error);
      toast.error(error?.message ?? t('auth.errors.generic'));
    }
    setLoadingAuth(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8">
        {/* Header with Logo */}
        <div className="text-center space-y-4">
          <div className="flex justify-center">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shadow-2xl ring-4 ring-primary/20">
              <img src={appLogo} alt="Logo" className="w-14 h-14 object-contain" />
            </div>
          </div>
          <div>
            <h1 className="text-4xl font-bold tracking-tight bg-gradient-to-r from-white to-white/70 bg-clip-text text-transparent">
              {t('app.name')}
            </h1>
            <p className="text-slate-400 mt-2 text-sm">
              {t('auth.welcome.subtitle')}
            </p>
          </div>
        </div>

        {/* Auth Form Card */}
        <div className="rounded-2xl bg-gradient-to-br from-slate-900/50 to-slate-800/30 backdrop-blur-sm border border-white/10 shadow-2xl p-6 space-y-6">
          <div className="space-y-4">
            <div className="text-center space-y-2">
              <div className="inline-flex p-3 rounded-xl bg-primary/20 text-primary">
                <Sparkles size={24} />
              </div>
              <h2 className="text-xl font-semibold text-white">
                {t('auth.welcome.title')}
              </h2>
              <p className="text-sm text-slate-400">
                {t('auth.welcome.description')}
              </p>
            </div>

            {/* OAuth Buttons */}
            <div className="space-y-3">
              <Button
                onClick={() => handleProviderSignIn("google")}
                disabled={loadingAuth}
                variant="outline"
                className="w-full h-12 rounded-2xl border-white/10 bg-slate-800/50 text-slate-300 hover:bg-white/10 hover:text-white transition-all duration-200 gap-3"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                <span className="font-semibold">{t('auth.signIn.google')}</span>
              </Button>
            </div>

            {/* Divider */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-white/10" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-slate-900/50 px-3 py-1 rounded-full text-slate-400 backdrop-blur-sm">
                  {t('auth.divider')}
                </span>
              </div>
            </div>

            {/* Email/Password Form */}
            <div className="space-y-4">
              <div className="flex gap-2 p-1 rounded-2xl bg-slate-800/50 border border-white/10">
                <Button
                  variant={authMode === "login" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setAuthMode("login")}
                  className={`flex-1 rounded-xl gap-2 transition-all duration-200 ${
                    authMode === "login" 
                      ? "bg-primary hover:bg-primary/80 text-white shadow-md" 
                      : "text-slate-400 hover:text-white hover:bg-white/10"
                  }`}
                >
                  <LogIn size={14} />
                  {t('auth.signIn.title')}
                </Button>
                <Button
                  variant={authMode === "register" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setAuthMode("register")}
                  className={`flex-1 rounded-xl gap-2 transition-all duration-200 ${
                    authMode === "register" 
                      ? "bg-primary hover:bg-primary/80 text-white shadow-md" 
                      : "text-slate-400 hover:text-white hover:bg-white/10"
                  }`}
                >
                  <UserPlus size={14} />
                  {t('auth.signUp.title')}
                </Button>
              </div>

              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                    <Mail size={14} className="text-primary" />
                    {t('auth.email')}
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={loadingAuth}
                    placeholder={t('auth.emailPlaceholder')}
                    className="rounded-2xl border-white/10 bg-slate-900/50 text-slate-200 placeholder:text-slate-500 focus:border-primary/50 transition-all duration-200 h-11"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password" className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                    <Lock size={14} className="text-primary" />
                    {t('auth.password')}
                  </Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={loadingAuth}
                    placeholder={t('auth.passwordPlaceholder')}
                    className="rounded-2xl border-white/10 bg-slate-900/50 text-slate-200 placeholder:text-slate-500 focus:border-primary/50 transition-all duration-200 h-11"
                  />
                </div>
                <Button
                  onClick={handleEmailSubmit}
                  disabled={loadingAuth}
                  className="w-full h-12 rounded-2xl gap-2 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 text-white font-semibold shadow-lg hover:shadow-primary/25 transition-all duration-200"
                >
                  {loadingAuth ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : authMode === "login" ? (
                    <LogIn size={16} />
                  ) : (
                    <UserPlus size={16} />
                  )}
                  {authMode === "login" ? t('auth.signIn.title') : t('auth.signUp.title')}
                </Button>
              </div>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-white/5" />
                </div>
                <div className="relative flex justify-center">
                  <span className="bg-slate-900 px-2 text-[10px] text-slate-500">
                    Secure authentication
                  </span>
                </div>
              </div>
              
              <p className="text-[11px] text-slate-500 text-center">
                {t('auth.terms')}
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center">
          <p className="text-[10px] text-slate-600">
            By continuing, you agree to our Terms of Service and Privacy Policy
          </p>
        </div>
      </div>
    </div>
  );
}