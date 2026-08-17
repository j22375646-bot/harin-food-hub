begin;

create table if not exists public.market_context_snapshots (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.market_projects(id) on delete cascade,
  master_product_id uuid not null references public.master_products(id) on delete restrict,
  provider text not null check (provider in ('KAMIS_PRICE','KMA_WEATHER','YOUTUBE_SEARCH')),
  query_key text not null,
  query_text text,
  status text not null check (status in ('READY','PARTIAL','NO_DATA','FAILED')),
  result_count integer not null default 0 check (result_count >= 0),
  result_payload jsonb not null default '[]'::jsonb check (jsonb_typeof(result_payload) = 'array'),
  error_code text,
  error_message text,
  fetched_at timestamptz not null default now(),
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists market_context_snapshots_project_provider_idx on public.market_context_snapshots(project_id,provider,fetched_at desc);
create index if not exists market_context_snapshots_product_idx on public.market_context_snapshots(master_product_id,provider,fetched_at desc);
create index if not exists market_context_snapshots_query_idx on public.market_context_snapshots(query_key,fetched_at desc);

create or replace function public.enforce_market_context_snapshot_product()
returns trigger language plpgsql set search_path=public as $$
begin
  if not exists(select 1 from public.market_projects p where p.id=new.project_id and p.master_product_id=new.master_product_id) then
    raise exception 'market context snapshot product does not match project';
  end if;
  return new;
end;
$$;

drop trigger if exists market_context_snapshot_product_guard on public.market_context_snapshots;
create trigger market_context_snapshot_product_guard before insert or update on public.market_context_snapshots for each row execute function public.enforce_market_context_snapshot_product();

alter table public.market_context_snapshots enable row level security;
revoke all on table public.market_context_snapshots from public,anon,authenticated;
grant select,insert,update,delete on table public.market_context_snapshots to service_role;
comment on table public.market_context_snapshots is 'Phase 19-5 product-isolated public market context cache. Server service role only; no customer PII or provider secrets.';

commit;
