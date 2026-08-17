begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create index if not exists market_naver_ad_research_profiles_product_idx
  on public.market_naver_ad_research_profiles (master_product_id);
create index if not exists market_naver_ad_research_snapshots_profile_idx
  on public.market_naver_ad_research_snapshots (profile_id);

drop policy if exists market_naver_ad_research_profiles_browser_deny
  on public.market_naver_ad_research_profiles;
create policy market_naver_ad_research_profiles_browser_deny
  on public.market_naver_ad_research_profiles
  for all
  to anon, authenticated
  using (false)
  with check (false);

drop policy if exists market_naver_ad_research_snapshots_browser_deny
  on public.market_naver_ad_research_snapshots;
create policy market_naver_ad_research_snapshots_browser_deny
  on public.market_naver_ad_research_snapshots
  for all
  to anon, authenticated
  using (false)
  with check (false);

comment on policy market_naver_ad_research_profiles_browser_deny
  on public.market_naver_ad_research_profiles is
  'Explicit browser-role deny. Only the server-side service role may access product-scoped settings.';
comment on policy market_naver_ad_research_snapshots_browser_deny
  on public.market_naver_ad_research_snapshots is
  'Explicit browser-role deny. Search Ads response snapshots remain server-only.';

notify pgrst, 'reload schema';
commit;
