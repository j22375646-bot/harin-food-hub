begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

alter table public.ai_analysis_results
  drop constraint if exists ai_analysis_results_analysis_type_check,
  drop constraint if exists ai_analysis_results_page_key_check,
  drop constraint if exists ai_analysis_results_page_scope_match_check;

alter table public.ai_analysis_results
  add constraint ai_analysis_results_analysis_type_check
    check (analysis_type in (
      'NAVER_EXECUTIVE_EXPLANATION',
      'PAGE_MAIN','PAGE_INSIGHT','PAGE_KEYWORD','PAGE_PRODUCT','PAGE_ORDERS','PAGE_CS',
      'PAGE_INVENTORY','PAGE_SETTLEMENT','PAGE_REPORTS','PAGE_CHANGES','PAGE_VALIDATION','PAGE_EXPERIMENTS'
    )),
  add constraint ai_analysis_results_page_key_check
    check (page_key is null or page_key in (
      'main','insight','keyword','product','orders','cs','inventory','settlement',
      'reports','changes','validation','experiments'
    )),
  add constraint ai_analysis_results_page_scope_match_check
    check (
      (page_key is null and analysis_type = 'NAVER_EXECUTIVE_EXPLANATION') or
      (page_key = 'main' and analysis_type = 'PAGE_MAIN') or
      (page_key = 'insight' and analysis_type = 'PAGE_INSIGHT') or
      (page_key = 'keyword' and analysis_type = 'PAGE_KEYWORD') or
      (page_key = 'product' and analysis_type = 'PAGE_PRODUCT') or
      (page_key = 'orders' and analysis_type = 'PAGE_ORDERS') or
      (page_key = 'cs' and analysis_type = 'PAGE_CS') or
      (page_key = 'inventory' and analysis_type = 'PAGE_INVENTORY') or
      (page_key = 'settlement' and analysis_type = 'PAGE_SETTLEMENT') or
      (page_key = 'reports' and analysis_type = 'PAGE_REPORTS') or
      (page_key = 'changes' and analysis_type = 'PAGE_CHANGES') or
      (page_key = 'validation' and analysis_type = 'PAGE_VALIDATION') or
      (page_key = 'experiments' and analysis_type = 'PAGE_EXPERIMENTS')
    );

comment on constraint ai_analysis_results_page_scope_match_check on public.ai_analysis_results is
  'Each Harin AI result belongs to exactly one page-specific analysis contract. Order and CS results remain isolated.';

commit;
