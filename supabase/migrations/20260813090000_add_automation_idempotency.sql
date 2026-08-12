begin;

alter table public.automation_runs
  add column if not exists idempotency_key text,
  add column if not exists scheduled_for timestamptz,
  add column if not exists kst_execution_date date,
  add column if not exists heartbeat_at timestamptz,
  add column if not exists lease_token uuid,
  add column if not exists recovery_count integer not null default 0 check (recovery_count >= 0);

create unique index if not exists automation_runs_job_idempotency_idx
  on public.automation_runs(job_name, idempotency_key);
create index if not exists automation_runs_running_heartbeat_idx
  on public.automation_runs(heartbeat_at)
  where status = 'RUNNING';

alter table public.coupang_sync_requests
  add column if not exists idempotency_key text,
  add column if not exists scheduled_for timestamptz,
  add column if not exists kst_execution_date date;

create unique index if not exists coupang_sync_requests_type_idempotency_idx
  on public.coupang_sync_requests(request_type, idempotency_key);

create or replace function public.claim_automation_run(
  p_job_name text,
  p_trigger_type text,
  p_idempotency_key text,
  p_scheduled_for timestamptz,
  p_kst_execution_date date,
  p_stale_before timestamptz,
  p_lease_token uuid
)
returns table (
  run_id uuid,
  claim_state text,
  run_status text,
  attempt_count integer,
  result_json jsonb
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_run public.automation_runs%rowtype;
  v_run_id uuid;
begin
  insert into public.automation_runs (
    job_name, trigger_type, status, idempotency_key, scheduled_for,
    kst_execution_date, heartbeat_at, lease_token
  ) values (
    p_job_name, p_trigger_type, 'RUNNING', p_idempotency_key, p_scheduled_for,
    p_kst_execution_date, now(), p_lease_token
  )
  on conflict (job_name, idempotency_key) do nothing
  returning * into v_run;

  if found then
    return query select v_run.id, 'CLAIMED'::text, v_run.status,
      v_run.attempt_count, v_run.result_json;
    return;
  end if;

  select * into v_run
  from public.automation_runs
  where job_name = p_job_name and idempotency_key = p_idempotency_key;
  v_run_id := v_run.id;

  if v_run.status in ('SUCCESS', 'PARTIAL') then
    return query select v_run.id, 'REUSED'::text, v_run.status,
      v_run.attempt_count, v_run.result_json;
    return;
  end if;

  if v_run.status = 'RUNNING'
     and coalesce(v_run.heartbeat_at, v_run.started_at) >= p_stale_before then
    return query select v_run.id, 'RUNNING'::text, v_run.status,
      v_run.attempt_count, v_run.result_json;
    return;
  end if;

  update public.automation_runs
  set status = 'RUNNING',
      trigger_type = p_trigger_type,
      started_at = now(),
      finished_at = null,
      heartbeat_at = now(),
      lease_token = p_lease_token,
      recovery_count = recovery_count + 1,
      error_message = null,
      result_json = '{}'::jsonb,
      scheduled_for = coalesce(scheduled_for, p_scheduled_for),
      kst_execution_date = coalesce(kst_execution_date, p_kst_execution_date)
  where id = v_run_id
    and (
      status = 'FAILED'
      or (status = 'RUNNING' and coalesce(heartbeat_at, started_at) < p_stale_before)
    )
  returning * into v_run;

  if found then
    return query select v_run.id, 'CLAIMED'::text, v_run.status,
      v_run.attempt_count, v_run.result_json;
    return;
  end if;

  select * into v_run from public.automation_runs where id = v_run_id;
  return query select v_run.id,
    case when v_run.status in ('SUCCESS', 'PARTIAL') then 'REUSED' else 'RUNNING' end,
    v_run.status, v_run.attempt_count, v_run.result_json;
end;
$$;

revoke all on function public.claim_automation_run(text, text, text, timestamptz, date, timestamptz, uuid)
  from public, anon, authenticated;
grant execute on function public.claim_automation_run(text, text, text, timestamptz, date, timestamptz, uuid)
  to service_role;

commit;
