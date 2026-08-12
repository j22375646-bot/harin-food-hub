begin;

create table if not exists public.channel_cost_calibrations (
  id uuid primary key default gen_random_uuid(),
  snapshot_key text not null unique,
  platform text not null check (platform in ('NAVER', 'CAFE24', 'COUPANG')),
  trigger_type text not null check (trigger_type in ('DASHBOARD', 'COST_IMPORT', 'API_SYNC', 'MANUAL_APPLY')),
  status text not null check (status in ('ACTIVE', 'SUPERSEDED', 'INSUFFICIENT')),
  confidence text not null check (confidence in ('HIGH', 'MEDIUM', 'LOW')),
  period_start date,
  period_end date,
  commission_source text,
  commission_order_count integer not null default 0 check (commission_order_count >= 0),
  net_sales numeric not null default 0,
  actual_commission_rate numeric check (actual_commission_rate between 0 and 1),
  logistics_source text,
  logistics_order_count integer not null default 0 check (logistics_order_count >= 0),
  actual_shipping_cost numeric check (actual_shipping_cost >= 0),
  assumed_commission_rate numeric not null default 0 check (assumed_commission_rate between 0 and 1),
  assumed_payment_fee_rate numeric not null default 0 check (assumed_payment_fee_rate between 0 and 1),
  assumed_shipping_cost numeric not null default 0 check (assumed_shipping_cost >= 0),
  calculation jsonb not null default '{}'::jsonb,
  applied_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists channel_cost_calibrations_platform_created_idx
  on public.channel_cost_calibrations(platform, created_at desc);
create index if not exists channel_cost_calibrations_active_idx
  on public.channel_cost_calibrations(platform, status)
  where status = 'ACTIVE';

alter table public.channel_cost_calibrations enable row level security;
revoke all on public.channel_cost_calibrations from anon, authenticated;
grant select, insert, update, delete on public.channel_cost_calibrations to service_role;

comment on table public.channel_cost_calibrations is
  'Server-only audit snapshots for actual settlement based channel cost calibration.';

commit;
