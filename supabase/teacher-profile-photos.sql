-- Run once in Supabase SQL Editor before enabling profile photos.
create table if not exists public.teacher_profile_photos (
  teacher_id uuid primary key references public.teachers(id) on delete cascade,
  storage_path text not null,
  updated_at timestamptz not null default now()
);
-- Access is exclusively through authenticated server routes using service-role client.
alter table public.teacher_profile_photos enable row level security;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('teacher-avatars', 'teacher-avatars', false, 2097152, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
