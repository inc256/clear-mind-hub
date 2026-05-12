import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useSettings } from "@/store/settings";
import { useAuth } from "@/store/auth";
import { useUserProfile } from "@/store/userProfile";
import { getFreeTierStatus } from "@/services/aiService";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Globe, 
  CreditCard, 
  Zap, 
  User, 
  Mail, 
  Calendar,
  CheckCircle,
  Crown,
  Star,
  Settings,
  LogOut,
  Edit2,
  Upload,
  RefreshCw,
  AlertCircle,
  X,
  MessageCircle
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import appLogo from "@/images/Xplainfy-Icon-Rounded-1080px.png";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { FeedbackDialog } from "@/components/FeedbackDialog";
import { FeedbackService, type Feedback } from "@/services/feedbackService";
import { analytics } from "@/lib/analytics";

const languageOptions = [
  { value: "en", label: "English", flag: "🇺🇸" },
  { value: "ar", label: "العربية", flag: "🇸🇦" },
  { value: "fr", label: "Français", flag: "🇫🇷" },
  { value: "zh", label: "中文", flag: "🇨🇳" },
  { value: "sw", label: "Kiswahili", flag: "🇰🇪" },
];

const Profile = () => {
  const s = useSettings();
  const auth = useAuth();
  const profile = useUserProfile();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [loadingAuth, setLoadingAuth] = useState(false);
  const [editing, setEditing] = useState(false);
  const [fullName, setFullName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarError, setAvatarError] = useState(false);
  const [showSignOutDialog, setShowSignOutDialog] = useState(false);
  const [showFeedbackDialog, setShowFeedbackDialog] = useState(false);

  const freeStatus = getFreeTierStatus(profile.profile, profile.subscriptions);
  const totalCredits = (profile.profile?.credits ?? 0) + freeStatus.remaining;
  const creditsLabel = freeStatus.remaining > 0
    ? `${profile.profile?.credits ?? 0} paid + ${freeStatus.remaining} free daily`
    : `${profile.profile?.credits ?? 0} paid credits`;

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
    try {
      await auth.signOut();
      toast.success("Signed out successfully.");
      navigate("/");
      setShowSignOutDialog(false);
    } catch (error: any) {
      toast.error(error?.message ?? "Failed to sign out.");
    }
  };

  const uploadAvatar = async () => {
    if (!avatarFile || !auth.user) return avatarUrl;

    const fileExt = avatarFile.name.split('.').pop();
    const fileName = `${auth.user.id}_${Date.now()}.${fileExt}`;
    const { data, error } = await supabase.storage
      .from('avatars')
      .upload(fileName, avatarFile);

    if (error) throw error;

    const { data: { publicUrl } } = supabase.storage
      .from('avatars')
      .getPublicUrl(fileName);

    return publicUrl;
  };

  const handleSaveProfile = async () => {
    if (!fullName.trim()) {
      toast.error("Full name cannot be empty.");
      return;
    }

    try {
      let newAvatarUrl = avatarUrl.trim() || null;
      if (avatarFile) {
        newAvatarUrl = await uploadAvatar();
      }

      await profile.updateProfile({
        full_name: fullName.trim(),
        avatar_url: newAvatarUrl,
      });
      setAvatarFile(null);
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
  }, [auth.user]);

  useEffect(() => {
    const avatar = profile.cachedAvatarUrl || profile.profile?.avatar_url || "";
    const name = profile.cachedFullName || profile.profile?.full_name || "";

    setFullName(name);
    setAvatarUrl(avatar);
    setAvatarError(false);
  }, [profile.cachedAvatarUrl, profile.cachedFullName, profile.profile?.avatar_url, profile.profile?.full_name]);

  const getSubscriptionBadge = () => {
    const plan = profile.profile?.subscription_plan ?? 'free';
    if (plan === 'pro') {
      return { label: 'Pro Plan', color: 'bg-gradient-to-r from-amber-500 to-orange-500', icon: Crown };
    }
    return { label: 'Free Plan', color: 'bg-gradient-to-r from-gray-500 to-gray-600', icon: Star };
  };

  const SubscriptionBadge = getSubscriptionBadge();

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <div className="mx-auto w-full max-w-4xl px-4 sm:px-6 py-6 sm:py-10 space-y-6">
        {/* Header with gradient */}
        <header className="space-y-3 text-center sm:text-left">
          <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
            {t('profile.title')}
          </h1>
          <p className="text-muted-foreground text-sm max-w-2xl mx-auto sm:mx-0">
            {t('profile.subtitle')}
          </p>
        </header>

        {/* Main Content */}
        <div className="space-y-6">
          {/* Authentication Section */}
          <section className="backdrop-blur-xl bg-card/50 rounded-2xl border border-border/50 shadow-xl overflow-hidden">
            <div className="p-6 sm:p-8">
              {auth.user ? (
                <div className="space-y-6">
                  {/* User Info Card */}
                  <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary/5 to-transparent">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-3xl" />
                    <div className="relative p-6 space-y-6">
                      {/* Profile Header */}
                      <div className="flex flex-col sm:flex-row items-center gap-6">
                        {/* Avatar */}
                        <div className="relative group">
                          <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-gradient-to-br from-primary/30 to-primary/5 flex items-center justify-center overflow-hidden ring-4 ring-primary/20 shadow-lg">
                            {(profile.cachedAvatarUrl || profile.profile?.avatar_url) && !avatarError ? (
                              <img
                                src={profile.cachedAvatarUrl || profile.profile?.avatar_url || ''}
                                alt="Profile"
                                className="w-full h-full object-cover"
                                onError={() => setAvatarError(true)}
                                onLoad={() => setAvatarError(false)}
                              />
                            ) : null}
                            {(!(profile.cachedAvatarUrl || profile.profile?.avatar_url) || avatarError) && (
                              <img
                                src={appLogo}
                                alt="App Logo"
                                className="w-full h-full object-cover rounded-full"
                              />
                            )}
                          </div>
                          {editing && (
                            <label className="absolute bottom-0 right-0 p-1.5 bg-primary text-primary-foreground rounded-full cursor-pointer hover:bg-primary/90 transition-all shadow-lg">
                              <Upload size={14} />
                              <input
                                type="file"
                                className="hidden"
                                accept="image/*"
                                onChange={(e) => setAvatarFile(e.target.files?.[0] || null)}
                              />
                            </label>
                          )}
                        </div>

                        {/* User Details */}
                        <div className="flex-1 text-center sm:text-left">
                          <div className="flex flex-col sm:flex-row items-center gap-3 mb-2">
                            <h3 className="text-xl sm:text-2xl font-bold text-foreground">
                              {(profile.cachedFullName || profile.profile?.full_name) || "No name set"}
                            </h3>
                            <div className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${SubscriptionBadge.color} text-white shadow-sm`}>
                              <SubscriptionBadge.icon size={12} />
                              <span>{SubscriptionBadge.label}</span>
                            </div>
                          </div>
                          <div className="flex items-center justify-center sm:justify-start gap-2 text-sm text-muted-foreground">
                            <Mail size={14} />
                            <span>{auth.user?.email}</span>
                          </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => profile.refreshCredits()}
                            disabled={profile.loading}
                            className="gap-2"
                          >
                            <RefreshCw size={14} className={profile.loading ? "animate-spin" : ""} />
                            {profile.loading ? "Refreshing..." : "Refresh"}
                          </Button>
                          <Button
                            size="sm"
                            variant={editing ? "secondary" : "default"}
                            onClick={() => setEditing(!editing)}
                            className="gap-2"
                          >
                            <Edit2 size={14} />
                            {editing ? "Cancel" : "Edit Profile"}
                          </Button>
                        </div>
                      </div>

                      {/* Edit Form */}
                      {editing && (
                        <div className="border-t border-border pt-6 space-y-4 animate-in slide-in-from-top-2">
                          <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                              <Label htmlFor="fullName" className="text-sm font-medium">
                                Full Name
                              </Label>
                              <Input
                                id="fullName"
                                value={fullName}
                                onChange={(e) => setFullName(e.target.value)}
                                placeholder="Enter your full name"
                                className="bg-background/50"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="avatarUrl" className="text-sm font-medium">
                                Avatar URL
                              </Label>
                              <Input
                                id="avatarUrl"
                                value={avatarUrl}
                                onChange={(e) => setAvatarUrl(e.target.value)}
                                placeholder="https://example.com/avatar.jpg"
                                className="bg-background/50"
                              />
                            </div>
                          </div>
                          <div className="flex gap-3">
                            <Button onClick={handleSaveProfile} disabled={profile.loading} className="gap-2">
                              {profile.loading ? (
                                <>
                                  <RefreshCw size={16} className="animate-spin" />
                                  Saving...
                                </>
                              ) : (
                                <>
                                  <CheckCircle size={16} />
                                  Save Changes
                                </>
                              )}
                            </Button>
                            <Button
                              variant="outline"
                              onClick={() => {
                                setFullName(profile.profile?.full_name || "");
                                setAvatarUrl(profile.profile?.avatar_url || "");
                                setAvatarFile(null);
                                setEditing(false);
                              }}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Sign Out Button */}
                  <Button 
                    variant="destructive" 
                    onClick={() => setShowSignOutDialog(true)}
                    className="w-full gap-2"
                  >
                    <LogOut size={16} />
                    {t('profile.signOut')}
                  </Button>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="text-center space-y-2">
                    <div className="inline-flex p-3 rounded-full bg-primary/10 text-primary mb-2">
                      <User size={24} />
                    </div>
                    <h3 className="text-xl font-semibold">{t('auth.welcome.title')}</h3>
                    <p className="text-sm text-muted-foreground">
                      {t('auth.welcome.description')}
                    </p>
                  </div>

                  {/* OAuth Buttons */}
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <Button
                      onClick={() => handleProviderSignIn("google")}
                      disabled={loadingAuth}
                      variant="outline"
                      className="w-full gap-2"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24">
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                      </svg>
                      {t('auth.signIn.google')}
                    </Button>
                    <Button
                      onClick={() => handleProviderSignIn("apple")}
                      disabled={loadingAuth}
                      variant="outline"
                      className="w-full gap-2"
                    >
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.898-1.389 2.312-1.228 3.668 1.3.104 2.624-.688 3.515-1.656z"/>
                      </svg>
                      {t('auth.signIn.apple')}
                    </Button>
                  </div>

                  {/* Divider */}
                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-border"></div>
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-card px-2 text-muted-foreground">Or continue with email</span>
                    </div>
                  </div>

                  {/* Email Auth */}
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        variant={authMode === "login" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setAuthMode("login")}
                        className="w-full"
                      >
                        Sign In
                      </Button>
                      <Button
                        variant={authMode === "register" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setAuthMode("register")}
                        className="w-full"
                      >
                        Sign Up
                      </Button>
                    </div>

                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="email">{t('auth.email')}</Label>
                        <Input
                          id="email"
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          disabled={loadingAuth}
                          placeholder={t('auth.emailPlaceholder')}
                          className="bg-background/50"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="password">{t('auth.password')}</Label>
                        <Input
                          id="password"
                          type="password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          disabled={loadingAuth}
                          placeholder={t('auth.passwordPlaceholder')}
                          className="bg-background/50"
                        />
                      </div>
                      <Button onClick={handleEmailSubmit} disabled={loadingAuth} className="w-full gap-2">
                        {loadingAuth && <RefreshCw size={16} className="animate-spin" />}
                        {authMode === "login" ? t('auth.signIn.title') : t('auth.signUp.title')}
                      </Button>
                      <p className="text-xs text-muted-foreground text-center">
                        {t('auth.terms')}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Credits Section */}
          <section className="backdrop-blur-xl bg-card/50 rounded-2xl border border-border/50 shadow-xl overflow-hidden group hover:border-primary/30 transition-all duration-300">
            <div className="p-6 sm:p-8">
              <div className="flex items-start gap-5">
                <div className="grid place-items-center h-12 w-12 rounded-xl bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-lg group-hover:scale-110 transition-transform duration-300">
                  <Zap size={22} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h2 className="text-xl font-semibold">{t('profile.credits.title')}</h2>
                      <p className="text-sm text-muted-foreground mt-1">
                        {t('profile.credits.description')}
                      </p>
                    </div>
                    <Link to="/subscription">
                      <Button variant="outline" size="sm" className="gap-2">
                        <Zap size={14} />
                        Get More Credits
                      </Button>
                    </Link>
                  </div>
                  <div className="mt-4">
                    <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-2">
                      <div>
                        <div className="flex items-baseline gap-2">
                          <span className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                            {totalCredits}
                          </span>
                          <span className="text-sm text-muted-foreground">
                            {t('profile.credits.available')}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">
                          {creditsLabel}
                        </p>
                      </div>
                      <div className="rounded-2xl bg-muted px-3 py-2 text-xs text-muted-foreground">
                        {freeStatus.remaining > 0
                          ? `Free daily credits remaining: ${freeStatus.remaining}`
                          : 'Daily free credits reset each day.'}
                      </div>
                    </div>
                    <Progress 
                      value={Math.min(totalCredits / 100 * 100, 100)} 
                      className="mt-3 h-2" 
                    />
                    <p className="text-xs text-muted-foreground mt-2">
                      {t('profile.credits.usage')}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Subscription Section */}
          {auth.user && (
            <section className="backdrop-blur-xl bg-card/50 rounded-2xl border border-border/50 shadow-xl overflow-hidden group hover:border-primary/30 transition-all duration-300">
              <div className="p-6 sm:p-8">
                <div className="flex items-start gap-5">
                  <div className="grid place-items-center h-12 w-12 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-lg group-hover:scale-110 transition-transform duration-300">
                    <CreditCard size={22} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <h2 className="text-xl font-semibold">{t('profile.subscription.title')}</h2>
                        <p className="text-sm text-muted-foreground mt-1">
                          {t('profile.subscription.description')}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Link to="/subscription">
                          <Button variant="outline" size="sm">
                            Manage Plan
                          </Button>
                        </Link>
                        {profile.profile?.subscription_plan !== 'pro' && (
                          <Button
                            size="sm"
                            onClick={() => toast.info(t('profile.subscription.upgradeComingSoon'))}
                            className="gap-2"
                          >
                            <Crown size={14} />
                            Upgrade
                          </Button>
                        )}
                      </div>
                    </div>
                    <div className="mt-4">
                      <div className="inline-flex items-center gap-2">
                        <div className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                          profile.profile?.subscription_plan === 'pro' 
                            ? 'bg-gradient-to-r from-amber-500/20 to-orange-500/20 text-amber-700 dark:text-amber-400 border border-amber-500/30'
                            : 'bg-muted/50 text-muted-foreground border border-border'
                        }`}>
                          {profile.profile?.subscription_plan === 'pro' ? '✨ Pro Plan Active' : 'Free Plan'}
                        </div>
                        {profile.profile?.subscription_expires_at && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Calendar size={12} />
                            Expires: {new Date(profile.profile.subscription_expires_at).toLocaleDateString()}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Feedback Card */}
          {auth.user && (
            <section className="backdrop-blur-xl bg-card/50 rounded-2xl border border-border/50 shadow-xl overflow-hidden group hover:border-primary/30 transition-all duration-300">
              <div className="p-6 sm:p-8">
                <div className="flex items-start gap-5">
                  <div className="grid place-items-center h-12 w-12 rounded-xl bg-gradient-to-br from-rose-500 to-pink-500 text-white shadow-lg group-hover:scale-110 transition-transform duration-300">
                    <MessageCircle size={22} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <h2 className="text-xl font-semibold">Feedback & Support</h2>
                        <p className="text-sm text-muted-foreground mt-1">
                          Share your thoughts and help us improve
                        </p>
                      </div>
                      <Button
                        onClick={() => setShowFeedbackDialog(true)}
                        className="gap-2"
                      >
                        <MessageCircle size={14} />
                        Send Feedback
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Language Section */}
          <section className="backdrop-blur-xl bg-card/50 rounded-2xl border border-border/50 shadow-xl overflow-hidden group hover:border-primary/30 transition-all duration-300">
            <div className="p-6 sm:p-8">
              <div className="flex items-start gap-5">
                <div className="grid place-items-center h-12 w-12 rounded-xl bg-gradient-to-br from-blue-500 to-purple-500 text-white shadow-lg group-hover:scale-110 transition-transform duration-300">
                  <Globe size={22} />
                </div>
                <div className="flex-1 min-w-0">
                  <div>
                    <h2 className="text-xl font-semibold">{t('profile.language.title')}</h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      {t('profile.language.description')}
                    </p>
                  </div>
                  <div className="mt-4">
                    <Select value={i18n.language || "en"} onValueChange={(value) => {
                      i18n.changeLanguage(value);
                      s.setLanguage(value);
                      analytics.languageChanged(value);
                    }}>
                      <SelectTrigger className="w-full max-w-xs bg-background/50">
                        <SelectValue placeholder="Select language" />
                      </SelectTrigger>
                      <SelectContent>
                        {languageOptions.map(({ value, label, flag }) => (
                          <SelectItem key={value} value={value}>
                            <span className="flex items-center gap-2">
                              <span>{flag}</span>
                              <span>{label}</span>
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground pt-8">
          {t('profile.footer')}
        </p>
      </div>

      {/* Sign Out Confirmation Dialog */}
      <Dialog open={showSignOutDialog} onOpenChange={setShowSignOutDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Sign Out</DialogTitle>
            <DialogDescription>
              Are you sure you want to sign out? You'll need to sign in again to access your account.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-3 sm:gap-0">
            <Button variant="outline" onClick={() => setShowSignOutDialog(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleSignOut}>
              Sign Out
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {showFeedbackDialog && (
        <FeedbackDialog
          open={showFeedbackDialog}
          onOpenChange={setShowFeedbackDialog}
          userId={auth.user.id}
        />
      )}
    </div>
  );
};

export default Profile;