-- Migration: Update subscription plans to new tier structure
-- Purpose: Update plans from Free/Starter/Pro/Ultra to Trial/Basic/Pro/Ultra
-- Date: 2026-05-14

-- ═════════════════════════════════════════════════════════════════
-- 1. Update existing plans
-- ═════════════════════════════════════════════════════════════════

-- Rename Free to Trial and update its properties
UPDATE public.plans
SET 
  name = 'Trial',
  price_usd = 0,
  billing_type = 'trial',
  credits = NULL,  -- Trial has daily credits instead
  duration_days = 30,
  is_active = true
WHERE name = 'Free Trial' OR name = 'Free';

-- Rename Starter to Basic and update its properties
UPDATE public.plans
SET 
  name = 'Basic',
  price_usd = 4,
  billing_type = 'one_time',
  credits = 1000,
  duration_days = NULL,
  is_active = true
WHERE name = 'Starter';

-- Update Pro plan
UPDATE public.plans
SET 
  name = 'Pro',
  price_usd = 9,
  billing_type = 'monthly',
  credits = NULL,  -- Unlimited
  duration_days = NULL,
  is_active = true
WHERE name = 'Pro' AND billing_type IN ('one_time', 'monthly');

-- Update Ultra plan
UPDATE public.plans
SET 
  name = 'Ultra',
  price_usd = 20,
  billing_type = 'monthly',
  credits = NULL,  -- Unlimited
  duration_days = NULL,
  is_active = true
WHERE name = 'Ultra';

-- ═════════════════════════════════════════════════════════════════
-- 2. Create any missing plans
-- ═════════════════════════════════════════════════════════════════

-- Insert Trial if not exists
INSERT INTO public.plans (name, price_usd, billing_type, credits, duration_days, is_active)
SELECT 'Trial', 0, 'trial', NULL, 30, true
WHERE NOT EXISTS (SELECT 1 FROM public.plans WHERE name = 'Trial');

-- Insert Basic if not exists
INSERT INTO public.plans (name, price_usd, billing_type, credits, duration_days, is_active)
SELECT 'Basic', 4, 'one_time', 1000, NULL, true
WHERE NOT EXISTS (SELECT 1 FROM public.plans WHERE name = 'Basic');

-- Insert Pro if not exists
INSERT INTO public.plans (name, price_usd, billing_type, credits, duration_days, is_active)
SELECT 'Pro', 9, 'monthly', NULL, NULL, true
WHERE NOT EXISTS (SELECT 1 FROM public.plans WHERE name = 'Pro');

-- Insert Ultra if not exists
INSERT INTO public.plans (name, price_usd, billing_type, credits, duration_days, is_active)
SELECT 'Ultra', 20, 'monthly', NULL, NULL, true
WHERE NOT EXISTS (SELECT 1 FROM public.plans WHERE name = 'Ultra');

-- ═════════════════════════════════════════════════════════════════
-- 3. Deactivate old plans
-- ═════════════════════════════════════════════════════════════════

UPDATE public.plans
SET is_active = false
WHERE name NOT IN ('Trial', 'Basic', 'Pro', 'Ultra') 
  AND is_active = true;

-- ═════════════════════════════════════════════════════════════════
-- 4. Create plan feature table for future extensibility
-- ═════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.plan_features (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
  feature_key text NOT NULL,
  feature_value text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(plan_id, feature_key)
);

-- Seed plan features
INSERT INTO public.plan_features (plan_id, feature_key, feature_value)
SELECT p.id, 'tutor_beginner', 'true'
FROM public.plans p WHERE p.name = 'Trial'
ON CONFLICT (plan_id, feature_key) DO NOTHING;

INSERT INTO public.plan_features (plan_id, feature_key, feature_value)
SELECT p.id, 'tutor_intermediate', 'true'
FROM public.plans p WHERE p.name = 'Trial'
ON CONFLICT (plan_id, feature_key) DO NOTHING;

INSERT INTO public.plan_features (plan_id, feature_key, feature_value)
SELECT p.id, 'research_beginner', 'true'
FROM public.plans p WHERE p.name = 'Trial'
ON CONFLICT (plan_id, feature_key) DO NOTHING;

INSERT INTO public.plan_features (plan_id, feature_key, feature_value)
SELECT p.id, 'upload_limit_mb', '1'
FROM public.plans p WHERE p.name IN ('Trial', 'Basic')
ON CONFLICT (plan_id, feature_key) DO NOTHING;

INSERT INTO public.plan_features (plan_id, feature_key, feature_value)
SELECT p.id, 'upload_limit_mb', '5'
FROM public.plans p WHERE p.name = 'Pro'
ON CONFLICT (plan_id, feature_key) DO NOTHING;

INSERT INTO public.plan_features (plan_id, feature_key, feature_value)
SELECT p.id, 'upload_limit_mb', '10000'
FROM public.plans p WHERE p.name = 'Ultra'
ON CONFLICT (plan_id, feature_key) DO NOTHING;

INSERT INTO public.plan_features (plan_id, feature_key, feature_value)
SELECT p.id, 'max_input_words', '250'
FROM public.plans p WHERE p.name = 'Trial'
ON CONFLICT (plan_id, feature_key) DO NOTHING;

INSERT INTO public.plan_features (plan_id, feature_key, feature_value)
SELECT p.id, 'max_input_words', '500'
FROM public.plans p WHERE p.name = 'Basic'
ON CONFLICT (plan_id, feature_key) DO NOTHING;

INSERT INTO public.plan_features (plan_id, feature_key, feature_value)
SELECT p.id, 'max_input_words', '1000'
FROM public.plans p WHERE p.name = 'Pro'
ON CONFLICT (plan_id, feature_key) DO NOTHING;

INSERT INTO public.plan_features (plan_id, feature_key, feature_value)
SELECT p.id, 'max_input_words', '100000'
FROM public.plans p WHERE p.name = 'Ultra'
ON CONFLICT (plan_id, feature_key) DO NOTHING;

INSERT INTO public.plan_features (plan_id, feature_key, feature_value)
SELECT p.id, 'ai_illustrations', 'false'
FROM public.plans p WHERE p.name IN ('Trial', 'Basic', 'Pro')
ON CONFLICT (plan_id, feature_key) DO NOTHING;

INSERT INTO public.plan_features (plan_id, feature_key, feature_value)
SELECT p.id, 'ai_illustrations', 'true'
FROM public.plans p WHERE p.name = 'Ultra'
ON CONFLICT (plan_id, feature_key) DO NOTHING;

INSERT INTO public.plan_features (plan_id, feature_key, feature_value)
SELECT p.id, 'available_citations', 'APA'
FROM public.plans p WHERE p.name = 'Trial'
ON CONFLICT (plan_id, feature_key) DO NOTHING;

INSERT INTO public.plan_features (plan_id, feature_key, feature_value)
SELECT p.id, 'available_citations', 'APA,MLA,IEEE,AMA'
FROM public.plans p WHERE p.name IN ('Basic', 'Pro', 'Ultra')
ON CONFLICT (plan_id, feature_key) DO NOTHING;

INSERT INTO public.plan_features (plan_id, feature_key, feature_value)
SELECT p.id, 'daily_credits', '10'
FROM public.plans p WHERE p.name = 'Trial'
ON CONFLICT (plan_id, feature_key) DO NOTHING;
