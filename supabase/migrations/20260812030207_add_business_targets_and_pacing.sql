create table if not exists public.business_targets (
  id uuid primary key default gen_random_uuid(),
  target_month date not null,
  platform text not null check (platform in ('ALL','NAVER','CAFE24','COUPANG')),
  revenue_target numeric not null default 0 check (revenue_target >= 0),
  ad_budget numeric not null default 0 check (ad_budget >= 0),
  target_roas numeric not null default 250 check (target_roas >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_targets_month_start check (target_month = date_trunc('month', target_month)::date),
  constraint business_targets_month_platform_key unique (target_month, platform)
);

create table if not exists public.budget_snapshots (
  id uuid primary key default gen_random_uuid(),
  target_id uuid not null references public.business_targets(id) on delete cascade,
  snapshot_date date not null,
  elapsed_days integer not null check (elapsed_days > 0),
  days_in_month integer not null check (days_in_month between 28 and 31),
  revenue_actual numeric not null default 0,
  revenue_forecast numeric not null default 0,
  ad_spend_actual numeric not null default 0,
  ad_spend_forecast numeric not null default 0,
  revenue_progress_rate numeric,
  revenue_pacing_rate numeric,
  budget_usage_rate numeric,
  budget_pacing_rate numeric,
  budget_remaining numeric,
  recommended_daily_spend numeric,
  required_daily_revenue numeric,
  status text not null check (status in ('ON_TRACK','WATCH','AT_RISK','TARGET_REQUIRED')),
  calculation_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint budget_snapshots_target_date_key unique (target_id, snapshot_date)
);

create index if not exists budget_snapshots_date_idx
  on public.budget_snapshots (snapshot_date desc, target_id);

alter table public.business_targets enable row level security;
alter table public.budget_snapshots enable row level security;

revoke all on public.business_targets, public.budget_snapshots from anon, authenticated;
grant select, insert, update, delete on public.business_targets, public.budget_snapshots to service_role;

comment on table public.business_targets is 'Server-only monthly revenue, advertising budget, and ROAS targets.';
comment on table public.budget_snapshots is 'Server-calculated monthly pacing and month-end forecast snapshots.';
