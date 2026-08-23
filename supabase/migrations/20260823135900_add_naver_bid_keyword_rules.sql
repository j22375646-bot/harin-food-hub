begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create table if not exists public.naver_bid_keyword_rules (
  ncc_keyword_id text primary key references public.naver_keywords(ncc_keyword_id) on delete cascade,
  ncc_adgroup_id text not null default '',
  enabled boolean not null default false,
  target_rank integer check (target_rank between 1 and 5),
  target_rank_mode text not null default 'REFERENCE_ONLY'
    check (target_rank_mode = 'REFERENCE_ONLY'),
  minimum_bid integer not null default 70
    check (minimum_bid between 70 and 100000 and minimum_bid % 10 = 0),
  maximum_bid integer not null default 100000
    check (maximum_bid between 70 and 100000 and maximum_bid % 10 = 0),
  increase_step integer not null default 10
    check (increase_step between 10 and 100000 and increase_step % 10 = 0),
  decrease_step integer not null default 10
    check (decrease_step between 10 and 100000 and decrease_step % 10 = 0),
  updated_by text not null default 'dashboard-session'
    check (char_length(updated_by) between 1 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (minimum_bid <= maximum_bid)
);

create index if not exists naver_bid_keyword_rules_adgroup_idx
  on public.naver_bid_keyword_rules (ncc_adgroup_id, updated_at desc);
create index if not exists naver_bid_keyword_rules_enabled_idx
  on public.naver_bid_keyword_rules (enabled, updated_at desc)
  where enabled = true;

drop trigger if exists naver_bid_keyword_rules_set_updated_at on public.naver_bid_keyword_rules;
create trigger naver_bid_keyword_rules_set_updated_at
before update on public.naver_bid_keyword_rules
for each row execute function public.set_updated_at();

alter table public.naver_bid_keyword_rules enable row level security;
revoke all on table public.naver_bid_keyword_rules from public, anon, authenticated;
revoke all on table public.naver_bid_keyword_rules from service_role;
grant select, insert, update on table public.naver_bid_keyword_rules to service_role;

comment on table public.naver_bid_keyword_rules is
  'Server-only owner settings for Naver keyword bid safety windows. Coupang data and write paths are forbidden.';
comment on column public.naver_bid_keyword_rules.target_rank is
  'Owner reference goal limited to officially probed positions 1-5. It never triggers an automatic bid change.';
comment on column public.naver_bid_keyword_rules.target_rank_mode is
  'Always REFERENCE_ONLY until the official estimate is explicitly requested and separately labeled.';

notify pgrst, 'reload schema';
commit;
