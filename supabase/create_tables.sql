-- =========================================================
-- EXTENSIONS
-- =========================================================
create extension if not exists "pgcrypto";

-- =========================================================
-- USER PROFILES
-- =========================================================
create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,

  email text unique,
  full_name text,
  avatar_url text,

  credits integer not null default 0 check (credits >= 0),

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_user_profiles_email
on public.user_profiles(email);

-- Function to update updated_at
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Trigger for user_profiles
create trigger trg_user_updated
before update on public.user_profiles
for each row
execute function public.set_updated_at();

-- Function to handle new user signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.user_profiles (id, email, full_name, avatar_url, credits)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'avatar_url', 10); -- Give 10 credits on signup
  return new;
end;
$$ language plpgsql security definer;

-- Trigger on auth.users
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- =========================================================
-- PLANS
-- =========================================================
create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),

  name text not null unique,
  price_usd numeric(10,2) not null default 0,

  billing_type text not null
    check (billing_type in ('one_time','monthly','yearly','trial')),

  credits integer, -- null = unlimited
  duration_days integer,

  is_active boolean default true,

  created_at timestamptz default now()
);

-- Seed plans
insert into public.plans (name, price_usd, billing_type, credits, duration_days)
values
('Free Trial', 0, 'trial', null, 30),
('Starter', 1.36, 'one_time', 50, null),
('Standard', 3.26, 'one_time', 150, null),
('Pro', 8.14, 'one_time', 500, null),
('Pro+ Monthly', 4.07, 'monthly', 300, null),
('Pro+ Yearly', 32.55, 'yearly', 300, null)
on conflict (name) do nothing;

-- =========================================================
-- SUBSCRIPTIONS
-- =========================================================
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),

  user_id uuid references auth.users(id) on delete cascade,
  plan_id uuid references public.plans(id),

  status text not null
    check (status in ('active','cancelled','expired')),

  current_period_start timestamptz,
  current_period_end timestamptz,

  created_at timestamptz default now()
);

create index if not exists idx_subscriptions_user_id
on public.subscriptions(user_id);

-- =========================================================
-- CREDIT TRANSACTIONS (LEDGER)
-- =========================================================
create table if not exists public.credit_transactions (
  id uuid primary key default gen_random_uuid(),

  user_id uuid references auth.users(id) on delete cascade,

  amount integer not null,
  type text not null
    check (type in ('purchase','usage','subscription','bonus','trial')),

  reference_id uuid,

  created_at timestamptz default now()
);

create index if not exists idx_credit_transactions_user
on public.credit_transactions(user_id);

-- =========================================================
-- CHAT HISTORY
-- =========================================================
create table if not exists public.chat_history (
  id uuid primary key default gen_random_uuid(),

  user_id uuid references auth.users(id) on delete cascade,

  mode text not null
    check (mode in ('tutor','research','problem','simplify','hints','rewrites')),

  prompt text not null,
  response text not null,

  credits_used integer not null default 1 check (credits_used > 0),

  created_at timestamptz default now()
);

create index if not exists idx_chat_user
on public.chat_history(user_id);

create index if not exists idx_chat_created
on public.chat_history(created_at desc);

-- =========================================================
-- ROW LEVEL SECURITY
-- =========================================================
alter table public.user_profiles enable row level security;
alter table public.chat_history enable row level security;
alter table public.subscriptions enable row level security;
alter table public.credit_transactions enable row level security;

-- USER PROFILE POLICIES
drop policy if exists "profile_select" on public.user_profiles;
create policy "profile_select"
on public.user_profiles for select
using (auth.uid() = id);

drop policy if exists "profile_update" on public.user_profiles;
create policy "profile_update"
on public.user_profiles for update
using (auth.uid() = id);

drop policy if exists "profile_insert" on public.user_profiles;
create policy "profile_insert"
on public.user_profiles for insert
with check (auth.uid() = id);

-- CHAT HISTORY POLICIES
drop policy if exists "chat_all" on public.chat_history;
create policy "chat_all"
on public.chat_history for all
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- SUBSCRIPTIONS POLICIES
drop policy if exists "subs_select" on public.subscriptions;
create policy "subs_select"
on public.subscriptions for select
using (user_id = auth.uid());

-- CREDIT POLICIES
drop policy if exists "credits_select" on public.credit_transactions;
create policy "credits_select"
on public.credit_transactions for select
using (user_id = auth.uid());

-- =========================================================
-- AUTO UPDATED_AT
-- =========================================================
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_user_updated on public.user_profiles;
create trigger trg_user_updated
before update on public.user_profiles
for each row execute procedure public.set_updated_at();

-- =========================================================
-- HANDLE NEW USER
-- =========================================================
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.user_profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name',''),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;

  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- =========================================================
-- HANDLE USER UPDATE
-- =========================================================
create or replace function public.handle_user_update()
returns trigger as $$
begin
  update public.user_profiles
  set
    email = new.email,
    full_name = coalesce(new.raw_user_meta_data->>'full_name', full_name),
    avatar_url = coalesce(new.raw_user_meta_data->>'avatar_url', avatar_url),
    updated_at = now()
  where id = new.id;

  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated
after update on auth.users
for each row execute procedure public.handle_user_update();

-- =========================================================
-- CREDIT USAGE FUNCTION
-- =========================================================
create or replace function public.use_credits(p_user_id uuid, p_amount integer)
returns void as $$
begin
  update public.user_profiles
  set credits = credits - p_amount
  where id = p_user_id
  and credits >= p_amount;

  if not found then
    raise exception 'Insufficient credits';
  end if;

  insert into public.credit_transactions (user_id, amount, type)
  values (p_user_id, -p_amount, 'usage');
end;
$$ language plpgsql security definer;

-- =========================================================
-- APPLY PLAN FUNCTION
-- =========================================================
create or replace function public.apply_plan(
  p_user_id uuid,
  p_plan_name text
)
returns void as $$
declare
  v_plan record;
begin
  select * into v_plan from public.plans
  where name = p_plan_name and is_active = true;

  if not found then
    raise exception 'Plan not found';
  end if;

  -- ONE-TIME
  if v_plan.billing_type = 'one_time' then
    update public.user_profiles
    set credits = credits + v_plan.credits
    where id = p_user_id;

    insert into public.credit_transactions (user_id, amount, type)
    values (p_user_id, v_plan.credits, 'purchase');

  -- TRIAL
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
      now(),
      now() + (v_plan.duration_days || ' days')::interval
    );

  -- SUBSCRIPTIONS
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
      now(),
      case
        when v_plan.billing_type = 'monthly'
          then now() + interval '1 month'
        when v_plan.billing_type = 'yearly'
          then now() + interval '1 year'
      end
    );
  end if;
end;
$$ language plpgsql security definer;

-- =========================================================
-- INSERT CHAT (AUTO CREDIT DEDUCTION)
-- =========================================================
create or replace function public.insert_chat(
  p_user_id uuid,
  p_mode text,
  p_prompt text,
  p_response text,
  p_credits integer
)
returns void as $$
begin
  perform public.use_credits(p_user_id, p_credits);

  insert into public.chat_history (
    user_id, mode, prompt, response, credits_used
  )
  values (
    p_user_id, p_mode, p_prompt, p_response, p_credits
  );
end;
$$ language plpgsql security definer;

create or replace function public.grant_credits(
  p_user_id uuid,
  p_amount integer,
  p_reason text default 'bonus'
)
returns void as $$
begin
  update public.user_profiles
  set credits = credits + p_amount
  where id = p_user_id;

  if not found then
    raise exception 'User not found';
  end if;

  insert into public.credit_transactions (user_id, amount, type)
  values (p_user_id, p_amount, p_reason);
end;
$$ language plpgsql security definer;

-- =========================================================
-- REFILL SUBSCRIPTION CREDITS
-- =========================================================
create or replace function public.refill_subscription_credits()
returns void as $$
begin
  insert into public.credit_transactions (user_id, amount, type)
  select
    s.user_id,
    p.credits,
    'subscription'
  from public.subscriptions s
  join public.plans p on s.plan_id = p.id
  where s.status = 'active'
  and p.billing_type in ('monthly','yearly');

  update public.user_profiles up
  set credits = credits + sub.credits
  from (
    select s.user_id, p.credits
    from public.subscriptions s
    join public.plans p on s.plan_id = p.id
    where s.status = 'active'
  ) sub
  where up.id = sub.user_id;
end;
$$ language plpgsql;