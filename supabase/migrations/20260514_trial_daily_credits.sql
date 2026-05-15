-- Migration: Add daily trial credits functionality
-- Purpose: Award 10 credits daily to Trial plan users for 30 days after registration
-- Date: 2026-05-14

-- ═════════════════════════════════════════════════════════════════
-- 1. Add trial_credits_awarded_date column to track daily awards
-- ═════════════════════════════════════════════════════════════════
ALTER TABLE public.user_profiles
ADD COLUMN IF NOT EXISTS trial_credits_awarded_date timestamptz,
ADD COLUMN IF NOT EXISTS trial_credits_remaining integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS trial_start_date timestamptz;

-- ═════════════════════════════════════════════════════════════════
-- 2. Function to award daily trial credits
-- ═════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.award_daily_trial_credits(p_user_id uuid)
RETURNS boolean AS $$
DECLARE
  v_user record;
  v_subscription record;
  v_now timestamptz := now();
  v_trial_end_date timestamptz;
  v_days_active integer;
  v_credits_to_award integer := 10;
BEGIN
  -- Get user profile
  SELECT * INTO v_user FROM public.user_profiles WHERE id = p_user_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Get active trial subscription
  SELECT s.*, p.duration_days 
  INTO v_subscription
  FROM public.subscriptions s
  JOIN public.plans p ON s.plan_id = p.id
  WHERE s.user_id = p_user_id 
    AND s.status = 'active' 
    AND p.name = 'Trial'
  LIMIT 1;

  IF NOT FOUND THEN
    -- User doesn't have active trial
    RETURN false;
  END IF;

  -- Check if trial has expired
  IF v_subscription.current_period_end <= v_now THEN
    RETURN false;
  END IF;

  -- Check if we already awarded credits today
  IF v_user.trial_credits_awarded_date IS NOT NULL 
    AND (v_now::date = v_user.trial_credits_awarded_date::date) THEN
    -- Already awarded today
    RETURN false;
  END IF;

  -- Award daily credits
  UPDATE public.user_profiles
  SET 
    credits = credits + v_credits_to_award,
    trial_credits_remaining = trial_credits_remaining + v_credits_to_award,
    trial_credits_awarded_date = v_now
  WHERE id = p_user_id;

  -- Log the transaction
  INSERT INTO public.credit_transactions (user_id, amount, type, description)
  VALUES (
    p_user_id,
    v_credits_to_award,
    'trial_daily',
    'Daily trial credits: ' || v_credits_to_award || ' credits awarded'
  );

  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═════════════════════════════════════════════════════════════════
-- 3. Function to initialize trial credits on signup
-- ═════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.initialize_trial_credits(p_user_id uuid)
RETURNS void AS $$
DECLARE
  v_user record;
  v_subscription record;
BEGIN
  -- Get user profile
  SELECT * INTO v_user FROM public.user_profiles WHERE id = p_user_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Get trial subscription if exists
  SELECT * 
  INTO v_subscription
  FROM public.subscriptions s
  JOIN public.plans p ON s.plan_id = p.id
  WHERE s.user_id = p_user_id 
    AND s.status = 'active'
    AND p.name = 'Trial'
  LIMIT 1;

  IF FOUND THEN
    -- Initialize trial credits tracking
    UPDATE public.user_profiles
    SET 
      trial_start_date = now(),
      trial_credits_remaining = 0,
      trial_credits_awarded_date = NULL
    WHERE id = p_user_id;

    -- Award first day of credits immediately
    PERFORM public.award_daily_trial_credits(p_user_id);
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═════════════════════════════════════════════════════════════════
-- 4. Function to get trial credits remaining for user
-- ═════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_trial_credits_remaining(p_user_id uuid)
RETURNS TABLE (
  remaining_credits integer,
  days_remaining integer,
  has_active_trial boolean
) AS $$
DECLARE
  v_user record;
  v_subscription record;
  v_now timestamptz := now();
  v_days_remaining integer;
BEGIN
  -- Get user
  SELECT * INTO v_user FROM public.user_profiles WHERE id = p_user_id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 0::integer, 0::integer, false;
    RETURN;
  END IF;

  -- Get trial subscription
  SELECT s.*, p.duration_days
  INTO v_subscription
  FROM public.subscriptions s
  JOIN public.plans p ON s.plan_id = p.id
  WHERE s.user_id = p_user_id
    AND s.status = 'active'
    AND p.name = 'Trial'
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 0::integer, 0::integer, false;
    RETURN;
  END IF;

  -- Calculate days remaining
  v_days_remaining := EXTRACT(DAY FROM (v_subscription.current_period_end - v_now))::integer + 1;
  IF v_days_remaining < 0 THEN
    v_days_remaining := 0;
  END IF;

  RETURN QUERY SELECT 
    COALESCE(v_user.trial_credits_remaining, 0),
    v_days_remaining,
    (v_subscription.current_period_end > v_now);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═════════════════════════════════════════════════════════════════
-- 5. Trigger to award daily credits on auth trigger
-- ═════════════════════════════════════════════════════════════════
-- Note: This would typically be called by a cron job or middleware
-- For now, you can call it manually or integrate with your auth flow

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.award_daily_trial_credits(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.initialize_trial_credits(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_trial_credits_remaining(uuid) TO authenticated, service_role;
