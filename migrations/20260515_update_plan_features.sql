-- Migration: Upsert plan_features for Free Trial, Basic, Pro, Ultra
-- Date: 2026-05-15

-- Ensure features table exists
create table if not exists public.plan_features (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans(id) on delete cascade,
  feature_key text not null,
  feature_value text,
  created_at timestamptz default now(),
  unique(plan_id, feature_key)
);

-- Helper: upsert feature by plan name
-- Daily credits for trial
INSERT INTO public.plan_features (plan_id, feature_key, feature_value)
SELECT p.id, 'daily_credits', '10'
FROM public.plans p WHERE p.name IN ('Free Trial','Trial','Free')
ON CONFLICT (plan_id, feature_key) DO UPDATE SET feature_value = EXCLUDED.feature_value;

-- Upload limits
INSERT INTO public.plan_features (plan_id, feature_key, feature_value)
SELECT p.id, 'upload_limit_mb', '1'
FROM public.plans p WHERE p.name IN ('Free Trial','Trial','Free')
ON CONFLICT (plan_id, feature_key) DO UPDATE SET feature_value = EXCLUDED.feature_value;

INSERT INTO public.plan_features (plan_id, feature_key, feature_value)
SELECT p.id, 'upload_limit_mb', '5'
FROM public.plans p WHERE p.name = 'Basic'
ON CONFLICT (plan_id, feature_key) DO UPDATE SET feature_value = EXCLUDED.feature_value;

INSERT INTO public.plan_features (plan_id, feature_key, feature_value)
SELECT p.id, 'upload_limit_mb', '10000'
FROM public.plans p WHERE p.name = 'Ultra'
ON CONFLICT (plan_id, feature_key) DO UPDATE SET feature_value = EXCLUDED.feature_value;

INSERT INTO public.plan_features (plan_id, feature_key, feature_value)
SELECT p.id, 'upload_limit_mb', '5'
FROM public.plans p WHERE p.name = 'Pro'
ON CONFLICT (plan_id, feature_key) DO UPDATE SET feature_value = EXCLUDED.feature_value;

-- Max input words
INSERT INTO public.plan_features (plan_id, feature_key, feature_value)
SELECT p.id, 'max_input_words', '250'
FROM public.plans p WHERE p.name IN ('Free Trial','Trial','Free')
ON CONFLICT (plan_id, feature_key) DO UPDATE SET feature_value = EXCLUDED.feature_value;

INSERT INTO public.plan_features (plan_id, feature_key, feature_value)
SELECT p.id, 'max_input_words', '500'
FROM public.plans p WHERE p.name = 'Basic'
ON CONFLICT (plan_id, feature_key) DO UPDATE SET feature_value = EXCLUDED.feature_value;

INSERT INTO public.plan_features (plan_id, feature_key, feature_value)
SELECT p.id, 'max_input_words', '1000'
FROM public.plans p WHERE p.name = 'Pro'
ON CONFLICT (plan_id, feature_key) DO UPDATE SET feature_value = EXCLUDED.feature_value;

INSERT INTO public.plan_features (plan_id, feature_key, feature_value)
SELECT p.id, 'max_input_words', '100000'
FROM public.plans p WHERE p.name = 'Ultra'
ON CONFLICT (plan_id, feature_key) DO UPDATE SET feature_value = EXCLUDED.feature_value;

-- AI illustrations
INSERT INTO public.plan_features (plan_id, feature_key, feature_value)
SELECT p.id, 'ai_illustrations', 'false'
FROM public.plans p WHERE p.name IN ('Free Trial','Trial','Free','Basic','Pro')
ON CONFLICT (plan_id, feature_key) DO UPDATE SET feature_value = EXCLUDED.feature_value;

INSERT INTO public.plan_features (plan_id, feature_key, feature_value)
SELECT p.id, 'ai_illustrations', 'true'
FROM public.plans p WHERE p.name = 'Ultra'
ON CONFLICT (plan_id, feature_key) DO UPDATE SET feature_value = EXCLUDED.feature_value;

-- Available citations
INSERT INTO public.plan_features (plan_id, feature_key, feature_value)
SELECT p.id, 'available_citations', 'APA'
FROM public.plans p WHERE p.name IN ('Free Trial','Trial','Free')
ON CONFLICT (plan_id, feature_key) DO UPDATE SET feature_value = EXCLUDED.feature_value;

INSERT INTO public.plan_features (plan_id, feature_key, feature_value)
SELECT p.id, 'available_citations', 'APA,MLA,IEEE,AMA'
FROM public.plans p WHERE p.name IN ('Basic','Pro','Ultra')
ON CONFLICT (plan_id, feature_key) DO UPDATE SET feature_value = EXCLUDED.feature_value;

-- Tutor / research flags
INSERT INTO public.plan_features (plan_id, feature_key, feature_value)
SELECT p.id, 'tutor_beginner', 'true'
FROM public.plans p WHERE p.name IN ('Free Trial','Trial','Free')
ON CONFLICT (plan_id, feature_key) DO UPDATE SET feature_value = EXCLUDED.feature_value;

INSERT INTO public.plan_features (plan_id, feature_key, feature_value)
SELECT p.id, 'tutor_intermediate', 'true'
FROM public.plans p WHERE p.name IN ('Basic','Pro','Ultra')
ON CONFLICT (plan_id, feature_key) DO UPDATE SET feature_value = EXCLUDED.feature_value;

INSERT INTO public.plan_features (plan_id, feature_key, feature_value)
SELECT p.id, 'research_beginner', 'true'
FROM public.plans p WHERE p.name IN ('Free Trial','Trial','Free')
ON CONFLICT (plan_id, feature_key) DO UPDATE SET feature_value = EXCLUDED.feature_value;
