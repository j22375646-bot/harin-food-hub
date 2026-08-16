begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create table if not exists public.market_projects (
  id uuid primary key default gen_random_uuid(),
  master_product_id uuid not null references public.master_products(id) on delete restrict,
  project_name text not null check (char_length(trim(project_name)) between 1 and 120),
  template_id text not null default 'market-conversion-product-v1'
    check (char_length(template_id) between 1 and 80),
  status text not null default 'DRAFT' check (status in ('DRAFT','ACTIVE','ARCHIVED')),
  active_version integer not null default 1 check (active_version >= 1),
  product_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(product_snapshot) = 'object'),
  analysis_config jsonb not null default '{}'::jsonb check (jsonb_typeof(analysis_config) = 'object'),
  created_by text not null default 'OWNER' check (char_length(created_by) between 1 and 160),
  last_opened_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists market_projects_product_status_updated_idx
  on public.market_projects (master_product_id, status, updated_at desc);
create index if not exists market_projects_recent_idx
  on public.market_projects (last_opened_at desc, updated_at desc);

create table if not exists public.market_project_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.market_projects(id) on delete cascade,
  version_number integer not null check (version_number >= 1),
  reason text not null default 'PROJECT_CREATED' check (char_length(reason) between 1 and 160),
  snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(snapshot) = 'object'),
  created_by text not null default 'OWNER' check (char_length(created_by) between 1 and 160),
  created_at timestamptz not null default now(),
  unique (project_id, version_number)
);

create index if not exists market_project_versions_project_created_idx
  on public.market_project_versions (project_id, version_number desc, created_at desc);

drop trigger if exists set_market_projects_updated_at on public.market_projects;
create trigger set_market_projects_updated_at before update on public.market_projects
for each row execute function public.set_updated_at();

alter table public.market_projects enable row level security;
alter table public.market_project_versions enable row level security;

revoke all on table public.market_projects, public.market_project_versions
  from public, anon, authenticated;
grant select, insert, update, delete on table public.market_projects, public.market_project_versions
  to service_role;

comment on table public.market_projects is
  'Owner-only, product-isolated market, competition and conversion analysis projects.';
comment on table public.market_project_versions is
  'Immutable server-created snapshots for each market intelligence project version.';

notify pgrst, 'reload schema';
commit;
