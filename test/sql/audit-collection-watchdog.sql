-- Transactional regression check: no operational records survive this test.
begin;
do $$
declare
  v_worker text;
  v_run uuid;
begin
  select worker_id into v_worker from public.worker_heartbeats where service_name='harin-coupang-worker' order by last_seen_at desc limit 1;
  select id into v_run from public.automation_runs where job_name='EXECUTION_LANE_HOURLY_ORDERS' order by started_at desc limit 1;
  assert v_worker is not null and v_run is not null, 'Existing heartbeat and hourly run required';
  update public.worker_heartbeats set status='ERROR',last_seen_at=now() where worker_id=v_worker;
  perform public.run_worker_heartbeat_watchdog();
  perform public.run_worker_heartbeat_watchdog();
  assert (select count(*)=1 from public.alerts where fingerprint='worker-silence:harin-coupang-worker' and status='OPEN'), 'Worker error must have one alert';
  update public.worker_heartbeats set status='ONLINE',last_seen_at=now() where worker_id=v_worker;
  update public.automation_runs set status='SUCCESS',started_at=now()-interval '80 minutes' where id=v_run;
  perform public.run_worker_heartbeat_watchdog();
  assert not exists(select 1 from public.alerts where fingerprint='worker-silence:harin-coupang-worker' and status='OPEN'), 'Healthy worker must resolve its alert';
  assert (select count(*)=1 from public.alerts where fingerprint='collection-gap:hourly-orders' and status='OPEN'), 'Hourly gap must alert despite healthy worker';
  update public.automation_runs set status='SUCCESS',started_at=now() where id=v_run;
  perform public.run_worker_heartbeat_watchdog();
  assert not exists(select 1 from public.alerts where fingerprint='collection-gap:hourly-orders' and status='OPEN'), 'Fresh success resolves gap';
  update public.automation_runs set status='PARTIAL' where id=v_run;
  perform public.run_worker_heartbeat_watchdog();
  assert (select count(*)=1 from public.alerts where fingerprint='collection-gap:hourly-orders' and status='OPEN'), 'Partial collection must alert';
  update public.automation_runs set status='RUNNING',started_at=now()-interval '20 minutes' where id=v_run;
  perform public.run_worker_heartbeat_watchdog();
  assert (select count(*)=1 from public.alerts where fingerprint='collection-gap:hourly-orders' and status='OPEN'), 'Hung run must remain alert';
end $$;
rollback;
