begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

create index if not exists market_execution_plans_product_idx
  on public.market_execution_plans (master_product_id, updated_at desc);
create index if not exists market_execution_plans_ab_test_idx
  on public.market_execution_plans (ab_test_id)
  where ab_test_id is not null;

commit;
