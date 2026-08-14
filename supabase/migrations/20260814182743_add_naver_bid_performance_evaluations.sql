begin;

create table if not exists public.naver_bid_performance_evaluations (
  id uuid primary key default gen_random_uuid(),
  change_request_id uuid not null references public.financial_change_requests(id) on delete restrict,
  checkpoint_days integer not null check (checkpoint_days in (7, 14)),
  baseline_start date not null,
  baseline_end date not null,
  evaluation_start date not null,
  evaluation_end date not null,
  before_metrics jsonb not null default '{}'::jsonb,
  after_metrics jsonb not null default '{}'::jsonb,
  data_status text not null check (data_status in ('READY', 'PARTIAL', 'NO_DATA', 'BLOCKED')),
  outcome text not null check (outcome in ('IMPROVED', 'DECLINED', 'INCONCLUSIVE', 'NO_DATA', 'BLOCKED')),
  decision text not null check (decision in ('KEEP', 'OBSERVE', 'ROLLBACK_REVIEW', 'WAIT')),
  confidence text not null check (confidence in ('HIGH', 'MEDIUM', 'LOW', 'NONE')),
  explanation text not null,
  evaluated_at timestamptz not null default now(),
  unique (change_request_id, checkpoint_days),
  check (baseline_end >= baseline_start),
  check (evaluation_end >= evaluation_start)
);

create index if not exists naver_bid_performance_evaluations_due_idx
  on public.naver_bid_performance_evaluations (evaluation_end desc, outcome);
create index if not exists naver_bid_performance_evaluations_request_idx
  on public.naver_bid_performance_evaluations (change_request_id, checkpoint_days);

alter table public.naver_bid_performance_evaluations enable row level security;
revoke all on public.naver_bid_performance_evaluations from anon, authenticated;
revoke all on public.naver_bid_performance_evaluations from service_role;
grant select, insert, update on public.naver_bid_performance_evaluations to service_role;

comment on table public.naver_bid_performance_evaluations is
  'Server-only 7-day and 14-day performance evidence for owner-approved Naver bid changes. The evaluator never applies or rolls back bids automatically.';

commit;
