-- Assignments: the tasks, the students' submissions (with attached files) and the private storage area.
-- A record of what is already in the database. Safe to run more than once.
create table if not exists assignments (
  id uuid primary key default gen_random_uuid(),
  term_id uuid not null references terms(id) on delete cascade,
  class_id uuid not null references classes(id) on delete cascade,
  subject_id uuid not null references subjects(id) on delete cascade,
  title text not null,
  instructions text,
  max_score integer not null default 10,
  due_at timestamptz,
  is_published boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists assignment_submissions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references assignments(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  answer text,
  submitted_at timestamptz not null default now(),
  score integer,
  comment text,
  marked_at timestamptz,
  unique (assignment_id, student_id)
);

-- Attached photos and PDFs: a list of { path, name, type }
alter table assignment_submissions
  add column if not exists files jsonb not null default '[]'::jsonb;

alter table assignments enable row level security;
alter table assignment_submissions enable row level security;

-- Private storage area for the attached files (5 MB each; JPG, PNG and PDF only)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('assignments', 'assignments', false, 5242880,
        array['image/jpeg','image/png','application/pdf'])
on conflict (id) do nothing;

notify pgrst, 'reload schema';
