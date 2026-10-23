-- DKPS: student management SQL (already run in Supabase; kept here as a copy)
-- Notes:
--  * Assign with  v := (select ...)  instead of  select ... into  (the Supabase SQL editor mis-parses "into").
--  * Do NOT re-run setup step A (update students set is_active=false) from 2026-2027-setup.sql.
--  * One-time data change already done: names made ALL CAPS
--      update students set name = upper(trim(name));
--      update student_results set name = upper(trim(name));

-- 1. Reset a student's PIN (returns the new PIN once)
create or replace function admin_reset_pin(p_login text)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_pin text;
  v_count int;
begin
  v_pin := lpad((floor(random() * 10000))::int::text, 4, '0');

  update students
  set pin_hash = crypt(v_pin, gen_salt('bf'))
  where login_id = p_login;
  get diagnostics v_count = row_count;

  if v_count = 0 then
    raise exception 'Login ID not found';
  end if;

  update student_results
  set pin_hash = crypt(v_pin, gen_salt('bf'))
  where login_id = p_login;

  return v_pin;
end;
$$;

revoke all on function admin_reset_pin(text) from public, anon, authenticated;
grant execute on function admin_reset_pin(text) to service_role;

-- 2. Move a student to another class: new Login ID, same PIN, old ID linked
create or replace function admin_move_student(p_student uuid, p_class uuid)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_prefix text;
  v_old text;
  v_cur uuid;
  v_max int;
  v_new text;
begin
  perform pg_advisory_xact_lock(hashtext('dkps_login_ids'));

  v_prefix := (select id_prefix from classes where id = p_class);
  v_old := (select login_id from students where id = p_student);
  v_cur := (select class_id from students where id = p_student);

  if v_old is null then
    raise exception 'Student not found';
  end if;
  if v_prefix is null then
    raise exception 'The new class has no id_prefix set';
  end if;
  if v_cur = p_class then
    raise exception 'The student is already in this class';
  end if;

  v_max := (
    select coalesce(max(substring(t.x from length(v_prefix) + 1)::int), 0)
    from (
      select login_id as x from students
      union all
      select previous_login_id from students
      union all
      select login_id from student_results
    ) t
    where t.x ~ ('^' || v_prefix || '[0-9]+$')
  );

  v_new := v_prefix || lpad((v_max + 1)::text, 3, '0');

  update students
  set login_id = v_new,
      class_id = p_class,
      previous_login_id = v_old
  where id = p_student;

  return v_new;
end;
$$;

revoke all on function admin_move_student(uuid, uuid) from public, anon, authenticated;
grant execute on function admin_move_student(uuid, uuid) to service_role;

-- 3. Results login: refuse deactivated students
create or replace function public.get_result(
  p_login_id text,
  p_pin text,
  p_term text default null,
  p_session text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_login text := upper(trim(p_login_id));
  v_fails int;
  v_hash  text;
  v_row   public.student_results%rowtype;
  v_terms jsonb;
begin
  v_fails := (
    select count(*)
    from public.login_attempts
    where login_id = v_login and success = false
      and created_at > now() - interval '15 minutes'
  );

  if v_fails >= 5 then
    return jsonb_build_object('status', 'locked');
  end if;

  -- the PIN is checked against the student's most recent record,
  -- and deactivated students are refused
  v_hash := (
    select pin_hash
    from public.student_results
    where upper(login_id) = v_login
      and not exists (
        select 1 from public.students s
        where upper(s.login_id) = v_login and s.is_active = false
      )
    order by created_at desc
    limit 1
  );

  if v_hash is null or v_hash <> crypt(p_pin, v_hash) then
    insert into public.login_attempts (login_id, success) values (v_login, false);
    return jsonb_build_object('status', 'invalid');
  end if;

  insert into public.login_attempts (login_id, success) values (v_login, true);

  v_row := (
    select r
    from public.student_results r
    where upper(r.login_id) = v_login
      and (p_term    is null or r.term    = p_term)
      and (p_session is null or r.session = p_session)
    order by r.created_at desc
    limit 1
  );

  if v_row.id is null then
    return jsonb_build_object('status', 'notfound');
  end if;

  v_terms := (
    select coalesce(
      jsonb_agg(jsonb_build_object('term', t.term, 'session', t.session)
                order by t.last_at desc),
      '[]'::jsonb)
    from (
      select term, session, max(created_at) as last_at
      from public.student_results
      where upper(login_id) = v_login
      group by term, session
    ) t
  );

  return jsonb_build_object(
    'status', 'ok',
    'terms',  v_terms,
    'student', jsonb_build_object(
      'login_id',       v_row.login_id,
      'name',           v_row.name,
      'class',          v_row.class,
      'term',           v_row.term,
      'session',        v_row.session,
      'subject_count',  v_row.subject_count,
      'total',          v_row.total,
      'average',        v_row.average,
      'grade',          v_row.grade,
      'school_remark',  v_row.school_remark,
      'teacher_remark', v_row.teacher_remark,
      'subjects',       v_row.subjects
    )
  );
end;
$function$;

notify pgrst, 'reload schema';