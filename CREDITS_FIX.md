# Credit System Fix - Implementation Guide

## Problem
Credits were not appearing for existing signed-up accounts. Root causes identified:

1. **New user trigger** (`handle_new_user`) was not inserting `credits` column, resulting in NULL for all users created via auth.signUp()
2. **Subscription plans** (monthly/yearly) in `apply_plan()` only created subscription records but did not grant the associated credits
3. **Existing users** who signed up before the fix had `NULL` or `0` credits with no automatic grant mechanism

## Solution

### Step 1: Run Initialization SQL
Execute this file in your Supabase SQL Editor:

```
supabase/migrations/20250511_comprehensive_credit_fix.sql
```

**What it does:**
- Sets `credits = 10` for all users with NULL or ≤ 0 credits
- Resets `daily_free_credits_used = 0` for all users
- Sets `daily_free_credits_reset_at` to current UTC day start
- Grants missing subscription credits to active monthly/yearly subscribers
- Grants 10 trial credits to trial users with no credits
- Logs all changes via `credit_transactions` for audit trail

### Step 2: Replace Credit Functions
Execute this file in your Supabase SQL Editor:

```
supabase/migrations/20250511_consolidated_credit_functions.sql
```

**What it does:**
- Replaces all credit-related functions with consolidated, battle-tested versions
- Fixes `consume_credit()` to properly handle free + paid tier logic
- Updates `insert_chat()` to return `uuid` (chat ID) so frontend can store `remoteId`
- Updates `apply_plan()` to grant credits immediately for subscriptions
- Adds proper permissions for all functions
- Adds version tracking table to prevent duplicate migrations

### Step 3: Verify in Supabase Dashboard
Run these verification queries in SQL Editor:

```sql
-- Check user credit distribution
SELECT
  count(*) as total_users,
  count(*) filter (where credits = 10) as users_with_10,
  count(*) filter (where credits > 10) as users_with_more,
  count(*) filter (where credits = 0) as users_with_0,
  avg(credits) as average_credits
FROM public.user_profiles;

-- Verify daily reset cycle is active
SELECT
  count(*) as total_users,
  count(*) filter (where daily_free_credits_used = 0) as fresh_accounts,
  min(daily_free_credits_reset_at) as oldest_reset,
  max(daily_free_credits_reset_at) as newest_reset
FROM public.user_profiles;

-- Check recent credit transactions (last hour)
SELECT type, count(*) as count, sum(amount) as total
FROM public.credit_transactions
WHERE created_at > now() - interval '1 hour'
GROUP BY type
ORDER BY created_at desc;
```

### Step 4: Test in Application
1. Refresh the browser (hard refresh: `Ctrl+Shift+R`)
2. Navigate to `/profile` page
3. Verify credit count shows correctly (e.g., "10 paid + 10 free daily" or just "10 paid credits")
4. If using free tier: verify "Free daily credits remaining: 10" is displayed
5. If you have a subscription: verify plan status shows "Pro Plan Active" and credits reflect subscription amount
6. Try running an AI query that costs credits — verify deduction works and UI updates in real-time

## Post-Fix Behavior

### Free Tier Users (no subscription)
- Start with 10 **paid** credits (one-time, never auto-refresh)
- Get 10 **free daily** credits that reset at UTC midnight
- Total starting pool: 20 credits on day 1, then 10/day after free pool exhausted
- Free daily credits reset automatically via `reset_daily_credits_if_needed()`

### Paid Subscribers (Pro+ Monthly/Yearly)
- Immediate credit grant: plan's credit amount added on purchase
- No daily free credits (eligible = false)
- Active subscription shows in UI with expiry date
- Monthly subscribers: refill happens via `refill_subscription_credits()` cron (set up separately)

### One-Time Credit Pack Purchasers
- Credits added immediately to `user_profiles.credits`
- Transaction logged as `'purchase'`
- No subscription created

## Optional: Daily Cron Job
Subscribe to a daily cron (e.g., GitHub Actions, cron-job.org) to ensure daily free credits reset for all users at exactly midnight UTC:

```bash
# Supabase SQL Editor — run as scheduled job
SELECT public.reset_all_daily_credits();
```

This is not strictly necessary because `reset_daily_credits_if_needed()` is called before every credit consumption, but it keeps all users in sync.

## Notes

- All changes are **idempotent** — you can re-run the migration files safely
- Existing `credit_transactions` are preserved; no data loss
- Real-time listeners in `userProfile.ts` will automatically update UI when credits change
- RLS policies already exist and are unchanged

## Files Modified/Created

1. `supabase/create_tables.sql` – Fixed `handle_new_user` to insert `credits = 10`
2. `supabase/create_tables.sql` – Fixed `apply_plan` to grant subscription credits immediately
3. `supabase/migrations/20250511_comprehensive_credit_fix.sql` – NEW: Initializes existing users
4. `supabase/migrations/20250511_consolidated_credit_functions.sql` – NEW: Replaces all credit RPCs with consolidated versions

---

**After running the migrations, any user who previously had 0 or NULL credits will see 10 credits in the UI immediately upon refresh.**
