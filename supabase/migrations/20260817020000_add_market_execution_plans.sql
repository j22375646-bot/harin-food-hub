begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create table if not exists public.market_execution_plans (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.market_projects(id) on delete cascade,
  master_product_id uuid not null references public.master_products(id) on delete restrict,
  source_type text not null check (source_type in ('GROWTH_LEVER','BARRIER','FEEDBACK')),
  source_id uuid not null,
  title text not null check (char_length(trim(title)) between 1 and 160),
  platform text not null default 'ALL' check (platform in ('ALL','NAVER','CAFE24','COUPANG')),
  hypothesis text not null default '' check (char_length(hypothesis) <= 2000),
  metric text not null default 'CVR' check (metric in ('CTR','CPC','CVR','CPA','ROAS','REVENUE','ORDERS','AOV')),
  start_date date not null,
  end_date date not null,
  control_label text not null default '기존안' check (char_length(trim(control_label)) between 1 and 120),
  variant_label text not null default '변경안' check (char_length(trim(variant_label)) between 1 and 120),
  minimum_sample_size integer not null default 30 check (minimum_sample_size between 1 and 1000000),
  risk_note text not null default '' check (char_length(risk_note) <= 2000),
  rollback_plan text not null default '' check (char_length(rollback_plan) <= 2000),
  evidence_ids uuid[] not null default '{}' check (cardinality(evidence_ids) <= 24),
  approval_status text not null default 'DRAFT' check (approval_status in ('DRAFT','AWAITING_APPROVAL','APPROVED','REJECTED')),
  owner_confirmed boolean not null default false,
  approved_by text,
  approved_at timestamptz,
  rejection_note text,
  ab_test_id uuid references public.ab_tests(id) on delete set null,
  report_snapshot jsonb,
  report_generated_at timestamptz,
  created_by text not null default 'OWNER' check (char_length(created_by) between 1 and 160),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, source_type, source_id),
  check (end_date >= start_date),
  check (report_snapshot is null or jsonb_typeof(report_snapshot) = 'object')
);

create index if not exists market_execution_plans_project_status_idx
  on public.market_execution_plans (project_id, approval_status, updated_at desc);

create or replace function public.check_market_execution_plan_links()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  source_ok boolean := false;
begin
  if not exists (
    select 1 from public.market_projects p
    where p.id = new.project_id and p.master_product_id = new.master_product_id
  ) then raise exception 'market execution product does not match project'; end if;

  if new.source_type = 'GROWTH_LEVER' then
    select exists(select 1 from public.market_growth_levers s where s.id = new.source_id and s.project_id = new.project_id)
      into source_ok;
  elsif new.source_type = 'BARRIER' then
    select exists(select 1 from public.market_barriers s where s.id = new.source_id and s.project_id = new.project_id)
      into source_ok;
  elsif new.source_type = 'FEEDBACK' then
    select exists(select 1 from public.market_feedback_cards s where s.id = new.source_id and s.project_id = new.project_id)
      into source_ok;
  end if;
  if not source_ok then raise exception 'market execution source must belong to the same project'; end if;
  if not public.market_verified_evidence_match(new.project_id,new.evidence_ids) then
    raise exception 'market execution evidence must be verified in the same project';
  end if;
  if new.approval_status in ('AWAITING_APPROVAL','APPROVED') and (
    cardinality(new.evidence_ids) = 0 or char_length(trim(new.hypothesis)) = 0
    or char_length(trim(new.risk_note)) = 0 or char_length(trim(new.rollback_plan)) = 0
  ) then raise exception 'approval requires hypothesis, risk, rollback and verified evidence'; end if;
  if new.approval_status = 'APPROVED' and (
    not new.owner_confirmed or new.approved_at is null or coalesce(char_length(trim(new.approved_by)),0) = 0
  ) then raise exception 'approved execution requires owner confirmation'; end if;
  return new;
end;
$$;

drop trigger if exists check_market_execution_plan_links on public.market_execution_plans;
create trigger check_market_execution_plan_links before insert or update on public.market_execution_plans
for each row execute function public.check_market_execution_plan_links();

drop trigger if exists set_market_execution_plans_updated_at on public.market_execution_plans;
create trigger set_market_execution_plans_updated_at before update on public.market_execution_plans
for each row execute function public.set_updated_at();

alter table public.market_execution_plans enable row level security;
revoke all on table public.market_execution_plans from public, anon, authenticated;
grant select, insert, update, delete on table public.market_execution_plans to service_role;
revoke all on function public.check_market_execution_plan_links() from public, anon, authenticated;
grant execute on function public.check_market_execution_plan_links() to service_role;

comment on table public.market_execution_plans is
  'Owner-approved, product-isolated bridge from verified market decisions to draft experiments and report snapshots.';

notify pgrst, 'reload schema';
commit;
