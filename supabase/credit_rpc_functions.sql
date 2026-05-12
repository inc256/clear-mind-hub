-- supabase/credit_rpc_functions.sql
-- Clean credit management RPCs for temporary daily credits and paid credits.

-- Allow the new daily usage transaction type alongside existing values.
alter table if exists public.credit_transactions
  add constraint if not exists credit_transactions_type_check
  check (type in ('purchase','usage','subscription','bonus','trial','daily_free_usage','refund','admin_adjustment'));

-- Reset daily free credits if a new UTC day has begun.
create or replace function public.reset_daily_credits_if_needed(
  p_user_id uuid
)
returns void
language plpgsql
security definer
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

-- Consume credits using free daily credits first, then paid credits.
create or replace function public.consume_credit(
  p_user_id uuid,
  p_amount integer default 1,
  p_description text default null,
  p_chat_id uuid default null
)
returns json
language plpgsql
security definer
as $$
declare
  v_free_used integer;
  v_paid_credits integer;
  v_free_remaining integer;
  v_now timestamptz := now();
begin
  perform public.reset_daily_credits_if_needed(p_user_id);

  select daily_free_credits_used, credits
  into v_free_used, v_paid_credits
  from public.user_profiles
  where id = p_user_id
  for update;

  if not found then
    return json_build_object('success', false, 'error', 'User profile not found');
  end if;

  v_free_used := coalesce(v_free_used, 0);
  v_paid_credits := coalesce(v_paid_credits, 0);
  v_free_remaining := greatest(0, 10 - v_free_used);

  if p_amount <= 0 then
    return json_build_object('success', false, 'error', 'Amount must be positive');
  end if;

  if v_free_remaining >= p_amount then
    update public.user_profiles
    set
      daily_free_credits_used = daily_free_credits_used + p_amount,
      updated_at = v_now
    where id = p_user_id;

    insert into public.credit_transactions (
      user_id,
      amount,
      type,
      description,
      chat_id,
      created_at
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

  if v_paid_credits >= p_amount then
    update public.user_profiles
    set
      credits = credits - p_amount,
      updated_at = v_now
    where id = p_user_id;

    insert into public.credit_transactions (
      user_id,
      amount,
      type,
      description,
      chat_id,
      created_at
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

  return json_build_object(
    'success', false,
    'error', 'Insufficient credits',
    'remaining_free', v_free_remaining,
    'remaining_paid', v_paid_credits
  );
end;
$$ language plpgsql security definer;

-- Compatibility wrapper for existing use_credits calls.
create or replace function public.use_credits(
  p_user_id uuid,
  p_amount integer
)
returns void
language plpgsql
security definer
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

-- Optional cron helper for batch resetting all daily free credits.
create or replace function public.reset_all_daily_credits()
returns void
language plpgsql
security definer
as $$
begin
  update public.user_profiles
  set
    daily_free_credits_used = 0,
    daily_free_credits_reset_at = now(),
    updated_at = now()
  where date(daily_free_credits_reset_at at time zone 'UTC') < date(now() at time zone 'UTC');
end;
$$ language plpgsql security definer;

-- Grant safe execution rights for authenticated users.
grant execute on function public.reset_daily_credits_if_needed(uuid) to authenticated;
grant execute on function public.consume_credit(uuid, integer, text, uuid) to authenticated;
grant execute on function public.use_credits(uuid, integer) to authenticated;
grant execute on function public.reset_all_daily_credits() to authenticated;
