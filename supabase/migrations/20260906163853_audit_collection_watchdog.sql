begin;

-- Retain the existing ten-minute database watchdog and its service-only access.
-- Worker liveness and scheduled collection evidence are independent signals.
create or replace function public.run_worker_heartbeat_watchdog()
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_worker public.worker_heartbeats%rowtype;
  v_run public.automation_runs%rowtype;
  v_worker_bad boolean;
  v_hourly_bad boolean;
  v_message text;
begin
  select * into v_worker from public.worker_heartbeats
    where service_name = 'harin-coupang-worker' order by last_seen_at desc limit 1;
  v_worker_bad := v_worker.last_seen_at is null
    or v_worker.last_seen_at <= now() - interval '15 minutes'
    or v_worker.status not in ('ONLINE','BUSY');
  if v_worker_bad then
    v_message := case when v_worker.last_seen_at is null then '고정 IP 워커의 생존 신호가 아직 등록되지 않았습니다.'
      when v_worker.last_seen_at <= now() - interval '15 minutes' then '고정 IP 워커가 15분 이상 신호를 보내지 않았습니다.'
      else format('고정 IP 워커가 %s 상태입니다. 최근 신호만으로 처리 가능 상태로 판단하지 않습니다.',v_worker.status) end;
    insert into public.alerts(source_type,platform,severity,title,message,fingerprint,status)
      select 'WORKER_HEARTBEAT','COUPANG','ERROR','쿠팡 고정 IP 워커 확인 필요',v_message,'worker-silence:harin-coupang-worker','OPEN'
      where not exists(select 1 from public.alerts where fingerprint='worker-silence:harin-coupang-worker' and status='OPEN')
      on conflict do nothing;
    update public.alerts set message=v_message where fingerprint='worker-silence:harin-coupang-worker' and status='OPEN' and message is distinct from v_message;
  else
    update public.alerts set status='RESOLVED',resolved_at=now()
      where fingerprint='worker-silence:harin-coupang-worker' and status='OPEN';
  end if;

  select * into v_run from public.automation_runs
    where job_name='EXECUTION_LANE_HOURLY_ORDERS' order by started_at desc limit 1;
  v_hourly_bad := v_run.started_at is null or v_run.started_at < now() - interval '75 minutes'
    or v_run.status in ('FAILED','PARTIAL')
    or (v_run.status='RUNNING' and v_run.started_at < now() - interval '15 minutes');
  if v_hourly_bad then
    v_message := case when v_run.started_at is null then '시간별 주문 수집 실행 기록이 없습니다. 서버 타이머를 확인해 주세요.'
      when v_run.started_at < now() - interval '75 minutes' then '시간별 주문 수집에 75분 이상 공백이 있습니다. 작업자 생존 신호와 별도로 서버 타이머를 확인해 주세요.'
      else '최근 시간별 주문 수집이 일부 실패했거나 완료되지 않았습니다. 채널별 수집 결과를 확인해 주세요.' end;
    insert into public.alerts(source_type,platform,severity,title,message,fingerprint,status)
      select 'AUTOMATION_SCHEDULE','ALL','ERROR','시간별 주문 수집 확인 필요',v_message,'collection-gap:hourly-orders','OPEN'
      where not exists(select 1 from public.alerts where fingerprint='collection-gap:hourly-orders' and status='OPEN')
      on conflict do nothing;
    update public.alerts set message=v_message where fingerprint='collection-gap:hourly-orders' and status='OPEN' and message is distinct from v_message;
  elsif v_run.status='SUCCESS' then
    update public.alerts set status='RESOLVED',resolved_at=now()
      where fingerprint='collection-gap:hourly-orders' and status='OPEN';
  end if;
end;
$$;
revoke all on function public.run_worker_heartbeat_watchdog() from public,anon,authenticated;
grant execute on function public.run_worker_heartbeat_watchdog() to service_role;
commit;
