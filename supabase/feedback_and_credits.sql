-- =========================================================
-- COMPREHENSIVE CREDIT ACCOUNTABILITY & FEEDBACK SYSTEM
-- =========================================================

-- =========================================================
-- FEEDBACK TABLE
-- =========================================================
create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  
  user_id uuid not null references auth.users(id) on delete cascade,
  
  type text not null
    check (type in ('bug_report', 'feature_request', 'general_feedback', 'performance_issue')),
  
  title text not null,
  description text not null,
  
  -- Rating out of 5 stars
  rating integer check (rating >= 1 and rating <= 5),
  
  -- Optional attachment metadata
  attachment_url text,
  attachment_type text, -- 'screenshot', 'log', 'other'
  
  -- Status tracking
  status text not null default 'open'
    check (status in ('open', 'in_review', 'acknowledged', 'resolved', 'closed')),
  
  -- Admin notes/response
  admin_response text,
  admin_responded_at timestamptz,
  
  -- Timestamps
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  
  constraint feedback_title_not_empty check (length(trim(title)) > 0),
  constraint feedback_desc_not_empty check (length(trim(description)) > 0)
);

create index if not exists idx_feedback_user_id 
  on public.feedback(user_id);

create index if not exists idx_feedback_status 
  on public.feedback(status);

create index if not exists idx_feedback_created_at 
  on public.feedback(created_at desc);

create index if not exists idx_feedback_type 
  on public.feedback(type);

-- =========================================================
-- IMPROVE CREDIT TRANSACTIONS WITH BETTER TRACKING
-- =========================================================

-- Add new columns to credit_transactions if they don't exist
alter table public.credit_transactions
  add column if not exists description text,
  add column if not exists chat_id uuid references public.chat_history(id) on delete set null,
  add column if not exists is_reversed boolean default false;

create index if not exists idx_credit_transactions_chat_id 
  on public.credit_transactions(chat_id);

create index if not exists idx_credit_transactions_created_at 
  on public.credit_transactions(created_at desc);

-- =========================================================
-- IMPROVE CHAT HISTORY WITH IMAGE METADATA
-- =========================================================

-- Add column to store extracted question from image
alter table public.chat_history
  add column if not exists image_extracted_question text;

alter table public.chat_history
  add column if not exists image_processing_metadata jsonb;

create index if not exists idx_chat_history_image_data 
  on public.chat_history(image_data) 
  where image_data is not null;

-- =========================================================
-- UPDATE CHAT INSERT LOGIC
-- =========================================================
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
returns void as $$
begin
  if p_credits > 0 then
    perform public.use_credits(p_user_id, p_credits);
  end if;

  insert into public.chat_history (
    user_id, mode, prompt, response, credits_used,
    image_data, image_mime_type, image_name,
    document_data, document_mime_type, document_name,
    voice_transcript, code_snippets
  )
  values (
    p_user_id, p_mode, p_prompt, p_response, p_credits,
    p_image_data, p_image_mime_type, p_image_name,
    p_document_data, p_document_mime_type, p_document_name,
    p_voice_transcript, p_code_snippets
  );
end;
$$ language plpgsql security definer;

-- =========================================================
-- TRIGGER FOR FEEDBACK UPDATED_AT
-- =========================================================

drop trigger if exists trg_feedback_updated on public.feedback;

create trigger trg_feedback_updated
before update on public.feedback
for each row
execute function public.set_updated_at();

-- =========================================================
-- FUNCTION: LOG CREDIT TRANSACTION WITH DETAILS
-- =========================================================

create or replace function public.log_credit_transaction(
  p_user_id uuid,
  p_amount integer,
  p_type text,
  p_description text default null,
  p_chat_id uuid default null,
  p_reference_id uuid default null
)
returns uuid as $$
declare
  v_transaction_id uuid;
begin
  insert into public.credit_transactions (
    user_id,
    amount,
    type,
    description,
    chat_id,
    reference_id
  )
  values (
    p_user_id,
    p_amount,
    p_type,
    p_description,
    p_chat_id,
    p_reference_id
  )
  returning id into v_transaction_id;

  return v_transaction_id;
end;
$$ language plpgsql security definer;

-- =========================================================
-- FUNCTION: GET CREDIT HISTORY WITH DETAILS
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
) as $$
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
-- FUNCTION: CALCULATE TOTAL CREDITS USED TODAY
-- =========================================================

create or replace function public.get_credits_used_today(p_user_id uuid)
returns integer as $$
declare
  v_used integer;
begin
  select coalesce(sum(case when amount < 0 then abs(amount) else 0 end), 0)
  into v_used
  from public.credit_transactions
  where user_id = p_user_id
    and type = 'usage'
    and created_at >= date_trunc('day', now());

  return v_used;
end;
$$ language plpgsql security definer;

-- =========================================================
-- FUNCTION: CREATE FEEDBACK
-- =========================================================

create or replace function public.create_feedback(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_description text,
  p_rating integer default null,
  p_attachment_url text default null,
  p_attachment_type text default null
)
returns uuid as $$
declare
  v_feedback_id uuid;
begin
  if length(trim(p_title)) = 0 or length(trim(p_description)) = 0 then
    raise exception 'Title and description cannot be empty';
  end if;

  if p_type not in ('bug_report', 'feature_request', 'general_feedback', 'performance_issue') then
    raise exception 'Invalid feedback type';
  end if;

  insert into public.feedback (
    user_id,
    type,
    title,
    description,
    rating,
    attachment_url,
    attachment_type,
    status
  )
  values (
    p_user_id,
    p_type,
    trim(p_title),
    trim(p_description),
    p_rating,
    p_attachment_url,
    p_attachment_type,
    'open'
  )
  returning id into v_feedback_id;

  return v_feedback_id;
end;
$$ language plpgsql security definer;

-- =========================================================
-- FUNCTION: UPDATE FEEDBACK STATUS
-- =========================================================

create or replace function public.update_feedback_status(
  p_feedback_id uuid,
  p_status text,
  p_admin_response text default null
)
returns void as $$
begin
  if p_status not in ('open', 'in_review', 'acknowledged', 'resolved', 'closed') then
    raise exception 'Invalid feedback status';
  end if;

  update public.feedback
  set
    status = p_status,
    admin_response = coalesce(p_admin_response, admin_response),
    admin_responded_at = case when p_admin_response is not null then now() else admin_responded_at end,
    updated_at = now()
  where id = p_feedback_id;
end;
$$ language plpgsql security definer;

-- =========================================================
-- ROW LEVEL SECURITY FOR FEEDBACK
-- =========================================================

alter table public.feedback enable row level security;

drop policy if exists "feedback_select" on public.feedback;
create policy "feedback_select"
on public.feedback for select
using (auth.uid() = user_id or auth.jwt() -> 'user_role' = '"admin"');

drop policy if exists "feedback_insert" on public.feedback;
create policy "feedback_insert"
on public.feedback for insert
with check (auth.uid() = user_id);

drop policy if exists "feedback_update" on public.feedback;
create policy "feedback_update"
on public.feedback for update
using (auth.uid() = user_id or auth.jwt() -> 'user_role' = '"admin"');

-- =========================================================
-- CREDIT ACCOUNTABILITY VIEW
-- =========================================================

create or replace view public.credit_accountability as
select
  up.id as user_id,
  up.email,
  up.full_name,
  up.credits as current_credits,
  (select coalesce(sum(amount), 0) from public.credit_transactions ct where ct.user_id = up.id and ct.type = 'purchase') as total_purchased,
  (select coalesce(sum(amount), 0) from public.credit_transactions ct where ct.user_id = up.id and ct.type = 'usage') as total_used,
  (select coalesce(sum(amount), 0) from public.credit_transactions ct where ct.user_id = up.id and ct.type = 'subscription') as total_from_subscriptions,
  (select coalesce(sum(amount), 0) from public.credit_transactions ct where ct.user_id = up.id and ct.type = 'bonus') as total_bonuses,
  (select count(*) from public.credit_transactions ct where ct.user_id = up.id) as total_transactions,
  (select count(*) from public.feedback f where f.user_id = up.id) as total_feedback_count,
  (select count(*) from public.feedback f where f.user_id = up.id and f.status = 'open') as open_feedback_count,
  up.created_at,
  up.updated_at
from public.user_profiles up;

-- =========================================================
-- AUDIT TABLE FOR ADMIN ACTIONS
-- =========================================================

create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  
  admin_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  target_user_id uuid references auth.users(id) on delete set null,
  
  details jsonb,
  
  created_at timestamptz default now()
);

create index if not exists idx_admin_audit_log_admin_id 
  on public.admin_audit_log(admin_id);

create index if not exists idx_admin_audit_log_target_user_id 
  on public.admin_audit_log(target_user_id);

create index if not exists idx_admin_audit_log_created_at 
  on public.admin_audit_log(created_at desc);
