-- Durable acknowledgements for read-only order collection. No customer data.
create table public.moaon_order_collection_receipts (
  id uuid primary key,
  status text not null default 'RUNNING' check (status in ('RUNNING','SETTLED','ATTENTION')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);
create index moaon_order_collection_receipts_started_idx on public.moaon_order_collection_receipts(started_at);
alter table public.moaon_order_collection_receipts enable row level security;
revoke all on table public.moaon_order_collection_receipts from public, anon, authenticated;
grant select, insert, update on table public.moaon_order_collection_receipts to service_role;
