-- Automatic remarks: fills each active student's school and teacher remark from their average.
-- Grades: A 70+, B 60+, C 50+, D 45+, E 40+, otherwise F (the same rule used when publishing).
-- Two remarks per grade exist in remark_options; one is picked at random.
-- A remark that already has text is NEVER replaced, so edited remarks are kept.
-- A record of what is already in the database. Safe to run more than once.
create or replace function admin_fill_remarks(p_term uuid, p_class uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  g text;
  v_school text;
  v_teacher text;
  n integer := 0;
begin
  for r in
    select st.id as student_id,
           sum(sc.score)::numeric / nullif(count(distinct sc.subject_id), 0) as avg_score
    from students st
    join scores sc on sc.student_id = st.id and sc.term_id = p_term
    where st.class_id = p_class
      and st.is_active = true
    group by st.id
  loop
    if r.avg_score is null then
      continue;
    end if;

    g := case
      when r.avg_score >= 70 then 'A'
      when r.avg_score >= 60 then 'B'
      when r.avg_score >= 50 then 'C'
      when r.avg_score >= 45 then 'D'
      when r.avg_score >= 40 then 'E'
      else 'F'
    end;

    v_school := (select o.text from remark_options o
                 where o.kind = 'school' and o.band = g
                 order by random() limit 1);
    v_teacher := (select o.text from remark_options o
                  where o.kind = 'teacher' and o.band = g
                  order by random() limit 1);

    insert into student_remarks (term_id, student_id, school_remark, teacher_remark)
    values (p_term, r.student_id, v_school, v_teacher)
    on conflict (term_id, student_id) do update
    set school_remark = case
          when coalesce(trim(student_remarks.school_remark), '') = ''
          then excluded.school_remark else student_remarks.school_remark end,
        teacher_remark = case
          when coalesce(trim(student_remarks.teacher_remark), '') = ''
          then excluded.teacher_remark else student_remarks.teacher_remark end;

    n := n + 1;
  end loop;

  return n;
end;
$$;

revoke all on function admin_fill_remarks(uuid, uuid) from public;
grant execute on function admin_fill_remarks(uuid, uuid) to service_role;

notify pgrst, 'reload schema';
