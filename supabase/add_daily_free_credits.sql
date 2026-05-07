-- supabase/add_daily_free_credits.sql
-- Add daily free credit tracking columns for free-tier users.

alter table if exists public.user_profiles
  add column if not exists daily_free_credits_used integer not null default 0;

alter table if exists public.user_profiles
  add column if not exists daily_free_credits_reset_at timestamptz not null default now();
