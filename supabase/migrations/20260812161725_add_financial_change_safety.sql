begin;

create table if not exists public.financial_change_requests (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique check (char_length(idempotency_key) between 8 and 128),
  change_type text not null check (change_type in ('PRODUCT_COST', 'CHANNEL_COST', 'SHIPPING_RULE', 'BUSINESS_TARGET')),
  target_type text not null,
  target_key text not null,
  platform text check (platform is null or platform in ('ALL', 'NAVER', 'CAFE24', 'COUPANG')),
  status text not null default 'PREVIEWED' check (status in (
    'PREVIEWED', 'APPROVED', 'EXECUTING', 'EXECUTED', 'VERIFIED',
    'VERIFICATION_FAILED', 'STALE', 'REJECTED', 'FAILED',
    'ROLLBACK_REQUESTED', 'ROLLED_BACK', 'ROLLBACK_FAILED', 'EXPIRED'
  )),
  before_value jsonb not null default '{}'::jsonb,
  proposed_value jsonb not null default '{}'::jsonb,
  impact_preview jsonb not null default '{}'::jsonb,
  rollback_value jsonb not null default '{}'::jsonb,
  preview_hash text not null,
  requested_by text not null default 'dashboard-session',
  approved_by text,
  approved_at timestamptz,
  approval_note text,
  executed_by text,
  execution_started_at timestamptz,
  executed_at timestamptz,
  verified_by text,
  verified_at timestamptz,
  verification_result jsonb,
  rolled_back_by text,
  rolled_back_at timestamptz,
  error_message text,
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.financial_change_audit_logs (
  id uuid primary key default gen_random_uuid(),
  change_request_id uuid not null references public.financial_change_requests(id) on delete cascade,
  event_type text not null,
  from_status text,
  to_status text,
  actor text not null default 'dashboard-session',
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists financial_change_requests_status_created_idx
  on public.financial_change_requests (status, created_at desc);
create index if not exists financial_change_requests_target_idx
  on public.financial_change_requests (target_type, target_key, created_at desc);
create index if not exists financial_change_audit_request_created_idx
  on public.financial_change_audit_logs (change_request_id, created_at);

drop trigger if exists financial_change_requests_set_updated_at on public.financial_change_requests;
create trigger financial_change_requests_set_updated_at
before update on public.financial_change_requests
for each row execute function public.set_updated_at();

alter table public.financial_change_requests enable row level security;
alter table public.financial_change_audit_logs enable row level security;

revoke all on public.financial_change_requests, public.financial_change_audit_logs from anon, authenticated;
revoke all on public.financial_change_requests, public.financial_change_audit_logs from service_role;
grant select, insert, update, delete on public.financial_change_requests, public.financial_change_audit_logs to service_role;

comment on table public.financial_change_requests is
  'Server-only preview, approval, execution, verification, and rollback state for monetary configuration changes.';
comment on table public.financial_change_audit_logs is
  'Append-only server audit trail for every financial change state transition.';

commit;
