-- P1-04-5 candidate, NOT an automatically applied production migration.
-- Fixed server policy only; callers supply neither time nor quota values.
begin;
create schema if not exists moaon_auth;
revoke all on schema moaon_auth from public, anon, authenticated;

create table moaon_auth.request_limits (
  kind text not null check (kind in ('LOGIN','RECOVERY_MAIL','RECOVERY_COMPLETE','EMAIL_CONFIRM')),
  subject_hash text not null check (subject_hash ~ '^[0-9a-f]{64}$'),
  started_at timestamptz not null default clock_timestamp(),
  used integer not null default 0,
  primary key (kind, subject_hash),
  check (
    (kind = 'LOGIN' and used between 0 and 10)
    or (kind = 'RECOVERY_MAIL' and used between 0 and 3)
    or (kind in ('RECOVERY_COMPLETE','EMAIL_CONFIRM') and used between 0 and 5)
  )
);
alter table moaon_auth.request_limits enable row level security;
revoke all on moaon_auth.request_limits from public, anon, authenticated;
grant usage on schema moaon_auth to service_role;
grant select, insert, update on moaon_auth.request_limits to service_role;

create function public.moaon_consume_auth_request(p_kind text, p_subject_hash text)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  v_bucket moaon_auth.request_limits;
  v_limit integer;
  v_window interval;
  v_now timestamptz;
begin
  case p_kind
    when 'LOGIN' then v_limit := 10; v_window := interval '900 seconds';
    when 'RECOVERY_MAIL' then v_limit := 3; v_window := interval '3600 seconds';
    when 'RECOVERY_COMPLETE' then v_limit := 5; v_window := interval '900 seconds';
    when 'EMAIL_CONFIRM' then v_limit := 5; v_window := interval '900 seconds';
    else raise exception 'AUTH_REQUEST_LIMIT_REJECTED';
  end case;
  if p_subject_hash is null or p_subject_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'AUTH_REQUEST_LIMIT_REJECTED';
  end if;

  insert into moaon_auth.request_limits as limits(kind, subject_hash)
    values(p_kind, p_subject_hash)
    on conflict(kind, subject_hash) do update set used = limits.used
    returning * into v_bucket;
  v_now := clock_timestamp();

  if v_bucket.used = 0 and v_bucket.started_at <= v_now then
    update moaon_auth.request_limits set started_at = v_now, used = 1
      where kind = p_kind and subject_hash = p_subject_hash;
    return true;
  end if;
  if v_now - v_bucket.started_at >= v_window then
    update moaon_auth.request_limits set started_at = v_now, used = 1
      where kind = p_kind and subject_hash = p_subject_hash;
    return true;
  end if;
  if v_bucket.used >= v_limit then return false; end if;
  update moaon_auth.request_limits set used = used + 1
    where kind = p_kind and subject_hash = p_subject_hash;
  return true;
end $$;

revoke all on function public.moaon_consume_auth_request(text,text)
  from public, anon, authenticated;
grant execute on function public.moaon_consume_auth_request(text,text) to service_role;
commit;
