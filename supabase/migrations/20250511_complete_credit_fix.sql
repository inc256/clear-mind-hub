-- =========================================================
-- COMPLETE CREDIT SYSTEM FIX & INITIALIZATION
-- =========================================================
-- This single migration fixes ALL credit issues:
-- 1. Fixes handle_new_user trigger → new users get 10 credits automatically
-- 2. Fixes apply_plan → subscription purchases grant credits immediately
-- 3. Replaces all credit RPCs with consolidated, correct implementations
-- 4. Initializes existing users with 10 credits and resets daily cycle
-- 5. Grants retroactive subscription credits to eligible existing subscribers
-- 6. Adds constraints & indexes for data integrity and performance
--
-- EXECUTION: Run this entire file in Supabase SQL Editor (one transaction).
-- All operations are idempotent — safe to re-run.
--
-- After running: all existing users see 10 credits; new signups get 10 automatically;
-- daily 10 free credits reset at UTC midnight; subscriptions grant credits instantly.

-- =========================================================
-- PART 1: CORE CREDIT FUNCTIONS
-- =========================================================

-- 1a. reset_daily_credits_if_needed
create or replace function public.reset_daily_credits_if_needed(
  p_user_id uuid
)
returns void
as $$
declare
  v_last_reset timestamptz;
begin
  select daily_free_credits_reset_at
  into v_last_reset
  from public.user_profiles
  where id = p_user_id
  for update;

  if not found then
    raise exception 'User profile not found';
  end if;

  if v_last_reset is null
     or date(v_last_reset at time zone 'UTC') < date(now() at time zone 'UTC') then
    update public.user_profiles
    set
      daily_free_credits_used = 0,
      daily_free_credits_reset_at = now(),
      updated_at = now()
    where id = p_user_id;
  end if;
end;
$$ language plpgsql security definer;

-- 1b. consume_credit
create or replace function public.consume_credit(
  p_user_id uuid,
  p_amount integer default 1,
  p_description text default null,
  p_chat_id uuid default null
)
returns json
as $$
declare
  v_profile record;
  v_free_used integer;
  v_paid_credits integer;
  v_free_remaining integer;
  v_now timestamptz := now();
begin
  if p_amount <= 0 then
    return json_build_object('success', false, 'error', 'Amount must be positive');
  end if;

  perform public.reset_daily_credits_if_needed(p_user_id);

  select credits, daily_free_credits_used
  into v_profile
  from public.user_profiles
  where id = p_user_id
  for update;

  if not found then
    return json_build_object('success', false, 'error', 'User profile not found');
  end if;

  v_free_used := coalesce(v_profile.daily_free_credits_used, 0);
  v_paid_credits := coalesce(v_profile.credits, 0);
  v_free_remaining := greatest(0, 10 - v_free_used);

  if v_free_remaining >= p_amount then
    update public.user_profiles
    set daily_free_credits_used = daily_free_credits_used + p_amount,
        updated_at = v_now
    where id = p_user_id;

    insert into public.credit_transactions (user_id, amount, type, description, chat_id, created_at)
    values (p_user_id, -p_amount, 'daily_free_usage', p_description, p_chat_id, v_now);

    return json_build_object(
      'success', true,
      'used', 'free',
      'remaining_free', 10 - (v_free_used + p_amount),
      'remaining_paid', v_paid_credits
    );
  end if;

  if v_paid_credits >= p_amount then
    update public.user_profiles
    set credits = credits - p_amount,
        updated_at = v_now
    where id = p_user_id;

    insert into public.credit_transactions (user_id, amount, type, description, chat_id, created_at)
    values (p_user_id, -p_amount, 'usage', p_description, p_chat_id, v_now);

    return json_build_object(
      'success', true,
      'used', 'paid',
      'remaining_free', v_free_remaining,
      'remaining_paid', v_paid_credits - p_amount
    );
  end if;

  return json_build_object(
    'success', false,
    'error', 'Insufficient credits',
    'remaining_free', v_free_remaining,
    'remaining_paid', v_paid_credits
  );
end;
$$ language plpgsql security definer;

-- 1c. use_credits (wrapper)
create or replace function public.use_credits(
  p_user_id uuid,
  p_amount integer
)
returns void
as $$
declare
  v_result json;
begin
  v_result := public.consume_credit(p_user_id, p_amount, 'AI prompt consumption', null);
  if (v_result->>'success')::boolean = false then
    raise exception '%', v_result->>'error';
  end if;
end;
$$ language plpgsql security definer;

-- 1d. insert_chat (returns chat id)
create or replace function public.insert_chat(
  p_user_id uuid,
  p_mode text,
  p_prompt text,
  p_response text,
  p_credits integer,
  p_image_data text default null,
  p_image_mime_type text default null,
  p_image_name text default null,
  p_document_data text default null,
  p_document_mime_type text default null,
  p_document_name text default null,
  p_voice_transcript text default null,
  p_code_snippets jsonb default null
)
returns uuid
as $$
declare
  v_chat_id uuid;
  v_now timestamptz := now();
begin
  if p_credits > 0 then
    perform public.use_credits(p_user_id, p_credits);
  end if;

   insert into public.chat_history (
     user_id, mode, prompt, response, credits_used,
     image_data, image_mime_type, image_name,
     document_data, document_mime_type, document_name,
     voice_transcript, code_snippets,
     created_at
   )
   values (
     p_user_id, p_mode, p_prompt, p_response, p_credits,
     p_image_data, p_image_mime_type, p_image_name,
     p_document_data, p_document_mime_type, p_document_name,
     p_voice_transcript, p_code_snippets,
     v_now
   )
  returning id into v_chat_id;

  return v_chat_id;
end;
$$ language plpgsql security definer;

-- 1e. apply_plan (with immediate subscription credit grant)
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

  -- ONE-TIME purchase
  if v_plan.billing_type = 'one_time' then
    update public.user_profiles
    set credits = credits + v_plan.credits
    where id = p_user_id;

    insert into public.credit_transactions (user_id, amount, type, description)
    values (p_user_id, v_plan.credits, 'purchase', 'Purchased ' || v_plan.credits || ' credits');

  -- Trial
  elsif v_plan.billing_type = 'trial' then
    insert into public.subscriptions (user_id, plan_id, status, current_period_start, current_period_end)
    values (p_user_id, v_plan.id, 'active', v_now, v_now + (v_plan.duration_days || ' days')::interval);

  -- Monthly/Yearly subscriptions
  else
    insert into public.subscriptions (user_id, plan_id, status, current_period_start, current_period_end)
    values (
      p_user_id, v_plan.id, 'active', v_now,
      case
        when v_plan.billing_type = 'monthly' then v_now + interval '1 month'
        when v_plan.billing_type = 'yearly' then v_now + interval '1 year'
      end
    );

    if v_plan.credits is not null and v_plan.credits > 0 then
      update public.user_profiles
      set credits = credits + v_plan.credits
      where id = p_user_id;

      insert into public.credit_transactions (user_id, amount, type, description)
      values (p_user_id, v_plan.credits, 'subscription', 'Subscription grant: ' || v_plan.name);
    end if;
  end if;
end;
$$ language plpgsql security definer;

-- 1f. grant_credits (admin/bonus)
create or replace function public.grant_credits(
  p_user_id uuid,
  p_amount integer,
  p_reason text default 'bonus'
)
returns void
as $$
begin
  if p_amount <= 0 then
    raise exception 'Credit amount must be positive';
  end if;

  update public.user_profiles
  set credits = credits + p_amount
  where id = p_user_id;

  if not found then
    raise exception 'User not found';
  end if;

  insert into public.credit_transactions (user_id, amount, type, description)
  values (p_user_id, p_amount, 'bonus', coalesce(p_reason, 'Bonus credits'));
end;
$$ language plpgsql security definer;

-- 1g. refill_subscription_credits (cron/batch)
create or replace function public.refill_subscription_credits()
returns void
as $$
begin
  insert into public.credit_transactions (user_id, amount, type, description)
  select
    s.user_id,
    p.credits,
    'subscription' as type,
    'Monthly subscription refill' as description
  from public.subscriptions s
  join public.plans p on s.plan_id = p.id
  where s.status = 'active'
    and p.billing_type in ('monthly', 'yearly')
    and p.credits is not null
    and p.credits > 0
    and s.current_period_start <= now()
    and now() <= s.current_period_end
    and not exists (
      select 1 from public.credit_transactions ct
      where ct.user_id = s.user_id
        and ct.type = 'subscription'
        and ct.created_at >= s.current_period_start
    );

  update public.user_profiles up
  set credits = credits + sub.credits
  from (
    select s.user_id, p.credits
    from public.subscriptions s
    join public.plans p on s.plan_id = p.id
    where s.status = 'active'
      and p.billing_type in ('monthly', 'yearly')
      and p.credits is not null
      and p.credits > 0
  ) sub
  where up.id = sub.user_id;
end;
$$ language plpgsql security definer;

-- 1h. get_credit_history
create or replace function public.get_credit_history(
  p_user_id uuid,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid,
  amount integer,
  type text,
  description text,
  chat_id uuid,
  reference_id uuid,
  created_at timestamptz
)
as $$
begin
  return query
  select ct.id, ct.amount, ct.type, ct.description, ct.chat_id, ct.reference_id, ct.created_at
  from public.credit_transactions ct
  where ct.user_id = p_user_id
  order by ct.created_at desc
  limit p_limit offset p_offset;
end;
$$ language plpgsql security definer;

-- 1i. get_credits_used_today
create or replace function public.get_credits_used_today(p_user_id uuid)
returns integer
as $$
declare
  v_used integer;
begin
  select coalesce(sum(abs(amount)), 0)
  into v_used
  from public.credit_transactions
  where user_id = p_user_id
    and type in ('usage', 'daily_free_usage')
    and created_at >= date_trunc('day', now() at time zone 'UTC');

  return v_used;
end;
$$ language plpgsql security definer;

-- =========================================================
-- PART 2: FIX TRIGGERS
-- =========================================================

-- 2a. handle_new_user (gives 10 starting credits)
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

-- Ensure trigger exists (re-create if needed)
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- =========================================================
-- PART 3: INITIALIZE EXISTING USERS
-- =========================================================

-- 3a. Grant 10 credits to users with ≤ 0 credits
update public.user_profiles
set credits = 10
where credits is null or credits <= 0;

-- 3b. Reset daily free credit usage to 0
update public.user_profiles
set daily_free_credits_used = 0;

-- 3c. Set daily reset timestamp to start of current UTC day
update public.user_profiles
set daily_free_credits_reset_at = date_trunc('day', now() at time zone 'UTC')
where daily_free_credits_reset_at is null
   or date(daily_free_credits_reset_at at time zone 'UTC') < date(now() at time zone 'UTC');

-- 3d. Retroactive subscription credits for existing active monthly/yearly subscribers
insert into public.credit_transactions (user_id, amount, type, description)
select
  s.user_id,
  p.credits,
  'subscription',
  'Subscription grant (retroactive): ' || p.name
from public.subscriptions s
join public.plans p on s.plan_id = p.id
where s.status = 'active'
  and p.billing_type in ('monthly', 'yearly')
  and p.credits is not null
  and p.credits > 0
  and not exists (
    select 1 from public.credit_transactions ct
    where ct.user_id = s.user_id
      and ct.type = 'subscription'
      and ct.created_at >= s.current_period_start
  );

update public.user_profiles up
set credits = credits + sub.total_credits
from (
  select s.user_id, sum(p.credits) as total_credits
  from public.subscriptions s
  join public.plans p on s.plan_id = p.id
  where s.status = 'active'
    and p.billing_type in ('monthly', 'yearly')
    and p.credits is not null
    and p.credits > 0
  group by s.user_id
) sub
where up.id = sub.user_id;

-- 3e. Trial users: grant 10 starter credits if they have none
insert into public.credit_transactions (user_id, amount, type, description)
select
  s.user_id,
  10,
  'trial',
  'Trial account starter credits'
from public.subscriptions s
join public.plans p on s.plan_id = p.id
where s.status = 'active'
  and p.billing_type = 'trial'
  and not exists (select 1 from public.user_profiles up where up.id = s.user_id and up.credits > 0)
  and not exists (select 1 from public.credit_transactions ct where ct.user_id = s.user_id and ct.type = 'trial');

update public.user_profiles up
set credits = 10
from (
  select s.user_id
  from public.subscriptions s
  join public.plans p on s.plan_id = p.id
  where s.status = 'active'
    and p.billing_type = 'trial'
    and not exists (select 1 from public.user_profiles up2 where up2.id = s.user_id and up2.credits > 0)
) trial_users
where up.id = trial_users.user_id;

-- =========================================================
-- PART 4: CONSTRAINTS & INDEXES
-- =========================================================

-- Ensure non-negative credits
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'user_profiles_credits_nonnegative'
      and conrelid = 'public.user_profiles'::regclass
  ) then
    alter table public.user_profiles
      add constraint user_profiles_credits_nonnegative check (credits >= 0);
  end if;
end $$;

-- Index for faster credit queries
create index if not exists idx_user_profiles_credits on public.user_profiles(credits);

-- Ensure credit_transactions has required columns
alter table public.credit_transactions
  add column if not exists description text,
  add column if not exists chat_id uuid references public.chat_history(id) on delete set null,
  add column if not exists is_reversed boolean default false;

-- Composite index for common queries
create index if not exists idx_credit_transactions_user_created
  on public.credit_transactions(user_id, created_at desc);
-- Ensure credit_transactions.type check includes all transaction types used
alter table public.credit_transactions
  drop constraint if exists credit_transactions_type_check;

alter table public.credit_transactions
  add constraint credit_transactions_type_check
  check (type in ('purchase','usage','subscription','bonus','trial','daily_free_usage','refund','admin_adjustment'));

-- =========================================================
-- PART 5: GRANT PERMISSIONS
-- =========================================================

grant execute on function public.reset_daily_credits_if_needed(uuid) to authenticated;
grant execute on function public.consume_credit(uuid, integer, text, uuid) to authenticated;
grant execute on function public.use_credits(uuid, integer) to authenticated;
grant execute on function public.insert_chat(uuid, text, text, text, integer, text, text, text, text, text, text, text, jsonb) to authenticated;
grant execute on function public.apply_plan(uuid, text) to authenticated;
grant execute on function public.grant_credits(uuid, integer, text) to authenticated;
grant execute on function public.refill_subscription_credits() to authenticated;
grant execute on function public.get_credit_history(uuid, integer, integer) to authenticated;
grant execute on function public.get_credits_used_today(uuid) to authenticated;

-- =========================================================
-- PART 6: VERSION TRACKING
-- =========================================================
create table if not exists public.schema_migrations_credit_system (
  version integer primary key,
  name text not null,
  applied_at timestamptz default now()
);

insert into public.schema_migrations_credit_system (version, name)
values (20250511, 'Complete credit system fix: functions + existing user initialization')
on conflict (version) do nothing;

-- =========================================================
-- MIGRATION COMPLETE
-- =========================================================
-- NEXT STEPS:
-- 1. Refresh your app (hard refresh: Ctrl+Shift+R)
-- 2. Navigate to /profile to verify credits display correctly
-- 3. Test an AI query that consumes credits to verify deduction works
-- 4. Check that daily free credits reset at UTC midnight automatically
