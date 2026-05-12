import { useAuth } from '../store/auth';
import { useUserProfile } from '../store/userProfile';

export function DebugPanel() {
  const auth = useAuth();
  const { profile, subscriptions, loading, error } = useUserProfile();

  return (
    <div className="fixed bottom-2 right-2 bg-black/90 text-white p-3 text-xs z-50 rounded shadow-lg max-w-[340px]">
      <div className="font-semibold text-[11px] uppercase tracking-[0.18em] text-slate-400">Debug panel</div>
      <div className="mt-2 space-y-1">
        <div>Auth user: {auth.user?.id ?? 'none'}</div>
        <div>Auth loading: {String(auth.loading)}</div>
        <div>Profile loading: {String(loading)}</div>
        <div>Profile error: {error ?? 'none'}</div>
        <div>Credits: {profile?.credits ?? 'N/A'}</div>
        <div>Daily Free Used: {profile?.daily_free_credits_used ?? 'N/A'}</div>
        <div>Subscriptions: {subscriptions?.length ? JSON.stringify(subscriptions) : '[]'}</div>
        <div className="pt-2 text-[10px] text-slate-400">Profile object: {profile ? JSON.stringify(profile) : 'null'}</div>
      </div>
    </div>
  );
}