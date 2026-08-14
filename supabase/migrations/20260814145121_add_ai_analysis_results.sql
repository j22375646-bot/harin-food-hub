begin;

create table if not exists public.ai_analysis_results (
  id uuid primary key default gen_random_uuid(),
  analysis_type text not null check (analysis_type in ('NAVER_EXECUTIVE_EXPLANATION')),
  status text not null check (status in ('READY','BLOCKED','FAILED')),
  model text,
  openai_response_id text,
  input_fingerprint text not null check (length(input_fingerprint) = 64),
  formula_version text not null,
  source_snapshot jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  token_usage jsonb not null default '{}'::jsonb,
  error_code text,
  created_by text not null default 'owner',
  created_at timestamptz not null default now()
);

create index if not exists ai_analysis_results_latest_idx
  on public.ai_analysis_results (analysis_type, created_at desc);
create index if not exists ai_analysis_results_fingerprint_idx
  on public.ai_analysis_results (analysis_type, input_fingerprint, created_at desc);

alter table public.ai_analysis_results enable row level security;
revoke all on public.ai_analysis_results from anon, authenticated;
grant select, insert, update, delete on public.ai_analysis_results to service_role;

comment on table public.ai_analysis_results is 'Server-only structured OpenAI explanations. Source snapshots contain aggregated metrics only and never PII.';
comment on column public.ai_analysis_results.source_snapshot is 'Allowlisted, server-calculated aggregate metrics. Customer, order, address, phone, and email fields are prohibited.';

commit;
