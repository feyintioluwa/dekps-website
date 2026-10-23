-- Broadsheet upload + publish. Paste the WHOLE file into the Supabase SQL editor and run once.

create or replace function public.admin_save_scores(p_term uuid, p_class uuid, p_rows jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare r jsonb; n int := 0;
begin
  for r in select jsonb_array_elements(p_rows) loop
    update scores set score = (r->>'score')::int, source = 'excel', updated_at = now()
     where term_id = p_term and student_id = (r->>'student_id')::uuid
       and subject_id = (r->>'subject_id')::uuid and kind = r->>'kind';
    if not found then
      insert into scores(term_id, student_id, class_id, subject_id, kind, score, source)
      values (p_term, (r->>'student_id')::uuid, p_class, (r->>'subject_id')::uuid,
              r->>'kind', (r->>'score')::int, 'excel');
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function public.admin_publish_results(p_term uuid, p_class uuid, p_term_label text, p_session text)
returns int language plpgsql security definer set search_path = public as $$
declare st record; v_class text; n int := 0;
        v_subjects jsonb; v_count int; v_total int; v_avg numeric; v_grade text;
        v_school text; v_teacher text;
begin
  v_class := (select c.name from classes c where c.id = p_class);
  for st in select * from students where class_id = p_class and is_active loop
    v_subjects := (
      with subj as (
        select s.id, s.name as sname, cs.position as pos
          from subjects s join class_subjects cs on cs.subject_id = s.id and cs.class_id = p_class
         where not exists (select 1 from student_subjects x where x.student_id = st.id)
            or s.id in (select ss.subject_id from student_subjects ss where ss.student_id = st.id)
      ), sc as (
        select subj.id, subj.sname, subj.pos,
               max(case when sco.kind = 'ca' then sco.score end) as ca,
               max(case when sco.kind = 'exam' then sco.score end) as ex
          from subj left join scores sco
            on sco.subject_id = subj.id and sco.student_id = st.id and sco.term_id = p_term
         group by subj.id, subj.sname, subj.pos
      )
      select coalesce(jsonb_agg(jsonb_build_object(
               'subject', sname, 'ca', ca, 'exam', ex,
               'total', case when ca is null and ex is null then null else coalesce(ca,0) + coalesce(ex,0) end
             ) order by pos), '[]'::jsonb)
        from sc
    );
    v_count := (select count(*) from jsonb_array_elements(v_subjects) e where e->>'total' is not null);
    v_total := (select coalesce(sum((e->>'total')::int), 0) from jsonb_array_elements(v_subjects) e);

    continue when v_count = 0;

    v_avg := round(v_total::numeric / v_count, 2);
    v_grade := case when v_avg >= 70 then 'A' when v_avg >= 60 then 'B' when v_avg >= 50 then 'C'
                    when v_avg >= 45 then 'D' when v_avg >= 40 then 'E' else 'F' end;
    v_school := (select sr.school_remark from student_remarks sr where sr.term_id = p_term and sr.student_id = st.id);
    v_teacher := (select sr.teacher_remark from student_remarks sr where sr.term_id = p_term and sr.student_id = st.id);

    update student_results
       set pin_hash = st.pin_hash, name = st.name, class = v_class, term = p_term_label,
           session = p_session, subject_count = v_count, total = v_total, average = v_avg,
           grade = v_grade, school_remark = v_school, teacher_remark = v_teacher, subjects = v_subjects
     where login_id = st.login_id and term_id = p_term;
    if not found then
      insert into student_results(login_id, pin_hash, name, class, term, session, subject_count, total,
                                  average, grade, school_remark, teacher_remark, subjects, term_id)
      values (st.login_id, st.pin_hash, st.name, v_class, p_term_label, p_session, v_count, v_total,
              v_avg, v_grade, v_school, v_teacher, v_subjects, p_term);
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;

revoke all on function public.admin_save_scores(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.admin_publish_results(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.admin_save_scores(uuid, uuid, jsonb) to service_role;
grant execute on function public.admin_publish_results(uuid, uuid, text, text) to service_role;

notify pgrst, 'reload schema';
