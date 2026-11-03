-- Prefects: one role per student per session.
-- A record of what is already in the database. Safe to run more than once.
create table if not exists prefects (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  session text not null,
  role text not null,
  created_at timestamptz not null default now()
);

-- The admin page saves with "on conflict (student_id, session)", which needs this unique index
create unique index if not exists prefects_student_session_key on prefects (student_id, session);

-- Only the website's server code (service key) may read or write this table
alter table prefects enable row level security;

notify pgrst, 'reload schema';
