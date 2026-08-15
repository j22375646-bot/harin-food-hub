begin;

create extension if not exists pg_cron;

create or replace function public.run_worker_heartbeat_watchdog()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_last_seen timestamptz;
  v_silent_minutes integer;
  v_fingerprint constant text := 'worker-silence:harin-coupang-worker';
begin
  select max(last_seen_at)
    into v_last_seen
    from public.worker_heartbeats
   where service_name = 'harin-coupang-worker';

  v_silent_minutes := case
    when v_last_seen is null then null
    else greatest(0, floor(extract(epoch from (now() - v_last_seen)) / 60)::integer)
  end;

  if v_last_seen is null or v_last_seen <= now() - interval '15 minutes' then
    insert into public.alerts (
      source_type, platform, severity, title, message, fingerprint, status
    )
    select
      'WORKER_HEARTBEAT',
      'COUPANG',
      'ERROR',
      '쿠팡 고정 IP 워커 확인 필요',
      case
        when v_last_seen is null then '고정 IP 워커의 생존 신호가 아직 등록되지 않았습니다.'
        else format('고정 IP 워커가 %s분 동안 신호를 보내지 않았습니다. 주문·쿠팡 수집 대기열을 확인해 주세요.', v_silent_minutes)
      end,
      v_fingerprint,
      'OPEN'
    where not exists (
      select 1
        from public.alerts
       where fingerprint = v_fingerprint
         and status = 'OPEN'
    );
  else
    update public.alerts
       set status = 'RESOLVED',
           resolved_at = now()
     where fingerprint = v_fingerprint
       and status = 'OPEN';
  end if;
end;
$$;

revoke all on function public.run_worker_heartbeat_watchdog()
  from public, anon, authenticated;
grant execute on function public.run_worker_heartbeat_watchdog()
  to service_role;

do $$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select jobid from cron.job where jobname = 'harin-worker-heartbeat-watchdog'
  loop
    perform cron.unschedule(v_job_id);
  end loop;

  perform cron.schedule(
    'harin-worker-heartbeat-watchdog',
    '*/10 * * * *',
    'select public.run_worker_heartbeat_watchdog();'
  );
end;
$$;

comment on function public.run_worker_heartbeat_watchdog() is
  'Phase 13-8: opens or resolves the fixed-IP worker silence alert every ten minutes through Supabase Cron.';

commit;
