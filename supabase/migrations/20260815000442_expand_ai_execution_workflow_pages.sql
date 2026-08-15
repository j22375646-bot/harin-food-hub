begin;

alter table public.ai_analysis_results
  drop constraint if exists ai_analysis_results_analysis_type_check,
  drop constraint if exists ai_analysis_results_page_key_check;

alter table public.ai_analysis_results
  add constraint ai_analysis_results_analysis_type_check
    check (analysis_type in (
      'NAVER_EXECUTIVE_EXPLANATION',
      'PAGE_MAIN','PAGE_INSIGHT','PAGE_KEYWORD','PAGE_PRODUCT','PAGE_INVENTORY','PAGE_SETTLEMENT',
      'PAGE_REPORTS','PAGE_CHANGES','PAGE_VALIDATION','PAGE_EXPERIMENTS'
    )),
  add constraint ai_analysis_results_page_key_check
    check (page_key is null or page_key in (
      'main','insight','keyword','product','inventory','settlement',
      'reports','changes','validation','experiments'
    ));

comment on constraint ai_analysis_results_page_key_check on public.ai_analysis_results is
  'Harin AI page scope including the diagnosis to experiment execution workflow.';

commit;
