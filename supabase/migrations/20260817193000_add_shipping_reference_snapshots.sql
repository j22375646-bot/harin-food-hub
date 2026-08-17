create table if not exists public.shipping_reference_snapshots (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('HOLIDAY_CALENDAR','ROAD_ADDRESS')),
  status text not null check (status in ('SUCCESS','NO_DATA','FAILED')),
  reference_year integer check (reference_year is null or reference_year between 2020 and 2100),
  metric_summary jsonb not null default '{}'::jsonb check (jsonb_typeof(metric_summary) = 'object'),
  source_data jsonb not null default '{}'::jsonb check (jsonb_typeof(source_data) = 'object'),
  source_timestamp timestamptz,
  fetched_at timestamptz not null default now(),
  error_code text,
  error_message text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  constraint shipping_reference_address_source_empty check (
    provider <> 'ROAD_ADDRESS' or source_data = '{}'::jsonb
  )
);

create index if not exists shipping_reference_snapshots_provider_fetched_idx
  on public.shipping_reference_snapshots(provider, fetched_at desc);
create index if not exists shipping_reference_snapshots_calendar_success_idx
  on public.shipping_reference_snapshots(provider, reference_year, fetched_at desc)
  where provider = 'HOLIDAY_CALENDAR' and status = 'SUCCESS';

alter table public.shipping_reference_snapshots enable row level security;
revoke all on table public.shipping_reference_snapshots from anon, authenticated;
grant select, insert, update, delete on table public.shipping_reference_snapshots to service_role;

comment on table public.shipping_reference_snapshots is
  'Phase 19-3 public holiday data and address lookup status only. Never store customer names, phone numbers, raw addresses, or address candidates.';
comment on column public.shipping_reference_snapshots.source_data is
  'Holiday calendar entries only. ROAD_ADDRESS rows are constrained to an empty object.';
