begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create table if not exists public.market_growth_levers (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.market_projects(id) on delete cascade,
  master_product_id uuid not null references public.master_products(id) on delete restrict,
  lever_type text not null check (lever_type in ('NDELIVERY','MEMBERSHIP','BUNDLE','REPURCHASE')),
  platform text not null check (platform in ('NAVER','CAFE24','ALL')),
  current_state text not null default '' check (char_length(current_state) <= 2000),
  hypothesis text not null default '' check (char_length(hypothesis) <= 2000),
  next_action text not null default '' check (char_length(next_action) <= 2000),
  success_metric text not null default '' check (char_length(success_metric) <= 500),
  linked_offer_id bigint references public.product_growth_offers(id) on delete set null,
  evidence_ids uuid[] not null default '{}' check (cardinality(evidence_ids) <= 24),
  status text not null default 'REVIEW_REQUIRED'
    check (status in ('REVIEW_REQUIRED','VERIFIED','BLOCKED')),
  owner_confirmed boolean not null default false,
  owner_confirmed_at timestamptz,
  created_by text not null default 'OWNER' check (char_length(created_by) between 1 and 160),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, lever_type)
);

create index if not exists market_growth_levers_project_status_idx
  on public.market_growth_levers (project_id, status, updated_at desc);
create index if not exists market_growth_levers_master_product_idx
  on public.market_growth_levers (master_product_id, updated_at desc);

create or replace function public.check_market_growth_lever_links()
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
    raise exception 'market growth lever product does not match project';
  end if;

  if (new.lever_type in ('NDELIVERY','MEMBERSHIP') and new.platform <> 'NAVER')
    or (new.lever_type = 'BUNDLE' and new.platform <> 'ALL')
    or (new.lever_type = 'REPURCHASE' and new.platform <> 'CAFE24') then
    raise exception 'market growth lever platform does not match lever type';
  end if;

  if new.linked_offer_id is not null and not exists (
    select 1 from public.product_growth_offers o
    where o.id = new.linked_offer_id and o.master_product_id = new.master_product_id
  ) then
    raise exception 'market growth lever offer does not match project product';
  end if;

  if not public.market_verified_evidence_match(new.project_id,new.evidence_ids) then
    raise exception 'market growth lever evidence must be verified in the same project';
  end if;

  if new.status = 'VERIFIED' and (
    not new.owner_confirmed
    or cardinality(new.evidence_ids) = 0
    or char_length(trim(new.current_state)) = 0
    or char_length(trim(new.hypothesis)) = 0
    or char_length(trim(new.next_action)) = 0
    or char_length(trim(new.success_metric)) = 0
  ) then
    raise exception 'verified growth lever requires state, hypothesis, action, metric, evidence and owner confirmation';
  end if;

  new.owner_confirmed_at = case when new.owner_confirmed then coalesce(new.owner_confirmed_at,now()) else null end;
  return new;
end;
$$;

drop trigger if exists check_market_growth_lever_links on public.market_growth_levers;
create trigger check_market_growth_lever_links
before insert or update on public.market_growth_levers
for each row execute function public.check_market_growth_lever_links();

drop trigger if exists set_market_growth_levers_updated_at on public.market_growth_levers;
create trigger set_market_growth_levers_updated_at before update on public.market_growth_levers
for each row execute function public.set_updated_at();

alter table public.market_growth_levers enable row level security;
revoke all on table public.market_growth_levers from public, anon, authenticated;
grant select, insert, update, delete on table public.market_growth_levers to service_role;
revoke all on function public.check_market_growth_lever_links() from public, anon, authenticated;
grant execute on function public.check_market_growth_lever_links() to service_role;

comment on table public.market_growth_levers is
  'Owner-only, product-isolated Ndelivery, membership, bundle and repurchase hypotheses. Operational prices and platform writes remain in their existing owners.';
comment on column public.market_growth_levers.evidence_ids is
  'Only VERIFIED Evidence from the same market project may be linked. No customer identifiers are stored.';

notify pgrst, 'reload schema';
commit;
