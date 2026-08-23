begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create table if not exists public.naver_bid_automation_schedules (
  ncc_adgroup_id text primary key references public.naver_adgroups(ncc_adgroup_id) on delete cascade,
  mode text not null default 'PAUSED' check (mode in ('PAUSED','OBSERVE','ACTIVE')),
  weekdays smallint[] not null default array[1,2,3,4,5]::smallint[],
  start_minute integer not null default 540 check (start_minute between 0 and 1410 and start_minute % 30 = 0),
  end_minute integer not null default 1080 check (end_minute between 30 and 1440 and end_minute % 30 = 0),
  interval_minutes integer not null default 60 check (interval_minutes in (30,60,120,180)),
  max_changes_per_run integer not null default 3 check (max_changes_per_run between 1 and 10),
  daily_change_limit integer not null default 6 check (daily_change_limit between 1 and 30),
  allow_increase boolean not null default false,
  activation_confirmed_at timestamptz,
  activation_confirmed_by text,
  last_run_slot text,
  last_run_at timestamptz,
  last_run_status text,
  updated_by text not null default 'dashboard-session',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (start_minute < end_minute),
  check (max_changes_per_run <= daily_change_limit),
  check (weekdays <@ array[0,1,2,3,4,5,6]::smallint[] and cardinality(weekdays) > 0),
  check (mode <> 'ACTIVE' or activation_confirmed_at is not null)
);

create table if not exists public.naver_bid_automation_runs (
  id uuid primary key default gen_random_uuid(),
  ncc_adgroup_id text not null references public.naver_bid_automation_schedules(ncc_adgroup_id) on delete cascade,
  run_slot text not null,
  mode text not null check (mode in ('OBSERVE','ACTIVE')),
  status text not null check (status in ('RUNNING','OBSERVED','COMPLETED','PARTIAL','FAILED','SKIPPED','SETUP_REQUIRED')),
  planned_count integer not null default 0 check (planned_count >= 0),
  executed_count integer not null default 0 check (executed_count >= 0),
  blocked_count integer not null default 0 check (blocked_count >= 0),
  details jsonb not null default '{}'::jsonb,
  error_message text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  unique (ncc_adgroup_id, run_slot)
);

create index if not exists naver_bid_automation_schedules_mode_idx
  on public.naver_bid_automation_schedules (mode, updated_at desc);
create index if not exists naver_bid_automation_runs_group_started_idx
  on public.naver_bid_automation_runs (ncc_adgroup_id, started_at desc);
create index if not exists naver_bid_automation_runs_daily_idx
  on public.naver_bid_automation_runs (started_at desc, status);

drop trigger if exists naver_bid_automation_schedules_set_updated_at on public.naver_bid_automation_schedules;
create trigger naver_bid_automation_schedules_set_updated_at
before update on public.naver_bid_automation_schedules
for each row execute function public.set_updated_at();

alter table public.naver_bid_automation_schedules enable row level security;
alter table public.naver_bid_automation_runs enable row level security;
revoke all on table public.naver_bid_automation_schedules from public, anon, authenticated, service_role;
revoke all on table public.naver_bid_automation_runs from public, anon, authenticated, service_role;
grant select, insert, update on table public.naver_bid_automation_schedules to service_role;
grant select, insert, update on table public.naver_bid_automation_runs to service_role;

comment on table public.naver_bid_automation_schedules is
  'Server-only owner schedules for Naver Search Ads bid operation. Coupang records and write paths are forbidden.';
comment on column public.naver_bid_automation_schedules.mode is
  'PAUSED does nothing, OBSERVE records a safe plan, ACTIVE may write only when the separate server kill switch is enabled.';
comment on column public.naver_bid_automation_schedules.allow_increase is
  'False by default. Active increases still require existing product, financial, stale-data, and live provider safety checks.';
comment on table public.naver_bid_automation_runs is
  'Idempotent Naver-only schedule run history, including observe plans, actual provider verification, and blocked reasons.';

notify pgrst, 'reload schema';
commit;
