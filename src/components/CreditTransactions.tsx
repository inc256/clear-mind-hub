import { useMemo } from "react";
import { useCredits } from "@/hooks/useCredits";
import { useAuth } from "@/store/auth";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

const iconByType: Record<string, string> = {
  purchase: "💰",
  usage: "⚡",
  subscription: "🔄",
  bonus: "🎁",
  trial: "🎯",
  daily_free_usage: "🌅",
  refund: "↩️",
  admin_adjustment: "⚙️",
};

export function CreditTransactions() {
  const { user } = useAuth();
  const {
    transactions,
    loading,
    error,
    page,
    hasMore,
    fetchTransactions,
  } = useCredits(user?.id);

  const emptyState = useMemo(() => !loading && !transactions.length, [loading, transactions.length]);

  const loadMore = async () => {
    if (!user?.id || !hasMore) return;
    await fetchTransactions(user.id, page + 1);
  };

  if (loading) {
    return (
      <div className="rounded-3xl border border-border/70 bg-card p-6 animate-pulse">
        <div className="h-6 w-40 rounded-full bg-slate-200" />
        <div className="mt-5 space-y-3">
          <div className="h-24 rounded-3xl bg-slate-200" />
          <div className="h-24 rounded-3xl bg-slate-200" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-3xl border border-red-200 bg-red-50 p-6">
        <p className="text-sm font-semibold text-red-700">Unable to load transaction history.</p>
        <p className="mt-2 text-sm text-red-600">{error}</p>
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-border/70 bg-card p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Credit Transactions</h3>
          <p className="text-sm text-muted-foreground">Recent activity by credit type</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            if (user?.id) {
              fetchTransactions(user.id, 1);
            }
          }}
        >
          Refresh
        </Button>
      </div>

      {emptyState ? (
        <div className="mt-8 rounded-3xl border border-dashed border-border/60 bg-background/80 p-8 text-center text-sm text-muted-foreground">
          No credit transactions yet.
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {transactions.map((transaction) => (
            <div key={transaction.id} className="flex items-center justify-between gap-4 rounded-3xl border border-border/50 bg-background/80 p-4">
              <div className="flex items-center gap-3">
                <div className="grid h-11 w-11 place-items-center rounded-2xl bg-primary/10 text-primary">
                  {iconByType[transaction.type] || "📊"}
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {transaction.description || transaction.type}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(transaction.created_at).toLocaleString()}
                  </p>
                </div>
              </div>
              <div className={`font-semibold ${transaction.amount >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                {transaction.amount >= 0 ? "+" : ""}{transaction.amount}
              </div>
            </div>
          ))}
        </div>
      )}

      {hasMore && (
        <div className="mt-6 text-center">
          <Button onClick={loadMore} className="gap-2">
            <Loader2 size={16} className="animate-spin" />
            Load more
          </Button>
        </div>
      )}
    </div>
  );
}
