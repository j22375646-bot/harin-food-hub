create table if not exists public.inventory_lots (
  id uuid primary key default gen_random_uuid(),
  platform text not null default 'COUPANG' check (platform = 'COUPANG'),
  vendor_item_id text not null,
  lot_code text not null,
  received_on date,
  manufactured_on date,
  expires_on date not null,
  quantity integer not null default 0 check (quantity >= 0),
  status text not null default 'ACTIVE' check (status in ('ACTIVE','USED','DISCARDED')),
  notes text,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (platform, vendor_item_id, lot_code)
);

create index if not exists inventory_lots_active_expiry_idx
  on public.inventory_lots (expires_on, vendor_item_id)
  where status = 'ACTIVE';

create index if not exists inventory_lots_vendor_item_idx
  on public.inventory_lots (vendor_item_id, updated_at desc);

drop trigger if exists inventory_lots_set_updated_at on public.inventory_lots;
create trigger inventory_lots_set_updated_at
before update on public.inventory_lots
for each row execute function public.set_updated_at();

alter table public.inventory_lots enable row level security;
revoke all on table public.inventory_lots from public, anon, authenticated;
grant select, insert, update, delete on table public.inventory_lots to service_role;

comment on table public.inventory_lots is
  'Owner-maintained expiry and receiving lots for currently sold Coupang Rocket Growth SKUs. Not sourced from Coupang inventory API.';
