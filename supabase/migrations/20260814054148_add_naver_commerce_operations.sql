begin;

create table if not exists public.naver_commerce_orders (
  order_id text primary key,
  order_date timestamptz,
  payment_date timestamptz,
  status text,
  paid_amount numeric not null default 0,
  receiver_name text,
  receiver_phone text,
  receiver_address text,
  shipping_memo text,
  shipment_id text,
  invoice_no text,
  delivery_company text,
  raw_data jsonb not null default '{}'::jsonb,
  collected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.naver_commerce_order_items (
  product_order_id text primary key,
  order_id text not null references public.naver_commerce_orders(order_id) on delete cascade,
  product_id text,
  original_product_id text,
  product_name text not null,
  option_name text,
  quantity integer not null default 0,
  unit_price numeric not null default 0,
  paid_amount numeric not null default 0,
  status text,
  shipping_due_date timestamptz,
  raw_data jsonb not null default '{}'::jsonb,
  collected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.naver_commerce_settlements (
  settlement_key text primary key,
  settle_basis_start_date date,
  settle_basis_end_date date,
  settle_expect_date date,
  settle_complete_date date,
  settle_amount numeric not null default 0,
  pay_settle_amount numeric not null default 0,
  commission_settle_amount numeric not null default 0,
  benefit_settle_amount numeric not null default 0,
  deduction_restore_settle_amount numeric not null default 0,
  pay_holdback_amount numeric not null default 0,
  difference_settle_amount numeric not null default 0,
  raw_data jsonb not null default '{}'::jsonb,
  collected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists naver_commerce_orders_date_idx
  on public.naver_commerce_orders(order_date desc);
create index if not exists naver_commerce_orders_status_idx
  on public.naver_commerce_orders(status, order_date desc);
create index if not exists naver_commerce_order_items_order_idx
  on public.naver_commerce_order_items(order_id);
create index if not exists naver_commerce_order_items_product_idx
  on public.naver_commerce_order_items(product_id);
create index if not exists naver_commerce_settlements_date_idx
  on public.naver_commerce_settlements(settle_complete_date desc, settle_expect_date desc);

drop trigger if exists naver_commerce_orders_set_updated_at on public.naver_commerce_orders;
create trigger naver_commerce_orders_set_updated_at
before update on public.naver_commerce_orders for each row execute function public.set_updated_at();
drop trigger if exists naver_commerce_order_items_set_updated_at on public.naver_commerce_order_items;
create trigger naver_commerce_order_items_set_updated_at
before update on public.naver_commerce_order_items for each row execute function public.set_updated_at();
drop trigger if exists naver_commerce_settlements_set_updated_at on public.naver_commerce_settlements;
create trigger naver_commerce_settlements_set_updated_at
before update on public.naver_commerce_settlements for each row execute function public.set_updated_at();

alter table public.naver_commerce_orders enable row level security;
alter table public.naver_commerce_order_items enable row level security;
alter table public.naver_commerce_settlements enable row level security;

revoke all on public.naver_commerce_orders, public.naver_commerce_order_items,
  public.naver_commerce_settlements from public, anon, authenticated;
grant select, insert, update, delete on public.naver_commerce_orders,
  public.naver_commerce_order_items, public.naver_commerce_settlements to service_role;

comment on table public.naver_commerce_orders is
  'Server-only Naver Commerce seller order snapshots collected through the fixed-IP worker.';
comment on table public.naver_commerce_order_items is
  'Server-only Naver Commerce product-order details. Customer delivery fields remain in protected raw_data.';
comment on table public.naver_commerce_settlements is
  'Server-only Naver Commerce daily settlement records.';

notify pgrst, 'reload schema';
commit;
