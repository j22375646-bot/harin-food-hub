begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create table if not exists public.market_sources (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.market_projects(id) on delete cascade,
  source_kind text not null default 'UPLOAD' check (source_kind in ('UPLOAD','URL','API','MANUAL')),
  display_name text not null check (char_length(trim(display_name)) between 1 and 180),
  file_name text check (file_name is null or char_length(file_name) between 1 and 180),
  mime_type text check (mime_type is null or char_length(mime_type) between 1 and 120),
  size_bytes bigint check (size_bytes is null or size_bytes between 1 and 20971520),
  sha256 text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  storage_bucket text check (storage_bucket is null or char_length(storage_bucket) between 1 and 80),
  storage_path text check (storage_path is null or char_length(storage_path) between 1 and 500),
  source_url text check (source_url is null or char_length(source_url) <= 2000),
  ingest_status text not null default 'UPLOAD_PENDING'
    check (ingest_status in ('UPLOAD_PENDING','UPLOADED','OCR_PENDING','REVIEW_REQUIRED','VERIFIED','FAILED')),
  ocr_text text check (ocr_text is null or char_length(ocr_text) <= 200000),
  ocr_confidence numeric(5,4) check (ocr_confidence is null or ocr_confidence between 0 and 1),
  ocr_engine text check (ocr_engine is null or char_length(ocr_engine) between 1 and 80),
  ocr_error text check (ocr_error is null or char_length(ocr_error) <= 500),
  owner_confirmed boolean not null default false,
  owner_confirmed_at timestamptz,
  created_by text not null default 'OWNER' check (char_length(created_by) between 1 and 160),
  uploaded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, sha256)
);

create index if not exists market_sources_project_recent_idx
  on public.market_sources (project_id, created_at desc);
create index if not exists market_sources_project_status_idx
  on public.market_sources (project_id, ingest_status, updated_at desc);

create table if not exists public.market_ingestion_jobs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.market_projects(id) on delete cascade,
  source_id uuid not null references public.market_sources(id) on delete cascade,
  job_type text not null default 'OCR_REVIEW' check (job_type in ('TEXT_EXTRACT','OCR_REVIEW')),
  status text not null default 'WAITING_INPUT' check (status in ('PENDING','RUNNING','WAITING_INPUT','COMPLETE','FAILED')),
  provider text not null default 'MANUAL_REVIEW' check (char_length(provider) between 1 and 80),
  attempts integer not null default 0 check (attempts between 0 and 20),
  safe_error text check (safe_error is null or char_length(safe_error) <= 500),
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists market_ingestion_jobs_source_idx
  on public.market_ingestion_jobs (source_id, created_at desc);
create index if not exists market_ingestion_jobs_project_status_idx
  on public.market_ingestion_jobs (project_id, status, created_at desc);

create table if not exists public.market_evidence (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.market_projects(id) on delete cascade,
  source_id uuid references public.market_sources(id) on delete set null,
  evidence_type text not null check (evidence_type in ('MEASURED','RELATIVE','PROXY','OCR_ESTIMATE','AI_HYPOTHESIS')),
  label text not null check (char_length(trim(label)) between 1 and 160),
  value_text text not null check (char_length(trim(value_text)) between 1 and 4000),
  unit text check (unit is null or char_length(unit) <= 40),
  source_locator jsonb not null default '{}'::jsonb check (jsonb_typeof(source_locator) = 'object'),
  confidence numeric(5,4) check (confidence is null or confidence between 0 and 1),
  owner_confirmed boolean not null default false,
  status text not null default 'UNVERIFIED'
    check (status in ('NEEDS_SOURCE','OWNER_CONFIRMATION_REQUIRED','UNVERIFIED','VERIFIED','BLOCKED')),
  captured_at timestamptz,
  created_by text not null default 'OWNER' check (char_length(created_by) between 1 and 160),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists market_evidence_project_status_idx
  on public.market_evidence (project_id, status, created_at desc);
create index if not exists market_evidence_source_idx
  on public.market_evidence (source_id, created_at desc);

drop trigger if exists set_market_sources_updated_at on public.market_sources;
create trigger set_market_sources_updated_at before update on public.market_sources
for each row execute function public.set_updated_at();
drop trigger if exists set_market_ingestion_jobs_updated_at on public.market_ingestion_jobs;
create trigger set_market_ingestion_jobs_updated_at before update on public.market_ingestion_jobs
for each row execute function public.set_updated_at();
drop trigger if exists set_market_evidence_updated_at on public.market_evidence;
create trigger set_market_evidence_updated_at before update on public.market_evidence
for each row execute function public.set_updated_at();

alter table public.market_sources enable row level security;
alter table public.market_ingestion_jobs enable row level security;
alter table public.market_evidence enable row level security;

create or replace function public.record_market_project_version(
  p_project_id uuid,
  p_reason text,
  p_snapshot jsonb,
  p_actor text default 'OWNER'
) returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  next_version integer;
begin
  update public.market_projects
    set active_version = active_version + 1
    where id = p_project_id
    returning active_version into next_version;
  if next_version is null then
    raise exception 'market project not found';
  end if;
  insert into public.market_project_versions(project_id, version_number, reason, snapshot, created_by)
  values (p_project_id, next_version, left(coalesce(nullif(trim(p_reason),''),'DATA_ROOM_UPDATED'),160), coalesce(p_snapshot,'{}'::jsonb), left(coalesce(nullif(trim(p_actor),''),'OWNER'),160));
  return next_version;
end;
$$;

revoke all on table public.market_sources, public.market_ingestion_jobs, public.market_evidence
  from public, anon, authenticated;
grant select, insert, update, delete on table public.market_sources, public.market_ingestion_jobs, public.market_evidence
  to service_role;
revoke all on function public.record_market_project_version(uuid,text,jsonb,text) from public, anon, authenticated;
grant execute on function public.record_market_project_version(uuid,text,jsonb,text) to service_role;

comment on table public.market_sources is
  'Owner-only source files isolated by market project. Storage paths are never exposed without short-lived signed URLs.';
comment on table public.market_ingestion_jobs is
  'OCR and text extraction review jobs. No external AI call is required.';
comment on table public.market_evidence is
  'Product-isolated evidence records gated by source, confidence and owner confirmation.';

notify pgrst, 'reload schema';
commit;
