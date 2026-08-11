begin;

create table if not exists public.coupang_rg_inventory (
  id uuid primary key default gen_random_uuid(),
  vendor_item_id text not null unique,
  external_sku_id text,
  total_orderable_quantity integer not null default 0 check (total_orderable_quantity >= 0),
  sales_last_30_days integer not null default 0 check (sales_last_30_days >= 0),
  average_daily_sales numeric not null default 0 check (average_daily_sales >= 0),
  days_of_stock numeric,
  stock_status text not null default 'UNKNOWN' check (stock_status in ('OUT_OF_STOCK','CRITICAL','LOW','HEALTHY','OVERSTOCK','UNKNOWN')),
  raw_data jsonb not null default '{}'::jsonb,
  snapshot_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.coupang_rg_inventory_daily (
  id uuid primary key default gen_random_uuid(),
  snapshot_date date not null,
  vendor_item_id text not null,
  external_sku_id text,
  total_orderable_quantity integer not null default 0 check (total_orderable_quantity >= 0),
  sales_last_30_days integer not null default 0 check (sales_last_30_days >= 0),
  average_daily_sales numeric not null default 0 check (average_daily_sales >= 0),
  days_of_stock numeric,
  stock_status text not null default 'UNKNOWN' check (stock_status in ('OUT_OF_STOCK','CRITICAL','LOW','HEALTHY','OVERSTOCK','UNKNOWN')),
  raw_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(snapshot_date, vendor_item_id)
);

create index if not exists coupang_rg_inventory_status_idx on public.coupang_rg_inventory(stock_status, days_of_stock);
create index if not exists coupang_rg_inventory_daily_date_idx on public.coupang_rg_inventory_daily(snapshot_date desc);
create index if not exists coupang_rg_inventory_daily_item_idx on public.coupang_rg_inventory_daily(vendor_item_id, snapshot_date desc);

drop trigger if exists coupang_rg_inventory_set_updated_at on public.coupang_rg_inventory;
create trigger coupang_rg_inventory_set_updated_at before update on public.coupang_rg_inventory for each row execute function public.set_updated_at();

alter table public.coupang_rg_inventory enable row level security;
alter table public.coupang_rg_inventory_daily enable row level security;
revoke all on public.coupang_rg_inventory, public.coupang_rg_inventory_daily from anon, authenticated;
grant select, insert, update, delete on public.coupang_rg_inventory, public.coupang_rg_inventory_daily to service_role;

commit;
