begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create table if not exists public.market_page_ai_snapshots (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.market_projects(id) on delete cascade,
  master_product_id uuid not null references public.master_products(id) on delete restrict,
  workspace text not null check (workspace in ('data','market','competition','conversion')),
  analysis_type text not null check (analysis_type in ('MARKET_DATA_AI','MARKET_SCOPE_AI','MARKET_COMPETITION_AI','MARKET_CONVERSION_AI')),
  result_mode text not null default 'SERVER_PREVIEW' check (result_mode in ('SERVER_PREVIEW','OPENAI')),
  status text not null check (status in ('PREVIEW','READY','BLOCKED')),
  data_status text not null check (data_status in ('READY','PARTIAL','BLOCKED','NO_DATA','STALE')),
  input_fingerprint text not null check (char_length(input_fingerprint) = 64),
  formula_version text not null check (char_length(formula_version) between 1 and 120),
  period_label text not null default '현재 상품 프로젝트' check (char_length(period_label) between 1 and 120),
  source_snapshot jsonb not null check (jsonb_typeof(source_snapshot) = 'object'),
  result jsonb not null check (jsonb_typeof(result) = 'object'),
  evidence_ids uuid[] not null default '{}' check (cardinality(evidence_ids) <= 100),
  model text,
  token_usage jsonb not null default '{}' check (jsonb_typeof(token_usage) = 'object'),
  created_by text not null default 'OWNER' check (char_length(created_by) between 1 and 160),
  created_at timestamptz not null default now(),
  unique (project_id, workspace, input_fingerprint, result_mode)
);

create index if not exists market_page_ai_snapshots_project_latest_idx
  on public.market_page_ai_snapshots (project_id, workspace, created_at desc);

create or replace function public.check_market_page_ai_snapshot_links()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1 from public.market_projects p
    where p.id = new.project_id and p.master_product_id = new.master_product_id
  ) then raise exception 'market page AI product does not match project'; end if;
  if not public.market_verified_evidence_match(new.project_id,new.evidence_ids) then
    raise exception 'market page AI evidence must be verified in the same project';
  end if;
  if (new.workspace = 'data' and new.analysis_type <> 'MARKET_DATA_AI')
    or (new.workspace = 'market' and new.analysis_type <> 'MARKET_SCOPE_AI')
    or (new.workspace = 'competition' and new.analysis_type <> 'MARKET_COMPETITION_AI')
    or (new.workspace = 'conversion' and new.analysis_type <> 'MARKET_CONVERSION_AI') then
    raise exception 'market page AI workspace and analysis type do not match';
  end if;
  return new;
end;
$$;

drop trigger if exists check_market_page_ai_snapshot_links on public.market_page_ai_snapshots;
create trigger check_market_page_ai_snapshot_links before insert or update on public.market_page_ai_snapshots
for each row execute function public.check_market_page_ai_snapshot_links();

alter table public.market_page_ai_snapshots enable row level security;
revoke all on table public.market_page_ai_snapshots from public, anon, authenticated;
grant select, insert, update, delete on table public.market_page_ai_snapshots to service_role;
revoke all on function public.check_market_page_ai_snapshot_links() from public, anon, authenticated;
grant execute on function public.check_market_page_ai_snapshot_links() to service_role;

comment on table public.market_page_ai_snapshots is
  'Product and workspace isolated AI input snapshots and explanations. Server aggregates only; no customer identifiers or platform writes.';
comment on column public.market_page_ai_snapshots.source_snapshot is
  'Allowlisted product-level aggregate metrics and verified Evidence ids only. PII is prohibited.';

notify pgrst, 'reload schema';
commit;
