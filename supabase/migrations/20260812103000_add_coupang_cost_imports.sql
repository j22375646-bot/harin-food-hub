begin;

create table if not exists public.coupang_cost_imports (
  id uuid primary key default gen_random_uuid(),
  file_hash text not null unique,
  file_name text not null,
  source_types text[] not null default '{}',
  status text not null check (status in ('SUCCESS', 'PARTIAL', 'FAILED')),
  input_rows integer not null default 0,
  stored_rows integer not null default 0,
  duplicate_rows integer not null default 0,
  invalid_rows integer not null default 0,
  gross_sales numeric not null default 0,
  cost_amount numeric not null default 0,
  cost_vat numeric not null default 0,
  credit_amount numeric not null default 0,
  period_start date,
  period_end date,
  metadata jsonb not null default '{}'::jsonb,
  imported_at timestamptz not null default now()
);

create table if not exists public.coupang_cost_transactions (
  id uuid primary key default gen_random_uuid(),
  transaction_key text not null unique,
  import_id uuid references public.coupang_cost_imports(id) on delete set null,
  source_type text not null,
  transaction_type text not null,
  event_date date,
  recognition_date date,
  settlement_end_date date,
  order_id text,
  reference_id text,
  seller_product_id text,
  vendor_item_id text,
  sku_id text,
  product_name text,
  option_name text,
  quantity numeric not null default 0,
  gross_sales numeric not null default 0,
  seller_discount numeric not null default 0,
  settlement_target numeric not null default 0,
  cost_amount numeric not null default 0,
  cost_vat numeric not null default 0,
  credit_amount numeric not null default 0,
  raw_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists coupang_cost_transactions_event_idx on public.coupang_cost_transactions(event_date desc);
create index if not exists coupang_cost_transactions_recognition_idx on public.coupang_cost_transactions(recognition_date desc);
create index if not exists coupang_cost_transactions_order_idx on public.coupang_cost_transactions(order_id);
create index if not exists coupang_cost_transactions_vendor_item_idx on public.coupang_cost_transactions(vendor_item_id);
create index if not exists coupang_cost_transactions_source_idx on public.coupang_cost_transactions(source_type);

drop trigger if exists coupang_cost_transactions_set_updated_at on public.coupang_cost_transactions;
create trigger coupang_cost_transactions_set_updated_at before update on public.coupang_cost_transactions
for each row execute function public.set_updated_at();

alter table public.coupang_cost_imports enable row level security;
alter table public.coupang_cost_transactions enable row level security;
revoke all on public.coupang_cost_imports, public.coupang_cost_transactions from anon, authenticated;
grant select, insert, update, delete on public.coupang_cost_imports, public.coupang_cost_transactions to service_role;

commit;
