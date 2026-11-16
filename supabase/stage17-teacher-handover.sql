-- Stage 17: run once in Supabase SQL Editor before deploying the updated site.
-- Existing scores, score history, submissions and corrections are never updated.
create table if not exists public.teacher_handover_history (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('subject', 'class')),
  from_teacher_id uuid not null references public.teachers(id),
  to_teacher_id uuid not null references public.teachers(id),
  class_id uuid not null references public.classes(id),
  subject_id uuid references public.subjects(id),
  reason text not null,
  performed_by text not null default 'admin-key',
  created_at timestamptz not null default now(),
  constraint handover_kind_subject_check check (
    (kind = 'subject' and subject_id is not null) or
    (kind = 'class' and subject_id is null)
  )
);
create index if not exists teacher_handover_history_created_idx
  on public.teacher_handover_history(created_at desc);
alter table public.teacher_handover_history enable row level security;
revoke all on public.teacher_handover_history from public, anon, authenticated;
grant select, insert on public.teacher_handover_history to service_role;
grant usage, select on sequence public.teacher_handover_history_id_seq to service_role;

create or replace function public.admin_handover_teacher(
  p_from uuid, p_to uuid, p_kind text, p_pairs jsonb default '[]'::jsonb,
  p_class_id uuid default null, p_reason text default ''
) returns integer
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_count integer;
  v_expected integer;
  v_class_order integer;
begin
  -- Serialize handovers and concurrent invocations of this function.
  perform pg_advisory_xact_lock(172017, 1);
  if p_from is null or p_to is null or p_from = p_to then
    raise exception 'Choose two different teachers';
  end if;
  if not exists (select 1 from public.teachers where id = p_from) then
    raise exception 'Outgoing teacher not found';
  end if;
  if not exists (select 1 from public.teachers where id = p_to and is_active is true) then
    raise exception 'Incoming teacher must exist and be active';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 or length(p_reason) > 500 then
    raise exception 'Enter a reason (3 to 500 characters)';
  end if;

  if p_kind = 'subject' then
    if p_pairs is null or jsonb_typeof(p_pairs) <> 'array' or jsonb_array_length(p_pairs) = 0 or jsonb_array_length(p_pairs) > 100 then
      raise exception 'Select between 1 and 100 class-subject pairs';
    end if;
    if exists (
      select 1 from jsonb_array_elements(p_pairs) e
      where jsonb_typeof(e) <> 'object'
        or coalesce(e->>'class_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        or coalesce(e->>'subject_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    ) then raise exception 'Invalid class or subject ID'; end if;
    select count(*) into v_expected from (
      select distinct (e->>'class_id')::uuid as cid, (e->>'subject_id')::uuid as sid
      from jsonb_array_elements(p_pairs) e
    ) x;
    select count(*) into v_count
    from (select distinct (e->>'class_id')::uuid as cid, (e->>'subject_id')::uuid as sid from jsonb_array_elements(p_pairs) e) x
    join public.teacher_subjects ts on ts.class_id = x.cid and ts.subject_id = x.sid and ts.teacher_id = p_from
    join public.classes c on c.id = x.cid and c.sort_order > 85;
    if v_count <> v_expected then raise exception 'One or more selected secondary-school assignments no longer belong to this teacher'; end if;
    if exists (
      select 1 from (select distinct (e->>'class_id')::uuid as cid, (e->>'subject_id')::uuid as sid from jsonb_array_elements(p_pairs) e) x
      join public.teacher_subjects ts on ts.class_id = x.cid and ts.subject_id = x.sid and ts.teacher_id <> p_from
    ) then raise exception 'Another teacher already has one of these class-subject assignments'; end if;

    update public.teacher_subjects ts set teacher_id = p_to
    from (select distinct (e->>'class_id')::uuid as cid, (e->>'subject_id')::uuid as sid from jsonb_array_elements(p_pairs) e) x
    where ts.teacher_id = p_from and ts.class_id = x.cid and ts.subject_id = x.sid;
    get diagnostics v_count = row_count;
    if v_count <> v_expected then raise exception 'Assignments changed during handover'; end if;
    insert into public.teacher_handover_history(kind, from_teacher_id, to_teacher_id, class_id, subject_id, reason)
    select 'subject', p_from, p_to, x.cid, x.sid, btrim(p_reason)
    from (select distinct (e->>'class_id')::uuid as cid, (e->>'subject_id')::uuid as sid from jsonb_array_elements(p_pairs) e) x;
    return v_count;
  elsif p_kind = 'class' then
    select sort_order into v_class_order from public.classes where id = p_class_id;
    if v_class_order is null or v_class_order > 85 then raise exception 'Choose a Creche, Nursery or Basic class'; end if;
    if not exists (select 1 from public.teacher_classes where teacher_id = p_from and class_id = p_class_id) then
      raise exception 'Outgoing teacher is not assigned to that class';
    end if;
    if exists (select 1 from public.teacher_classes where class_id = p_class_id and teacher_id <> p_from) then
      raise exception 'Another teacher already has this class';
    end if;
    update public.teacher_classes set teacher_id = p_to where teacher_id = p_from and class_id = p_class_id;
    get diagnostics v_count = row_count;
    if v_count <> 1 then raise exception 'Class assignment changed during handover'; end if;
    insert into public.teacher_handover_history(kind, from_teacher_id, to_teacher_id, class_id, reason)
    values ('class', p_from, p_to, p_class_id, btrim(p_reason));
    return 1;
  else
    raise exception 'Unknown handover type';
  end if;
end;
$$;
revoke all on function public.admin_handover_teacher(uuid,uuid,text,jsonb,uuid,text) from public, anon, authenticated;
grant execute on function public.admin_handover_teacher(uuid,uuid,text,jsonb,uuid,text) to service_role;
