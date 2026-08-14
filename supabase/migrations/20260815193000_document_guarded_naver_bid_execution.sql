begin;

comment on table public.naver_keyword_product_links is
  'Server-only keyword-to-product links used by guarded Naver bid calculation, owner approval, execution, verification, and rollback.';

comment on constraint financial_change_requests_change_type_check on public.financial_change_requests is
  'Includes NAVER_BID owner approvals. Live execution is guarded by server-only configuration, fresh provider checks, verification, and rollback.';

commit;
