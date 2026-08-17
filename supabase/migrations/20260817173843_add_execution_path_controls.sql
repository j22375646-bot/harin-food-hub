-- Phase 21-1: observation-only execution path registry.
-- This table does not trigger, pause, or move jobs. It records the currently
-- verified owner of each lane so a later bridge/cutover cannot create two
-- active schedulers for the same work.
create table if not exists public.execution_path_controls (
  lane_key text primary key check (lane_key ~ '^[A-Z0-9_]{3,80}$'),
  label text not null,
  current_trigger text not null check (current_trigger in ('AWS_SYSTEMD','VERCEL_CRON','SUPABASE_CRON','SUPABASE_TABLE','MANUAL')),
  current_executor text not null check (current_executor in ('VERCEL_FUNCTION','AWS_FIXED_IP_WORKER','SUPABASE_DATABASE','OWNER')),
  queue_backend text not null check (queue_backend in ('SUPABASE_CUSTOM_TABLE','NONE')),
  desired_trigger text,
  desired_executor text,
  desired_queue_backend text,
  mode text not null default 'OBSERVE' check (mode in ('OBSERVE','BRIDGE','CUTOVER','ROLLBACK','PAUSED')),
  migration_authorized boolean not null default false,
  schedule_label text not null,
  source_path text not null,
  safety_rules jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint execution_path_controls_authorized_mode
    check (migration_authorized or mode = 'OBSERVE')
);

insert into public.execution_path_controls (
  lane_key,label,current_trigger,current_executor,queue_backend,schedule_label,source_path,safety_rules,notes
) values
  ('HOURLY_ORDERS','시간별 주문·CS·배송 추적','AWS_SYSTEMD','VERCEL_FUNCTION','SUPABASE_CUSTOM_TABLE','매시 정각','harin-orders-hourly.timer -> /api/cron/hourly-orders',
   '{"idempotency":"hour bucket","worker":"fixed ip","writes":"existing path only"}'::jsonb,'현재 운영 경로를 관찰하며 이 단계에서는 소유권을 바꾸지 않습니다.'),
  ('DAILY_COLLECTION','매일 전체 채널 수집','VERCEL_CRON','VERCEL_FUNCTION','SUPABASE_CUSTOM_TABLE','매일 05:30 KST','vercel.json -> /api/cron/daily-sync',
   '{"idempotency":"schedule bucket","lease":"automation_runs","writes":"existing path only"}'::jsonb,'Cafe24 직접 수집과 고정 IP 작업 큐를 함께 관찰합니다.'),
  ('COUPANG_FIXED_IP_QUEUE','쿠팡 고정 IP 수집 큐','SUPABASE_TABLE','AWS_FIXED_IP_WORKER','SUPABASE_CUSTOM_TABLE','계속 감시','coupang_sync_requests -> harin-coupang-worker',
   '{"idempotency":"partial unique key","retry":"lease and backoff","ip":"13.124.12.17"}'::jsonb,'쿠팡 호출은 서울 고정 IP 워커만 실행합니다.'),
  ('CHANNEL_OPERATION_QUEUE','채널 작업·우체국 추적 큐','SUPABASE_TABLE','AWS_FIXED_IP_WORKER','SUPABASE_CUSTOM_TABLE','계속 감시','coupang_operation_requests -> harin-coupang-worker',
   '{"idempotency":"partial unique key","retry":"dead letter","pii":"encrypted payload"}'::jsonb,'네이버·쿠팡·우체국 작업은 종류와 키를 분리합니다.'),
  ('WORKER_WATCHDOG','고정 IP 워커 생존 감시','SUPABASE_CRON','SUPABASE_DATABASE','NONE','10분마다','cron.job -> run_worker_heartbeat_watchdog()',
   '{"dedupe":"alert fingerprint","silence_minutes":15,"writes":"alert only"}'::jsonb,'워커 작업을 대신 실행하지 않고 생존 알림만 관리합니다.'),
  ('REPORT_SCHEDULES','보고서 예약 실행','VERCEL_CRON','VERCEL_FUNCTION','NONE','일·주·월 예약','vercel.json -> report cron routes',
   '{"idempotency":"automation run","writes":"report storage only"}'::jsonb,'운영 수집 큐와 별도 경로로 유지합니다.')
on conflict (lane_key) do update set
  label=excluded.label,
  current_trigger=excluded.current_trigger,
  current_executor=excluded.current_executor,
  queue_backend=excluded.queue_backend,
  schedule_label=excluded.schedule_label,
  source_path=excluded.source_path,
  safety_rules=excluded.safety_rules,
  notes=excluded.notes,
  updated_at=now();

alter table public.execution_path_controls enable row level security;
revoke all on table public.execution_path_controls from public,anon,authenticated;
grant select,insert,update,delete on table public.execution_path_controls to service_role;

comment on table public.execution_path_controls is
  'Phase 21-1 server-only observation registry. It cannot change scheduler ownership or execute jobs.';
