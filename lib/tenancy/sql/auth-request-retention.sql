-- P1-04-7 candidate, NOT an automatically applied production migration.
-- Fixed DB-clock retention only; callers supply no cutoff, limit, or target.
begin;

create index if not exists request_limits_retention_idx
  on moaon_auth.request_limits(started_at, kind, subject_hash);
create index if not exists admission_limits_ip_retention_idx
  on moaon_auth.admission_limits(started_at, key_hash)
  where scope = 'IP';

revoke all on schema moaon_auth from public, anon, authenticated;
grant usage on schema moaon_auth to service_role;
alter table moaon_auth.request_limits enable row level security;
alter table moaon_auth.admission_limits enable row level security;
revoke all on moaon_auth.request_limits from public, anon, authenticated;
revoke all on moaon_auth.admission_limits from public, anon, authenticated;
grant delete on moaon_auth.request_limits to service_role;
grant delete on moaon_auth.admission_limits to service_role;

create or replace function public.moaon_prune_auth_request_limits()
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_cutoff timestamptz := clock_timestamp() - interval '24 hours';
  v_request_deleted integer;
  v_ip_deleted integer;
begin
  with candidates as (
    select limits.kind, limits.subject_hash
      from moaon_auth.request_limits as limits
      where limits.started_at < v_cutoff
      order by limits.started_at, limits.kind, limits.subject_hash
      limit 500
      for update of limits skip locked
  ), deleted as (
    delete from moaon_auth.request_limits as limits
      using candidates
      where limits.kind = candidates.kind
        and limits.subject_hash = candidates.subject_hash
      returning 1
  )
  select count(*)::integer into v_request_deleted from deleted;

  with candidates as (
    select limits.key_hash
      from moaon_auth.admission_limits as limits
      where limits.scope = 'IP'
        and limits.started_at < v_cutoff
      order by limits.started_at, limits.key_hash
      limit 500
      for update of limits skip locked
  ), deleted as (
    delete from moaon_auth.admission_limits as limits
      using candidates
      where limits.scope = 'IP'
        and limits.key_hash = candidates.key_hash
      returning 1
  )
  select count(*)::integer into v_ip_deleted from deleted;

  return jsonb_build_object(
    'requestDeleted', v_request_deleted,
    'ipDeleted', v_ip_deleted
  );
end $$;

revoke all on function public.moaon_prune_auth_request_limits()
  from public, anon, authenticated;
grant execute on function public.moaon_prune_auth_request_limits() to service_role;
commit;
