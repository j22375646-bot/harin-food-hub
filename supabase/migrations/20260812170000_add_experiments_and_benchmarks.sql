create table if not exists public.ab_tests (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  platform text not null default 'ALL' check (platform in ('ALL','NAVER','CAFE24','COUPANG')),
  hypothesis text not null default '',
  target_type text not null default 'OTHER' check (target_type in ('CAMPAIGN','ADGROUP','KEYWORD','PRODUCT','LANDING','OFFER','CREATIVE','OTHER')),
  source_type text not null default 'MANUAL' check (source_type in ('MANUAL','NAVER_ENTITY','CAFE24_PRODUCT','COUPANG_PRODUCT')),
  metric text not null check (metric in ('CTR','CPC','CVR','CPA','ROAS','REVENUE','ORDERS','AOV')),
  start_date date not null,
  end_date date not null,
  status text not null default 'DRAFT' check (status in ('DRAFT','RUNNING','COMPLETED','CANCELLED')),
  minimum_sample_size integer not null default 30 check (minimum_sample_size > 0),
  confidence_level numeric(5,2) not null default 90 check (confidence_level >= 50 and confidence_level < 100),
  minimum_detectable_lift numeric(8,2) not null default 10 check (minimum_detectable_lift >= 0),
  evaluation_status text not null default 'NOT_EVALUATED' check (evaluation_status in ('NOT_EVALUATED','INSUFFICIENT_SAMPLE','INCONCLUSIVE','WINNER')),
  winner_variant_id uuid,
  result_summary text,
  last_evaluated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create table if not exists public.ab_test_variants (
  id uuid primary key default gen_random_uuid(),
  ab_test_id uuid not null references public.ab_tests(id) on delete cascade,
  name text not null,
  is_control boolean not null default false,
  entity_id text,
  impressions numeric not null default 0 check (impressions >= 0),
  clicks numeric not null default 0 check (clicks >= 0),
  conversions numeric not null default 0 check (conversions >= 0),
  orders numeric not null default 0 check (orders >= 0),
  revenue numeric not null default 0 check (revenue >= 0),
  cost numeric not null default 0 check (cost >= 0),
  calculated_metrics jsonb not null default '{}'::jsonb,
  source_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ab_test_id, name)
);

create unique index if not exists ab_test_single_control_idx on public.ab_test_variants(ab_test_id) where is_control;
create index if not exists ab_tests_status_period_idx on public.ab_tests(status, start_date, end_date);
create index if not exists ab_tests_platform_idx on public.ab_tests(platform, created_at desc);
create index if not exists ab_test_variants_test_idx on public.ab_test_variants(ab_test_id);

create table if not exists public.performance_benchmarks (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  platform text not null default 'ALL' check (platform in ('ALL','NAVER','CAFE24','COUPANG')),
  metric text not null check (metric in ('CTR','CPC','CVR','CPA','ROAS','REVENUE','ORDERS','AOV')),
  segment text not null default 'ALL',
  warning_value numeric,
  target_value numeric not null,
  direction text not null default 'HIGHER_IS_BETTER' check (direction in ('HIGHER_IS_BETTER','LOWER_IS_BETTER')),
  source_type text not null default 'INTERNAL' check (source_type in ('INTERNAL','MANUAL','EXTERNAL')),
  source_name text,
  effective_from date not null default current_date,
  effective_to date,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from)
);

create index if not exists performance_benchmarks_active_idx on public.performance_benchmarks(platform, metric, is_active, effective_from desc);

drop trigger if exists ab_tests_set_updated_at on public.ab_tests;
create trigger ab_tests_set_updated_at before update on public.ab_tests for each row execute function public.set_updated_at();
drop trigger if exists ab_test_variants_set_updated_at on public.ab_test_variants;
create trigger ab_test_variants_set_updated_at before update on public.ab_test_variants for each row execute function public.set_updated_at();
drop trigger if exists performance_benchmarks_set_updated_at on public.performance_benchmarks;
create trigger performance_benchmarks_set_updated_at before update on public.performance_benchmarks for each row execute function public.set_updated_at();

alter table public.ab_tests enable row level security;
alter table public.ab_test_variants enable row level security;
alter table public.performance_benchmarks enable row level security;
revoke all on public.ab_tests, public.ab_test_variants, public.performance_benchmarks from anon, authenticated;
grant select, insert, update, delete on public.ab_tests, public.ab_test_variants, public.performance_benchmarks to service_role;
