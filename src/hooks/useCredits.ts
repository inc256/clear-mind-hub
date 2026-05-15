import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/store/auth";
import { supabase } from "@/integrations/supabase/client";

export type CreditTransactionType =
  | "purchase"
  | "usage"
  | "subscription"
  | "bonus"
  | "trial"
  | "daily_free_usage"
  | "refund"
  | "admin_adjustment";

export interface UserProfileCredits {
  id: string;
  email: string | null;
  full_name: string | null;
  credits: number;
  daily_free_credits_used: number;
  daily_free_credits_reset_at: string | null;
}

export interface CreditTransaction {
  id: string;
  user_id: string;
  amount: number;
  type: CreditTransactionType;
  reference_id: string | null;
  description: string | null;
  chat_id: string | null;
  is_reversed: boolean;
  created_at: string;
}

export interface CreditBreakdown {
  currentCredits: number;
  totalEarned: number;
  purchased: number;
  bonus: number;
  subscription: number;
  trial: number;
  dailyFree: number;
  used: number;
}

const DAILY_FREE_LIMIT = 10;
const TRANSACTIONS_PAGE_SIZE = 50;

const buildBreakdown = (
  profile: UserProfileCredits | null,
  transactions: CreditTransaction[]
): CreditBreakdown => {
  const breakdown: CreditBreakdown = {
    currentCredits: profile?.credits ?? 0,
    totalEarned: 0,
    purchased: 0,
    bonus: 0,
    subscription: 0,
    trial: 0,
    dailyFree: 0,
    used: 0,
  };

  transactions.forEach((transaction) => {
    if (transaction.is_reversed) return;

    const amount = transaction.amount ?? 0;

    switch (transaction.type) {
      case "purchase":
        breakdown.purchased += amount;
        break;
      case "subscription":
        breakdown.subscription += amount;
        break;
      case "bonus":
        breakdown.bonus += amount;
        break;
      case "trial":
        breakdown.trial += amount;
        break;
      case "daily_free_usage":
        breakdown.dailyFree += Math.abs(amount);
        break;
      case "usage":
        breakdown.used += Math.abs(amount);
        break;
      case "refund":
      case "admin_adjustment":
      default:
        break;
    }
  });

  breakdown.totalEarned =
    breakdown.purchased +
    breakdown.subscription +
    breakdown.bonus +
    breakdown.trial +
    breakdown.dailyFree;

  return breakdown;
};

const isNewUtcDay = (timestamp: string | null): boolean => {
  if (!timestamp) return true;
  const now = new Date();
  const lastReset = new Date(timestamp);
  return (
    now.getUTCFullYear() !== lastReset.getUTCFullYear() ||
    now.getUTCMonth() !== lastReset.getUTCMonth() ||
    now.getUTCDate() !== lastReset.getUTCDate()
  );
};

const millisecondsUntilNextUtcMidnight = (): number => {
  const now = new Date();
  const nextMidnight = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0)
  );
  return Math.max(nextMidnight.getTime() - now.getTime(), 0);
};

export const useCredits = (userIdProp?: string) => {
  const { user } = useAuth();
  const userId = userIdProp ?? user?.id ?? null;
  const [profile, setProfile] = useState<UserProfileCredits | null>(null);
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [creditBreakdown, setCreditBreakdown] = useState<CreditBreakdown>({
    currentCredits: 0,
    totalEarned: 0,
    purchased: 0,
    bonus: 0,
    subscription: 0,
    trial: 0,
    dailyFree: 0,
    used: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const resetTimerRef = useRef<number | null>(null);
  const mountedRef = useRef(true);

  const clearResetTimer = useCallback(() => {
    if (resetTimerRef.current) {
      window.clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
    }
  }, []);

  const fetchCreditBreakdown = useCallback(
    async (uid: string, profileData: UserProfileCredits | null) => {
      const { data, error } = await supabase
        .from<CreditTransaction>("credit_transactions")
        .select(
          "id, user_id, amount, type, reference_id, description, chat_id, is_reversed, created_at"
        )
        .eq("user_id", uid)
        .eq("is_reversed", false);

      if (error) {
        throw error;
      }

      const breakdown = buildBreakdown(profileData, data || []);
      setCreditBreakdown(breakdown);
      return data || [];
    },
    []
  );

  const fetchTransactions = useCallback(
    async (uid: string, nextPage = 1) => {
      const from = (nextPage - 1) * TRANSACTIONS_PAGE_SIZE;
      const to = from + TRANSACTIONS_PAGE_SIZE - 1;

      const { data, error, count } = await supabase
        .from<CreditTransaction>("credit_transactions")
        .select(
          "id, user_id, amount, type, reference_id, description, chat_id, is_reversed, created_at",
          { count: "exact" }
        )
        .eq("user_id", uid)
        .order("created_at", { ascending: false })
        .range(from, to);

      if (error) {
        throw error;
      }

      setTransactions(data || []);
      setPage(nextPage);
      setHasMore(typeof count === "number" ? from + TRANSACTIONS_PAGE_SIZE < count : false);
      return data || [];
    },
    []
  );

  const scheduleMidnightRefresh = useCallback(() => {
    clearResetTimer();
    resetTimerRef.current = window.setTimeout(async () => {
      if (userId) {
        await refreshCredits();
      }
    }, millisecondsUntilNextUtcMidnight());
  }, [clearResetTimer, userId]);

  const checkDailyReset = useCallback(
    async (profileData: UserProfileCredits) => {
      if (!userId) return profileData;

      if (!profileData.daily_free_credits_reset_at || isNewUtcDay(profileData.daily_free_credits_reset_at)) {
        const now = new Date().toISOString();
        const { error } = await supabase
          .from("user_profiles")
          .update({
            daily_free_credits_used: 0,
            daily_free_credits_reset_at: now,
          })
          .eq("id", userId);

        if (error) {
          throw error;
        }

        const updatedProfile = {
          ...profileData,
          daily_free_credits_used: 0,
          daily_free_credits_reset_at: now,
        };

        setProfile(updatedProfile);
        return updatedProfile;
      }

      return profileData;
    },
    [userId]
  );

  const fetchProfile = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data, error } = await supabase
        .from<UserProfileCredits>("user_profiles")
        .select("id, email, full_name, credits, daily_free_credits_used, daily_free_credits_reset_at")
        .eq("id", userId)
        .single();

      if (error) {
        throw error;
      }

      const profileData = await checkDailyReset(data);
      setProfile(profileData);
      const transactionsData = await fetchCreditBreakdown(userId, profileData);
      await fetchTransactions(userId, 1);
      setCreditBreakdown(buildBreakdown(profileData, transactionsData));
      scheduleMidnightRefresh();
    } catch (err: any) {
      if (!mountedRef.current) return;
      setError(err?.message ?? "Unable to load credit profile.");
    } finally {
      if (!mountedRef.current) return;
      setLoading(false);
    }
  }, [checkDailyReset, fetchCreditBreakdown, fetchTransactions, scheduleMidnightRefresh, userId]);

  const refreshCredits = useCallback(async () => {
    await fetchProfile();
  }, [fetchProfile]);

  const consumeCredits = useCallback(
    async (amount: number, description = "Premium content access", chatId: string | null = null) => {
      if (!userId) {
        throw new Error("User is not authenticated.");
      }

      if (amount <= 0) {
        return;
      }

      const { data, error } = await supabase.rpc("consume_credit", {
        p_user_id: userId,
        p_amount: amount,
        p_description: description,
        p_chat_id: chatId,
      });

      if (error) {
        throw error;
      }

      const result = data as { success?: boolean; error?: string } | null;
      if (result?.success === false) {
        throw new Error(result.error || "Unable to consume credits.");
      }

      await refreshCredits();
      return result;
    },
    [refreshCredits, userId]
  );

  const premiumAccess = useMemo(() => {
    return (
      creditBreakdown.purchased > 0 ||
      creditBreakdown.bonus > 0 ||
      creditBreakdown.subscription > 0 ||
      creditBreakdown.trial > 0
    );
  }, [creditBreakdown]);

  const remainingDailyCredits = useMemo(() => {
    return Math.max(0, DAILY_FREE_LIMIT - (profile?.daily_free_credits_used ?? 0));
  }, [profile]);

  const availableCredits = useMemo(() => {
    return (profile?.credits ?? 0) + remainingDailyCredits;
  }, [profile, remainingDailyCredits]);

  useEffect(() => {
    mountedRef.current = true;
    if (userId) {
      fetchProfile();
    } else {
      setLoading(false);
      setProfile(null);
      setTransactions([]);
      setCreditBreakdown({
        currentCredits: 0,
        totalEarned: 0,
        purchased: 0,
        bonus: 0,
        subscription: 0,
        trial: 0,
        dailyFree: 0,
        used: 0,
      });
    }

    return () => {
      mountedRef.current = false;
      clearResetTimer();
    };
  }, [clearResetTimer, fetchProfile, userId]);

  return {
    profile,
    transactions,
    creditBreakdown,
    loading,
    error,
    page,
    hasMore,
    premiumAccess,
    remainingDailyCredits,
    availableCredits,
    consumeCredits,
    refreshCredits,
    fetchTransactions,
  };
};
