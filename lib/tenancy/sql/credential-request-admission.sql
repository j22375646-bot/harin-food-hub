-- P4-61L candidate only. Production route remains inactive. Before activation: load-test
-- fixed 300s GLOBAL120/IP30/USER10 policy, approve retention cleanup and HMAC rotation,
-- provision the restricted runtime role separately and verify production permissions.
-- Fixed server policy only; callers supply neither time nor quota values.
begin;
-- Does not rerun or alter the existing NOLOGIN provisioning candidate.
do $$ begin
 if not exists(select 1 from pg_roles where rolname='moaon_control_app'
  and not rolsuper and not rolbypassrls and not rolcreatedb and not rolcreaterole
  and not rolreplication and not rolinherit)
 then raise exception 'restricted control role required'; end if;
 if exists(select 1 from pg_auth_members where member=(select oid from pg_roles where rolname='moaon_control_app') or roleid=(select oid from pg_roles where rolname='moaon_control_app'))
 or exists(select 1 from pg_namespace where nspname in ('public','moaon_control') and has_schema_privilege('moaon_control_app',oid,'CREATE'))
 then raise exception 'unsafe control role privileges'; end if;
end $$;
-- Existing schema ACLs are owned by control-role provisioning.

create table if not exists moaon_control.credential_request_limits (
  scope text not null check (scope in ('GLOBAL','IP','USER')),
  key_hash text not null check (key_hash ~ '^[0-9a-f]{64}$'),
  started_at timestamptz not null default clock_timestamp(),
  used integer not null default 0,
  primary key (scope, key_hash),
  check (
    (scope = 'GLOBAL' and key_hash = repeat('0', 64) and used between 0 and 120)
    or (scope = 'IP' and used between 0 and 30)
    or (scope = 'USER' and used between 0 and 10)
  )
);
alter table moaon_control.credential_request_limits enable row level security;
revoke all on moaon_control.credential_request_limits from public, anon, authenticated, service_role;
grant usage on schema moaon_control to moaon_control_app;
revoke all on moaon_control.credential_request_limits from moaon_control_app, service_role;
grant select, insert, update on moaon_control.credential_request_limits to moaon_control_app;
drop policy if exists credential_limit_select on moaon_control.credential_request_limits;
drop policy if exists credential_limit_insert on moaon_control.credential_request_limits;
drop policy if exists credential_limit_update on moaon_control.credential_request_limits;
create policy credential_limit_select on moaon_control.credential_request_limits for select to moaon_control_app using(true);
create policy credential_limit_insert on moaon_control.credential_request_limits for insert to moaon_control_app with check(true);
create policy credential_limit_update on moaon_control.credential_request_limits for update to moaon_control_app using(true) with check(true);

create or replace function public.moaon_consume_credential_network(p_ip_hash text)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  v_global moaon_control.credential_request_limits;
  v_ip moaon_control.credential_request_limits;
  v_now timestamptz;
  v_global_key constant text := repeat('0', 64);
  v_window constant interval := interval '300 seconds';
begin
  if p_ip_hash is null or p_ip_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'CREDENTIAL_ADMISSION_UNAVAILABLE';
  end if;

  insert into moaon_control.credential_request_limits as limits(scope, key_hash)
    values('GLOBAL', v_global_key)
    on conflict(scope, key_hash) do update set used = limits.used
    returning * into v_global;
  v_now := clock_timestamp();

  if v_global.used = 0 and v_global.started_at <= v_now then
    update moaon_control.credential_request_limits set started_at = v_now, used = 1
      where scope = 'GLOBAL' and key_hash = v_global_key;
  elsif v_now >= v_global.started_at + v_window then
    update moaon_control.credential_request_limits set started_at = v_now, used = 1
      where scope = 'GLOBAL' and key_hash = v_global_key;
  elsif v_global.used >= 120 then
    return false;
  else
    update moaon_control.credential_request_limits set used = used + 1
      where scope = 'GLOBAL' and key_hash = v_global_key;
  end if;

  insert into moaon_control.credential_request_limits as limits(scope, key_hash)
    values('IP', p_ip_hash)
    on conflict(scope, key_hash) do update set used = limits.used
    returning * into v_ip;
  v_now := clock_timestamp();

  if v_ip.used = 0 and v_ip.started_at <= v_now then
    update moaon_control.credential_request_limits set started_at = v_now, used = 1
      where scope = 'IP' and key_hash = p_ip_hash;
    return true;
  end if;
  if v_now >= v_ip.started_at + v_window then
    update moaon_control.credential_request_limits set started_at = v_now, used = 1
      where scope = 'IP' and key_hash = p_ip_hash;
    return true;
  end if;
  if v_ip.used >= 30 then return false; end if;
  update moaon_control.credential_request_limits set used = used + 1
    where scope = 'IP' and key_hash = p_ip_hash;
  return true;
end $$;

revoke all on function public.moaon_consume_credential_network(text)
  from public, anon, authenticated, service_role;
grant execute on function public.moaon_consume_credential_network(text) to moaon_control_app;
create or replace function public.moaon_consume_credential_user(p_user_hash text)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare
 v_user moaon_control.credential_request_limits;
 v_now timestamptz;
begin
 if p_user_hash is null or p_user_hash !~ '^[0-9a-f]{64}$' then
  raise exception 'CREDENTIAL_ADMISSION_UNAVAILABLE';
 end if;
 insert into moaon_control.credential_request_limits as limits(scope,key_hash)
  values('USER',p_user_hash) on conflict(scope,key_hash) do update set used=limits.used
  returning * into v_user;
 v_now:=clock_timestamp();
 if (v_user.used=0 and v_user.started_at<=v_now) or v_now>=v_user.started_at+interval '300 seconds' then
  update moaon_control.credential_request_limits set started_at=v_now,used=1 where scope='USER' and key_hash=p_user_hash;
  return true;
 end if;
 if v_user.used>=10 then return false; end if;
 update moaon_control.credential_request_limits set used=used+1 where scope='USER' and key_hash=p_user_hash;
 return true;
end $$;
revoke all on function public.moaon_consume_credential_user(text) from public,anon,authenticated,service_role;
grant execute on function public.moaon_consume_credential_user(text) to moaon_control_app;
commit;
