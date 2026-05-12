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
  setupRealtimeListeners: (userId: string) => () => void;
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
    console.warn('[userProfile] fetchProfile called');
    set({ loading: true, error: null, profile: null, subscriptions: [] });

    const defaultProfile: UserProfile = {
      id: 'default',
      email: 'default@example.com',
      full_name: null,
      avatar_url: null,
      credits: 10,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      daily_free_credits_used: 0,
      daily_free_credits_reset_at: new Date().toISOString(),
      subscription_plan: null,
      subscription_status: null,
      subscription_expires_at: null,
    };

    let didTimeout = false;
    const timeoutId = window.setTimeout(() => {
      didTimeout = true;
      console.warn('[userProfile] fetchProfile timeout after 10s, using default profile');
      set({
        profile: defaultProfile,
        cachedAvatarUrl: null,
        cachedFullName: null,
        subscriptions: [],
        creditTransactions: [],
        loading: false,
        error: 'Using default profile due to timeout'
      });
    }, 10000);

    const safeSet = (payload: Partial<UserProfileState>) => {
      if (!didTimeout) {
        set(payload);
      }
    };

    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      const user = sessionData?.session?.user;
      if (!user) throw new Error('Not authenticated');

      console.warn('[userProfile] fetchProfile start', { userId: user.id, email: user.email });

      let profile: UserProfile | null = null;
      let subscriptions: any[] = [];

      const { data: profileData, error: profileError } = await (supabase as any)
        .from('user_profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      if (profileError) {
        console.warn('[userProfile] profile fetch error', profileError);
      } else if (profileData) {
        profile = profileData;
      }

      if (!profile) {
        console.warn('[userProfile] profile row missing, creating default row');
        const { data: createdProfile, error: insertError } = await (supabase as any)
          .from('user_profiles')
          .insert({
            id: user.id,
            email: user.email,
            full_name: user.user_metadata?.full_name || null,
            avatar_url: user.user_metadata?.avatar_url || null,
            credits: 10
          })
          .select()
          .single();

        if (insertError) {
          console.warn('[userProfile] profile insert failed', insertError);
        } else {
          profile = createdProfile;
        }
      }

      if (profile) {
        console.warn('[userProfile] resetting daily credits if needed');
        try {
          const { data: resetData, error: resetError } = await (supabase as any).rpc('reset_daily_credits_if_needed', {
            p_user_id: user.id
          });
          if (resetError) throw resetError;
          console.warn('[userProfile] reset_daily_credits_if_needed success', resetData);
        } catch (error: any) {
          console.warn('[userProfile] Failed to reset daily credits:', error);
        }
      }

      const { data: subscriptionsData, error: subscriptionsError } = await (supabase as any)
        .from('subscriptions')
        .select(`
          *,
          plans (*)
        `)
        .eq('user_id', user.id);

      if (subscriptionsError) {
        console.warn('[userProfile] subscriptions fetch failed', subscriptionsError);
      } else {
        subscriptions = subscriptionsData || [];
      }

      if (!profile) {
        profile = {
          id: user.id,
          email: user.email,
          full_name: user.user_metadata?.full_name || null,
          avatar_url: user.user_metadata?.avatar_url || null,
          credits: 10,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          daily_free_credits_used: 0,
          daily_free_credits_reset_at: new Date().toISOString(),
          subscription_plan: null,
          subscription_status: null,
          subscription_expires_at: null,
        };
      }

      profile.credits = profile.credits ?? 10;
      profile.daily_free_credits_used = profile.daily_free_credits_used ?? 0;
      profile.daily_free_credits_reset_at = profile.daily_free_credits_reset_at ?? new Date().toISOString();

      const activeSubscription = subscriptions.find((s) => s.status === 'active');
      profile.subscription_plan = activeSubscription?.plans?.name || null;
      profile.subscription_status = activeSubscription?.status || null;
      profile.subscription_expires_at = activeSubscription?.current_period_end || null;

      setToStorage(STORAGE_KEYS.AVATAR_URL, profile.avatar_url);
      setToStorage(STORAGE_KEYS.FULL_NAME, profile.full_name);

      safeSet({
        profile,
        cachedAvatarUrl: profile.avatar_url,
        cachedFullName: profile.full_name,
        subscriptions,
        creditTransactions: [],
        loading: false,
        error: null,
      });

      console.warn('[userProfile] fetchProfile success', {
        profile: {
          id: profile.id,
          credits: profile.credits,
          daily_free_credits_used: profile.daily_free_credits_used,
          daily_free_credits_reset_at: profile.daily_free_credits_reset_at,
          subscription_plan: profile.subscription_plan,
          subscription_status: profile.subscription_status,
        },
        subscriptionsCount: subscriptions.length,
      });

      void useHistory.getState().loadFromSupabase().catch((historyError) => {
        console.warn('[userProfile] history sync failed', historyError);
      });
    } catch (error: any) {
      if (!didTimeout) {
        const message = error?.message ?? String(error ?? 'Unknown error');
        console.error('[userProfile] fetchProfile failed', { error, message, errorKeys: Object.keys(error || {}) });
        set({ error: message, loading: false });
      }
    } finally {
      clearTimeout(timeoutId);
      if (!didTimeout) {
        set((state) => ({ loading: state.loading ? false : state.loading }));
      }
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
    console.log('[userProfile] deductCredits start', { amount, profileId: profile?.id });
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

      console.log('[userProfile] deductCredits success', { amount, userId: profile.id, result: data });

      // Refresh profile data
      await get().fetchProfile();
      return true;
    } catch (error: any) {
      console.error('[userProfile] deductCredits error', error);
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
    console.log('[userProfile] refreshCredits');
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
    console.log('[userProfile] setupRealtimeListeners', { userId });
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
          console.log('[userProfile] realtime profile payload', payload);
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
          console.log('[userProfile] realtime transaction payload', payload);
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