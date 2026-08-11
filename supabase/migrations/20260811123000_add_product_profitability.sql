begin;

create table if not exists public.product_costs (
  id uuid primary key default gen_random_uuid(),
  master_product_id uuid not null unique references public.master_products(id) on delete cascade,
  unit_cost numeric not null default 0 check (unit_cost >= 0),
  packaging_cost numeric not null default 0 check (packaging_cost >= 0),
  other_unit_cost numeric not null default 0 check (other_unit_cost >= 0),
  notes text,
  effective_from date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.channel_cost_settings (
  platform text primary key check (platform in ('NAVER','CAFE24','COUPANG')),
  commission_rate numeric not null default 0 check (commission_rate between 0 and 1),
  payment_fee_rate numeric not null default 0 check (payment_fee_rate between 0 and 1),
  default_shipping_cost numeric not null default 0 check (default_shipping_cost >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.channel_cost_settings(platform)
values ('CAFE24'), ('NAVER'), ('COUPANG')
on conflict (platform) do nothing;

drop trigger if exists set_product_costs_updated_at on public.product_costs;
create trigger set_product_costs_updated_at before update on public.product_costs
for each row execute function public.set_updated_at();
drop trigger if exists set_channel_cost_settings_updated_at on public.channel_cost_settings;
create trigger set_channel_cost_settings_updated_at before update on public.channel_cost_settings
for each row execute function public.set_updated_at();

alter table public.product_costs enable row level security;
alter table public.channel_cost_settings enable row level security;
revoke all on public.product_costs, public.channel_cost_settings from anon, authenticated;
grant select, insert, update, delete on public.product_costs, public.channel_cost_settings to service_role;

comment on table public.product_costs is 'Server-only per-unit product costs used for contribution-profit calculations.';
comment on table public.channel_cost_settings is 'Server-only channel fee and fulfillment assumptions used for profitability calculations.';

commit;
