begin;

alter table public.ai_analysis_results
  drop constraint if exists ai_analysis_results_analysis_type_check,
  drop constraint if exists ai_analysis_results_status_check;

alter table public.ai_analysis_results
  add constraint ai_analysis_results_analysis_type_check
    check (analysis_type in (
      'NAVER_EXECUTIVE_EXPLANATION',
      'PAGE_MAIN','PAGE_INSIGHT','PAGE_KEYWORD',
      'PAGE_PRODUCT','PAGE_INVENTORY','PAGE_SETTLEMENT'
    )),
  add constraint ai_analysis_results_status_check
    check (status in ('PREVIEW','READY','BLOCKED','FAILED'));

alter table public.ai_analysis_results
  add column if not exists page_key text,
  add column if not exists result_mode text not null default 'OPENAI',
  add column if not exists period_label text,
  add column if not exists data_status text,
  add column if not exists knowledge_versions jsonb not null default '[]'::jsonb;

alter table public.ai_analysis_results
  drop constraint if exists ai_analysis_results_page_key_check,
  drop constraint if exists ai_analysis_results_result_mode_check,
  drop constraint if exists ai_analysis_results_data_status_check;

alter table public.ai_analysis_results
  add constraint ai_analysis_results_page_key_check
    check (page_key is null or page_key in ('main','insight','keyword','product','inventory','settlement')),
  add constraint ai_analysis_results_result_mode_check
    check (result_mode in ('SERVER_PREVIEW','OPENAI')),
  add constraint ai_analysis_results_data_status_check
    check (data_status is null or data_status in ('READY','PARTIAL','STALE','BLOCKED','NO_DATA'));

create index if not exists ai_analysis_results_page_latest_idx
  on public.ai_analysis_results (page_key, created_at desc)
  where page_key is not null;

alter table public.ai_analysis_results enable row level security;
revoke all on public.ai_analysis_results from anon, authenticated;
grant select, insert, update, delete on public.ai_analysis_results to service_role;

comment on column public.ai_analysis_results.result_mode is
  'SERVER_PREVIEW is a deterministic no-cost preview. OPENAI is a paid structured explanation.';
comment on column public.ai_analysis_results.knowledge_versions is
  'Approved knowledge document ids and versions used for the result. Never stores document contents.';

commit;
