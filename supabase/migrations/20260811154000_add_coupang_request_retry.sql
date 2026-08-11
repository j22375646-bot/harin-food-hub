begin;

alter table public.coupang_sync_requests
  add column if not exists attempt_count integer not null default 0,
  add column if not exists next_attempt_at timestamptz;

drop index if exists public.coupang_sync_requests_pending_idx;
create index coupang_sync_requests_pending_idx
  on public.coupang_sync_requests(status, next_attempt_at, requested_at);

commit;
