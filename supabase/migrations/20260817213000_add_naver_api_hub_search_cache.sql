begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create table if not exists public.market_naver_search_cache (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.market_projects(id) on delete cascade,
  master_product_id uuid not null references public.master_products(id) on delete restrict,
  source_type text not null check (source_type in ('BLOG','CAFE','KIN','NEWS')),
  cache_key text not null check (char_length(cache_key) = 64),
  query_text text not null check (char_length(query_text) between 1 and 100),
  sort_mode text not null check (sort_mode in ('sim','date','point')),
  display_count integer not null check (display_count between 1 and 10),
  result_payload jsonb not null default '[]' check (jsonb_typeof(result_payload) = 'array'),
  result_count integer not null default 0 check (result_count >= 0),
  data_status text not null check (data_status in ('READY','NO_DATA')),
  fetched_at timestamptz not null default now(),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, source_type, cache_key),
  check (expires_at >= fetched_at)
);

create index if not exists market_naver_search_cache_project_expiry_idx
  on public.market_naver_search_cache (project_id, expires_at desc);
create index if not exists market_naver_search_cache_product_latest_idx
  on public.market_naver_search_cache (master_product_id, fetched_at desc);

create or replace function public.check_market_naver_search_cache_links()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1 from public.market_projects p
    where p.id = new.project_id and p.master_product_id = new.master_product_id
  ) then raise exception 'market NAVER search cache product does not match project'; end if;
  return new;
end;
$$;

drop trigger if exists check_market_naver_search_cache_links on public.market_naver_search_cache;
create trigger check_market_naver_search_cache_links before insert or update on public.market_naver_search_cache
for each row execute function public.check_market_naver_search_cache_links();

drop trigger if exists market_naver_search_cache_set_updated_at on public.market_naver_search_cache;
create trigger market_naver_search_cache_set_updated_at before update on public.market_naver_search_cache
for each row execute function public.set_updated_at();

alter table public.market_naver_search_cache enable row level security;
revoke all on table public.market_naver_search_cache from public, anon, authenticated;
grant select, insert, update, delete on table public.market_naver_search_cache to service_role;
revoke all on function public.check_market_naver_search_cache_links() from public, anon, authenticated;
grant execute on function public.check_market_naver_search_cache_links() to service_role;

comment on table public.market_naver_search_cache is
  'Short-lived product and project isolated cache for owner-triggered NAVER API HUB public search results.';
comment on column public.market_naver_search_cache.result_payload is
  'Normalized public search snippets only. No customer PII, credentials, AI output, or owner approval state.';

notify pgrst, 'reload schema';
commit;
