begin;

alter table public.ab_tests
  add column if not exists master_product_id uuid references public.master_products(id) on delete set null,
  add column if not exists market_project_id uuid references public.market_projects(id) on delete set null;

create index if not exists ab_tests_master_product_created_idx
  on public.ab_tests(master_product_id, created_at desc)
  where master_product_id is not null;

create index if not exists ab_tests_market_project_created_idx
  on public.ab_tests(market_project_id, created_at desc)
  where market_project_id is not null;

commit;
