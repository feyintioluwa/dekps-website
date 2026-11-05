-- =====================================================================
-- CVCommit database schema (Supabase / PostgreSQL)
--
-- Run this whole file once in the Supabase SQL editor of a new project.
-- It only creates what is missing, so running it again is safe.
--
-- Written from the live database. Anything added later (new columns,
-- tables or functions) should be added to this file too.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. profiles: one row per user, created automatically at sign-up.
--    plan = 'pro' gives account-wide access (older arrangement).
--    Everyone else is 'free' and pays per CV through cv_unlocks.
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  plan text not null default 'free' check (plan in ('free', 'pro')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile"
  on public.profiles
  for select
  to authenticated
  using (auth.uid() = id);

-- Users cannot change their own plan. Only the server (service role) writes.


-- ---------------------------------------------------------------------
-- 2. cv_unlocks: one row per paid CV.
--    cv_hash is the SHA-256 of the CV text, not the CV itself.
--    Rows are written only by the server, after Paystack confirms payment.
--    fix_count and download_count track use of the unlock (see section 4).
-- ---------------------------------------------------------------------
create table if not exists public.cv_unlocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  cv_hash text not null,
  payment_reference text unique,
  amount integer not null,
  currency text not null default 'NGN',
  status text not null default 'paid'
    check (status in ('paid', 'refunded', 'revoked')),
  fix_count integer not null default 0,
  download_count integer not null default 0,
  unlocked_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, cv_hash)
);

alter table public.cv_unlocks enable row level security;

drop policy if exists "Users can read own CV unlocks" on public.cv_unlocks;
create policy "Users can read own CV unlocks"
  on public.cv_unlocks
  for select
  to authenticated
  using (auth.uid() = user_id);

-- No insert, update or delete policy: only the server (service role) writes.
-- Access counts only rows with status = 'paid'. Set a row to 'refunded' or
-- 'revoked' to take access away.


-- ---------------------------------------------------------------------
-- 3. Create a profile automatically when someone signs up.
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  insert into public.profiles (
    id,
    full_name,
    plan
  )
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    'free'
  );

  return new;
end;
$function$;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();


-- ---------------------------------------------------------------------
-- 4. Usage limits for one unlock.
--    The server calls this before each Fix request (kind = 'fix') and
--    each PDF/DOCX download (kind = 'download'). The limit number is
--    passed in by the app (see lib/access/cv-quota.ts).
--    Returns 'ok', 'limit', 'no_unlock' or 'bad_kind'.
-- ---------------------------------------------------------------------
create or replace function public.consume_cv_quota(
  p_user uuid,
  p_cv_hash text,
  p_kind text,
  p_limit integer
)
 returns text
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_rows integer;
begin
  if p_kind = 'fix' then
    update cv_unlocks set fix_count = fix_count + 1
     where user_id = p_user and cv_hash = p_cv_hash
       and status = 'paid' and fix_count < p_limit;
  elsif p_kind = 'download' then
    update cv_unlocks set download_count = download_count + 1
     where user_id = p_user and cv_hash = p_cv_hash
       and status = 'paid' and download_count < p_limit;
  else
    return 'bad_kind';
  end if;

  get diagnostics v_rows = row_count;
  if v_rows > 0 then
    return 'ok';
  end if;

  if exists (
    select 1 from cv_unlocks
     where user_id = p_user and cv_hash = p_cv_hash and status = 'paid'
  ) then
    return 'limit';
  end if;

  return 'no_unlock';
end $function$;

-- Only the server (service role) may call it, never a signed-in user.
revoke all on function public.consume_cv_quota(uuid, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.consume_cv_quota(uuid, text, text, integer)
  to service_role;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------
-- Daily limit on CV analyses per account.
-- Run this file once in the Supabase SQL editor, and also add it to
-- supabase/schema.sql so the schema file stays complete.
-- ---------------------------------------------------------------------

create table if not exists public.analysis_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null default ((now() at time zone 'utc')::date),
  count integer not null default 0,
  primary key (user_id, day)
);

alter table public.analysis_usage enable row level security;
-- No policies on purpose: only the server (service role) reads or writes this table.
revoke all on public.analysis_usage from anon, authenticated;

create or replace function public.consume_analysis_quota(
  p_user uuid,
  p_limit integer
)
 returns text
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_rows integer;
  v_day date := (now() at time zone 'utc')::date;
begin
  insert into analysis_usage (user_id, day, count)
  values (p_user, v_day, 0)
  on conflict (user_id, day) do nothing;

  update analysis_usage
     set count = count + 1
   where user_id = p_user
     and day = v_day
     and count < p_limit;

  get diagnostics v_rows = row_count;

  if v_rows > 0 then
    return 'ok';
  end if;

  return 'limit';
end;
$function$;

revoke all on function public.consume_analysis_quota(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.consume_analysis_quota(uuid, integer)
  to service_role;

notify pgrst, 'reload schema';

-- Free CV allowances: one fix and one download per user/CV.
create table if not exists public.free_cv_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  cv_hash text not null,
  fix_count integer not null default 0,
  download_count integer not null default 0,
  primary key(user_id, cv_hash)
);
alter table public.free_cv_usage enable row level security;
revoke all on public.free_cv_usage from anon, authenticated;

create or replace function public.consume_free_cv_quota(
  p_user uuid, p_cv_hash text, p_kind text, p_limit integer
) returns text language plpgsql security definer set search_path = 'public' as $$
declare v_rows integer;
begin
  if p_user is null or length(p_cv_hash) < 10 or p_limit < 1 then return 'limit'; end if;
  if p_kind not in ('fix', 'download') then return 'bad_kind'; end if;
  insert into public.free_cv_usage(user_id, cv_hash) values(p_user, p_cv_hash)
    on conflict (user_id, cv_hash) do nothing;
  if p_kind = 'fix' then
    update public.free_cv_usage set fix_count = fix_count + 1
    where user_id = p_user and cv_hash = p_cv_hash and fix_count < p_limit;
  else
    update public.free_cv_usage set download_count = download_count + 1
    where user_id = p_user and cv_hash = p_cv_hash and download_count < p_limit;
  end if;
  get diagnostics v_rows = row_count;
  if v_rows > 0 then return 'ok'; end if;
  return 'limit';
end $$;
revoke all on function public.consume_free_cv_quota(uuid,text,text,integer) from public,anon,authenticated;
grant execute on function public.consume_free_cv_quota(uuid,text,text,integer) to service_role;
notify pgrst, 'reload schema';

-- Run once in the Supabase SQL Editor before deploying usage tracking.
-- Metadata only; CV contents and prompts are never stored here.
create table if not exists public.ai_usage_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  task text not null check (task in ('analysis','fix')),
  provider text not null check (provider in ('gemini','openrouter','self-hosted','local')),
  model text not null,
  status text not null check (status in ('success','failure')),
  input_tokens integer check (input_tokens >= 0),
  output_tokens integer check (output_tokens >= 0),
  estimated_input_tokens integer check (estimated_input_tokens >= 0),
  estimated_output_tokens integer check (estimated_output_tokens >= 0),
  created_at timestamptz not null default now()
);
create index if not exists ai_usage_events_user_created_idx on public.ai_usage_events(user_id, created_at desc);
alter table public.ai_usage_events enable row level security;
revoke all on public.ai_usage_events from anon, authenticated;
grant select, insert on public.ai_usage_events to service_role;
grant usage, select on sequence public.ai_usage_events_id_seq to service_role;
