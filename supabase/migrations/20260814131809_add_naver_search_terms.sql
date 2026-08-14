begin;

create table if not exists public.naver_search_terms (
  id uuid primary key default gen_random_uuid(),
  period_start date not null,
  period_end date not null,
  ncc_adgroup_id text not null,
  campaign_type text not null default 'SHOPPING',
  search_term text not null,
  normalized_term text not null,
  impressions bigint not null default 0 check (impressions >= 0),
  clicks bigint not null default 0 check (clicks >= 0),
  cost numeric not null default 0 check (cost >= 0),
  conversions numeric not null default 0 check (conversions >= 0),
  conversion_revenue numeric not null default 0 check (conversion_revenue >= 0),
  classification_auto text not null check (classification_auto in ('BRAND','GENERAL_PURCHASE','PRODUCT_DETAIL','PROBLEM_SITUATION','INFORMATION','IRRELEVANT')),
  classification_override text check (classification_override is null or classification_override in ('BRAND','GENERAL_PURCHASE','PRODUCT_DETAIL','PROBLEM_SITUATION','INFORMATION','IRRELEVANT')),
  classification_confidence numeric not null default 0 check (classification_confidence >= 0 and classification_confidence <= 1),
  recommended_action text not null check (recommended_action in ('NEGATIVE_REVIEW','SEPARATE','LANDING_REVIEW','NEW_KEYWORD','CONTENT_FAQ','OBSERVE')),
  action_reason text not null,
  action_status text not null default 'PENDING' check (action_status in ('PENDING','REVIEWED','IGNORED')),
  is_registered_exact boolean not null default false,
  owner_note text,
  source text not null default 'NAVER_SEARCH_AD_API',
  raw_data jsonb not null default '{}'::jsonb,
  collected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint naver_search_terms_period_check check (period_end >= period_start),
  constraint naver_search_terms_unique unique (period_start, period_end, ncc_adgroup_id, normalized_term)
);

create index if not exists naver_search_terms_period_idx on public.naver_search_terms (period_end desc, period_start desc);
create index if not exists naver_search_terms_action_idx on public.naver_search_terms (recommended_action, action_status, period_end desc);
create index if not exists naver_search_terms_classification_idx on public.naver_search_terms ((coalesce(classification_override, classification_auto)), period_end desc);

drop trigger if exists set_naver_search_terms_updated_at on public.naver_search_terms;
create trigger set_naver_search_terms_updated_at before update on public.naver_search_terms
for each row execute function public.set_updated_at();

alter table public.naver_search_terms enable row level security;
revoke all on public.naver_search_terms from anon, authenticated;
grant select, insert, update, delete on public.naver_search_terms to service_role;

comment on table public.naver_search_terms is 'Server-only Naver Shopping Search Ads actual search-term performance and owner review decisions.';
comment on column public.naver_search_terms.classification_override is 'Owner correction; when present it takes precedence over deterministic classification_auto.';
comment on column public.naver_search_terms.recommended_action is 'Review recommendation only. Phase 12-2 never writes negative keywords or bids to Naver.';

commit;
