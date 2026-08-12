begin;

alter table public.coupang_operation_requests
  drop constraint if exists coupang_operation_requests_status_check;

alter table public.coupang_operation_requests
  add constraint coupang_operation_requests_status_check
  check (status in ('PENDING','RUNNING','EXECUTING','SUCCESS','FAILED','CANCELLED'));

alter table public.coupang_operation_requests
  add column if not exists collector text,
  add column if not exists started_at timestamptz,
  add column if not exists attempt_count integer not null default 0,
  add column if not exists next_attempt_at timestamptz,
  add column if not exists expires_at timestamptz,
  add column if not exists idempotency_key text;

create index if not exists coupang_operation_requests_queue_idx
  on public.coupang_operation_requests(status, next_attempt_at, created_at);

create unique index if not exists coupang_operation_requests_idempotency_idx
  on public.coupang_operation_requests(idempotency_key)
  where idempotency_key is not null;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'coupang_operation_requests'
  ) then
    alter publication supabase_realtime add table public.coupang_operation_requests;
  end if;
end $$;

comment on column public.coupang_operation_requests.payload is
  'AES-256-GCM envelope only for fixed-IP worker operations; never store plaintext customer or CS data.';
comment on column public.coupang_operation_requests.result_json is
  'AES-256-GCM envelope only; dashboard decrypts server-side with the service secret.';

commit;
