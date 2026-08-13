begin;

create table if not exists public.product_growth_profiles (
  master_product_id uuid primary key references public.master_products(id) on delete cascade,
  product_role text not null default 'STANDARD'
    check (product_role in ('STANDARD','OPTION','BUNDLE','GIFT')),
  product_summary text not null default '',
  target_customer text not null default '',
  purchase_situations text[] not null default '{}',
  hesitation_reasons text[] not null default '{}',
  core_message text not null default '',
  prohibited_phrases text[] not null default '{}',
  usage_guide text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.product_growth_offers (
  id bigint generated always as identity primary key,
  master_product_id uuid not null references public.master_products(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  offer_type text not null check (offer_type in ('SINGLE','DOUBLE','BUNDLE','GIFT')),
  platform text not null default 'CAFE24' check (platform in ('NAVER','CAFE24','COUPANG')),
  quantity integer not null default 1 check (quantity between 1 and 100),
  list_price numeric not null default 0 check (list_price >= 0),
  sale_price numeric not null default 0 check (sale_price >= 0),
  customer_shipping_revenue numeric not null default 0 check (customer_shipping_revenue >= 0),
  shipping_cost_override numeric check (shipping_cost_override is null or shipping_cost_override >= 0),
  gift_cost numeric not null default 0 check (gift_cost >= 0),
  extra_packaging_cost numeric not null default 0 check (extra_packaging_cost >= 0),
  ad_cost_per_order numeric not null default 0 check (ad_cost_per_order >= 0),
  sort_order integer not null default 0 check (sort_order between 0 and 1000),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (master_product_id, name)
);

create index if not exists product_growth_offers_master_idx
  on public.product_growth_offers(master_product_id, sort_order, id);

create table if not exists public.product_detail_checklists (
  master_product_id uuid primary key references public.master_products(id) on delete cascade,
  items jsonb not null default '{}'::jsonb check (jsonb_typeof(items) = 'object'),
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_product_growth_profiles_updated_at on public.product_growth_profiles;
create trigger set_product_growth_profiles_updated_at before update on public.product_growth_profiles
for each row execute function public.set_updated_at();

drop trigger if exists set_product_growth_offers_updated_at on public.product_growth_offers;
create trigger set_product_growth_offers_updated_at before update on public.product_growth_offers
for each row execute function public.set_updated_at();

drop trigger if exists set_product_detail_checklists_updated_at on public.product_detail_checklists;
create trigger set_product_detail_checklists_updated_at before update on public.product_detail_checklists
for each row execute function public.set_updated_at();

alter table public.product_growth_profiles enable row level security;
alter table public.product_growth_offers enable row level security;
alter table public.product_detail_checklists enable row level security;

revoke all on table public.product_growth_profiles, public.product_growth_offers, public.product_detail_checklists
  from public, anon, authenticated;
revoke all on sequence public.product_growth_offers_id_seq from public, anon, authenticated;

grant select, insert, update, delete on table public.product_growth_profiles, public.product_growth_offers, public.product_detail_checklists
  to service_role;
grant usage, select on sequence public.product_growth_offers_id_seq to service_role;

comment on table public.product_growth_profiles is 'Server-only customer, positioning, and compliant-copy notes for the product growth center.';
comment on table public.product_growth_offers is 'Server-only single, double, bundle, and gift offer inputs for actual-profit comparisons.';
comment on table public.product_detail_checklists is 'Server-only detail-page readiness checklist for each master product.';

notify pgrst, 'reload schema';
commit;
