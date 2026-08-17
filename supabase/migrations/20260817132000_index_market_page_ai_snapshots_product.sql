begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

create index if not exists market_page_ai_snapshots_product_idx
  on public.market_page_ai_snapshots (master_product_id, created_at desc);

commit;
