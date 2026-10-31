-- Teacher notifications: one row per teacher, assignment and student.
-- A student who edits and resubmits turns the same row unread again (no duplicates).
-- Safe to run more than once.
create table if not exists teacher_notifications (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references teachers(id) on delete cascade,
  assignment_id uuid not null references assignments(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  submitted_at timestamptz not null default now(),
  read_at timestamptz,
  unique (teacher_id, assignment_id, student_id)
);

create index if not exists teacher_notifications_teacher_idx
  on teacher_notifications (teacher_id, submitted_at desc);

-- Only the website's server code (service key) may read or write this table
alter table teacher_notifications enable row level security;

notify pgrst, 'reload schema';

-- Check: this should list id, teacher_id, assignment_id, student_id, submitted_at, read_at
select column_name, data_type from information_schema.columns
where table_schema = 'public' and table_name = 'teacher_notifications' order by ordinal_position;
