-- supabase/fix_daily_credits_and_history.sql
-- Comprehensive fix for daily credit distribution and chat history logging

-- =========================================================
-- FUNCTION: Award daily free credits
-- =========================================================
-- This function checks if it's been 24 hours since the last reset
-- and automatically awards 10 free credits if needed

create or replace function public.award_daily_free_credits(p_user_id uuid)
returns void as $$
declare
  v_profile record;
  v_now timestamptz;
begin
  v_now := now() at time zone 'UTC';
  
  -- Fetch current profile
  select * into v_profile from public.user_profiles where id = p_user_id;
  
  if v_profile is null then
    raise exception 'User profile not found';
  end if;
  
  -- Check if 24 hours have passed since last reset
  if v_profile.daily_free_credits_reset_at is null 
     or (v_now - v_profile.daily_free_credits_reset_at) >= interval '24 hours' then
    
    -- Award daily credits by resetting counters
    update public.user_profiles
    set 
      daily_free_credits_used = 0,
      daily_free_credits_reset_at = v_now,
      updated_at = v_now
    where id = p_user_id;
    
    -- Log the transaction
    insert into public.credit_transactions (
      user_id,
      amount,
      type,
      description,
      created_at
    ) values (
      p_user_id,
      10,
      'daily_free_credits',
      'Daily free credits awarded',
      v_now
    );
  end if;
end;
$$ language plpgsql security definer;

-- =========================================================
-- FUNCTION: Use credits with daily free credit support
-- =========================================================
-- This function attempts to deduct credits:
-- 1. First from paid credits
-- 2. Then from daily free credits (max 10 per day)
-- 3. Logs the transaction

create or replace function public.use_credits(
  p_user_id uuid,
  p_amount integer
)
returns void as $$
declare
  v_profile record;
  v_now timestamptz;
  v_free_available integer;
  v_from_free integer;
  v_from_paid integer;
begin
  v_now := now() at time zone 'UTC';
  
  -- Award daily credits first
  perform public.award_daily_free_credits(p_user_id);
  
  -- Fetch current profile
  select * into v_profile from public.user_profiles where id = p_user_id;
  
  if v_profile is null then
    raise exception 'User profile not found';
  end if;
  
  -- Calculate available free credits for today
  v_free_available := greatest(0, 10 - coalesce(v_profile.daily_free_credits_used, 0));
  
  -- Determine how much to deduct from free vs paid
  if p_amount <= v_free_available then
    v_from_free := p_amount;
    v_from_paid := 0;
  else
    v_from_free := v_free_available;
    v_from_paid := p_amount - v_free_available;
  end if;
  
  -- Check if enough paid credits exist
  if v_from_paid > 0 and v_profile.credits < v_from_paid then
    raise exception 'Insufficient credits. You need % credits but only have % paid credits.', 
      p_amount, v_profile.credits;
  end if;
  
  -- Update profile
  update public.user_profiles
  set 
    credits = greatest(0, credits - v_from_paid),
    daily_free_credits_used = daily_free_credits_used + v_from_free,
    updated_at = v_now
  where id = p_user_id;
  
  -- Log the transaction if anything was deducted
  if p_amount > 0 then
    insert into public.credit_transactions (
      user_id,
      amount,
      type,
      description,
      created_at
    ) values (
      p_user_id,
      -p_amount,
      'usage',
      concat('Used ', v_from_free, ' free + ', v_from_paid, ' paid credits'),
      v_now
    );
  end if;
end;
$$ language plpgsql security definer;

-- =========================================================
-- IMPROVED CHAT HISTORY INSERT FUNCTION
-- =========================================================
-- Fixed to properly handle credit deduction and history logging

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
returns uuid as $$
declare
  v_chat_id uuid;
  v_now timestamptz;
begin
  v_now := now() at time zone 'UTC';
  
  -- Deduct credits if needed
  if p_credits > 0 then
    perform public.use_credits(p_user_id, p_credits);
  end if;

  -- Insert chat history with all fields
  insert into public.chat_history (
    user_id,
    mode,
    prompt,
    response,
    credits_used,
    image_data,
    image_mime_type,
    image_name,
    document_data,
    document_mime_type,
    document_name,
    voice_transcript,
    code_snippets,
    created_at,
    updated_at
  )
  values (
    p_user_id,
    p_mode,
    p_prompt,
    p_response,
    p_credits,
    p_image_data,
    p_image_mime_type,
    p_image_name,
    p_document_data,
    p_document_mime_type,
    p_document_name,
    p_voice_transcript,
    p_code_snippets,
    v_now,
    v_now
  )
  returning id into v_chat_id;
  
  return v_chat_id;
end;
$$ language plpgsql security definer;

-- =========================================================
-- INDEXES AND CONSTRAINTS
-- =========================================================
create index if not exists idx_user_profiles_daily_reset
  on public.user_profiles(daily_free_credits_reset_at);

-- Add constraint only if it doesn't exist (using DO block for PostgreSQL)
do $$
begin
  if not exists (
    select 1 from pg_constraint 
    where conname = 'credit_transactions_type_check'
    and connamespace = (select oid from pg_namespace where nspname = 'public')
  ) then
    alter table public.credit_transactions
      add constraint credit_transactions_type_check
      check (type in ('purchase','usage','subscription','bonus','trial','daily_free_usage','refund','admin_adjustment'));
  end if;
end $$;

create index if not exists idx_credit_transactions_type
  on public.credit_transactions(type, created_at desc);

-- =========================================================
-- GRANT PERMISSIONS
-- =========================================================
grant execute on function public.award_daily_free_credits(uuid) to authenticated;
grant execute on function public.use_credits(uuid, integer) to authenticated;
grant execute on function public.insert_chat(uuid, text, text, text, integer, text, text, text, text, text, text, text, jsonb) to authenticated;