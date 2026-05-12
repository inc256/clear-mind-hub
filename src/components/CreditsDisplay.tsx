import { useMemo } from "react";
import { useCredits } from "@/hooks/useCredits";
import { useAuth } from "@/store/auth";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Sparkles, ShieldCheck, Gift, ArrowUpRight } from "lucide-react";

export function CreditsDisplay() {
  const { user } = useAuth();
  const {
    profile,
    loading,
    error,
    creditBreakdown,
    premiumAccess,
    remainingDailyCredits,
    availableCredits,
    addDailyFreeCredits,
    refreshCredits,
  } = useCredits(user?.id);

  const statusLabel = useMemo(() => {
    if (premiumAccess) {
      return "Premium Access";
    }
    return "Free Account";
  }, [premiumAccess]);

  const canClaimDailyCredits = remainingDailyCredits > 0 && !loading;

  const onClaimFreeCredits = async () => {
    try {
      await addDailyFreeCredits();
    } catch (err: any) {
      console.error(err);
    }
  };

  if (loading) {
    return (
      <div className="rounded-3xl border border-border/70 bg-card p-6 animate-pulse">
        <div className="h-8 w-48 rounded-full bg-slate-200" />
        <div className="mt-6 space-y-3">
          <div className="h-6 w-32 rounded-full bg-slate-200" />
          <div className="h-6 w-full rounded-full bg-slate-200" />
          <div className="h-40 rounded-3xl bg-slate-200" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-3xl border border-red-200 bg-red-50 p-6">
        <p className="text-sm font-semibold text-red-700">Unable to load credit data.</p>
        <p className="mt-2 text-sm text-red-600">{error}</p>
        <Button onClick={refreshCredits} className="mt-4">Try again</Button>
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-border/70 bg-card p-6 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Total Credit Balance</p>
          <div className="mt-2 flex items-center gap-3">
            <p className="text-4xl font-semibold tracking-tight text-foreground">
              {availableCredits}
            </p>
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
              <Sparkles size={14} />
              {statusLabel}
            </span>
          </div>
        </div>

        <Button variant="secondary" onClick={refreshCredits} className="gap-2">
          <ArrowUpRight size={16} />
          Refresh
        </Button>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-border/60 bg-background/80 p-4">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>Paid credits</span>
            <span>{creditBreakdown.currentCredits}</span>
          </div>
          <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
            <span>Remaining daily free</span>
            <span>{remainingDailyCredits}/10</span>
          </div>
        </div>

        <div className="rounded-2xl border border-border/60 bg-background/80 p-4">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>Premium source</span>
            <span>{premiumAccess ? "Active" : "Inactive"}</span>
          </div>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Premium access is granted when purchased, bonus, subscription, or trial credits are present.
          </p>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-border/60 bg-background/80 p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-muted-foreground">Daily free credit usage</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {profile?.daily_free_credits_used ?? 0}/10 used
            </p>
          </div>
          <div className="text-xs font-semibold text-foreground">
            {remainingDailyCredits} free left
          </div>
        </div>

        <Progress
          value={Math.min(((profile?.daily_free_credits_used ?? 0) / 10) * 100, 100)}
          className="mt-4 h-2"
        />

        <Button
          disabled={!canClaimDailyCredits}
          onClick={onClaimFreeCredits}
          className="mt-4 w-full justify-center"
        >
          {canClaimDailyCredits ? "Claim 10 Free Credits" : "Daily free credits claimed"}
        </Button>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-border/60 bg-background/80 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Gift size={16} />
            Bonus credited
          </div>
          <p className="mt-3 text-3xl font-semibold">{creditBreakdown.bonus}</p>
        </div>

        <div className="rounded-2xl border border-border/60 bg-background/80 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <ShieldCheck size={16} />
            Subscription credits
          </div>
          <p className="mt-3 text-3xl font-semibold">{creditBreakdown.subscription}</p>
        </div>
      </div>
    </div>
  );
}
