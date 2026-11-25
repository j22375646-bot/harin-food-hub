create table public.cafe24_deposit_confirmations (
  order_id text primary key check (order_id ~ '^[0-9]{8}-[0-9]{7}$'),
  actor_id uuid not null,
  amount_krw bigint not null check (amount_krw > 0),
  created_at timestamptz not null default now(),
  confirmed_at timestamptz
);
alter table public.cafe24_deposit_confirmations enable row level security;
revoke all on public.cafe24_deposit_confirmations from public, anon, authenticated;
grant select, insert, update on public.cafe24_deposit_confirmations to service_role;
