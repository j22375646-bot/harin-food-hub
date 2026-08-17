begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create table if not exists public.market_naver_ad_research_profiles (
  project_id uuid primary key references public.market_projects(id) on delete cascade,
  master_product_id uuid not null references public.master_products(id) on delete restrict,
  seed_keywords jsonb not null default '[]' check (
    jsonb_typeof(seed_keywords) = 'array'
    and jsonb_array_length(seed_keywords) between 1 and 5
  ),
  selected_keywords jsonb not null default '[]' check (
    jsonb_typeof(selected_keywords) = 'array'
    and jsonb_array_length(selected_keywords) <= 20
  ),
  target_position smallint not null default 3 check (target_position between 1 and 5),
  estimate_period text not null default 'MONTH' check (estimate_period in ('DAY','MONTH')),
  owner_confirmed boolean not null default false,
  created_by text not null default 'OWNER' check (char_length(created_by) between 1 and 160),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.market_naver_ad_research_snapshots (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.market_projects(id) on delete cascade,
  master_product_id uuid not null references public.master_products(id) on delete restrict,
  profile_id uuid not null references public.market_naver_ad_research_profiles(project_id) on delete cascade,
  snapshot_kind text not null check (snapshot_kind in ('KEYWORD_TOOL','BID_ESTIMATE')),
  request_fingerprint text not null check (char_length(request_fingerprint) = 64),
  seed_keywords jsonb not null default '[]' check (jsonb_typeof(seed_keywords) = 'array'),
  selected_keywords jsonb not null default '[]' check (jsonb_typeof(selected_keywords) = 'array'),
  target_position smallint check (target_position is null or target_position between 1 and 5),
  estimate_period text check (estimate_period is null or estimate_period in ('DAY','MONTH')),
  rows jsonb not null default '[]' check (jsonb_typeof(rows) = 'array'),
  summary jsonb not null default '{}' check (jsonb_typeof(summary) = 'object'),
  data_status text not null check (data_status in ('READY','PARTIAL','NO_DATA')),
  source_endpoints jsonb not null default '[]' check (jsonb_typeof(source_endpoints) = 'array'),
  owner_confirmed boolean not null default false,
  confirmed_at timestamptz,
  fetched_at timestamptz not null default now(),
  created_by text not null default 'OWNER' check (char_length(created_by) between 1 and 160),
  created_at timestamptz not null default now(),
  unique (project_id, snapshot_kind, request_fingerprint)
);

create index if not exists market_naver_ad_research_snapshots_project_latest_idx
  on public.market_naver_ad_research_snapshots (project_id, snapshot_kind, fetched_at desc);
create index if not exists market_naver_ad_research_snapshots_product_latest_idx
  on public.market_naver_ad_research_snapshots (master_product_id, snapshot_kind, fetched_at desc);

create or replace function public.check_market_naver_ad_research_links()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1 from public.market_projects p
    where p.id = new.project_id and p.master_product_id = new.master_product_id
  ) then
    raise exception 'market NAVER ad research product does not match project';
  end if;
  if tg_table_name = 'market_naver_ad_research_snapshots'
    and (to_jsonb(new)->>'profile_id')::uuid <> new.project_id then
    raise exception 'market NAVER ad research profile does not match project';
  end if;
  return new;
end;
$$;

drop trigger if exists check_market_naver_ad_research_profile_links on public.market_naver_ad_research_profiles;
create trigger check_market_naver_ad_research_profile_links
before insert or update on public.market_naver_ad_research_profiles
for each row execute function public.check_market_naver_ad_research_links();

drop trigger if exists check_market_naver_ad_research_snapshot_links on public.market_naver_ad_research_snapshots;
create trigger check_market_naver_ad_research_snapshot_links
before insert or update on public.market_naver_ad_research_snapshots
for each row execute function public.check_market_naver_ad_research_links();

drop trigger if exists market_naver_ad_research_profiles_set_updated_at on public.market_naver_ad_research_profiles;
create trigger market_naver_ad_research_profiles_set_updated_at
before update on public.market_naver_ad_research_profiles
for each row execute function public.set_updated_at();

alter table public.market_naver_ad_research_profiles enable row level security;
alter table public.market_naver_ad_research_snapshots enable row level security;
revoke all on table public.market_naver_ad_research_profiles from public, anon, authenticated;
revoke all on table public.market_naver_ad_research_snapshots from public, anon, authenticated;
grant select, insert, update, delete on table public.market_naver_ad_research_profiles to service_role;
grant select, insert, update, delete on table public.market_naver_ad_research_snapshots to service_role;
revoke all on function public.check_market_naver_ad_research_links() from public, anon, authenticated;
grant execute on function public.check_market_naver_ad_research_links() to service_role;

comment on table public.market_naver_ad_research_profiles is
  'Owner-selected Naver Search Ads keyword discovery and read-only bid-estimate settings isolated by market project and product.';
comment on table public.market_naver_ad_research_snapshots is
  'Server-only Naver Search Ads keyword-tool and bid-estimate snapshots. Estimated bids never authorize or perform platform writes.';
comment on column public.market_naver_ad_research_snapshots.rows is
  'Normalized keyword metrics. Values reported as less than 10 or missing stay nullable and are never converted to zero.';

notify pgrst, 'reload schema';
commit;
