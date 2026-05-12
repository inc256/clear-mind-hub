-- =========================================================
-- CONSOLIDATED CREDIT MANAGEMENT FUNCTIONS
-- =========================================================
-- This file defines the authoritative versions of all credit-related
-- database functions. It combines the best implementations from:
-- - credit_rpc_functions.sql
-- - fix_daily_credits_and_history.sql
-- - create_tables.sql
--
-- All functions are idempotent (CREATE OR REPLACE) and include
-- proper error handling, transaction safety, and audit logging.

-- =========================================================
-- 1. RESET DAILY FREE CREDITS (UTC DAY BOUNDARY)
-- =========================================================
-- Called automatically before credit consumption and can be called
-- manually via cron to reset all users' daily free credits at UTC midnight.

create or replace function public.reset_daily_credits_if_needed(
  p_user_id uuid
)
returns void
as $$
declare
  v_result json;
begin
  -- Lock the user row to prevent race conditions
  select daily_free_credits_reset_at
  into v_last_reset
  from public.user_profiles
  where id = p_user_id
  for update;

  if not found then
    raise exception 'User profile not found';
  end if;

  -- If last reset was on a previous UTC day, reset the counters
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

-- =========================================================
-- 2. CONSUME CREDITS (MAIN CREDIT DEDUCTION FUNCTION)
-- =========================================================
-- Deducts credits using this priority:
-- 1. Free daily credits (up to 10 per UTC day)
-- 2. Paid credits
-- Returns JSON with success status and remaining balances.

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
  -- Validate input
  if p_amount <= 0 then
    return json_build_object('success', false, 'error', 'Amount must be positive');
  end if;

  -- Reset daily credits if needed (UTC day boundary)
  perform public.reset_daily_credits_if_needed(p_user_id);

  -- Lock user profile and fetch current balances
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

  -- Try to use free daily credits first
  if v_free_remaining >= p_amount then
    update public.user_profiles
    set
      daily_free_credits_used = daily_free_credits_used + p_amount,
      updated_at = v_now
    where id = p_user_id;

    insert into public.credit_transactions (
      user_id, amount, type, description, chat_id, created_at
    ) values (
      p_user_id,
      -p_amount,
      'daily_free_usage',
      p_description,
      p_chat_id,
      v_now
    );

    return json_build_object(
      'success', true,
      'used', 'free',
      'remaining_free', 10 - (v_free_used + p_amount),
      'remaining_paid', v_paid_credits
    );
  end if;

  -- Not enough free credits, check paid credits
  if v_paid_credits >= p_amount then
    update public.user_profiles
    set
      credits = credits - p_amount,
      updated_at = v_now
    where id = p_user_id;

    insert into public.credit_transactions (
      user_id, amount, type, description, chat_id, created_at
    ) values (
      p_user_id,
      -p_amount,
      'usage',
      p_description,
      p_chat_id,
      v_now
    );

    return json_build_object(
      'success', true,
      'used', 'paid',
      'remaining_free', v_free_remaining,
      'remaining_paid', v_paid_credits - p_amount
    );
  end if;

  -- Insufficient credits
  return json_build_object(
    'success', false,
    'error', 'Insufficient credits',
    'remaining_free', v_free_remaining,
    'remaining_paid', v_paid_credits
  );
end;
$$ language plpgsql security definer;

-- Compatibility wrapper for legacy code
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

-- =========================================================
-- 3. INSERT CHAT (WITH CREDIT DEDUCTION)
-- =========================================================
-- Inserts a chat history entry and deducts credits atomically.
-- Returns the chat ID on success.

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
  -- Deduct credits if p_credits > 0
  if p_credits > 0 then
    perform public.use_credits(p_user_id, p_credits);
  end if;

  -- Insert chat history
  insert into public.chat_history (
    user_id, mode, prompt, response, credits_used,
    image_data, image_mime_type, image_name,
    document_data, document_mime_type, document_name,
    voice_transcript, code_snippets,
    created_at, updated_at
  )
  values (
    p_user_id, p_mode, p_prompt, p_response, p_credits,
    p_image_data, p_image_mime_type, p_image_name,
    p_document_data, p_document_mime_type, p_document_name,
    p_voice_transcript, p_code_snippets,
    v_now, v_now
  )
  returning id into v_chat_id;

  return v_chat_id;
end;
$$ language plpgsql security definer;

-- =========================================================
-- 4. APPLY PLAN (SUBSCRIPTION/CREDIT PURCHASE)
-- =========================================================
-- Grants credits and/or activates subscription based on plan type.
-- One-time plans: immediate credit grant
-- Monthly/Yearly: activates subscription AND grants credits immediately
-- Trial: activates subscription (unlimited or special handling)

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

  -- TRIAL: Create subscription (no immediate credit grant, unlimited access)
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

  -- SUBSCRIPTIONS (Monthly/Yearly): Create subscription AND grant credits
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

    -- Grant subscription credits immediately
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
-- 5. GRANT CREDITS (ADMIN/BONUS FUNCTION)
-- =========================================================

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

-- =========================================================
-- 6. REFILL SUBSCRIPTION CREDITS (BATCH/CRON FUNCTION)
-- =========================================================
-- Can be called daily via cron to refresh subscription credits
-- based on billing cycles.

create or replace function public.refill_subscription_credits()
returns void
as $$
begin
  -- Grant credits to all active monthly/yearly subscribers
  -- who don't already have a subscription credit in the current period
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
      select 1
      from public.credit_transactions ct
      where ct.user_id = s.user_id
        and ct.type = 'subscription'
        and ct.created_at >= s.current_period_start
    );

  -- Update balances
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

-- =========================================================
-- 7. GET CREDIT HISTORY (FOR UI DISPLAY)
-- =========================================================

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
  select
    ct.id,
    ct.amount,
    ct.type,
    ct.description,
    ct.chat_id,
    ct.reference_id,
    ct.created_at
  from public.credit_transactions ct
  where ct.user_id = p_user_id
  order by ct.created_at desc
  limit p_limit
  offset p_offset;
end;
$$ language plpgsql security definer;

-- =========================================================
-- 8. GET CREDITS USED TODAY
-- =========================================================

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
-- GRANT PERMISSIONS
-- =========================================================
grant execute on function public.reset_daily_credits_if_needed(uuid) to authenticated;
grant execute on function public.consume_credit(uuid, integer, text, uuid) to authenticated;
grant execute on function public.use_credits(uuid, integer) to authenticated;
grant execute on function public.insert_chat(uuid, text, text, text, integer, text, text, text, text, text, text, jsonb) to authenticated;
grant execute on function public.apply_plan(uuid, text) to authenticated;
grant execute on function public.grant_credits(uuid, integer, text) to authenticated;
grant execute on function public.refill_subscription_credits() to authenticated;
grant execute on function public.get_credit_history(uuid, integer, integer) to authenticated;
grant execute on function public.get_credits_used_today(uuid) to authenticated;

-- =========================================================
-- VERSION TRACKING
-- =========================================================
-- Record this migration version
create table if not exists public.schema_migrations_credit_system (
  version integer primary key,
  name text not null,
  applied_at timestamptz default now()
);

insert into public.schema_migrations_credit_system (version, name)
values (20250511, 'Comprehensive credit system fix and user initialization')
on conflict (version) do nothing;
