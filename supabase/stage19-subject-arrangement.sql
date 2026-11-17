-- DKPS Stage 19: class-wide order for Crèche–Basic 6, personal order for JSS–SSS.
-- Run in Supabase SQL editor before deploying the updated website.
create table if not exists public.teacher_subject_order (
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  position integer not null check (position > 0),
  primary key (teacher_id, class_id, subject_id)
);
create index if not exists teacher_subject_order_lookup on public.teacher_subject_order(teacher_id, class_id, position);
alter table public.teacher_subject_order enable row level security;
revoke all on public.teacher_subject_order from anon, authenticated;

create or replace function public.dkps_save_class_subject_order(p_class_id uuid, p_subject_ids uuid[])
returns void language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  select count(*) into n from public.class_subjects where class_id = p_class_id;
  if n <> cardinality(p_subject_ids) or
    exists(select 1 from unnest(p_subject_ids) x where not exists
      (select 1 from public.class_subjects cs where cs.class_id=p_class_id and cs.subject_id=x)) or
    (select count(distinct x) from unnest(p_subject_ids) x) <> n then
    raise exception 'Subject list changed';
  end if;
  update public.class_subjects cs set position = o.ord
  from unnest(p_subject_ids) with ordinality as o(subject_id, ord)
  where cs.class_id=p_class_id and cs.subject_id=o.subject_id;
end; $$;

create or replace function public.dkps_save_teacher_subject_order(p_teacher_id uuid, p_class_id uuid, p_subject_ids uuid[])
returns void language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  select count(*) into n from public.teacher_subjects ts
  join public.class_subjects cs on cs.class_id=ts.class_id and cs.subject_id=ts.subject_id
  where ts.teacher_id=p_teacher_id and ts.class_id=p_class_id;
  if n <> cardinality(p_subject_ids) or
    (select count(distinct x) from unnest(p_subject_ids) x) <> n or
    exists(select 1 from unnest(p_subject_ids) x where not exists
      (select 1 from public.teacher_subjects ts join public.class_subjects cs
       on cs.class_id=ts.class_id and cs.subject_id=ts.subject_id
       where ts.teacher_id=p_teacher_id and ts.class_id=p_class_id and ts.subject_id=x)) then
    raise exception 'Assigned subjects changed';
  end if;
  delete from public.teacher_subject_order where teacher_id=p_teacher_id and class_id=p_class_id;
  insert into public.teacher_subject_order(teacher_id,class_id,subject_id,position)
  select p_teacher_id,p_class_id,o.subject_id,o.ord
  from unnest(p_subject_ids) with ordinality as o(subject_id,ord);
end; $$;
revoke all on function public.dkps_save_class_subject_order(uuid,uuid[]) from public, anon, authenticated;
revoke all on function public.dkps_save_teacher_subject_order(uuid,uuid,uuid[]) from public, anon, authenticated;
grant execute on function public.dkps_save_class_subject_order(uuid,uuid[]) to service_role;
grant execute on function public.dkps_save_teacher_subject_order(uuid,uuid,uuid[]) to service_role;
