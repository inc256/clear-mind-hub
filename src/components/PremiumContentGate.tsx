import { useState } from "react";
import { useCredits } from "@/hooks/useCredits";
import { useAuth } from "@/store/auth";
import { Button } from "@/components/ui/button";

interface PremiumContentGateProps {
  children: React.ReactNode;
  creditCost?: number;
  onAccess?: () => void;
}

export function PremiumContentGate({ children, creditCost = 1, onAccess }: PremiumContentGateProps) {
  const { user } = useAuth();
  const { profile, premiumAccess, remainingDailyCredits, consumeCredits, loading, error } = useCredits(user?.id);
  const [unlocking, setUnlocking] = useState(false);
  const hasEnoughCredits = (profile?.credits ?? 0) + remainingDailyCredits >= creditCost;

  const handleUnlock = async () => {
    setUnlocking(true);
    try {
      await consumeCredits(creditCost, "Premium content unlock");
      if (onAccess) onAccess();
    } catch (err) {
      console.error(err);
    } finally {
      setUnlocking(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-3xl border border-border/70 bg-card p-10 text-center text-sm text-muted-foreground">
        Checking premium access...
      </div>
    );
  }

  if (premiumAccess) {
    return <>{children}</>;
  }

  return (
    <div className="relative overflow-hidden rounded-3xl border border-border/70 bg-card">
      <div className={hasEnoughCredits ? "" : "blur-sm px-4 py-6 sm:p-8"}>
        {children}
      </div>

      <div className="absolute inset-0 flex items-center justify-center bg-slate-950/80 p-6 text-center text-white sm:p-8">
        <div className="max-w-md rounded-3xl border border-white/10 bg-slate-900/95 p-6 shadow-2xl">
          <h3 className="text-lg font-semibold">Premium content</h3>
          <p className="mt-2 text-sm text-slate-300">
            This content requires {creditCost} credit{creditCost !== 1 ? "s" : ""} to unlock.
          </p>
          <p className="mt-3 text-sm text-slate-400">
            Your balance: {(profile?.credits ?? 0) + remainingDailyCredits} credits.
          </p>

          {hasEnoughCredits ? (
            <Button
              onClick={handleUnlock}
              disabled={unlocking}
              className="mt-6 w-full"
            >
              {unlocking ? "Unlocking…" : `Unlock for ${creditCost} credit${creditCost !== 1 ? "s" : ""}`}
            </Button>
          ) : (
            <Button disabled className="mt-6 w-full bg-rose-600 text-white">
              Insufficient credits
            </Button>
          )}

          {error && <p className="mt-3 text-sm text-rose-300">{error}</p>}
        </div>
      </div>
    </div>
  );
}
