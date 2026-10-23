-- =====================================================================
-- DKPS CBT PORTAL - database schema
-- Run this once in the Supabase dashboard: SQL Editor -> New query -> Run
-- Safe to re-run (uses IF NOT EXISTS).
-- =====================================================================

-- Exams -----------------------------------------------------------------
create table if not exists public.cbt_exams (
  id                uuid primary key default gen_random_uuid(),
  title             text not null,
  subject           text not null,
  class_name        text,                       -- empty/null = open to all classes
  term              text,
  session           text,
  duration_minutes  int  not null check (duration_minutes between 1 and 600),
  instructions      text,
  shuffle_questions boolean not null default false,
  show_score        boolean not null default true,   -- show score to student after submitting
  is_published      boolean not null default false,
  created_by        uuid references auth.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Questions -------------------------------------------------------------
create table if not exists public.cbt_questions (
  id             uuid primary key default gen_random_uuid(),
  exam_id        uuid not null references public.cbt_exams(id) on delete cascade,
  position       int  not null default 0,
  question_text  text not null,
  option_a       text not null,
  option_b       text not null,
  option_c       text,
  option_d       text,
  correct_option char(1) not null check (correct_option in ('A','B','C','D')),
  marks          int  not null default 1 check (marks > 0),
  created_at     timestamptz not null default now()
);
create index if not exists cbt_questions_exam_idx on public.cbt_questions (exam_id, position);

-- Attempts (one per student per exam) -------------------------------------
create table if not exists public.cbt_attempts (
  id             uuid primary key default gen_random_uuid(),
  exam_id        uuid not null references public.cbt_exams(id) on delete cascade,
  login_id       text not null,
  student_name   text not null,
  class_name     text,
  started_at     timestamptz not null default now(),
  expires_at     timestamptz not null,
  submitted_at   timestamptz,
  question_order uuid[] not null,
  answers        jsonb not null default '{}'::jsonb,
  score          int,
  total_marks    int,
  status         text not null default 'in_progress' check (status in ('in_progress','submitted')),
  unique (exam_id, login_id)
);
create index if not exists cbt_attempts_exam_idx  on public.cbt_attempts (exam_id);
create index if not exists cbt_attempts_login_idx on public.cbt_attempts (login_id);

-- Security ---------------------------------------------------------------
-- All access goes through the Next.js server using the service (secret) key,
-- which bypasses RLS. Turning RLS on with NO policies means the browser /
-- anon key can never read the answer key or anyone's attempt directly.
alter table public.cbt_exams     enable row level security;
alter table public.cbt_questions enable row level security;
alter table public.cbt_attempts  enable row level security;

revoke all on public.cbt_exams, public.cbt_questions, public.cbt_attempts from anon, authenticated;
