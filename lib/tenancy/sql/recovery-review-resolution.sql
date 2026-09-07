-- P1-04-8 private candidate; NOT an automatically applied production migration.
-- Depends on dashboard accounts, auth-session-fence.sql and recovery-review.sql.
-- Operator provisioning is a separate privileged activation. No seed or self-grant.
begin;
create table if not exists moaon_auth.recovery_operators (
  user_id uuid primary key references public.dashboard_users(user_id)
);
create table if not exists moaon_auth.recovery_resolutions (
  resolution_id uuid primary key,
  operation_id uuid not null unique,
  user_id uuid not null,
  operator_id uuid not null,
  action text not null check (action in ('CONFIRM_COMPLETED','CLOSE_NOT_STARTED')),
  expected_version text not null check (expected_version ~ '^[0-9a-f]{64}$'),
  result_status text not null check (result_status in ('COMPLETED','REJECTED')),
  resolved_at timestamptz not null default clock_timestamp(),
  check ((action='CONFIRM_COMPLETED' and result_status='COMPLETED')
    or (action='CLOSE_NOT_STARTED' and result_status='REJECTED'))
);
-- Audit identifiers deliberately have no cascading foreign keys: deleting an
-- account or its journal must never delete historical resolution evidence.
alter table moaon_auth.recovery_operators enable row level security;
alter table moaon_auth.recovery_resolutions enable row level security;
revoke all on moaon_auth.recovery_operators, moaon_auth.recovery_resolutions
  from public, anon, authenticated, service_role;
grant select on moaon_auth.recovery_operators to service_role;
grant select, insert on moaon_auth.recovery_resolutions to service_role;

-- Dedicated recovery namespace 1297040206, key 1 is the operator allowlist. Shared readers
-- retain SELECT-only rights; privileged edits take the exclusive counterpart.
create or replace function moaon_auth.lock_recovery_operator_changes()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(1297040206,1);
  return null;
end $$;
drop trigger if exists lock_recovery_operator_changes on moaon_auth.recovery_operators;
create trigger lock_recovery_operator_changes
  before insert or update or delete or truncate on moaon_auth.recovery_operators
  for each statement execute function moaon_auth.lock_recovery_operator_changes();

create or replace function moaon_auth.authorize_recovery_operator(p_operator_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if p_operator_id is null then raise exception 'RECOVERY_REVIEW_RESOLUTION_REJECTED'; end if;
  -- Advisory waits cannot refresh a REPEATABLE READ/SERIALIZABLE snapshot.
  -- This RPC requires fresh statement snapshots after a committed revocation.
  if pg_catalog.current_setting('transaction_isolation')<>'read committed' then
    raise exception 'RECOVERY_REVIEW_RESOLUTION_REJECTED';
  end if;
  -- Table before advisory also orders a privileged TRUNCATE's AccessExclusiveLock.
  lock table moaon_auth.recovery_operators in access share mode;
  perform pg_catalog.pg_advisory_xact_lock_shared(1297040206,1);
  perform 1 from moaon_auth.recovery_operators where user_id=p_operator_id;
  if not found then raise exception 'RECOVERY_REVIEW_RESOLUTION_REJECTED'; end if;
  perform 1 from public.dashboard_users where user_id=p_operator_id and active for share;
  if not found then raise exception 'RECOVERY_REVIEW_RESOLUTION_REJECTED'; end if;
end $$;

create or replace function moaon_auth.locked_recovery_review_snapshot(p_operator_id uuid,p_user_id uuid,p_operation_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_state moaon_auth.account_state;
  v_review moaon_auth.recovery_reviews;
  v_change moaon_auth.password_changes;
  v_state_exists boolean;
  v_target_exists boolean;
  v_active boolean;
  v_change_exists boolean;
  v_decision text;
  v_evidence jsonb;
begin
  perform moaon_auth.authorize_recovery_operator(p_operator_id);
  if p_user_id is null or p_operation_id is null then raise exception 'RECOVERY_REVIEW_RESOLUTION_REJECTED'; end if;
  -- Same account -> profile -> journal order as the existing password fence.
  select * into v_state from moaon_auth.account_state where user_id=p_user_id for update;
  v_state_exists := found;
  select active into v_active from public.dashboard_users where user_id=p_user_id for share;
  v_target_exists := found;
  select * into v_review from moaon_auth.recovery_reviews where operation_id=p_operation_id for update;
  if not found or v_review.user_id<>p_user_id then raise exception 'RECOVERY_REVIEW_RESOLUTION_REJECTED'; end if;
  select * into v_change from moaon_auth.password_changes where user_id=p_user_id and id=p_operation_id for share;
  v_change_exists := found;
  v_decision := case
    when v_review.status in ('COMPLETED','REJECTED') then 'ALREADY_CLOSED'
    when not v_state_exists or not v_target_exists or not v_active then 'CHECK_REQUIRED'
    when v_state.blocked or v_change.status='PENDING' then 'KEEP_BLOCKED'
    when v_change.status='COMPLETED' and not v_state.blocked then 'CONFIRM_COMPLETED'
    when not v_change_exists and not v_state.blocked then 'CLOSE_NOT_STARTED'
    else 'CHECK_REQUIRED' end;
  v_evidence := jsonb_build_object(
    'userId',v_review.user_id,'operationId',v_review.operation_id,
    'status',v_review.status,'stage',v_review.stage,
    'createdAt',to_char(v_review.created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'updatedAt',to_char(v_review.updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'accountExists',v_state_exists,'generation',v_state.generation,
    'blocked',v_state.blocked,'accountOperationId',v_state.operation_id,
    'targetExists',v_target_exists,'active',v_active,'changeExists',v_change_exists,
    'changeStatus',v_change.status,
    'changeStartedAt',to_char(v_change.started_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'changeCompletedAt',to_char(v_change.completed_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
  );
  return jsonb_build_object('userId',p_user_id,'operationId',p_operation_id,
    'status',v_review.status,'stage',v_review.stage,'decision',v_decision,
    'version',encode(sha256(convert_to(v_evidence::text,'UTF8')),'hex'));
end $$;

create or replace function public.moaon_inspect_recovery_review(p_operator_id uuid,p_user_id uuid,p_operation_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
begin
  return moaon_auth.locked_recovery_review_snapshot(p_operator_id,p_user_id,p_operation_id);
end $$;

create or replace function public.moaon_resolve_recovery_review(p_operator_id uuid,p_user_id uuid,p_operation_id uuid,
  p_resolution_id uuid,p_expected_version text,p_action text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_snapshot jsonb; v_audit moaon_auth.recovery_resolutions; v_status text;
begin
  perform moaon_auth.authorize_recovery_operator(p_operator_id);
  if p_user_id is null or p_operation_id is null or p_resolution_id is null
    or p_expected_version is null or p_expected_version !~ '^[0-9a-f]{64}$'
    or p_action is null or p_action not in ('CONFIRM_COMPLETED','CLOSE_NOT_STARTED') then
    raise exception 'RECOVERY_REVIEW_RESOLUTION_REJECTED';
  end if;
  -- Separate bigint advisory namespace. Hash collisions only add serialization.
  -- This also serializes reuse of one ID for different accounts/operations.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('moaon:recovery-resolution:'||p_resolution_id::text,0));
  select * into v_audit from moaon_auth.recovery_resolutions where resolution_id=p_resolution_id;
  if found then
    if v_audit.operator_id<>p_operator_id or v_audit.user_id<>p_user_id
      or v_audit.operation_id<>p_operation_id or v_audit.action<>p_action
      or v_audit.expected_version<>p_expected_version then
      raise exception 'RECOVERY_REVIEW_RESOLUTION_REJECTED';
    end if;
    return jsonb_build_object('userId',v_audit.user_id,'operationId',v_audit.operation_id,
      'resolutionId',v_audit.resolution_id,'status',v_audit.result_status);
  end if;
  v_snapshot := moaon_auth.locked_recovery_review_snapshot(p_operator_id,p_user_id,p_operation_id);
  if v_snapshot->>'version'<>p_expected_version or v_snapshot->>'decision'<>p_action
    or exists(select 1 from moaon_auth.recovery_resolutions where operation_id=p_operation_id) then
    raise exception 'RECOVERY_REVIEW_RESOLUTION_REJECTED';
  end if;
  v_status := case p_action when 'CONFIRM_COMPLETED' then 'COMPLETED' else 'REJECTED' end;
  update moaon_auth.recovery_reviews set status=v_status,updated_at=clock_timestamp()
    where user_id=p_user_id and operation_id=p_operation_id;
  insert into moaon_auth.recovery_resolutions(resolution_id,operation_id,user_id,operator_id,action,expected_version,result_status)
    values(p_resolution_id,p_operation_id,p_user_id,p_operator_id,p_action,p_expected_version,v_status);
  return jsonb_build_object('userId',p_user_id,'operationId',p_operation_id,'resolutionId',p_resolution_id,'status',v_status);
end $$;

revoke all on function moaon_auth.lock_recovery_operator_changes(),
  moaon_auth.authorize_recovery_operator(uuid),moaon_auth.locked_recovery_review_snapshot(uuid,uuid,uuid),
  public.moaon_inspect_recovery_review(uuid,uuid,uuid),
  public.moaon_resolve_recovery_review(uuid,uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function moaon_auth.authorize_recovery_operator(uuid),
  moaon_auth.locked_recovery_review_snapshot(uuid,uuid,uuid),
  public.moaon_inspect_recovery_review(uuid,uuid,uuid),
  public.moaon_resolve_recovery_review(uuid,uuid,uuid,uuid,text,text) to service_role;
commit;
