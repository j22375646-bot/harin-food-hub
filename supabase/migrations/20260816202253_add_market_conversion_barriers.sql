begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create table if not exists public.market_barriers (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.market_projects(id) on delete cascade,
  master_product_id uuid not null references public.master_products(id) on delete restrict,
  barrier_type text not null check (barrier_type in (
    'TARGETING','MESSAGE','PRICE_VALUE','TRUST_REVIEW','CONTENT_CLARITY',
    'OPTION_CHOICE','SHIPPING','STOCK','CHECKOUT','CLAIM_SAFETY'
  )),
  funnel_stage text not null default 'PRODUCT' check (funnel_stage in ('AD','PRODUCT','CART','ORDER')),
  severity text not null default 'WATCH' check (severity in ('LOW','WATCH','HIGH','BLOCKED')),
  title text not null check (char_length(trim(title)) between 1 and 160),
  observation text not null default '' check (char_length(observation) <= 2000),
  recommendation text not null default '' check (char_length(recommendation) <= 2000),
  evidence_ids uuid[] not null default '{}' check (cardinality(evidence_ids) <= 24),
  status text not null default 'REVIEW_REQUIRED'
    check (status in ('DRAFT','REVIEW_REQUIRED','VERIFIED','BLOCKED')),
  owner_confirmed boolean not null default false,
  created_by text not null default 'OWNER' check (char_length(created_by) between 1 and 160),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, barrier_type)
);

create index if not exists market_barriers_project_status_idx
  on public.market_barriers (project_id, status, updated_at desc);

create table if not exists public.market_feedback_cards (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.market_projects(id) on delete cascade,
  master_product_id uuid not null references public.master_products(id) on delete restrict,
  area text not null check (area in ('HERO','TRUST','BENEFIT','USAGE','OFFER','SHIPPING','FAQ','CTA','OTHER')),
  title text not null check (char_length(trim(title)) between 1 and 160),
  current_issue text not null default '' check (char_length(current_issue) <= 2000),
  recommended_change text not null default '' check (char_length(recommended_change) <= 2000),
  success_metric text not null default '' check (char_length(success_metric) <= 500),
  source_barrier_ids uuid[] not null default '{}' check (cardinality(source_barrier_ids) <= 10),
  evidence_ids uuid[] not null default '{}' check (cardinality(evidence_ids) <= 24),
  status text not null default 'REVIEW_REQUIRED'
    check (status in ('DRAFT','REVIEW_REQUIRED','VERIFIED','BLOCKED')),
  owner_confirmed boolean not null default false,
  created_by text not null default 'OWNER' check (char_length(created_by) between 1 and 160),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists market_feedback_cards_project_status_idx
  on public.market_feedback_cards (project_id, status, updated_at desc);

create or replace function public.check_market_barrier_links()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1 from public.market_projects p
    where p.id = new.project_id and p.master_product_id = new.master_product_id
  ) then raise exception 'market barrier product does not match project'; end if;
  if not public.market_verified_evidence_match(new.project_id,new.evidence_ids) then
    raise exception 'market barrier evidence must be verified in the same project';
  end if;
  if new.status = 'VERIFIED' and (
    not new.owner_confirmed or cardinality(new.evidence_ids) = 0
    or char_length(trim(new.observation)) = 0 or char_length(trim(new.recommendation)) = 0
  ) then raise exception 'verified barrier requires observation, recommendation, evidence and owner confirmation'; end if;
  return new;
end;
$$;

create or replace function public.check_market_feedback_links()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  matched_barriers integer;
begin
  if not exists (
    select 1 from public.market_projects p
    where p.id = new.project_id and p.master_product_id = new.master_product_id
  ) then raise exception 'market feedback product does not match project'; end if;
  if not public.market_verified_evidence_match(new.project_id,new.evidence_ids) then
    raise exception 'market feedback evidence must be verified in the same project';
  end if;
  select count(*)::integer into matched_barriers
  from public.market_barriers b
  where b.project_id = new.project_id
    and b.id = any(coalesce(new.source_barrier_ids,'{}'::uuid[]));
  if matched_barriers <> cardinality(new.source_barrier_ids) then
    raise exception 'market feedback barriers must belong to the same project';
  end if;
  if new.status = 'VERIFIED' and (
    not new.owner_confirmed or cardinality(new.evidence_ids) = 0
    or cardinality(new.source_barrier_ids) = 0
    or char_length(trim(new.recommended_change)) = 0
  ) then raise exception 'verified feedback requires barrier, recommendation, evidence and owner confirmation'; end if;
  return new;
end;
$$;

drop trigger if exists check_market_barrier_links on public.market_barriers;
create trigger check_market_barrier_links before insert or update on public.market_barriers
for each row execute function public.check_market_barrier_links();
drop trigger if exists check_market_feedback_links on public.market_feedback_cards;
create trigger check_market_feedback_links before insert or update on public.market_feedback_cards
for each row execute function public.check_market_feedback_links();

drop trigger if exists set_market_barriers_updated_at on public.market_barriers;
create trigger set_market_barriers_updated_at before update on public.market_barriers
for each row execute function public.set_updated_at();
drop trigger if exists set_market_feedback_cards_updated_at on public.market_feedback_cards;
create trigger set_market_feedback_cards_updated_at before update on public.market_feedback_cards
for each row execute function public.set_updated_at();

alter table public.market_barriers enable row level security;
alter table public.market_feedback_cards enable row level security;

revoke all on table public.market_barriers, public.market_feedback_cards
  from public, anon, authenticated;
grant select, insert, update, delete on table public.market_barriers, public.market_feedback_cards
  to service_role;
revoke all on function public.check_market_barrier_links() from public, anon, authenticated;
revoke all on function public.check_market_feedback_links() from public, anon, authenticated;
grant execute on function public.check_market_barrier_links() to service_role;
grant execute on function public.check_market_feedback_links() to service_role;

comment on table public.market_barriers is
  'Product-isolated purchase barrier decisions. VERIFIED rows cite same-project verified Evidence.';
comment on table public.market_feedback_cards is
  'Evidence-backed detail-page feedback cards linked to barriers in the same product project.';

notify pgrst, 'reload schema';
commit;
