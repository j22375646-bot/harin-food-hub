create table if not exists public.optional_provider_snapshots (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('DEEPL','GOOGLE_TRENDS_ALPHA','PUBLIC_PROCUREMENT')),
  status text not null check (status in ('SUCCESS','NO_DATA','FAILED')),
  metric_summary jsonb not null default '{}'::jsonb check (jsonb_typeof(metric_summary) = 'object'),
  fetched_at timestamptz not null default now(),
  error_code text,
  error_message text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create index if not exists optional_provider_snapshots_provider_fetched_idx
  on public.optional_provider_snapshots(provider, fetched_at desc);
create index if not exists optional_provider_snapshots_success_idx
  on public.optional_provider_snapshots(provider, fetched_at desc)
  where status = 'SUCCESS';

alter table public.optional_provider_snapshots enable row level security;
revoke all on table public.optional_provider_snapshots from anon, authenticated;
grant select, insert, update, delete on table public.optional_provider_snapshots to service_role;

comment on table public.optional_provider_snapshots is
  'Phase 20-5 aggregate readiness and quota metadata for optional providers; never store source text, credentials or customer PII.';
