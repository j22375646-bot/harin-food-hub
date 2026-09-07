-- P1-04-6 candidate, NOT an automatically applied production migration.
-- Fixed server policy only; callers supply neither time nor quota values.
begin;
create schema if not exists moaon_auth;
revoke all on schema moaon_auth from public, anon, authenticated;

create table if not exists moaon_auth.admission_limits (
  scope text not null check (scope in ('GLOBAL','IP')),
  key_hash text not null check (key_hash ~ '^[0-9a-f]{64}$'),
  started_at timestamptz not null default clock_timestamp(),
  used integer not null default 0,
  primary key (scope, key_hash),
  check (
    (scope = 'GLOBAL' and key_hash = repeat('0', 64) and used between 0 and 500)
    or (scope = 'IP' and used between 0 and 30)
  )
);
alter table moaon_auth.admission_limits enable row level security;
revoke all on moaon_auth.admission_limits from public, anon, authenticated;
grant usage on schema moaon_auth to service_role;
grant select, insert, update on moaon_auth.admission_limits to service_role;

create or replace function public.moaon_consume_auth_admission(p_ip_hash text)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  v_global moaon_auth.admission_limits;
  v_ip moaon_auth.admission_limits;
  v_now timestamptz;
  v_global_key constant text := repeat('0', 64);
  v_window constant interval := interval '300 seconds';
begin
  if p_ip_hash is null or p_ip_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'AUTH_REQUEST_ADMISSION_REJECTED';
  end if;

  insert into moaon_auth.admission_limits(scope, key_hash)
    values('GLOBAL', v_global_key) on conflict do nothing;
  select * into strict v_global
    from moaon_auth.admission_limits
    where scope = 'GLOBAL' and key_hash = v_global_key
    for update;
  v_now := clock_timestamp();

  if v_now >= v_global.started_at + v_window then
    update moaon_auth.admission_limits set started_at = v_now, used = 1
      where scope = 'GLOBAL' and key_hash = v_global_key;
  elsif v_global.used >= 500 then
    return false;
  else
    update moaon_auth.admission_limits set used = used + 1
      where scope = 'GLOBAL' and key_hash = v_global_key;
  end if;

  insert into moaon_auth.admission_limits(scope, key_hash)
    values('IP', p_ip_hash) on conflict do nothing;
  select * into strict v_ip
    from moaon_auth.admission_limits
    where scope = 'IP' and key_hash = p_ip_hash
    for update;
  v_now := clock_timestamp();

  if v_now >= v_ip.started_at + v_window then
    update moaon_auth.admission_limits set started_at = v_now, used = 1
      where scope = 'IP' and key_hash = p_ip_hash;
    return true;
  end if;
  if v_ip.used >= 30 then return false; end if;
  update moaon_auth.admission_limits set used = used + 1
    where scope = 'IP' and key_hash = p_ip_hash;
  return true;
end $$;

revoke all on function public.moaon_consume_auth_admission(text)
  from public, anon, authenticated;
grant execute on function public.moaon_consume_auth_admission(text) to service_role;
commit;
