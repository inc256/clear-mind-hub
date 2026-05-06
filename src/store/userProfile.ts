import { create } from "zustand";
import { supabase } from "@/integrations/supabase/client";

interface UserProfile {
  id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  credits: number;
  created_at: string;
  updated_at: string;
}

interface UserProfileState {
  profile: UserProfile | null;
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
  subscriptions: [],
  creditTransactions: [],
  loading: false,
  error: null,

  fetchProfile: async () => {
    set({ loading: true, error: null });
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Fetch user profile
      const { data: profile, error: profileError } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (profileError) {
        if (profileError.code === 'PGRST116') { // No rows returned
          // Create profile if it doesn't exist
          const { data: newProfile, error: insertError } = await supabase
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
          set({
            profile: newProfile,
            subscriptions: [],
            creditTransactions: [],
            loading: false
          });
        } else {
          throw profileError;
        }
      } else {
        // Fetch subscriptions
        const { data: subscriptions, error: subsError } = await supabase
          .from('subscriptions')
          .select(`
            *,
            plans (*)
          `)
          .eq('user_id', user.id);

        if (subsError) throw subsError;

        // Fetch recent credit transactions
        const { data: creditTransactions, error: creditsError } = await supabase
          .from('credit_transactions')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(10);

        if (creditsError) throw creditsError;

        set({
          profile,
          subscriptions: subscriptions || [],
          creditTransactions: creditTransactions || [],
          loading: false
        });
      }
    } catch (error: any) {
      set({ error: error.message, loading: false });
    }
  },

  updateProfile: async (updates) => {
    const { profile } = get();
    if (!profile) return;

    set({ loading: true, error: null });
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', profile.id)
        .select()
        .single();

      if (error) throw error;
      set({ profile: data, loading: false });
    } catch (error: any) {
      set({ error: error.message, loading: false });
    }
  },

  deductCredits: async (amount) => {
    const { profile } = get();
    if (!profile) {
      set({ error: 'Unable to validate credits. Please sign in again.' });
      return false;
    }

    try {
      // Use the database function to deduct credits
      const { error } = await supabase.rpc('use_credits', {
        p_user_id: profile.id,
        p_amount: amount
      });

      if (error) throw error;

      // Refresh profile data
      await get().fetchProfile();
      return true;
    } catch (error: any) {
      const message =
        error?.message?.includes('Insufficient credits')
          ? 'You do not have enough app credits. Please purchase credits, upgrade your plan, or add a custom API key.'
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
      const { error } = await supabase.rpc('apply_plan', {
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
      const { data, error } = await supabase
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
      await supabase
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
            set({ profile: payload.new as UserProfile });
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
        () => {
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