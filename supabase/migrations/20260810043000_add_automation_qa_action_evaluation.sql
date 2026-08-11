begin;

create table if not exists public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  job_name text not null,
  trigger_type text not null check (trigger_type in ('MANUAL','CRON','SYSTEM')),
  status text not null default 'RUNNING' check (status in ('RUNNING','SUCCESS','PARTIAL','FAILED')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  result_json jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now()
);

create table if not exists public.automation_attempts (
  id uuid primary key default gen_random_uuid(),
  automation_run_id uuid not null references public.automation_runs(id) on delete cascade,
  attempt_no integer not null check (attempt_no > 0),
  status text not null default 'RUNNING' check (status in ('RUNNING','SUCCESS','FAILED')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  result_json jsonb not null default '{}'::jsonb,
  error_message text,
  unique (automation_run_id, attempt_no)
);

create table if not exists public.data_quality_checks (
  id uuid primary key default gen_random_uuid(),
  automation_run_id uuid references public.automation_runs(id) on delete set null,
  platform text not null check (platform in ('ALL','NAVER','CAFE24','COUPANG')),
  dataset text not null,
  period_start date,
  period_end date,
  status_code text not null check (status_code in ('OK','REAL_ZERO','NOT_COLLECTED','NO_DATA','API_ERROR','PARSE_ERROR','PERIOD_MISMATCH','DUPLICATE','STALE','NOT_CONNECTED')),
  severity text not null default 'INFO' check (severity in ('INFO','WARNING','ERROR')),
  rows_checked integer not null default 0 check (rows_checked >= 0),
  duplicate_count integer not null default 0 check (duplicate_count >= 0),
  message text not null,
  remediation text,
  retryable boolean not null default false,
  details jsonb not null default '{}'::jsonb,
  checked_at timestamptz not null default now(),
  check (period_end is null or period_start is null or period_end >= period_start)
);

create table if not exists public.alerts (
  id uuid primary key default gen_random_uuid(),
  source_type text not null,
  source_id uuid,
  platform text not null default 'ALL' check (platform in ('ALL','NAVER','CAFE24','COUPANG')),
  severity text not null default 'INFO' check (severity in ('INFO','WARNING','ERROR')),
  title text not null,
  message text not null,
  fingerprint text,
  status text not null default 'OPEN' check (status in ('OPEN','ACKNOWLEDGED','RESOLVED')),
  created_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  resolved_at timestamptz
);

alter table public.actions
  add column if not exists priority text not null default 'MEDIUM',
  add column if not exists assignee text,
  add column if not exists due_at date,
  add column if not exists hold_reason text;
alter table public.actions drop constraint if exists actions_priority_check;
alter table public.actions add constraint actions_priority_check check (priority in ('LOW','MEDIUM','HIGH','URGENT'));
alter table public.actions drop constraint if exists actions_status_check;
alter table public.actions add constraint actions_status_check check (status in ('PLANNED','ON_HOLD','EXECUTED','CANCELLED','REVIEWED'));

create table if not exists public.action_evaluations (
  id uuid primary key default gen_random_uuid(),
  action_id uuid not null references public.actions(id) on delete cascade,
  baseline_start date,
  baseline_end date,
  evaluation_start date,
  evaluation_end date,
  metric_name text,
  before_json jsonb not null default '{}'::jsonb,
  after_json jsonb not null default '{}'::jsonb,
  change_rate numeric,
  outcome text not null check (outcome in ('IMPROVED','DECLINED','INCONCLUSIVE','NO_DATA')),
  explanation text not null,
  evaluated_at timestamptz not null default now(),
  unique (action_id, evaluation_end)
);

create index if not exists automation_runs_job_started_idx on public.automation_runs(job_name, started_at desc);
create index if not exists automation_runs_status_idx on public.automation_runs(status, started_at desc);
create index if not exists automation_attempts_run_idx on public.automation_attempts(automation_run_id, attempt_no);
create index if not exists data_quality_checks_checked_idx on public.data_quality_checks(checked_at desc);
create index if not exists data_quality_checks_platform_status_idx on public.data_quality_checks(platform, status_code, checked_at desc);
create index if not exists data_quality_checks_run_idx on public.data_quality_checks(automation_run_id) where automation_run_id is not null;
create index if not exists alerts_status_created_idx on public.alerts(status, created_at desc);
create unique index if not exists alerts_open_fingerprint_idx on public.alerts(fingerprint) where status = 'OPEN' and fingerprint is not null;
create index if not exists action_evaluations_action_idx on public.action_evaluations(action_id, evaluated_at desc);

alter table public.automation_runs enable row level security;
alter table public.automation_attempts enable row level security;
alter table public.data_quality_checks enable row level security;
alter table public.alerts enable row level security;
alter table public.action_evaluations enable row level security;
revoke all on public.automation_runs, public.automation_attempts, public.data_quality_checks, public.alerts, public.action_evaluations from anon, authenticated;
grant select, insert, update, delete on public.automation_runs, public.automation_attempts, public.data_quality_checks, public.alerts, public.action_evaluations to service_role;

create or replace function public.qa_duplicate_counts()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'cafe24_orders', (select count(*) from (select order_id from public.cafe24_orders group by order_id having count(*) > 1) d),
    'cafe24_products', (select count(*) from (select external_product_no from public.cafe24_products group by external_product_no having count(*) > 1) d),
    'naver_keywords', (select count(*) from (select ncc_keyword_id from public.naver_keywords group by ncc_keyword_id having count(*) > 1) d),
    'naver_stats_daily', (select count(*) from (select date, entity_id, entity_type from public.naver_stats_daily group by date, entity_id, entity_type having count(*) > 1) d)
  );
$$;
revoke all on function public.qa_duplicate_counts() from public, anon, authenticated;
grant execute on function public.qa_duplicate_counts() to service_role;
alter function public.set_updated_at() set search_path = '';

commit;
