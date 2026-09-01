begin;

create table if not exists public.rocket_growth_destinations (
  id uuid primary key default gen_random_uuid(),
  center_code text not null unique check (center_code ~ '^[A-Z0-9_-]{2,30}$'),
  label text not null,
  receiver_encrypted jsonb not null,
  source text not null default 'MANUAL' check (source in ('MANUAL','COUPANG_API_HINT')),
  is_active boolean not null default true,
  last_verified_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rocket_growth_inbound_shipments (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null,
  shipment_reference text not null unique check (shipment_reference ~ '^RGI-[A-F0-9]{12}$'),
  destination_id uuid not null references public.rocket_growth_destinations(id),
  destination_code text not null,
  vendor_item_id text not null,
  external_sku_id text,
  product_name text not null,
  quantity integer not null check (quantity between 1 and 99999),
  weight integer not null check (weight between 1 and 30),
  volume integer not null check (volume between 1 and 160),
  status text not null default 'QUEUED' check (status in ('QUEUED','ISSUING','ISSUED','FAILED')),
  operation_request_id uuid references public.coupang_operation_requests(id),
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists rocket_growth_inbound_shipments_batch_idx
  on public.rocket_growth_inbound_shipments(batch_id, created_at desc);
create index if not exists rocket_growth_inbound_shipments_destination_idx
  on public.rocket_growth_inbound_shipments(destination_id, created_at desc);

drop trigger if exists rocket_growth_destinations_set_updated_at on public.rocket_growth_destinations;
create trigger rocket_growth_destinations_set_updated_at
  before update on public.rocket_growth_destinations
  for each row execute function public.set_updated_at();

drop trigger if exists rocket_growth_inbound_shipments_set_updated_at on public.rocket_growth_inbound_shipments;
create trigger rocket_growth_inbound_shipments_set_updated_at
  before update on public.rocket_growth_inbound_shipments
  for each row execute function public.set_updated_at();

alter table public.rocket_growth_destinations enable row level security;
alter table public.rocket_growth_inbound_shipments enable row level security;
revoke all on public.rocket_growth_destinations, public.rocket_growth_inbound_shipments from anon, authenticated;
grant select, insert, update, delete on public.rocket_growth_destinations, public.rocket_growth_inbound_shipments to service_role;

comment on column public.rocket_growth_destinations.receiver_encrypted is
  'Service-role-only AES-GCM envelope containing the ePost receiver name, phone and address.';

commit;
