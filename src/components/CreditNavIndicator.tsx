import { useEffect } from "react";
import { CreditCard } from "lucide-react";
import { useAuth } from "@/store/auth";
import { useUserProfile } from "@/store/userProfile";
import { getFreeTierStatus } from "@/services/aiService";
import { useTranslation } from "react-i18next";

interface CreditNavIndicatorProps {
  compact?: boolean;
}

export function CreditNavIndicator({ compact = false }: CreditNavIndicatorProps) {
  const { t } = useTranslation();
  const auth = useAuth();
  const { profile, subscriptions, loading, fetchProfile } = useUserProfile();
  const freeStatus = getFreeTierStatus(profile, subscriptions);
  const hasPremiumSubscription = subscriptions.some(
    (s: any) => s.status === "active" && ["monthly", "yearly"].includes(s.plans?.billing_type)
  );
  const availableCredits = profile ? (profile.credits ?? 0) + freeStatus.remaining : 0;

  useEffect(() => {
    if (auth.user && !profile && !loading) {
      console.log("[CreditNavIndicator] fetching profile because profile state is missing", { userId: auth.user.id });
      fetchProfile().catch((error) => console.error("[CreditNavIndicator] fetchProfile failed", error));
    }
  }, [auth.user, profile, loading, fetchProfile]);

  useEffect(() => {
    if (!auth.user) return;
    console.log("[CreditNavIndicator] render", {
      userId: auth.user.id,
      profileCredits: profile?.credits,
      freeRemaining: freeStatus.remaining,
      premium: hasPremiumSubscription,
      loading,
    });
  }, [auth.user, profile, freeStatus.remaining, hasPremiumSubscription, loading]);

  const badgeLabel = auth.user
    ? loading
      ? "Loading…"
      : hasPremiumSubscription
      ? "Unlimited"
      : compact
      ? `${availableCredits}`
      : `${t('navigation.credits')}: ${availableCredits}`
    : "Sign in";

  const subLabel = hasPremiumSubscription
    ? "Premium access"
    : loading
    ? "Loading credits"
    : freeStatus.remaining > 0
    ? `${freeStatus.remaining} free daily left`
    : `${profile?.credits ?? 0} paid credits`;

  if (!auth.user) return null;

  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold leading-none transition-colors ${
        compact
          ? "bg-slate-950/90 border-white/10 text-slate-200"
          : "bg-slate-900/95 border-white/10 text-slate-100 shadow-sm"
      }`}
      title={hasPremiumSubscription ? "Premium subscription active" : "Available credit balance"}
    >
      <CreditCard className="h-4 w-4 text-blue-400" />
      <div className="flex flex-col items-start gap-0.5">
        <span className="text-sm font-semibold leading-none">{badgeLabel}</span>
        {!compact ? <span className="text-[11px] text-slate-400">{subLabel}</span> : null}
      </div>
    </div>
  );
}
