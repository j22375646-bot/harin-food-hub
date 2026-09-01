create table if not exists public.cafe24_sales_daily (
  date date not null,
  shop_no integer not null default 1 check (shop_no > 0),
  payment_amount numeric,
  refund_amount numeric,
  sales_count integer,
  source_status text not null default 'OK' check (source_status in ('OK','PARTIAL','PARSE_ERROR','NO_DATA')),
  raw_data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (date, shop_no)
);

create table if not exists public.cafe24_ad_attribution (
  period_start date not null,
  period_end date not null check (period_end >= period_start),
  shop_no integer not null default 1 check (shop_no > 0),
  dimension_type text not null check (dimension_type in ('MEDIA','KEYWORD')),
  ad text not null,
  keyword text,
  keyword_key text not null default '',
  visit_count integer,
  order_count integer,
  revenue numeric,
  join_count integer,
  purchase_rate numeric,
  ad_spend numeric,
  source_status text not null default 'OK' check (source_status in ('OK','PARTIAL','PARSE_ERROR','NO_DATA')),
  raw_data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (period_start, period_end, shop_no, dimension_type, ad, keyword_key)
);

create index if not exists cafe24_sales_daily_date_idx
  on public.cafe24_sales_daily (date desc);
create index if not exists cafe24_ad_attribution_period_idx
  on public.cafe24_ad_attribution (period_end desc, dimension_type, ad);

drop trigger if exists cafe24_sales_daily_set_updated_at on public.cafe24_sales_daily;
create trigger cafe24_sales_daily_set_updated_at
before update on public.cafe24_sales_daily
for each row execute function public.set_updated_at();

drop trigger if exists cafe24_ad_attribution_set_updated_at on public.cafe24_ad_attribution;
create trigger cafe24_ad_attribution_set_updated_at
before update on public.cafe24_ad_attribution
for each row execute function public.set_updated_at();

alter table public.cafe24_sales_daily enable row level security;
alter table public.cafe24_ad_attribution enable row level security;

revoke all on public.cafe24_sales_daily, public.cafe24_ad_attribution from anon, authenticated;
grant select, insert, update, delete on public.cafe24_sales_daily, public.cafe24_ad_attribution to service_role;

comment on table public.cafe24_sales_daily is
  'Server-only Cafe24 sales-report API snapshots. Payment/refund sales are not actual payout settlement amounts.';
comment on table public.cafe24_ad_attribution is
  'Server-only Cafe24 Analytics advertising attribution. ad_spend stays null because Cafe24 Analytics does not provide media cost.';
