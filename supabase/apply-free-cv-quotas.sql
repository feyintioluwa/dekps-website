-- Run in Supabase SQL editor before deploying updated code.
-- Free CV allowances: one fix and one download per user/CV.
create table if not exists public.free_cv_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  cv_hash text not null,
  fix_count integer not null default 0,
  download_count integer not null default 0,
  primary key(user_id, cv_hash)
);
alter table public.free_cv_usage enable row level security;
revoke all on public.free_cv_usage from anon, authenticated;

create or replace function public.consume_free_cv_quota(
  p_user uuid, p_cv_hash text, p_kind text, p_limit integer
) returns text language plpgsql security definer set search_path = 'public' as $$
declare v_rows integer;
begin
  if p_user is null or length(p_cv_hash) < 10 or p_limit < 1 then return 'limit'; end if;
  if p_kind not in ('fix', 'download') then return 'bad_kind'; end if;
  insert into public.free_cv_usage(user_id, cv_hash) values(p_user, p_cv_hash)
    on conflict (user_id, cv_hash) do nothing;
  if p_kind = 'fix' then
    update public.free_cv_usage set fix_count = fix_count + 1
    where user_id = p_user and cv_hash = p_cv_hash and fix_count < p_limit;
  else
    update public.free_cv_usage set download_count = download_count + 1
    where user_id = p_user and cv_hash = p_cv_hash and download_count < p_limit;
  end if;
  get diagnostics v_rows = row_count;
  if v_rows > 0 then return 'ok'; end if;
  return 'limit';
end $$;
revoke all on function public.consume_free_cv_quota(uuid,text,text,integer) from public,anon,authenticated;
grant execute on function public.consume_free_cv_quota(uuid,text,text,integer) to service_role;
notify pgrst, 'reload schema';
