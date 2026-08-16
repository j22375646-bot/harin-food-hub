begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create table if not exists public.market_scope_entries (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.market_projects(id) on delete cascade,
  master_product_id uuid not null references public.master_products(id) on delete restrict,
  scope_level text not null check (scope_level in ('L0','L1','L2','L3','L4','L5','EX')),
  label text not null check (char_length(trim(label)) between 1 and 160),
  description text not null default '' check (char_length(description) <= 2000),
  relationship text not null default '' check (char_length(relationship) <= 1000),
  evidence_ids uuid[] not null default '{}' check (cardinality(evidence_ids) <= 24),
  status text not null default 'REVIEW_REQUIRED'
    check (status in ('DRAFT','REVIEW_REQUIRED','VERIFIED','BLOCKED')),
  owner_confirmed boolean not null default false,
  created_by text not null default 'OWNER' check (char_length(created_by) between 1 and 160),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, scope_level)
);

create index if not exists market_scope_entries_project_status_idx
  on public.market_scope_entries (project_id, status, scope_level);

create table if not exists public.market_review_insights (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.market_projects(id) on delete cascade,
  master_product_id uuid not null references public.master_products(id) on delete restrict,
  platform text not null check (platform in ('NAVER','CAFE24','COUPANG','OTHER')),
  review_set_name text not null check (char_length(trim(review_set_name)) between 1 and 160),
  review_period_start date,
  review_period_end date,
  sample_size integer not null check (sample_size between 1 and 100000),
  positive_count integer check (positive_count is null or positive_count between 0 and 100000),
  neutral_count integer check (neutral_count is null or neutral_count between 0 and 100000),
  negative_count integer check (negative_count is null or negative_count between 0 and 100000),
  pain_points text[] not null default '{}' check (cardinality(pain_points) <= 12),
  desired_outcomes text[] not null default '{}' check (cardinality(desired_outcomes) <= 12),
  objections text[] not null default '{}' check (cardinality(objections) <= 12),
  purchase_contexts text[] not null default '{}' check (cardinality(purchase_contexts) <= 12),
  evidence_ids uuid[] not null default '{}' check (cardinality(evidence_ids) <= 24),
  status text not null default 'REVIEW_REQUIRED'
    check (status in ('DRAFT','REVIEW_REQUIRED','VERIFIED','BLOCKED')),
  owner_confirmed boolean not null default false,
  created_by text not null default 'OWNER' check (char_length(created_by) between 1 and 160),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (review_period_start is null or review_period_end is null or review_period_start <= review_period_end),
  check (coalesce(positive_count,0) + coalesce(neutral_count,0) + coalesce(negative_count,0) <= sample_size)
);

create index if not exists market_review_insights_project_status_idx
  on public.market_review_insights (project_id, status, created_at desc);

create table if not exists public.market_personas (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.market_projects(id) on delete cascade,
  master_product_id uuid not null references public.master_products(id) on delete restrict,
  persona_name text not null check (char_length(trim(persona_name)) between 1 and 160),
  summary text not null default '' check (char_length(summary) <= 2000),
  primary_need text not null default '' check (char_length(primary_need) <= 1000),
  purchase_situations text[] not null default '{}' check (cardinality(purchase_situations) <= 12),
  barriers text[] not null default '{}' check (cardinality(barriers) <= 12),
  decision_criteria text[] not null default '{}' check (cardinality(decision_criteria) <= 12),
  source_review_ids uuid[] not null default '{}' check (cardinality(source_review_ids) <= 24),
  evidence_ids uuid[] not null default '{}' check (cardinality(evidence_ids) <= 48),
  status text not null default 'REVIEW_REQUIRED'
    check (status in ('DRAFT','REVIEW_REQUIRED','VERIFIED','BLOCKED')),
  owner_confirmed boolean not null default false,
  created_by text not null default 'OWNER' check (char_length(created_by) between 1 and 160),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists market_personas_project_status_idx
  on public.market_personas (project_id, status, created_at desc);

create or replace function public.market_verified_evidence_match(p_project_id uuid, p_evidence_ids uuid[])
returns boolean
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select cardinality(coalesce(p_evidence_ids,'{}'::uuid[])) = (
    select count(*)::integer
    from public.market_evidence e
    where e.project_id = p_project_id
      and e.status = 'VERIFIED'
      and e.id = any(coalesce(p_evidence_ids,'{}'::uuid[]))
  );
$$;

create or replace function public.check_market_scope_links()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1 from public.market_projects p
    where p.id = new.project_id and p.master_product_id = new.master_product_id
  ) then raise exception 'market scope product does not match project'; end if;
  if not public.market_verified_evidence_match(new.project_id,new.evidence_ids) then
    raise exception 'market scope evidence must be verified in the same project';
  end if;
  if new.status = 'VERIFIED' and (not new.owner_confirmed or cardinality(new.evidence_ids) = 0) then
    raise exception 'verified market scope requires evidence and owner confirmation';
  end if;
  return new;
end;
$$;

create or replace function public.check_market_review_links()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1 from public.market_projects p
    where p.id = new.project_id and p.master_product_id = new.master_product_id
  ) then raise exception 'market review product does not match project'; end if;
  if not public.market_verified_evidence_match(new.project_id,new.evidence_ids) then
    raise exception 'market review evidence must be verified in the same project';
  end if;
  if new.status = 'VERIFIED' and (not new.owner_confirmed or new.sample_size < 10 or cardinality(new.evidence_ids) = 0) then
    raise exception 'verified market review requires sample, evidence and owner confirmation';
  end if;
  return new;
end;
$$;

create or replace function public.check_market_persona_links()
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
  ) then raise exception 'market persona product does not match project'; end if;
  if not public.market_verified_evidence_match(new.project_id,new.evidence_ids) then
    raise exception 'market persona evidence must be verified in the same project';
  end if;
  select count(*)::integer into matched_reviews
  from public.market_review_insights r
  where r.project_id = new.project_id and r.status = 'VERIFIED'
    and r.id = any(coalesce(new.source_review_ids,'{}'::uuid[]));
  if matched_reviews <> cardinality(new.source_review_ids) then
    raise exception 'market persona reviews must be verified in the same project';
  end if;
  if new.status = 'VERIFIED' and (
    not new.owner_confirmed or cardinality(new.source_review_ids) = 0
    or cardinality(new.evidence_ids) = 0
  ) then raise exception 'verified persona requires reviews, evidence and owner confirmation'; end if;
  return new;
end;
$$;

drop trigger if exists check_market_scope_links on public.market_scope_entries;
create trigger check_market_scope_links before insert or update on public.market_scope_entries
for each row execute function public.check_market_scope_links();
drop trigger if exists check_market_review_links on public.market_review_insights;
create trigger check_market_review_links before insert or update on public.market_review_insights
for each row execute function public.check_market_review_links();
drop trigger if exists check_market_persona_links on public.market_personas;
create trigger check_market_persona_links before insert or update on public.market_personas
for each row execute function public.check_market_persona_links();

drop trigger if exists set_market_scope_entries_updated_at on public.market_scope_entries;
create trigger set_market_scope_entries_updated_at before update on public.market_scope_entries
for each row execute function public.set_updated_at();
drop trigger if exists set_market_review_insights_updated_at on public.market_review_insights;
create trigger set_market_review_insights_updated_at before update on public.market_review_insights
for each row execute function public.set_updated_at();
drop trigger if exists set_market_personas_updated_at on public.market_personas;
create trigger set_market_personas_updated_at before update on public.market_personas
for each row execute function public.set_updated_at();

alter table public.market_scope_entries enable row level security;
alter table public.market_review_insights enable row level security;
alter table public.market_personas enable row level security;

revoke all on table public.market_scope_entries, public.market_review_insights, public.market_personas
  from public, anon, authenticated;
grant select, insert, update, delete on table public.market_scope_entries, public.market_review_insights, public.market_personas
  to service_role;
revoke all on function public.market_verified_evidence_match(uuid,uuid[]) from public, anon, authenticated;
revoke all on function public.check_market_scope_links() from public, anon, authenticated;
revoke all on function public.check_market_review_links() from public, anon, authenticated;
revoke all on function public.check_market_persona_links() from public, anon, authenticated;
grant execute on function public.market_verified_evidence_match(uuid,uuid[]) to service_role;
grant execute on function public.check_market_scope_links() to service_role;
grant execute on function public.check_market_review_links() to service_role;
grant execute on function public.check_market_persona_links() to service_role;

with seeded as (
  insert into public.market_scope_entries (
    project_id, master_product_id, scope_level, label, description, status, owner_confirmed, created_by
  )
  select
    p.id,
    p.master_product_id,
    'L0',
    left(coalesce(nullif(trim(p.product_snapshot->>'name'),''),nullif(trim(mp.name),''),'선택 상품'),160),
    '현재 선택한 기준상품입니다. 상위 시장범위는 검증된 Evidence를 연결한 뒤 확정합니다.',
    'REVIEW_REQUIRED',
    false,
    'SYSTEM_PHASE_17_4'
  from public.market_projects p
  join public.master_products mp on mp.id = p.master_product_id
  on conflict (project_id, scope_level) do nothing
  returning project_id, master_product_id, id
)
select public.record_market_project_version(
  project_id,
  'MARKET_SCOPE_L0_SEEDED',
  jsonb_build_object('phase','17-4','scope_entry_id',id,'master_product_id',master_product_id,'status','REVIEW_REQUIRED'),
  'SYSTEM_PHASE_17_4'
) from seeded;

comment on table public.market_scope_entries is
  'Owner-only L0-L5 and EX market scope map. Verified scope always cites same-project verified Evidence.';
comment on table public.market_review_insights is
  'Privacy-safe review aggregates only. Raw review text, names, order IDs and contact details are intentionally not stored.';
comment on table public.market_personas is
  'Evidence-grounded personas derived only from verified same-project review aggregates.';

notify pgrst, 'reload schema';
commit;
