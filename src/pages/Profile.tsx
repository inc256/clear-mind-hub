import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useSettings } from "@/store/settings";
import { useAuth } from "@/store/auth";
import { useUserProfile } from "@/store/userProfile";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { Shield, Globe, CreditCard, Zap } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const languageOptions = [
  { value: "en", label: "English" },
  { value: "ar", label: "العربية (Arabic)" },
  { value: "fr", label: "Français (French)" },
  { value: "zh", label: "中文 (Chinese)" },
  { value: "sw", label: "Kiswahili (Swahili)" },
];

const Profile = () => {
  const s = useSettings();
  const auth = useAuth();
  const profile = useUserProfile();
  const { t, i18n } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [loadingAuth, setLoadingAuth] = useState(false);
  const [editing, setEditing] = useState(false);
  const [fullName, setFullName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");

  const handleProviderSignIn = async (provider: "google" | "apple") => {
    setLoadingAuth(true);
    const { error } = await supabase.auth.signInWithOAuth({ provider });
    if (error) {
      toast.error(error.message);
    }
    setLoadingAuth(false);
  };

  const handleEmailSubmit = async () => {
    if (!email || !password) {
      toast.error("Please enter both email and password.");
      return;
    }

    setLoadingAuth(true);
    try {
      if (authMode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Signed in successfully.");
      } else {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        toast.success("Registration complete. If your project requires email confirmation, check your inbox.");
      }
    } catch (error: any) {
      toast.error(error?.message ?? "Unable to authenticate.");
    }
    setLoadingAuth(false);
  };

  const handleSignOut = async () => {
    await auth.signOut();
    toast.success("Signed out successfully.");
  };

  const handleSaveProfile = async () => {
    if (!fullName.trim()) {
      toast.error("Full name cannot be empty.");
      return;
    }

    try {
      await profile.updateProfile({
        full_name: fullName.trim(),
        avatar_url: avatarUrl.trim() || null,
      });
      setEditing(false);
      toast.success("Profile updated successfully.");
    } catch (error: any) {
      console.error("Profile update error:", error);
      toast.error(error?.message || "Failed to update profile. Please try again.");
    }
  };

  useEffect(() => {
    if (s.language && s.language !== i18n.language) {
      i18n.changeLanguage(s.language);
    }
  }, [s.language, i18n]);

  useEffect(() => {
    if (auth.user) {
      profile.fetchProfile();
    }
  }, [auth.user]); // Removed profile from dependencies to prevent infinite loop

  useEffect(() => {
    if (profile.profile) {
      setFullName(profile.profile.full_name || "");
      setAvatarUrl(profile.profile.avatar_url || "");
    }
  }, [profile.profile]);



  return (
    <div className="mx-auto w-full max-w-2xl px-4 sm:px-6 py-6 sm:py-10 space-y-6">
      <header className="space-y-2">
        <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight">{t('profile.title')}</h1>
        <p className="text-muted-foreground text-sm">{t('profile.subtitle')}</p>
      </header>

      <section className="glass-card rounded-2xl p-5 sm:p-6">
        <div className="grid gap-4">
          {auth.user ? (
              <div className="space-y-3">
                <div className="rounded-2xl border border-border p-4">
                  <p className="text-sm text-muted-foreground">{t('profile.signedInAs')}</p>
                  <p className="mt-1 text-base font-medium text-foreground">{auth.user.email ?? auth.user.id}</p>
                  <p className="text-xs text-muted-foreground mt-1">{auth.user.role ?? t('profile.user')}</p>
                </div>
                {profile.loading ? (
                  <div className="rounded-2xl border border-border p-4">
                    <p className="text-sm text-muted-foreground">Loading profile...</p>
                  </div>
                ) : profile.profile ? (
                  <div className="rounded-2xl border border-border p-6 space-y-4">
                    {/* Profile Header */}
                    <div className="flex items-center gap-4">
                      <div className="relative">
                        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center overflow-hidden">
                          {profile.profile.avatar_url ? (
                            <img
                              src={profile.profile.avatar_url}
                              alt="Profile"
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                                e.currentTarget.nextElementSibling?.classList.remove('hidden');
                              }}
                            />
                          ) : null}
                          <div className={`w-full h-full flex items-center justify-center text-primary text-xl font-semibold ${profile.profile.avatar_url ? 'hidden' : ''}`}>
                            {(profile.profile.full_name || auth.user?.email || 'U')[0].toUpperCase()}
                          </div>
                        </div>
                        {editing && (
                          <button
                            onClick={() => document.getElementById('avatarUrl')?.focus()}
                            className="absolute -bottom-1 -right-1 w-6 h-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-xs hover:bg-primary/90 transition-colors"
                          >
                            ✏️
                          </button>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-lg font-semibold text-foreground">
                          {profile.profile.full_name || "No name set"}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          {auth.user?.email}
                        </p>
                        <p className="text-sm text-muted-foreground mt-1">
                          {profile.profile.credits} credits available
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setEditing(!editing)}
                      >
                        {editing ? "Cancel" : "Edit Profile"}
                      </Button>
                    </div>

                    {/* Edit Form */}
                    {editing && (
                      <div className="border-t border-border pt-4 space-y-4">
                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="space-y-2">
                            <Label htmlFor="fullName">Full Name</Label>
                            <Input
                              id="fullName"
                              value={fullName}
                              onChange={(e) => setFullName(e.target.value)}
                              placeholder="Enter your full name"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="avatarUrl">Avatar URL</Label>
                            <Input
                              id="avatarUrl"
                              value={avatarUrl}
                              onChange={(e) => setAvatarUrl(e.target.value)}
                              placeholder="https://example.com/avatar.jpg"
                            />
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button onClick={handleSaveProfile} disabled={profile.loading}>
                            {profile.loading ? "Saving..." : "Save Changes"}
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => {
                              setFullName(profile.profile?.full_name || "");
                              setAvatarUrl(profile.profile?.avatar_url || "");
                              setEditing(false);
                            }}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-border p-4">
                    <p className="text-sm text-muted-foreground">Profile not found. Try refreshing.</p>
                  </div>
                )}
                <Button size="sm" variant="secondary" onClick={handleSignOut}>
                  {t('profile.signOut')}
                </Button>
              </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <p className="text-sm font-semibold">{t('auth.welcome.title')}</p>
                <p className="text-sm text-muted-foreground">
                  {t('auth.welcome.description')}
                </p>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  onClick={() => handleProviderSignIn("google")}
                  disabled={loadingAuth}
                  className="w-full"
                >
                  {t('auth.signIn.google')}
                </Button>
                <Button
                  onClick={() => handleProviderSignIn("apple")}
                  disabled={loadingAuth}
                  className="w-full"
                >
                  {t('auth.signIn.apple')}
                </Button>
              </div>

              <div className="grid gap-3">
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant={authMode === "login" ? "default" : "secondary"}
                    size="sm"
                    onClick={() => setAuthMode("login")}
                  >
                    {t('auth.signIn.title')}
                  </Button>
                  <Button
                    variant={authMode === "register" ? "default" : "secondary"}
                    size="sm"
                    onClick={() => setAuthMode("register")}
                  >
                    {t('auth.signUp.title')}
                  </Button>
                </div>

                  <div className="grid gap-3">
                    <div className="grid gap-1">
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
                    <div className="grid gap-1">
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
                    <Button onClick={handleEmailSubmit} disabled={loadingAuth}>
                      {authMode === "login" ? t('auth.signIn.title') : t('auth.signUp.title')}
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      {t('auth.terms')}
                    </p>
                  </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Credits */}
      <section className="glass-card rounded-2xl p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <div className="grid place-items-center h-10 w-10 rounded-xl bg-accent text-primary">
            <Zap size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold">{t('profile.credits.title')}</h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {t('profile.credits.description')}
                </p>
              </div>
            </div>
            <div className="mt-3">
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold text-primary">
                  {profile.profile?.credits ?? 0}
                </span>
                <span className="text-sm text-muted-foreground">
                  {t('profile.credits.available')}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {t('profile.credits.usage')}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Subscription */}
      <section className="glass-card rounded-2xl p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <div className="grid place-items-center h-10 w-10 rounded-xl bg-accent text-primary">
            <CreditCard size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold">{t('profile.subscription.title')}</h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {t('profile.subscription.description')}
                </p>
              </div>
            </div>
            <div className="mt-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium capitalize">
                      {profile.profile?.subscription_plan ?? 'free'}
                    </span>
                    <span className={`px-2 py-1 rounded-full text-xs ${
                      profile.profile?.subscription_status === 'active'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}>
                      {profile.profile?.subscription_status ?? 'active'}
                    </span>
                  </div>
                  {profile.profile?.subscription_expires_at && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {t('profile.subscription.expires')}: {new Date(profile.profile.subscription_expires_at).toLocaleDateString()}
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Link to="/subscription">
                    <Button variant="outline" size="sm">
                      {t('profile.subscription.viewPlans')}
                    </Button>
                  </Link>
                  {profile.profile?.subscription_plan !== 'pro' && (
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => toast.info(t('profile.subscription.upgradeComingSoon'))}
                    >
                      {t('profile.subscription.upgrade')}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Privacy */}
      <section className="glass-card rounded-2xl p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <div className="grid place-items-center h-10 w-10 rounded-xl bg-accent text-primary">
            <Shield size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold">{t('profile.privacy.title')}</h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {t('profile.privacy.description')}
                </p>
              </div>
              <Switch checked={s.privacyMode} onCheckedChange={s.setPrivacyMode} />
            </div>
            {s.privacyMode && (
              <div className="mt-3 rounded-xl bg-accent/60 border border-primary/15 px-3 py-2 text-xs text-accent-foreground">
                {t('profile.privacy.active')}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Language */}
      <section className="glass-card rounded-2xl p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <div className="grid place-items-center h-10 w-10 rounded-xl bg-accent text-primary">
            <Globe size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold">{t('profile.language.title')}</h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {t('profile.language.description')}
                </p>
              </div>
            </div>
            <div className="mt-3">
              <Select value={i18n.language || "en"} placeholder="" onValueChange={(value) => {
                i18n.changeLanguage(value);
                s.setLanguage(value);
              }}>
                <SelectTrigger className="w-full max-w-xs">
                  <SelectValue placeholder="" />
                </SelectTrigger>
                <SelectContent>
                  {languageOptions.map(({ value, label }) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </section>



      <p className="text-center text-xs text-muted-foreground pt-4">
        {t('profile.footer')}
      </p>
    </div>
  );
};

export default Profile;
