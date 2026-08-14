begin;

alter table public.financial_change_requests
  drop constraint if exists financial_change_requests_change_type_check;

alter table public.financial_change_requests
  add constraint financial_change_requests_change_type_check
  check (change_type in (
    'PRODUCT_COST', 'CHANNEL_COST', 'SHIPPING_RULE', 'BUSINESS_TARGET', 'NAVER_BID'
  ));

create table if not exists public.naver_keyword_product_links (
  ncc_keyword_id text primary key references public.naver_keywords(ncc_keyword_id) on delete cascade,
  master_product_id uuid not null references public.master_products(id) on delete restrict,
  linked_by text not null default 'dashboard-session',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists naver_keyword_product_links_product_idx
  on public.naver_keyword_product_links (master_product_id, updated_at desc);

drop trigger if exists naver_keyword_product_links_set_updated_at on public.naver_keyword_product_links;
create trigger naver_keyword_product_links_set_updated_at
before update on public.naver_keyword_product_links
for each row execute function public.set_updated_at();

alter table public.naver_keyword_product_links enable row level security;
revoke all on public.naver_keyword_product_links from anon, authenticated;
revoke all on public.naver_keyword_product_links from service_role;
grant select, insert, update, delete on public.naver_keyword_product_links to service_role;

comment on table public.naver_keyword_product_links is
  'Server-only explicit keyword-to-product links used by guarded Naver bid recommendations.';

comment on constraint financial_change_requests_change_type_check on public.financial_change_requests is
  'Includes NAVER_BID approval previews; external bid execution remains application-locked in phase 12-6A.';

commit;
