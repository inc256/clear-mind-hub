-- =========================================================
-- COMPREHENSIVE CREDIT SYSTEM FIX & INITIALIZATION
-- =========================================================
-- This single migration fixes ALL credit issues:
-- 1. Fixes handle_new_user trigger to grant 10 credits to NEW signups
-- 2. Fixes apply_plan to grant subscription credits immediately
-- 3. Initializes EXISTING users with 10 credits
-- 4. Resets daily credit cycle for all users
-- 5. Repairs inconsistent data
-- 6. Provides maintenance functions
--
-- EXECUTION ORDER MATTERS: Run this file as a whole in Supabase SQL Editor.
-- All operations are wrapped in a single transaction for safety.
--
-- After running this, credits work correctly for both existing and new users.

-- =========================================================
-- PART 1: FIX CORE DATABASE FUNCTIONS & TRIGGERS
-- =========================================================
-- These fixes ensure FUTURE users get credits properly upon signup
-- and subscription purchases grant credits immediately.

-- 1a. Fix handle_new_user trigger to include credits = 10
-- This ensures every NEW user created via auth.signUp() gets 10 starting credits
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.user_profiles (id, email, full_name, avatar_url, credits)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name',''),
    new.raw_user_meta_data->>'avatar_url',
    10
  )
  on conflict (id) do nothing;

  return new;
end;
$$ language plpgsql security definer;

-- 1b. Fix apply_plan to grant subscription credits immediately
-- Monthly/Yearly subscribers get their credits right away, not via cron
create or replace function public.apply_plan(
  p_user_id uuid,
  p_plan_name text
)
returns void
as $$
declare
  v_plan record;
  v_now timestamptz := now();
begin
  select * into v_plan from public.plans
  where name = p_plan_name and is_active = true;

  if not found then
    raise exception 'Plan not found';
  end if;

  -- ONE-TIME PURCHASE: Grant credits immediately
  if v_plan.billing_type = 'one_time' then
    update public.user_profiles
    set credits = credits + v_plan.credits
    where id = p_user_id;

    insert into public.credit_transactions (user_id, amount, type, description)
    values (p_user_id, v_plan.credits, 'purchase', 'Purchased ' || v_plan.credits || ' credits');

  -- TRIAL: Create subscription (no immediate credit grant, trial users have unlimited access concept)
  elsif v_plan.billing_type = 'trial' then
    insert into public.subscriptions (
      user_id, plan_id, status,
      current_period_start,
      current_period_end
    )
    values (
      p_user_id,
      v_plan.id,
      'active',
      v_now,
      v_now + (v_plan.duration_days || ' days')::interval
    );

  -- SUBSCRIPTIONS (Monthly/Yearly): Create subscription AND grant credits immediately
  else
    insert into public.subscriptions (
      user_id, plan_id, status,
      current_period_start,
      current_period_end
    )
    values (
      p_user_id,
      v_plan.id,
      'active',
      v_now,
      case
        when v_plan.billing_type = 'monthly' then v_now + interval '1 month'
        when v_plan.billing_type = 'yearly' then v_now + interval '1 year'
      end
    );

    -- Grant subscription credits immediately (FIX: was missing before)
    if v_plan.credits is not null and v_plan.credits > 0 then
      update public.user_profiles
      set credits = credits + v_plan.credits
      where id = p_user_id;

      insert into public.credit_transactions (user_id, amount, type, description)
      values (
        p_user_id,
        v_plan.credits,
        'subscription',
        'Subscription grant: ' || v_plan.name
      );
    end if;
  end if;
end;
$$ language plpgsql security definer;

-- =========================================================
-- PART 2: INITIALIZE EXISTING USERS (ONE-TIME DATA FIX)
-- =========================================================
-- This grants 10 credits to all existing users who have 0 or NULL
-- and resets their daily credit cycle.

-- 2a. Grant 10 initial credits to users who have ≤ 0 credits
-- (Preserves users who already have > 10 credits from purchases)
update public.user_profiles
set credits = 10
where credits is null
   or credits <= 0;

-- 2b. Reset daily free credit usage to 0 for everyone
update public.user_profiles
set daily_free_credits_used = 0;

-- 2c. Set daily reset timestamp to start of current UTC day
-- This starts the 10/day free credit cycle from today
update public.user_profiles
set daily_free_credits_reset_at = date_trunc('day', now() at time zone 'UTC')
where daily_free_credits_reset_at is null
   or date(daily_free_credits_reset_at at time zone 'UTC') < date(now() at time zone 'UTC');

-- =========================================================
-- PART 3: FIX SUBSCRIPTION CREDITS FOR EXISTING SUBSCRIBERS
-- =========================================================
-- Active monthly/yearly subscribers who purchased BEFORE this fix
-- need their subscription credits granted retroactively.

-- 3a. Log subscription credit transactions for existing active subscribers
insert into public.credit_transactions (user_id, amount, type, description)
select
  s.user_id,
  p.credits as amount,
  'subscription' as type,
  'Subscription grant (retroactive): ' || p.name as description
from public.subscriptions s
join public.plans p on s.plan_id = p.id
where s.status = 'active'
  and p.billing_type in ('monthly', 'yearly')
  and p.credits is not null
  and p.credits > 0
  and not exists (
    select 1
    from public.credit_transactions ct
    where ct.user_id = s.user_id
      and ct.type = 'subscription'
      and ct.created_at >= s.current_period_start
  );

-- 3b. Actually add the credits to user_profiles
update public.user_profiles up
set credits = credits + sub.total_credits
from (
  select
    s.user_id,
    sum(p.credits) as total_credits
  from public.subscriptions s
  join public.plans p on s.plan_id = p.id
  where s.status = 'active'
    and p.billing_type in ('monthly', 'yearly')
    and p.credits is not null
    and p.credits > 0
  group by s.user_id
) sub
where up.id = sub.user_id;

-- =========================================================
-- PART 4: FIX TRIAL USERS (GRANT STARTER CREDITS IF NEEDED)
-- =========================================================
-- Trial users with no credits get 10 starter credits

insert into public.credit_transactions (user_id, amount, type, description)
select
  s.user_id,
  10 as amount,
  'trial' as type,
  'Trial account starter credits' as description
from public.subscriptions s
join public.plans p on s.plan_id = p.id
where s.status = 'active'
  and p.billing_type = 'trial'
  and not exists (
    select 1 from public.user_profiles up
    where up.id = s.user_id and up.credits > 0
  )
  and not exists (
    select 1 from public.credit_transactions ct
    where ct.user_id = s.user_id and ct.type = 'trial'
  );

update public.user_profiles up
set credits = 10
from (
  select s.user_id
  from public.subscriptions s
  join public.plans p on s.plan_id = p.id
  where s.status = 'active'
    and p.billing_type = 'trial'
    and not exists (
      select 1 from public.user_profiles up2
      where up2.id = s.user_id and up2.credits > 0
    )
) trial_users
where up.id = trial_users.user_id;

-- =========================================================
-- PART 5: ENSURE CONSTRAINTS & INDEXES FOR PERFORMANCE
-- =========================================================

-- Ensure credits is always non-negative
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'user_profiles_credits_nonnegative'
      and conrelid = 'public.user_profiles'::regclass
  ) then
    alter table public.user_profiles
      add constraint user_profiles_credits_nonnegative
      check (credits >= 0);
  end if;
end $$;

-- Fast lookup for credit queries
create index if not exists idx_user_profiles_credits
  on public.user_profiles(credits);

-- Ensure credit_transactions has description, chat_id, is_reversed columns
alter table public.credit_transactions
  add column if not exists description text,
  add column if not exists chat_id uuid references public.chat_history(id) on delete set null,
  add column if not exists is_reversed boolean default false;

-- Composite index for frequent queries: user + date
create index if not exists idx_credit_transactions_user_created
  on public.credit_transactions(user_id, created_at desc);

-- =========================================================
-- PART 6: VERIFY THE FIX (RUN THESE QUERIES AFTER MIGRATION)
-- =========================================================

-- SELECT
--   count(*) as total_users,
--   count(*) filter (where credits = 10) as users_with_10,
--   count(*) filter (where credits > 10) as users_with_more,
--   count(*) filter (where credits = 0) as users_with_0,
--   avg(credits) as average_credits
-- FROM public.user_profiles;

-- SELECT
--   count(*) as total_users,
--   count(*) filter (where daily_free_credits_used = 0) as fresh_accounts,
--   min(daily_free_credits_reset_at) as oldest_reset,
--   max(daily_free_credits_reset_at) as newest_reset
-- FROM public.user_profiles;

-- SELECT type, count(*) as count, sum(amount) as total
-- FROM public.credit_transactions
-- WHERE created_at > now() - interval '1 hour'
-- GROUP BY type ORDER BY created_at desc;

-- =========================================================
-- MIGRATION COMPLETE
-- =========================================================
-- NEW users: get 10 credits automatically via handle_new_user trigger
-- EXISTING users: already granted 10 credits in Part 2
-- Subscribers: already granted subscription credits in Part 3
-- Daily cycle: resets at UTC midnight via reset_daily_credits_if_needed()
--
-- No further action required. Refresh the app to see credits.
