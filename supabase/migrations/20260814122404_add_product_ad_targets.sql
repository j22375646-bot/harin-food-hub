begin;

create table if not exists public.product_ad_targets (
  master_product_id uuid primary key references public.master_products(id) on delete cascade,
  target_profit_margin_rate numeric not null check (target_profit_margin_rate >= 0 and target_profit_margin_rate < 100),
  notes text,
  formula_version text not null default 'n1-product-target-v1',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_product_ad_targets_updated_at on public.product_ad_targets;
create trigger set_product_ad_targets_updated_at before update on public.product_ad_targets
for each row execute function public.set_updated_at();

alter table public.product_ad_targets enable row level security;
revoke all on public.product_ad_targets from anon, authenticated;
grant select, insert, update, delete on public.product_ad_targets to service_role;

comment on table public.product_ad_targets is 'Server-only per-product profit targets used to calculate ROAS, CPA, and CPC safety limits.';
comment on column public.product_ad_targets.target_profit_margin_rate is 'Desired contribution profit margin after advertising, expressed as a percentage.';

commit;
