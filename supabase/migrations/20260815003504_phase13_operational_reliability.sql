begin;

create table if not exists public.worker_heartbeats (
  worker_id text primary key,
  service_name text not null,
  collector text not null,
  status text not null default 'ONLINE' check (status in ('ONLINE','BUSY','ERROR','STOPPING')),
  source_ip text,
  current_job_type text,
  current_job_id uuid,
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_success_at timestamptz,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists worker_heartbeats_last_seen_idx
  on public.worker_heartbeats(last_seen_at desc);

alter table public.worker_heartbeats enable row level security;
revoke all on public.worker_heartbeats from public, anon, authenticated;
grant select, insert, update, delete on public.worker_heartbeats to service_role;

create table if not exists public.external_call_guards (
  guard_key text primary key,
  provider text not null,
  operation text not null,
  status text not null default 'RUNNING' check (status in ('RUNNING','SUCCESS','FAILED')),
  claimed_at timestamptz not null default now(),
  expires_at timestamptz not null,
  completed_at timestamptz,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists external_call_guards_expiry_idx
  on public.external_call_guards(expires_at);

alter table public.external_call_guards enable row level security;
revoke all on public.external_call_guards from public, anon, authenticated;
grant select, insert, update, delete on public.external_call_guards to service_role;

create or replace function public.claim_external_call_guard(
  p_guard_key text,
  p_provider text,
  p_operation text,
  p_ttl_seconds integer default 120
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_claimed text;
begin
  insert into public.external_call_guards (
    guard_key, provider, operation, status, claimed_at, expires_at,
    completed_at, error_message, updated_at
  ) values (
    p_guard_key, p_provider, p_operation, 'RUNNING', now(),
    now() + make_interval(secs => greatest(30, least(coalesce(p_ttl_seconds, 120), 3600))),
    null, null, now()
  )
  on conflict (guard_key) do update
  set provider = excluded.provider,
      operation = excluded.operation,
      status = 'RUNNING',
      claimed_at = now(),
      expires_at = excluded.expires_at,
      completed_at = null,
      error_message = null,
      updated_at = now()
  where public.external_call_guards.expires_at <= now()
     or public.external_call_guards.status = 'FAILED'
  returning guard_key into v_claimed;

  return v_claimed is not null;
end;
$$;

revoke all on function public.claim_external_call_guard(text, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.claim_external_call_guard(text, text, text, integer)
  to service_role;

alter table public.coupang_operation_requests
  add column if not exists dead_lettered_at timestamptz,
  add column if not exists manual_retry_count integer not null default 0 check (manual_retry_count >= 0),
  add column if not exists retry_requested_by text;

alter table public.coupang_sync_requests
  add column if not exists dead_lettered_at timestamptz,
  add column if not exists manual_retry_count integer not null default 0 check (manual_retry_count >= 0),
  add column if not exists retry_requested_by text;

create index if not exists coupang_operation_requests_dead_letter_idx
  on public.coupang_operation_requests(dead_lettered_at desc)
  where status = 'FAILED';

create index if not exists coupang_sync_requests_dead_letter_idx
  on public.coupang_sync_requests(dead_lettered_at desc)
  where status = 'FAILED';

comment on table public.worker_heartbeats is
  'Server-only liveness records for fixed-IP collectors. A 15-minute silence is an operational alert.';
comment on table public.external_call_guards is
  'Server-only short leases that prevent concurrent duplicate provider calls with monetary cost.';

commit;
