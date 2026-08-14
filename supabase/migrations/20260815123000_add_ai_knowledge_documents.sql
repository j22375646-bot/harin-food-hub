begin;

create table if not exists public.ai_knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 2 and 160),
  category text not null check (category in ('PLANNING','PRODUCT','MARKETING','COMPLIANCE','CS','COST_SHIPPING')),
  version_label text not null default 'v1.0' check (char_length(version_label) between 1 and 40),
  status text not null default 'DRAFT' check (status in ('DRAFT','READY','ACTIVE','ARCHIVED')),
  scope_pages text[] not null default '{}'::text[],
  source_type text not null default 'METADATA' check (source_type in ('METADATA','FILE','URL')),
  source_label text,
  notes text,
  privacy_status text not null default 'REVIEW_REQUIRED' check (privacy_status in ('REVIEW_REQUIRED','APPROVED','BLOCKED')),
  openai_file_id text,
  vector_store_file_id text,
  vector_status text not null default 'NOT_CONNECTED' check (vector_status in ('NOT_CONNECTED','QUEUED','PROCESSING','READY','FAILED')),
  approved_by text,
  approved_at timestamptz,
  created_by text not null default 'owner',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (scope_pages <@ array['main','insight','keyword','product','inventory','settlement']::text[]),
  check (openai_file_id is null or openai_file_id ~ '^file[_-][A-Za-z0-9_-]+$'),
  check (vector_store_file_id is null or vector_store_file_id ~ '^vs[_-][A-Za-z0-9_-]+$')
);

create index if not exists ai_knowledge_documents_status_updated_idx
  on public.ai_knowledge_documents (status, updated_at desc);
create index if not exists ai_knowledge_documents_category_idx
  on public.ai_knowledge_documents (category);

alter table public.ai_knowledge_documents enable row level security;
revoke all on public.ai_knowledge_documents from anon, authenticated;
grant select, insert, update, delete on public.ai_knowledge_documents to service_role;

comment on table public.ai_knowledge_documents is 'Server-only registry of owner-approved AI reference materials. File contents and customer PII are not stored here.';
comment on column public.ai_knowledge_documents.scope_pages is 'Allowlisted Hub pages that may use this reference after File Search is enabled.';
comment on column public.ai_knowledge_documents.privacy_status is 'Owner review gate. Customer names, phone numbers, addresses, emails, and raw order data must be blocked.';

commit;
