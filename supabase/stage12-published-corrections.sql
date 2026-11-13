-- Stage 12: apply in Supabase SQL Editor before deploying the routes.
create table if not exists public.published_score_corrections (
 id uuid primary key default gen_random_uuid(),
 teacher_id uuid not null references public.teachers(id),
 term_id uuid not null references public.terms(id),
 class_id uuid not null references public.classes(id),
 student_id uuid not null references public.students(id),
 subject_id uuid not null references public.subjects(id),
 kind text not null check (kind in ('test1','exam')),
 old_score integer not null,
 proposed_score integer not null,
 reason text not null check (length(btrim(reason)) between 10 and 1000),
 status text not null default 'pending' check (status in ('pending','approved','rejected')),
 decided_at timestamptz,
 decision_note text,
 created_at timestamptz not null default now(),
 constraint score_correction_limits check (proposed_score between 0 and case when kind='test1' then 40 else 60 end)
);
create unique index if not exists published_score_correction_pending_unique
 on public.published_score_corrections(term_id,student_id,subject_id,kind) where status='pending';
create index if not exists published_score_correction_teacher_idx on public.published_score_corrections(teacher_id,created_at desc);
create index if not exists published_score_correction_status_idx on public.published_score_corrections(status,created_at desc);
alter table public.published_score_corrections enable row level security;
revoke all on public.published_score_corrections from anon, authenticated;

-- The admin route uses the service role. The RPC locks the request, score and
-- published snapshot in one database transaction, preventing partial updates.
create or replace function public.admin_decide_published_score_correction(
 p_request uuid, p_approve boolean, p_note text default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
 r public.published_score_corrections%rowtype;
 v_score integer;
 v_login text;
 v_name text;
 v_subjects jsonb;
 v_new_subjects jsonb;
 v_count integer;
 v_total integer;
 v_average numeric;
 v_grade text;
 v_result record;
 v_matches integer;
begin
 select * into r from public.published_score_corrections where id=p_request for update;
 if not found then raise exception 'Correction request not found'; end if;
 if r.status <> 'pending' then raise exception 'Request already decided'; end if;
 if not p_approve then
  update public.published_score_corrections set status='rejected',decided_at=now(),decision_note=nullif(btrim(p_note),'') where id=r.id;
  return;
 end if;
 select score into v_score from public.scores
  where term_id=r.term_id and student_id=r.student_id and subject_id=r.subject_id and kind=r.kind for update;
 if not found or v_score is distinct from r.old_score then
  raise exception 'Score changed since the request; reject it and request a fresh correction';
 end if;
 select login_id into v_login from public.students where id=r.student_id and class_id=r.class_id and is_active=true;
 if not found then raise exception 'Student no longer belongs to the requested class'; end if;
 select name into v_name from public.subjects where id=r.subject_id;
 select subjects into v_subjects from public.student_results
  where login_id=v_login and term_id=r.term_id for update;
 if not found then raise exception 'Published result no longer exists'; end if;
 select count(*) into v_matches from jsonb_array_elements(v_subjects) x where x->>'subject'=v_name;
 if v_matches <> 1 then raise exception 'Published subject snapshot is ambiguous or missing'; end if;
 select jsonb_agg(
  case when x->>'subject'=v_name then
   jsonb_set(jsonb_set(x,case when r.kind='test1' then '{ca}' else '{exam}' end,to_jsonb(r.proposed_score)),
    '{total}',to_jsonb(coalesce(case when r.kind='test1' then r.proposed_score else (x->>'ca')::integer end,0)
       +coalesce(case when r.kind='exam' then r.proposed_score else (x->>'exam')::integer end,0)))
  else x end order by ord)
 into v_new_subjects from jsonb_array_elements(v_subjects) with ordinality as a(x,ord);
 select count(*),coalesce(sum((x->>'total')::integer),0) into v_count,v_total
 from jsonb_array_elements(v_new_subjects) x where x->>'total' is not null;
 if v_count=0 then raise exception 'Cannot calculate published result'; end if;
 v_average:=round(v_total::numeric/v_count,2);
 v_grade:=case when v_average>=70 then 'A' when v_average>=60 then 'B' when v_average>=50 then 'C' when v_average>=45 then 'D' when v_average>=40 then 'E' else 'F' end;
 update public.scores set score=r.proposed_score,source='manual',updated_at=now()
  where term_id=r.term_id and student_id=r.student_id and subject_id=r.subject_id and kind=r.kind;
 update public.student_results set subjects=v_new_subjects,subject_count=v_count,total=v_total,average=v_average,grade=v_grade
  where login_id=v_login and term_id=r.term_id;
 update public.published_score_corrections set status='approved',decided_at=now(),decision_note=nullif(btrim(p_note),'') where id=r.id;
end $$;
revoke all on function public.admin_decide_published_score_correction(uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.admin_decide_published_score_correction(uuid,boolean,text) to service_role;
