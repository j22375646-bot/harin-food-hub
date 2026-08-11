begin;

create table if not exists public.coupang_products (
  id uuid primary key default gen_random_uuid(),
  seller_product_id text not null unique,
  product_id text,
  product_name text not null,
  status text,
  brand text,
  sale_started_at timestamptz,
  sale_ended_at timestamptz,
  raw_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.coupang_product_items (
  id uuid primary key default gen_random_uuid(),
  vendor_item_id text not null unique,
  seller_product_id text,
  item_name text not null,
  sale_price numeric not null default 0,
  status text,
  raw_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.coupang_orders (
  id uuid primary key default gen_random_uuid(),
  shipment_box_id text not null unique,
  order_id text not null,
  ordered_at timestamptz,
  paid_at timestamptz,
  status text,
  gross_amount numeric not null default 0,
  raw_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.coupang_order_items (
  id uuid primary key default gen_random_uuid(),
  external_item_key text not null unique,
  shipment_box_id text not null,
  order_id text not null,
  vendor_item_id text,
  seller_product_id text,
  product_name text not null,
  quantity integer not null default 0 check (quantity >= 0),
  unit_price numeric not null default 0,
  paid_amount numeric not null default 0,
  status text,
  raw_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.coupang_settlements (
  id uuid primary key default gen_random_uuid(),
  settlement_key text not null unique,
  order_id text,
  vendor_item_id text,
  sale_type text,
  recognition_date date not null,
  settlement_date date,
  sale_amount numeric not null default 0,
  service_fee numeric not null default 0,
  service_fee_vat numeric not null default 0,
  settlement_amount numeric not null default 0,
  quantity numeric not null default 0,
  raw_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists coupang_products_status_idx on public.coupang_products(status);
create index if not exists coupang_product_items_product_idx on public.coupang_product_items(seller_product_id);
create index if not exists coupang_orders_ordered_idx on public.coupang_orders(ordered_at desc);
create index if not exists coupang_orders_order_id_idx on public.coupang_orders(order_id);
create index if not exists coupang_order_items_shipment_idx on public.coupang_order_items(shipment_box_id);
create index if not exists coupang_order_items_vendor_item_idx on public.coupang_order_items(vendor_item_id);
create index if not exists coupang_settlements_recognition_idx on public.coupang_settlements(recognition_date desc);
create index if not exists coupang_settlements_order_idx on public.coupang_settlements(order_id);

drop trigger if exists coupang_products_set_updated_at on public.coupang_products;
create trigger coupang_products_set_updated_at before update on public.coupang_products for each row execute function public.set_updated_at();
drop trigger if exists coupang_product_items_set_updated_at on public.coupang_product_items;
create trigger coupang_product_items_set_updated_at before update on public.coupang_product_items for each row execute function public.set_updated_at();
drop trigger if exists coupang_orders_set_updated_at on public.coupang_orders;
create trigger coupang_orders_set_updated_at before update on public.coupang_orders for each row execute function public.set_updated_at();
drop trigger if exists coupang_order_items_set_updated_at on public.coupang_order_items;
create trigger coupang_order_items_set_updated_at before update on public.coupang_order_items for each row execute function public.set_updated_at();
drop trigger if exists coupang_settlements_set_updated_at on public.coupang_settlements;
create trigger coupang_settlements_set_updated_at before update on public.coupang_settlements for each row execute function public.set_updated_at();

alter table public.coupang_products enable row level security;
alter table public.coupang_product_items enable row level security;
alter table public.coupang_orders enable row level security;
alter table public.coupang_order_items enable row level security;
alter table public.coupang_settlements enable row level security;
revoke all on public.coupang_products, public.coupang_product_items, public.coupang_orders, public.coupang_order_items, public.coupang_settlements from anon, authenticated;
grant select, insert, update, delete on public.coupang_products, public.coupang_product_items, public.coupang_orders, public.coupang_order_items, public.coupang_settlements to service_role;

create or replace function public.qa_duplicate_counts()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'cafe24_orders', (select count(*) from (select order_id from public.cafe24_orders group by order_id having count(*) > 1) d),
    'cafe24_products', (select count(*) from (select external_product_no from public.cafe24_products group by external_product_no having count(*) > 1) d),
    'naver_keywords', (select count(*) from (select ncc_keyword_id from public.naver_keywords group by ncc_keyword_id having count(*) > 1) d),
    'naver_stats_daily', (select count(*) from (select date, entity_id, entity_type from public.naver_stats_daily group by date, entity_id, entity_type having count(*) > 1) d),
    'coupang_products', (select count(*) from (select seller_product_id from public.coupang_products group by seller_product_id having count(*) > 1) d),
    'coupang_orders', (select count(*) from (select shipment_box_id from public.coupang_orders group by shipment_box_id having count(*) > 1) d),
    'coupang_order_items', (select count(*) from (select external_item_key from public.coupang_order_items group by external_item_key having count(*) > 1) d),
    'coupang_settlements', (select count(*) from (select settlement_key from public.coupang_settlements group by settlement_key having count(*) > 1) d)
  );
$$;
revoke all on function public.qa_duplicate_counts() from public, anon, authenticated;
grant execute on function public.qa_duplicate_counts() to service_role;

commit;
