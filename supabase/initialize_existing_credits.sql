-- =========================================================
-- INITIALIZE CREDITS FOR EXISTING USERS
-- =========================================================
-- This migration ensures all existing user profiles have:
-- 1. A positive credit balance (minimum 10)
-- 2. daily_free_credits_used = 0
-- 3. daily_free_credits_reset_at set to current UTC date
--
-- After this, the daily cycle continues automatically via
-- reset_daily_credits_if_needed() and award_daily_free_credits().

-- Step 1: Ensure every user has at least 10 credits
-- Users with 0 or NULL credits get 10
-- Users with existing positive credits keep theirs (no downgrade)
update public.user_profiles
set credits = 10
where credits is null
   or credits <= 0;

-- Step 2: Reset daily free credit usage to 0 for everyone
-- This ensures all users start fresh with their 10 daily free credits
update public.user_profiles
set daily_free_credits_used = 0
where daily_free_credits_used != 0
   or daily_free_credits_used is null;

-- Step 3: Set daily reset timestamp to start of current UTC day
-- This marks when the daily free credits were last awarded/reset
update public.user_profiles
set daily_free_credits_reset_at = date_trunc('day', now() at time zone 'UTC')
where daily_free_credits_reset_at is null
   or date(daily_free_credits_reset_at at time zone 'UTC') < date(now() at time zone 'UTC');

-- Step 4: Log a one-time bonus transaction for users who received credits
-- This provides an audit trail for the initial credit grant
insert into public.credit_transactions (user_id, amount, type, description)
select
  id as user_id,
  10 as amount,
  'bonus' as type,
  'Initial account credits' as description
from public.user_profiles
where credits = 10
  and not exists (
    select 1
    from public.credit_transactions ct
    where ct.user_id = user_profiles.id
      and ct.type = 'bonus'
      and ct.description = 'Initial account credits'
  );

-- =========================================================
-- VERIFICATION QUERIES (run these to check results)
-- =========================================================

-- Check total users affected
-- select count(*) as total_users from public.user_profiles;

-- Check users with credits = 10 (newly initialized)
-- select count(*) as initialized_with_10 from public.user_profiles where credits = 10;

-- Check daily free credits are ready
-- select
--   count(*) as total_users,
--   sum(daily_free_credits_used) as total_used_today,
--   min(daily_free_credits_reset_at) as oldest_reset,
--   max(daily_free_credits_reset_at) as newest_reset
-- from public.user_profiles;

-- Check recent bonus transactions
-- select user_id, amount, description, created_at
-- from public.credit_transactions
-- where type = 'bonus' and description = 'Initial account credits'
-- order by created_at desc limit 10;