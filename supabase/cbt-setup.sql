-- DKPS Test & Exam (CBT) portal. Paste the WHOLE file into the Supabase SQL editor and run once.
create extension if not exists pgcrypto;

create or replace function public.cbt_login(p_login text, p_pin text)
returns table(o_status text, o_student_id uuid, o_name text, o_class_id uuid, o_class_name text)
language plpgsql security definer set search_path = public, extensions as $$
declare v_fails int; v_id uuid; v_hash text;
begin
  v_fails := (select count(*) from login_attempts la
               where la.login_id = p_login and la.success = false
                 and la.created_at > now() - interval '15 minutes');
  if v_fails >= 5 then
    o_status := 'locked'; return next; return;
  end if;
  v_id := (select st.id from students st where st.login_id = p_login and st.is_active limit 1);
  v_hash := (select st.pin_hash from students st where st.id = v_id);
  if v_id is not null and v_hash = crypt(p_pin, v_hash) then
    insert into login_attempts(login_id, success) values (p_login, true);
    o_status := 'ok';
    o_student_id := v_id;
    o_name := (select st.name from students st where st.id = v_id);
    o_class_id := (select st.class_id from students st where st.id = v_id);
    o_class_name := (select c.name from classes c where c.id = o_class_id);
  else
    insert into login_attempts(login_id, success) values (p_login, false);
    o_status := 'invalid';
  end if;
  return next;
end $$;

create or replace function public.cbt_submit(p_attempt uuid)
returns table(o_score int, o_max int, o_correct int, o_total int)
language plpgsql security definer set search_path = public, extensions as $$
declare v_asm uuid; v_stud uuid; v_sub timestamptz; v_old int; v_max int; v_kind text;
        v_term uuid; v_class uuid; v_subject uuid; v_total int; v_correct int; v_score int;
begin
  v_asm := (select a.assessment_id from attempts a where a.id = p_attempt);
  if v_asm is null then raise exception 'Attempt not found'; end if;
  perform 1 from attempts a where a.id = p_attempt for update;
  v_stud := (select a.student_id from attempts a where a.id = p_attempt);
  v_sub := (select a.submitted_at from attempts a where a.id = p_attempt);
  v_old := (select a.score from attempts a where a.id = p_attempt);
  v_max := (select x.max_score from assessments x where x.id = v_asm);
  v_kind := (select x.kind from assessments x where x.id = v_asm);
  v_term := (select x.term_id from assessments x where x.id = v_asm);
  v_class := (select x.class_id from assessments x where x.id = v_asm);
  v_subject := (select x.subject_id from assessments x where x.id = v_asm);

  v_total := (select count(*) from questions q
               where q.assessment_id = v_asm
                  or q.id in (select eq.question_id from exam_questions eq where eq.exam_id = v_asm));
  v_correct := (select count(*) from answers an join questions q on q.id = an.question_id
                 where an.attempt_id = p_attempt
                   and upper(btrim(an.chosen)) = upper(btrim(q.correct)));

  if v_sub is null then
    v_score := case when v_total = 0 then 0 else round(v_correct::numeric * v_max / v_total) end;
    update attempts set submitted_at = now(), score = v_score where id = p_attempt;
    if v_kind = 'exam' then
      begin
        update scores set score = v_score, source = 'cbt', updated_at = now()
         where term_id = v_term and student_id = v_stud and subject_id = v_subject and kind = 'exam';
        if not found then
          insert into scores(term_id, student_id, class_id, subject_id, kind, score, source)
          values (v_term, v_stud, v_class, v_subject, 'exam', v_score, 'cbt');
        end if;
      exception when others then
        null;
      end;
    end if;
  else
    v_score := v_old;
  end if;

  o_score := v_score; o_max := v_max; o_correct := v_correct; o_total := v_total;
  return next;
end $$;

revoke all on function public.cbt_login(text, text) from public, anon, authenticated;
revoke all on function public.cbt_submit(uuid) from public, anon, authenticated;
grant execute on function public.cbt_login(text, text) to service_role;
grant execute on function public.cbt_submit(uuid) to service_role;

notify pgrst, 'reload schema';
