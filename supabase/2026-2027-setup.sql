-- DKPS 2026/2027 session setup. Run in Supabase SQL editor, in order.
create extension if not exists pgcrypto;

-- STEP A: hide last session's imported students (nothing is deleted).
-- Run this BEFORE you add any new students.
update public.students set is_active = false where is_active = true;

-- STEP B: new columns
alter table public.students add column if not exists previous_login_id text;
alter table public.classes  add column if not exists id_prefix text;

-- STEP C: set each class's Login ID prefix (edit names to match your classes table).
-- Pattern = DKPS + level code + class digit, e.g. Basic 2 -> DKPSPRY2 (IDs become DKPSPRY2001...)
-- See your class names first:  select id, name, id_prefix from public.classes order by sort_order;
-- update public.classes set id_prefix = 'DKPSPRY2' where name = 'Basic 2';
-- (repeat for every class)

-- STEP D: bulk create. IDs continue after the highest number EVER used
-- (in students or in published results), so an old ID is never reissued.
create or replace function public.admin_bulk_create_students(p_class_id uuid, p_names text[])
returns table(o_name text, o_login_id text, o_pin text)
language plpgsql security definer set search_path = public, extensions as $$
declare v_prefix text; v_next int; v_n text; v_pin text; v_id text;
begin
  v_prefix := (select c.id_prefix from classes c where c.id = p_class_id);
  if v_prefix is null then raise exception 'This class has no id_prefix set'; end if;
  perform pg_advisory_xact_lock(hashtext(v_prefix));
  v_next := coalesce((
    select max(case when substring(t.l from length(v_prefix) + 1) ~ '^[0-9]{3,}$'
                    then substring(t.l from length(v_prefix) + 1)::int end)
    from (
      select s.login_id as l from students s where s.login_id like v_prefix || '%'
      union
      select r.login_id from student_results r where r.login_id like v_prefix || '%'
    ) t
  ), 0);
  foreach v_n in array p_names loop
    v_n := btrim(v_n);
    continue when v_n = '';
    v_next := v_next + 1;
    v_id := v_prefix || lpad(v_next::text, 3, '0');
    v_pin := lpad((('x' || encode(gen_random_bytes(4), 'hex'))::bit(32)::bigint % 10000)::text, 4, '0');
    insert into students (login_id, pin_hash, name, class_id, is_active)
    values (v_id, crypt(v_pin, gen_salt('bf')), v_n, p_class_id, true);
    o_name := v_n; o_login_id := v_id; o_pin := v_pin;
    return next;
  end loop;
end $$;

revoke all on function public.admin_bulk_create_students(uuid, text[]) from public, anon, authenticated;
grant execute on function public.admin_bulk_create_students(uuid, text[]) to service_role;

notify pgrst, 'reload schema';
