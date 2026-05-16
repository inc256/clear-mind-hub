-- Migration: Add/Update plans and create zabure_transactions table
-- Date: 2026-05-15

-- Ensure plans match product offering: Free Trial (30 days), Basic $4, Pro $15, Ultra $35
insert into public.plans (name, price_usd, billing_type, credits, duration_days, is_active)
values
  ('Free Trial', 0, 'trial', null, 30, true),
  ('Basic', 4.00, 'monthly', null, null, true),
  ('Pro', 15.00, 'monthly', null, null, true),
  ('Ultra', 35.00, 'monthly', null, null, true)
on conflict (name) do update
  set price_usd = excluded.price_usd,
      billing_type = excluded.billing_type,
      credits = excluded.credits,
      duration_days = excluded.duration_days,
      is_active = excluded.is_active;


-- Table to record incoming Zabure transactions (idempotency + audit)
create table if not exists public.zabure_transactions (
  id text primary key,
  event text not null,
  amount numeric(10,2) null,
  currency text null,
  status text null,
  user_id uuid null references auth.users(id) on delete set null,
  plan_name text null,
  subscription_id uuid null references public.subscriptions(id) on delete set null,
  raw jsonb null,
  created_at timestamptz default now()
);

create index if not exists idx_zabure_transactions_user on public.zabure_transactions(user_id);
