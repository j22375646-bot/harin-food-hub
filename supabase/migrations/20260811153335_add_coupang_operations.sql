begin;

create table if not exists public.coupang_rg_orders (
  id uuid primary key default gen_random_uuid(), order_id text not null unique,
  status text, paid_at timestamptz, shipped_at timestamptz, total_amount numeric not null default 0,
  item_count integer not null default 0, raw_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.coupang_rg_order_items (
  id uuid primary key default gen_random_uuid(), external_item_key text not null unique,
  order_id text not null, vendor_item_id text, external_sku_id text, product_name text,
  quantity integer not null default 0, amount numeric not null default 0,
  raw_data jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.coupang_returns (
  id uuid primary key default gen_random_uuid(), receipt_id text not null unique, order_id text,
  status text, cancel_type text, reason_code text, reason_text text, fault_type text,
  requested_at timestamptz, amount numeric not null default 0, raw_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.coupang_exchanges (
  id uuid primary key default gen_random_uuid(), exchange_id text not null unique, order_id text,
  status text, reason_code text, reason_text text, fault_type text, requested_at timestamptz,
  amount numeric not null default 0, item_count integer not null default 0,
  raw_data jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.coupang_inquiries (
  id uuid primary key default gen_random_uuid(), inquiry_key text not null unique,
  inquiry_type text not null check (inquiry_type in ('ONLINE','CALL_CENTER')), inquiry_id text not null,
  status text, answered boolean not null default false, product_id text, seller_product_id text,
  vendor_item_id text, order_id text, inquired_at timestamptz,
  raw_data jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.coupang_item_inventory (
  id uuid primary key default gen_random_uuid(), vendor_item_id text not null unique,
  quantity integer not null default 0, sale_price numeric not null default 0, original_price numeric not null default 0,
  status text, external_sku_id text, raw_data jsonb not null default '{}'::jsonb,
  checked_at timestamptz not null default now(), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.coupang_settlement_summaries (
  id uuid primary key default gen_random_uuid(), summary_key text not null unique,
  recognition_month text not null, settlement_type text, settlement_date date, status text,
  total_sale numeric not null default 0, service_fee numeric not null default 0,
  settlement_target_amount numeric not null default 0, final_amount numeric not null default 0,
  seller_discount_coupon numeric not null default 0, downloadable_coupon numeric not null default 0,
  raw_data jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.coupang_shipping_centers (
  id uuid primary key default gen_random_uuid(), center_key text not null unique,
  center_type text not null check (center_type in ('OUTBOUND','RETURN')), center_code text,
  center_name text, usable boolean, raw_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.coupang_promotion_budgets (
  id uuid primary key default gen_random_uuid(), budget_key text not null unique,
  contract_id text, status text, budget_amount numeric not null default 0,
  used_amount numeric not null default 0, remaining_amount numeric not null default 0,
  raw_data jsonb not null default '{}'::jsonb, checked_at timestamptz not null default now(),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.coupang_brands (
  id uuid primary key default gen_random_uuid(), brand_id text not null unique, name text,
  status text, raw_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.coupang_api_capabilities (
  id uuid primary key default gen_random_uuid(), feature_key text not null unique, family text not null,
  title text not null, method text not null, endpoint text not null, mode text not null,
  status text not null, risk_level text not null, sync_frequency text, updated_at timestamptz not null default now()
);

create index if not exists coupang_rg_orders_paid_idx on public.coupang_rg_orders(paid_at desc);
create index if not exists coupang_returns_status_idx on public.coupang_returns(status, requested_at desc);
create index if not exists coupang_exchanges_status_idx on public.coupang_exchanges(status, requested_at desc);
create index if not exists coupang_inquiries_status_idx on public.coupang_inquiries(answered, inquired_at desc);
create index if not exists coupang_item_inventory_status_idx on public.coupang_item_inventory(status, quantity);
create index if not exists coupang_settlement_summaries_month_idx on public.coupang_settlement_summaries(recognition_month desc);

do $$ declare t text; begin foreach t in array array['coupang_rg_orders','coupang_rg_order_items','coupang_returns','coupang_exchanges','coupang_inquiries','coupang_item_inventory','coupang_settlement_summaries','coupang_shipping_centers','coupang_promotion_budgets','coupang_brands'] loop
  execute format('drop trigger if exists %I_set_updated_at on public.%I', t, t);
  execute format('create trigger %I_set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t, t);
end loop; end $$;

alter table public.coupang_rg_orders enable row level security;
alter table public.coupang_rg_order_items enable row level security;
alter table public.coupang_returns enable row level security;
alter table public.coupang_exchanges enable row level security;
alter table public.coupang_inquiries enable row level security;
alter table public.coupang_item_inventory enable row level security;
alter table public.coupang_settlement_summaries enable row level security;
alter table public.coupang_shipping_centers enable row level security;
alter table public.coupang_promotion_budgets enable row level security;
alter table public.coupang_brands enable row level security;
alter table public.coupang_api_capabilities enable row level security;
revoke all on public.coupang_rg_orders, public.coupang_rg_order_items, public.coupang_returns, public.coupang_exchanges, public.coupang_inquiries, public.coupang_item_inventory, public.coupang_settlement_summaries, public.coupang_shipping_centers, public.coupang_promotion_budgets, public.coupang_brands, public.coupang_api_capabilities from anon, authenticated;
grant select, insert, update, delete on public.coupang_rg_orders, public.coupang_rg_order_items, public.coupang_returns, public.coupang_exchanges, public.coupang_inquiries, public.coupang_item_inventory, public.coupang_settlement_summaries, public.coupang_shipping_centers, public.coupang_promotion_budgets, public.coupang_brands, public.coupang_api_capabilities to service_role;

insert into public.coupang_api_capabilities(feature_key,family,title,method,endpoint,mode,status,risk_level,sync_frequency) values
('rg_inventory','Rocket Growth','로켓그로스 재고','GET','/rg/inventory/summaries','AUTO','ACTIVE','READ_ONLY','5분 수동/매일'),
('rg_orders','Rocket Growth','로켓그로스 주문','GET','/rg/orders','AUTO','ACTIVE','READ_ONLY','매일'),
('marketplace_orders','배송/주문','일반 주문·배송','GET','/ordersheets','AUTO','ACTIVE','READ_ONLY','매일'),
('products','상품','상품 목록·상태','GET','/seller-products','AUTO','ACTIVE','READ_ONLY','매일'),
('item_inventory','상품','아이템 수량·가격·상태','GET','/vendor-items/{id}/inventories','AUTO','ACTIVE','READ_ONLY','매일'),
('returns','반품','반품·취소 요청','GET','/returnRequests','AUTO','ACTIVE','READ_ONLY','매일'),
('exchanges','교환','교환 요청','GET','/exchangeRequests','AUTO','ACTIVE','READ_ONLY','매일'),
('inquiries','고객문의','상품·고객센터 문의','GET','/onlineInquiries','AUTO','ACTIVE','READ_ONLY','매일'),
('settlements','정산','매출·지급 예정액','GET','/settlement-histories','AUTO','ACTIVE','READ_ONLY','매일'),
('shipping_centers','물류','출고지·반품지','GET','/shipping-place','AUTO','ACTIVE','READ_ONLY','주간'),
('promotion_budget','프로모션','계약·예산 현황','GET','/budgets','AUTO','ACTIVE','READ_ONLY','매일'),
('brands','브랜드','등록 브랜드','GET','/brands/enrolled','AUTO','ACTIVE','READ_ONLY','주간'),
('price_change','상품','가격 변경','PUT','/vendor-items/{id}/prices/{price}','APPROVAL','GATED','HIGH','수동'),
('quantity_change','상품','재고수량 변경','PUT','/vendor-items/{id}/quantities/{quantity}','APPROVAL','GATED','HIGH','수동'),
('shipping_action','배송/주문','상품준비·송장·취소 처리','POST','/orders/*','APPROVAL','GATED','HIGH','수동'),
('return_action','반품/교환','반품·교환 처리','PATCH','/returnRequests/*','APPROVAL','GATED','HIGH','수동'),
('coupon_action','프로모션','쿠폰 생성·파기','POST','/coupons','APPROVAL','GATED','HIGH','수동')
on conflict(feature_key) do update set family=excluded.family,title=excluded.title,method=excluded.method,endpoint=excluded.endpoint,mode=excluded.mode,status=excluded.status,risk_level=excluded.risk_level,sync_frequency=excluded.sync_frequency,updated_at=now();

commit;
