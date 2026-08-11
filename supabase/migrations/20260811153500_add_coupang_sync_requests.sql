begin;

create table if not exists public.coupang_sync_requests (
  id uuid primary key default gen_random_uuid(),
  request_type text not null check (request_type in ('FULL', 'RG_INVENTORY')),
  status text not null default 'PENDING' check (status in ('PENDING', 'RUNNING', 'SUCCESS', 'FAILED')),
  requested_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  collector text,
  result_json jsonb,
  error_message text
);

create index if not exists coupang_sync_requests_pending_idx
  on public.coupang_sync_requests(status, requested_at);

alter table public.coupang_sync_requests enable row level security;
revoke all on public.coupang_sync_requests from anon, authenticated;
grant select, insert, update, delete on public.coupang_sync_requests to service_role;

commit;
