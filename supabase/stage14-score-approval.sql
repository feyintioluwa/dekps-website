-- Stage 14: run in Supabase SQL editor before deploying the app.
create table if not exists public.score_submissions (
 id uuid primary key default gen_random_uuid(),
 term_id uuid not null references public.terms(id),
 class_id uuid not null references public.classes(id),
 subject_id uuid not null references public.subjects(id),
 teacher_id uuid not null references public.teachers(id),
 status text not null default 'draft' check (status in ('draft','pending','approved','returned','withdrawn')),
 review_note text not null default '',
 submitted_at timestamptz,
 reviewed_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique (term_id,class_id,subject_id)
);
create table if not exists public.score_submission_events (
 id bigint generated always as identity primary key,
 submission_id uuid not null references public.score_submissions(id) on delete cascade,
 actor_type text not null check (actor_type in ('teacher','admin')),
 actor_id text not null,
 action text not null,
 note text not null default '',
 created_at timestamptz not null default now()
);
create index if not exists score_submissions_status_idx on public.score_submissions(status,term_id);
create index if not exists score_submissions_teacher_idx on public.score_submissions(teacher_id,term_id);
alter table public.score_submissions enable row level security;
alter table public.score_submission_events enable row level security;
-- Access through server-side service-role clients only. No public RLS policies.
create or replace function public.stage14_teacher_transition(
 p_term uuid,p_class uuid,p_subject uuid,p_teacher uuid,p_action text
) returns text language plpgsql security definer set search_path=public as $$
declare v public.score_submissions%rowtype; v_locked boolean;
begin
 if p_action not in ('submit','withdraw') then raise exception 'Invalid action'; end if;
 select is_locked into v_locked from terms where id=p_term and is_active=true;
 if not found or coalesce(v_locked,false) then raise exception 'Active term unavailable or locked'; end if;
 -- The API also verifies class/subject assignment; enforce it here as defense in depth.
 if not exists(select 1 from teacher_subjects where teacher_id=p_teacher and class_id=p_class and subject_id=p_subject)
    and not exists(select 1 from teacher_classes tc join class_subjects cs on cs.class_id=tc.class_id where tc.teacher_id=p_teacher and tc.class_id=p_class and cs.subject_id=p_subject)
 then raise exception 'Teacher is not assigned to this class and subject'; end if;
 insert into score_submissions(term_id,class_id,subject_id,teacher_id,status)
 values(p_term,p_class,p_subject,p_teacher,'draft') on conflict(term_id,class_id,subject_id) do nothing;
 select * into v from score_submissions where term_id=p_term and class_id=p_class and subject_id=p_subject for update;
 if v.teacher_id<>p_teacher then raise exception 'Submission belongs to another teacher; admin must reassign it'; end if;
 if p_action='submit' then
   if v.status not in ('draft','withdrawn','returned') then raise exception 'Only draft, withdrawn or returned scores may be submitted'; end if;
   -- Require at least one CA/exam score for this subject. Missing-score completion remains visible in UI.
   if not exists(select 1 from scores s join students st on st.id=s.student_id where s.term_id=p_term and st.class_id=p_class and s.subject_id=p_subject)
   then raise exception 'No saved scores found for this subject'; end if;
   update score_submissions set status='pending',submitted_at=now(),review_note='',updated_at=now() where id=v.id;
 else
   if v.status<>'pending' then raise exception 'Only pending submissions can be withdrawn'; end if;
   update score_submissions set status='withdrawn',updated_at=now() where id=v.id;
 end if;
 insert into score_submission_events(submission_id,actor_type,actor_id,action) values(v.id,'teacher',p_teacher::text,p_action);
 return case when p_action='submit' then 'pending' else 'withdrawn' end;
end $$;
create or replace function public.stage14_admin_transition(p_id uuid,p_action text,p_note text default '')
returns text language plpgsql security definer set search_path=public as $$
declare v public.score_submissions%rowtype;
begin
 if p_action not in ('approve','return') then raise exception 'Invalid action'; end if;
 select * into v from score_submissions where id=p_id for update;
 if not found or v.status<>'pending' then raise exception 'Submission is no longer pending'; end if;
 if p_action='return' and length(trim(p_note))=0 then raise exception 'A reason is required when returning scores'; end if;
 update score_submissions set status=case when p_action='approve' then 'approved' else 'returned' end,
 review_note=left(coalesce(p_note,''),1000),reviewed_at=now(),updated_at=now() where id=p_id;
 insert into score_submission_events(submission_id,actor_type,actor_id,action,note)
 values(p_id,'admin','admin-key',p_action,left(coalesce(p_note,''),1000));
 return case when p_action='approve' then 'approved' else 'returned' end;
end $$;
revoke all on function public.stage14_teacher_transition(uuid,uuid,uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.stage14_admin_transition(uuid,text,text) from public,anon,authenticated;
grant execute on function public.stage14_teacher_transition(uuid,uuid,uuid,uuid,text) to service_role;
grant execute on function public.stage14_admin_transition(uuid,text,text) to service_role;
