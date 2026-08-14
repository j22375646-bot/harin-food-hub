begin;

alter table public.ai_knowledge_documents
  add column if not exists source_status text not null default 'NOT_UPLOADED',
  add column if not exists source_storage_bucket text,
  add column if not exists source_storage_path text,
  add column if not exists source_file_name text,
  add column if not exists source_mime_type text,
  add column if not exists source_size_bytes bigint,
  add column if not exists source_sha256 text,
  add column if not exists source_uploaded_at timestamptz;

alter table public.ai_knowledge_documents
  drop constraint if exists ai_knowledge_documents_source_status_check,
  drop constraint if exists ai_knowledge_documents_source_size_bytes_check,
  drop constraint if exists ai_knowledge_documents_source_sha256_check;

alter table public.ai_knowledge_documents
  add constraint ai_knowledge_documents_source_status_check
    check (source_status in ('NOT_UPLOADED','UPLOAD_PENDING','STORED','FAILED')),
  add constraint ai_knowledge_documents_source_size_bytes_check
    check (source_size_bytes is null or source_size_bytes between 1 and 20971520),
  add constraint ai_knowledge_documents_source_sha256_check
    check (source_sha256 is null or source_sha256 ~ '^[a-f0-9]{64}$');

create index if not exists ai_knowledge_documents_source_status_idx
  on public.ai_knowledge_documents (source_status, updated_at desc);

comment on column public.ai_knowledge_documents.source_storage_bucket is
  'Private Supabase Storage bucket. Never expose a public object URL.';
comment on column public.ai_knowledge_documents.source_storage_path is
  'Server-managed object path. The document must be reviewed again after every replacement.';
comment on column public.ai_knowledge_documents.source_sha256 is
  'Browser-computed SHA-256 used to identify exact document versions before OpenAI upload is enabled.';

commit;
