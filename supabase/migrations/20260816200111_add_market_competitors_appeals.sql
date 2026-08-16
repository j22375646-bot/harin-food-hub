begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create table if not exists public.market_competitors (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.market_projects(id) on delete cascade,
  master_product_id uuid not null references public.master_products(id) on delete restrict,
  platform text not null check (platform in ('NAVER','CAFE24','COUPANG','OTHER')),
  competitor_name text not null check (char_length(trim(competitor_name)) between 1 and 160),
  product_name text not null check (char_length(trim(product_name)) between 1 and 240),
  product_url text not null default '' check (char_length(product_url) <= 1000),
  price_won numeric(14,2) check (price_won is null or price_won >= 0),
  package_quantity numeric(12,3) check (package_quantity is null or package_quantity > 0),
  package_unit text not null default '' check (char_length(package_unit) <= 40),
  strengths text[] not null default '{}' check (cardinality(strengths) <= 12),
  comparison_notes text not null default '' check (char_length(comparison_notes) <= 2000),
  evidence_ids uuid[] not null default '{}' check (cardinality(evidence_ids) <= 24),
  status text not null default 'REVIEW_REQUIRED'
    check (status in ('DRAFT','REVIEW_REQUIRED','VERIFIED','BLOCKED')),
  owner_confirmed boolean not null default false,
  created_by text not null default 'OWNER' check (char_length(created_by) between 1 and 160),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists market_competitors_project_status_idx
  on public.market_competitors (project_id, status, created_at desc);

create table if not exists public.market_competitor_review_insights (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.market_projects(id) on delete cascade,
  master_product_id uuid not null references public.master_products(id) on delete restrict,
  competitor_id uuid not null references public.market_competitors(id) on delete cascade,
  review_set_name text not null check (char_length(trim(review_set_name)) between 1 and 160),
  review_period_start date,
  review_period_end date,
  sample_size integer not null check (sample_size between 1 and 100000),
  pain_points text[] not null default '{}' check (cardinality(pain_points) <= 12),
  praised_points text[] not null default '{}' check (cardinality(praised_points) <= 12),
  purchase_reasons text[] not null default '{}' check (cardinality(purchase_reasons) <= 12),
  rejection_reasons text[] not null default '{}' check (cardinality(rejection_reasons) <= 12),
  evidence_ids uuid[] not null default '{}' check (cardinality(evidence_ids) <= 24),
  status text not null default 'REVIEW_REQUIRED'
    check (status in ('DRAFT','REVIEW_REQUIRED','VERIFIED','BLOCKED')),
  owner_confirmed boolean not null default false,
  created_by text not null default 'OWNER' check (char_length(created_by) between 1 and 160),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (review_period_start is null or review_period_end is null or review_period_start <= review_period_end)
);

create index if not exists market_competitor_reviews_project_status_idx
  on public.market_competitor_review_insights (project_id, status, created_at desc);
create index if not exists market_competitor_reviews_competitor_idx
  on public.market_competitor_review_insights (competitor_id, created_at desc);

create table if not exists public.market_appeal_points (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.market_projects(id) on delete cascade,
  master_product_id uuid not null references public.master_products(id) on delete restrict,
  appeal_type text not null default 'DIFFERENTIATION'
    check (appeal_type in ('DIFFERENTIATION','TRUST','CONVENIENCE','VALUE','USAGE','OTHER')),
  title text not null check (char_length(trim(title)) between 1 and 160),
  customer_problem text not null check (char_length(trim(customer_problem)) between 1 and 1000),
  own_resolution text not null check (char_length(trim(own_resolution)) between 1 and 1000),
  proof_summary text not null default '' check (char_length(proof_summary) <= 2000),
  claim_text text not null check (char_length(trim(claim_text)) between 1 and 500),
  claim_status text not null default 'VERIFY'
    check (claim_status in ('ALLOWED','VERIFY','BLOCKED')),
  competitor_review_ids uuid[] not null default '{}' check (cardinality(competitor_review_ids) <= 24),
  competitor_pain_evidence_ids uuid[] not null default '{}' check (cardinality(competitor_pain_evidence_ids) <= 24),
  own_resolution_evidence_ids uuid[] not null default '{}' check (cardinality(own_resolution_evidence_ids) <= 24),
  status text not null default 'REVIEW_REQUIRED'
    check (status in ('DRAFT','REVIEW_REQUIRED','VERIFIED','BLOCKED')),
  owner_confirmed boolean not null default false,
  created_by text not null default 'OWNER' check (char_length(created_by) between 1 and 160),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists market_appeal_points_project_status_idx
  on public.market_appeal_points (project_id, status, created_at desc);

create or replace function public.check_market_competitor_links()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1 from public.market_projects p
    where p.id = new.project_id and p.master_product_id = new.master_product_id
  ) then raise exception 'market competitor product does not match project'; end if;
  if not public.market_verified_evidence_match(new.project_id,new.evidence_ids) then
    raise exception 'market competitor evidence must be verified in the same project';
  end if;
  if new.status = 'VERIFIED' and (not new.owner_confirmed or cardinality(new.evidence_ids) = 0) then
    raise exception 'verified competitor requires evidence and owner confirmation';
  end if;
  return new;
end;
$$;

create or replace function public.check_market_competitor_review_links()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  competitor_verified boolean;
begin
  if not exists (
    select 1 from public.market_projects p
    where p.id = new.project_id and p.master_product_id = new.master_product_id
  ) then raise exception 'market competitor review product does not match project'; end if;
  select (c.status = 'VERIFIED') into competitor_verified
  from public.market_competitors c
  where c.id = new.competitor_id and c.project_id = new.project_id
    and c.master_product_id = new.master_product_id;
  if competitor_verified is null then
    raise exception 'market competitor review must use a competitor in the same project';
  end if;
  if not public.market_verified_evidence_match(new.project_id,new.evidence_ids) then
    raise exception 'market competitor review evidence must be verified in the same project';
  end if;
  if new.status = 'VERIFIED' and (
    not competitor_verified or not new.owner_confirmed or new.sample_size < 10
    or cardinality(new.evidence_ids) = 0
  ) then raise exception 'verified competitor review requires verified competitor, sample, evidence and owner confirmation'; end if;
  return new;
end;
$$;

create or replace function public.check_market_appeal_links()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  matched_reviews integer;
begin
  if not exists (
    select 1 from public.market_projects p
    where p.id = new.project_id and p.master_product_id = new.master_product_id
  ) then raise exception 'market appeal product does not match project'; end if;
  if not public.market_verified_evidence_match(new.project_id,new.competitor_pain_evidence_ids)
    or not public.market_verified_evidence_match(new.project_id,new.own_resolution_evidence_ids) then
    raise exception 'market appeal evidence must be verified in the same project';
  end if;
  select count(*)::integer into matched_reviews
  from public.market_competitor_review_insights r
  where r.project_id = new.project_id and r.status = 'VERIFIED'
    and r.id = any(coalesce(new.competitor_review_ids,'{}'::uuid[]));
  if matched_reviews <> cardinality(new.competitor_review_ids) then
    raise exception 'market appeal reviews must be verified in the same project';
  end if;
  if new.claim_status = 'BLOCKED' and new.status <> 'BLOCKED' then
    raise exception 'blocked claim must keep appeal blocked';
  end if;
  if new.status = 'VERIFIED' and (
    not new.owner_confirmed or new.claim_status <> 'ALLOWED'
    or cardinality(new.competitor_review_ids) = 0
    or cardinality(new.competitor_pain_evidence_ids) = 0
    or cardinality(new.own_resolution_evidence_ids) = 0
  ) then raise exception 'verified appeal requires both evidence sides, verified review, safe claim and owner confirmation'; end if;
  return new;
end;
$$;

drop trigger if exists check_market_competitor_links on public.market_competitors;
create trigger check_market_competitor_links before insert or update on public.market_competitors
for each row execute function public.check_market_competitor_links();
drop trigger if exists check_market_competitor_review_links on public.market_competitor_review_insights;
create trigger check_market_competitor_review_links before insert or update on public.market_competitor_review_insights
for each row execute function public.check_market_competitor_review_links();
drop trigger if exists check_market_appeal_links on public.market_appeal_points;
create trigger check_market_appeal_links before insert or update on public.market_appeal_points
for each row execute function public.check_market_appeal_links();

drop trigger if exists set_market_competitors_updated_at on public.market_competitors;
create trigger set_market_competitors_updated_at before update on public.market_competitors
for each row execute function public.set_updated_at();
drop trigger if exists set_market_competitor_reviews_updated_at on public.market_competitor_review_insights;
create trigger set_market_competitor_reviews_updated_at before update on public.market_competitor_review_insights
for each row execute function public.set_updated_at();
drop trigger if exists set_market_appeal_points_updated_at on public.market_appeal_points;
create trigger set_market_appeal_points_updated_at before update on public.market_appeal_points
for each row execute function public.set_updated_at();

alter table public.market_competitors enable row level security;
alter table public.market_competitor_review_insights enable row level security;
alter table public.market_appeal_points enable row level security;

revoke all on table public.market_competitors, public.market_competitor_review_insights, public.market_appeal_points
  from public, anon, authenticated;
grant select, insert, update, delete on table public.market_competitors, public.market_competitor_review_insights, public.market_appeal_points
  to service_role;
revoke all on function public.check_market_competitor_links() from public, anon, authenticated;
revoke all on function public.check_market_competitor_review_links() from public, anon, authenticated;
revoke all on function public.check_market_appeal_links() from public, anon, authenticated;
grant execute on function public.check_market_competitor_links() to service_role;
grant execute on function public.check_market_competitor_review_links() to service_role;
grant execute on function public.check_market_appeal_links() to service_role;

comment on table public.market_competitors is
  'Owner-only product-isolated competitor snapshots. Verified competitors cite same-project verified Evidence.';
comment on table public.market_competitor_review_insights is
  'Privacy-safe competitor review aggregates. Raw review text and customer identifiers are intentionally not stored.';
comment on table public.market_appeal_points is
  'Evidence-paired appeal points. VERIFIED requires competitor pain Evidence and own resolution Evidence.';

notify pgrst, 'reload schema';
commit;
