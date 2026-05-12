import { create } from "zustand";
import { supabase } from "@/integrations/supabase/client";
import { useHistory } from "@/store/history";

// Local storage keys for profile persistence
const STORAGE_KEYS = {
  AVATAR_URL: 'user_profile_avatar_url',
  FULL_NAME: 'user_profile_full_name',
} as const;

// Helper functions for localStorage
const getFromStorage = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const setToStorage = (key: string, value: string | null): void => {
  try {
    if (value === null) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, value);
    }
  } catch {
    // Ignore localStorage errors
  }
};

interface UserProfile {
  id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  credits: number;
  daily_free_credits_used?: number;
  daily_free_credits_reset_at?: string | null;
  subscription_plan: string | null;
  subscription_status: string | null;
  subscription_expires_at: string | null;
  created_at: string;
  updated_at: string;
}

interface UserProfileState {
  profile: UserProfile | null;
  cachedAvatarUrl: string | null;
  cachedFullName: string | null;
  subscriptions: any[];
  creditTransactions: any[];
  loading: boolean;
  error: string | null;
  fetchProfile: () => Promise<void>;
  updateProfile: (updates: Partial<UserProfile>) => Promise<void>;
  deductCredits: (amount: number) => Promise<boolean>;
  refreshCredits: () => Promise<void>;
  applyPlan: (planName: string) => Promise<boolean>;
  purchaseCredits: (credits: number) => Promise<boolean>;
  setupRealtimeListeners: (userId: string) => void;
}

export const useUserProfile = create<UserProfileState>((set, get) => ({
  profile: null,
  cachedAvatarUrl: getFromStorage(STORAGE_KEYS.AVATAR_URL),
  cachedFullName: getFromStorage(STORAGE_KEYS.FULL_NAME),
  subscriptions: [],
  creditTransactions: [],
  loading: false,
  error: null,

  fetchProfile: async () => {
    set({ loading: true, error: null });
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Reset daily free credits if needed before fetching the profile
      try {
        await (supabase as any).rpc('reset_daily_credits_if_needed', {
          p_user_id: user.id
        });
      } catch (error: any) {
        console.warn('[userProfile] Failed to reset daily credits:', error);
        // Continue anyway - don't block profile fetch
      }

      // Fetch profile, transactions, and subscriptions in parallel
      const [profileResult, transactionsResult, subscriptionsResult] = await Promise.allSettled([
        (supabase as any)
          .from('user_profiles')
          .select('*')
          .eq('id', user.id)
          .single(),
        (supabase as any)
          .from('credit_transactions')
          .select('amount')
          .eq('user_id', user.id),
        (supabase as any)
          .from('subscriptions')
          .select(`
            *,
            plans (*)
          `)
          .eq('user_id', user.id)
      ]);

      const profileData = profileResult.status === 'fulfilled' ? profileResult.value.data : null;
      const profileError = profileResult.status === 'fulfilled' ? profileResult.value.error : { message: 'Failed to fetch profile' };

      const transactions = transactionsResult.status === 'fulfilled' && !transactionsResult.value.error ? transactionsResult.value.data || [] : [];
      const subscriptions = subscriptionsResult.status === 'fulfilled' && !subscriptionsResult.value.error ? subscriptionsResult.value.data || [] : [];

      if (profileError && profileError.code !== 'PGRST116') {
        throw profileError;
      }

      let profile = profileData;

      if (!profile) {
        // Create profile if it doesn't exist
        const { data: newProfile, error: insertError } = await (supabase as any)
          .from('user_profiles')
          .insert({
            id: user.id,
            email: user.email,
            full_name: user.user_metadata?.full_name || null,
            avatar_url: user.user_metadata?.avatar_url || null,
            credits: 10 // Default credits
          })
          .select()
          .single();

        if (insertError) throw insertError;
        profile = newProfile;
      }

      // Use the transaction ledger as a fallback when the profile balance is missing or stale.
      // Only use positive transactions (purchases/bonuses) as a fallback, not usage debits.
      const purchaseBalance = Math.max(
        0,
        transactions
          .filter((t) => (t.amount ?? 0) > 0)
          .reduce((sum, t) => sum + (t.amount ?? 0), 0)
      );
      if (profile.credits == null) {
        profile.credits = purchaseBalance;
      }

      profile.daily_free_credits_used = profile.daily_free_credits_used ?? 0;
      profile.daily_free_credits_reset_at = profile.daily_free_credits_reset_at ?? new Date().toISOString();

      // Set subscription info
      const activeSubscription = subscriptions.find(s => s.status === 'active');
      profile.subscription_plan = activeSubscription?.plans?.name || null;
      profile.subscription_status = activeSubscription?.status || null;
      profile.subscription_expires_at = activeSubscription?.current_period_end || null;

      // Update localStorage with latest data
      setToStorage(STORAGE_KEYS.AVATAR_URL, profile.avatar_url);
      setToStorage(STORAGE_KEYS.FULL_NAME, profile.full_name);

      // Set profile and cached values
      set({
        profile,
        cachedAvatarUrl: profile.avatar_url,
        cachedFullName: profile.full_name,
        subscriptions,
        creditTransactions: transactions,
        loading: false
      });

      // Load chat history from Supabase
      await useHistory.getState().loadFromSupabase();

    } catch (error: any) {
      set({ error: error.message, loading: false });
    }
  },

  updateProfile: async (updates) => {
    const { profile } = get();
    if (!profile) return;

    set({ loading: true, error: null });
    try {
      const { data, error } = await (supabase as any)
        .from('user_profiles')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', profile.id)
        .select()
        .single();

      if (error) throw error;

      // Update localStorage with the new values
      if (updates.avatar_url !== undefined) {
        setToStorage(STORAGE_KEYS.AVATAR_URL, updates.avatar_url);
      }
      if (updates.full_name !== undefined) {
        setToStorage(STORAGE_KEYS.FULL_NAME, updates.full_name);
      }

      set({
        profile: data,
        cachedAvatarUrl: data.avatar_url,
        cachedFullName: data.full_name,
        loading: false
      });
    } catch (error: any) {
      set({ error: error.message, loading: false });
    }
  },

  deductCredits: async (amount) => {
    let { profile } = get();
    if (!profile) {
      // Fetch profile if not loaded
      await get().fetchProfile();
      profile = get().profile;
      if (!profile) {
        set({ error: 'Unable to validate credits. Please sign in again.' });
        return false;
      }
    }

    try {
      // Use the database function to deduct credits, preferring free daily usage first.
      const { data, error } = await (supabase as any).rpc('consume_credit', {
        p_user_id: profile.id,
        p_amount: amount,
        p_description: 'AI chat request'
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Insufficient credits');

      // Refresh profile data
      await get().fetchProfile();
      return true;
    } catch (error: any) {
      const message =
        error?.message?.includes('Daily free credits exhausted')
          ? 'You’ve used your 10 daily free credits. Please wait until tomorrow for the reset.'
          : error?.message?.includes('Insufficient credits')
            ? 'You do not have enough app credits. Please purchase credits or upgrade your plan.'
            : error?.message || 'Failed to deduct credits. Please try again.';
      set({ error: message });
      return false;
    }
  },

  refreshCredits: async () => {
    await get().fetchProfile();
  },

  applyPlan: async (planName: string) => {
    const { profile } = get();
    if (!profile) return false;

    set({ loading: true, error: null });
    try {
      // Use the database function to apply the plan
      const { error } = await (supabase as any).rpc('apply_plan', {
        p_user_id: profile.id,
        p_plan_name: planName
      });

      if (error) throw error;

      // Refresh profile data
      await get().fetchProfile();
      return true;
    } catch (error: any) {
      set({ error: error.message, loading: false });
      return false;
    }
  },

  purchaseCredits: async (credits: number) => {
    const { profile } = get();
    if (!profile) return false;

    set({ loading: true, error: null });
    try {
      // Add credits directly to user profile
      const { data, error } = await (supabase as any)
        .from('user_profiles')
        .update({
          credits: profile.credits + credits,
          updated_at: new Date().toISOString()
        })
        .eq('id', profile.id)
        .select()
        .single();

      if (error) throw error;

      // Log the transaction
      await (supabase as any)
        .from('credit_transactions')
        .insert({
          user_id: profile.id,
          amount: credits,
          type: 'purchase'
        });

      set({ profile: data, loading: false });
      return true;
    } catch (error: any) {
      set({ error: error.message, loading: false });
      return false;
    }
  },

  setupRealtimeListeners: (userId: string) => {
    // Subscribe to user_profiles changes to get instant credit updates
    const profileSub = supabase
      .channel(`profile_${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_profiles',
          filter: `id=eq.${userId}`,
        },
        (payload) => {
          if (payload.new && typeof payload.new === 'object') {
            const updatedProfile = payload.new as UserProfile;
            // Update localStorage with realtime changes
            setToStorage(STORAGE_KEYS.AVATAR_URL, updatedProfile.avatar_url);
            setToStorage(STORAGE_KEYS.FULL_NAME, updatedProfile.full_name);
            set({
              profile: updatedProfile,
              cachedAvatarUrl: updatedProfile.avatar_url,
              cachedFullName: updatedProfile.full_name
            });
          }
        }
      )
      .subscribe();

    // Subscribe to credit_transactions to see transaction history update in real-time
    const transactionsSub = supabase
      .channel(`transactions_${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'credit_transactions',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          // Refresh the entire profile when a new transaction is recorded
          get().fetchProfile();
        }
      )
      .subscribe();

    // Cleanup function to unsubscribe when user logs out
    return () => {
      supabase.removeChannel(profileSub);
      supabase.removeChannel(transactionsSub);
    };
  },
}));