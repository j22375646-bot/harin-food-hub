create table if not exists public.owned_site_api_snapshots (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('SEARCH_CONSOLE','GA4','PAGESPEED','CRUX')),
  site_url text not null check (length(site_url) between 4 and 500),
  status text not null check (status in ('SUCCESS','NO_DATA','FAILED')),
  metric_summary jsonb not null default '{}'::jsonb check (jsonb_typeof(metric_summary) = 'object'),
  quota_summary jsonb not null default '{}'::jsonb check (jsonb_typeof(quota_summary) = 'object'),
  source_timestamp timestamptz,
  fetched_at timestamptz not null default now(),
  error_code text,
  error_message text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create index if not exists owned_site_api_snapshots_provider_fetched_idx
  on public.owned_site_api_snapshots(provider, fetched_at desc);
create index if not exists owned_site_api_snapshots_success_idx
  on public.owned_site_api_snapshots(provider, fetched_at desc)
  where status = 'SUCCESS';

alter table public.owned_site_api_snapshots enable row level security;
revoke all on table public.owned_site_api_snapshots from anon, authenticated;
grant select, insert, update, delete on table public.owned_site_api_snapshots to service_role;

comment on table public.owned_site_api_snapshots is
  'Phase 19-1 aggregated owned-site API diagnostics only; never store customer or visitor identifiers.';
