-- Teachers: accounts, subject teachers and class teachers.
-- Sign-in is handled by Supabase Auth; auth_user_id links a teacher to their login.
-- A record of what is already in the database. Safe to run more than once.
create table if not exists teachers (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  name text not null,
  email text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Subject teacher: this teacher teaches this subject in this class
create table if not exists teacher_subjects (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references teachers(id) on delete cascade,
  class_id uuid not null references classes(id) on delete cascade,
  subject_id uuid not null references subjects(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (teacher_id, class_id, subject_id)
);

-- Class teacher (Creche to Basic 6): this teacher covers every subject of this class
create table if not exists teacher_classes (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references teachers(id) on delete cascade,
  class_id uuid not null references classes(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (teacher_id, class_id)
);

alter table teachers enable row level security;
alter table teacher_subjects enable row level security;
alter table teacher_classes enable row level security;

notify pgrst, 'reload schema';
