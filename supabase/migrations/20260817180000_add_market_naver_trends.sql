begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create table if not exists public.market_naver_trend_profiles (
  project_id uuid primary key references public.market_projects(id) on delete cascade,
  master_product_id uuid not null references public.master_products(id) on delete restrict,
  topic_name text not null check (char_length(topic_name) between 1 and 120),
  keywords jsonb not null default '[]' check (jsonb_typeof(keywords) = 'array' and jsonb_array_length(keywords) between 1 and 5),
  shopping_category_code text check (shopping_category_code is null or shopping_category_code ~ '^[0-9]{8}$'),
  shopping_category_name text check (shopping_category_name is null or char_length(shopping_category_name) between 1 and 120),
  period_days integer not null default 90 check (period_days in (7,30,90,180,365)),
  time_unit text not null default 'date' check (time_unit in ('date','week','month')),
  owner_confirmed boolean not null default false,
  created_by text not null default 'OWNER' check (char_length(created_by) between 1 and 160),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.market_naver_trend_snapshots (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.market_projects(id) on delete cascade,
  master_product_id uuid not null references public.master_products(id) on delete restrict,
  profile_id uuid not null references public.market_naver_trend_profiles(project_id) on delete cascade,
  snapshot_kind text not null check (snapshot_kind in ('SEARCH_TREND','SHOPPING_KEYWORD')),
  request_fingerprint text not null check (char_length(request_fingerprint) = 64),
  topic_name text not null check (char_length(topic_name) between 1 and 120),
  keywords jsonb not null check (jsonb_typeof(keywords) = 'array' and jsonb_array_length(keywords) between 1 and 5),
  shopping_category_code text check (shopping_category_code is null or shopping_category_code ~ '^[0-9]{8}$'),
  shopping_category_name text,
  period_start date not null,
  period_end date not null check (period_end >= period_start),
  time_unit text not null check (time_unit in ('date','week','month')),
  series jsonb not null default '[]' check (jsonb_typeof(series) = 'array'),
  summary jsonb not null default '{}' check (jsonb_typeof(summary) = 'object'),
  data_status text not null check (data_status in ('READY','PARTIAL','NO_DATA')),
  source_metric text not null default 'RELATIVE_RATIO' check (source_metric = 'RELATIVE_RATIO'),
  source_endpoint text not null check (source_endpoint in ('SEARCH_TREND','SHOPPING_INSIGHT_KEYWORD')),
  owner_confirmed boolean not null default false,
  confirmed_at timestamptz,
  fetched_at timestamptz not null default now(),
  created_by text not null default 'OWNER' check (char_length(created_by) between 1 and 160),
  created_at timestamptz not null default now(),
  unique (project_id, snapshot_kind, request_fingerprint)
);

create index if not exists market_naver_trend_snapshots_project_latest_idx
  on public.market_naver_trend_snapshots (project_id, snapshot_kind, fetched_at desc);
create index if not exists market_naver_trend_snapshots_product_latest_idx
  on public.market_naver_trend_snapshots (master_product_id, snapshot_kind, fetched_at desc);

create or replace function public.check_market_naver_trend_links()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1 from public.market_projects p
    where p.id = new.project_id and p.master_product_id = new.master_product_id
  ) then raise exception 'market NAVER trend product does not match project'; end if;
  if tg_table_name = 'market_naver_trend_snapshots' and new.profile_id <> new.project_id then
    raise exception 'market NAVER trend profile does not match project';
  end if;
  return new;
end;
$$;

drop trigger if exists check_market_naver_trend_profile_links on public.market_naver_trend_profiles;
create trigger check_market_naver_trend_profile_links before insert or update on public.market_naver_trend_profiles
for each row execute function public.check_market_naver_trend_links();
drop trigger if exists check_market_naver_trend_snapshot_links on public.market_naver_trend_snapshots;
create trigger check_market_naver_trend_snapshot_links before insert or update on public.market_naver_trend_snapshots
for each row execute function public.check_market_naver_trend_links();

drop trigger if exists market_naver_trend_profiles_set_updated_at on public.market_naver_trend_profiles;
create trigger market_naver_trend_profiles_set_updated_at before update on public.market_naver_trend_profiles
for each row execute function public.set_updated_at();

alter table public.market_naver_trend_profiles enable row level security;
alter table public.market_naver_trend_snapshots enable row level security;
revoke all on table public.market_naver_trend_profiles from public, anon, authenticated;
revoke all on table public.market_naver_trend_snapshots from public, anon, authenticated;
grant select, insert, update, delete on table public.market_naver_trend_profiles to service_role;
grant select, insert, update, delete on table public.market_naver_trend_snapshots to service_role;
revoke all on function public.check_market_naver_trend_links() from public, anon, authenticated;
grant execute on function public.check_market_naver_trend_links() to service_role;

comment on table public.market_naver_trend_profiles is
  'Owner-selected NAVER API HUB trend settings isolated by market project and master product.';
comment on table public.market_naver_trend_snapshots is
  'Normalized product-specific NAVER Search Trend and Shopping Insight relative-ratio snapshots. Missing periods are never stored as zero.';
comment on column public.market_naver_trend_snapshots.source_metric is
  'NAVER relative ratio with section maximum 100; it is not absolute search or click volume.';

notify pgrst, 'reload schema';
commit;
