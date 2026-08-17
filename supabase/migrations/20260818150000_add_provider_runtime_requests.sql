-- Phase 20-6: provider-separated request cache, deduplication and fallback ledger.
create table if not exists public.provider_request_runs (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider ~ '^[A-Z0-9_]{2,80}$'),
  request_hash text not null check (request_hash ~ '^[a-f0-9]{64}$'),
  status text not null check (status in ('RUNNING','SUCCESS','NO_DATA','FAILED','CACHED','DEDUPLICATED','STALE_FALLBACK')),
  response_summary jsonb not null default '{}'::jsonb,
  quota_summary jsonb not null default '{}'::jsonb,
  source_timestamp timestamptz,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  expires_at timestamptz,
  parent_run_id uuid references public.provider_request_runs(id) on delete set null,
  error_code text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists provider_request_runs_active_unique
  on public.provider_request_runs(provider,request_hash)
  where status='RUNNING';
create index if not exists provider_request_runs_provider_recent_idx
  on public.provider_request_runs(provider,created_at desc);
create index if not exists provider_request_runs_cache_idx
  on public.provider_request_runs(provider,request_hash,expires_at desc)
  where status in ('SUCCESS','NO_DATA');

alter table public.provider_request_runs enable row level security;
revoke all on table public.provider_request_runs from public,anon,authenticated;
grant select,insert,update,delete on table public.provider_request_runs to service_role;

comment on table public.provider_request_runs is
  'Phase 20-6 provider-isolated request runtime ledger. Stores hashes and normalized non-PII summaries only; server service role access only.';
