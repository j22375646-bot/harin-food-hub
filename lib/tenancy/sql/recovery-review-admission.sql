-- P1-04-10 private candidate; NOT an automatically applied production migration.
-- Fixed recovery-review policy only. It does not issue or verify MFA evidence.
begin;
create schema if not exists moaon_auth;
revoke all on schema moaon_auth from public, anon, authenticated;

create table if not exists moaon_auth.recovery_request_limits (
  scope text not null check (scope in ('GLOBAL','OPERATOR')),
  subject_id uuid not null,
  mode text not null check (mode in ('inspect','resolve')),
  started_at timestamptz not null default clock_timestamp(),
  used integer not null default 0,
  primary key (scope,subject_id,mode),
  check ((scope='GLOBAL' and subject_id='00000000-0000-0000-0000-000000000000'::uuid)
    or (scope='OPERATOR' and subject_id<>'00000000-0000-0000-0000-000000000000'::uuid)),
  check (used>=0 and ((scope='GLOBAL' and mode='inspect' and used<=300)
    or (scope='GLOBAL' and mode='resolve' and used<=100)
    or (scope='OPERATOR' and mode='inspect' and used<=30)
    or (scope='OPERATOR' and mode='resolve' and used<=10)))
);
alter table moaon_auth.recovery_request_limits enable row level security;
revoke all on moaon_auth.recovery_request_limits from public, anon, authenticated, service_role;
grant usage on schema moaon_auth to service_role;
grant select, insert, update on moaon_auth.recovery_request_limits to service_role;

create or replace function public.moaon_consume_recovery_review(
  p_operator_id uuid,
  p_session_id uuid,
  p_mode text
)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  v_session public.dashboard_sessions;
  v_global moaon_auth.recovery_request_limits;
  v_operator moaon_auth.recovery_request_limits;
  v_now timestamptz;
  v_window constant interval := interval '60 seconds';
  v_global_subject constant uuid := '00000000-0000-0000-0000-000000000000'::uuid;
  v_global_limit integer;
  v_operator_limit integer;
  v_global_used integer;
  v_operator_used integer;
begin
  if p_operator_id is null or p_session_id is null
    or p_mode is null or p_mode not in ('inspect','resolve') then
    raise exception 'RECOVERY_REVIEW_ADMISSION_REJECTED';
  end if;
  perform moaon_auth.authorize_recovery_operator(p_operator_id);
  select * into v_session from public.dashboard_sessions
    where id=p_session_id and user_id=p_operator_id for share;
  if not found or v_session.revoked_at is not null
    or v_session.expires_at<=clock_timestamp() then
    raise exception 'RECOVERY_REVIEW_ADMISSION_REJECTED';
  end if;

  -- All callers take quota rows in the same GLOBAL -> OPERATOR order.
  insert into moaon_auth.recovery_request_limits as limits(scope,subject_id,mode)
    values('GLOBAL',v_global_subject,p_mode)
    on conflict(scope,subject_id,mode) do update set used=limits.used
    returning * into v_global;
  insert into moaon_auth.recovery_request_limits as limits(scope,subject_id,mode)
    values('OPERATOR',p_operator_id,p_mode)
    on conflict(scope,subject_id,mode) do update set used=limits.used
    returning * into v_operator;

  v_now := clock_timestamp();
  if v_session.revoked_at is not null or v_session.expires_at<=v_now then
    raise exception 'RECOVERY_REVIEW_ADMISSION_REJECTED';
  end if;
  if v_global.started_at>v_now or v_operator.started_at>v_now then return false; end if;

  v_global_limit := case p_mode when 'inspect' then 300 else 100 end;
  v_operator_limit := case p_mode when 'inspect' then 30 else 10 end;
  v_global_used := case when v_now>=v_global.started_at+v_window then 0 else v_global.used end;
  v_operator_used := case when v_now>=v_operator.started_at+v_window then 0 else v_operator.used end;
  if v_global_used>=v_global_limit or v_operator_used>=v_operator_limit then return false; end if;

  update moaon_auth.recovery_request_limits
    set started_at=case when v_now>=v_global.started_at+v_window then v_now else started_at end,
      used=v_global_used+1
    where scope='GLOBAL' and subject_id=v_global_subject and mode=p_mode;
  update moaon_auth.recovery_request_limits
    set started_at=case when v_now>=v_operator.started_at+v_window then v_now else started_at end,
      used=v_operator_used+1
    where scope='OPERATOR' and subject_id=p_operator_id and mode=p_mode;
  return true;
end $$;

revoke all on function public.moaon_consume_recovery_review(uuid,uuid,text)
  from public, anon, authenticated;
grant execute on function public.moaon_consume_recovery_review(uuid,uuid,text) to service_role;
commit;
