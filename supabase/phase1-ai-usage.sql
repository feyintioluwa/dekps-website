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
