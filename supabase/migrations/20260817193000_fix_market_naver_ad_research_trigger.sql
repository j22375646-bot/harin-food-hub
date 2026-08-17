begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create or replace function public.check_market_naver_ad_research_links()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1 from public.market_projects p
    where p.id = new.project_id and p.master_product_id = new.master_product_id
  ) then
    raise exception 'market NAVER ad research product does not match project';
  end if;
  if tg_table_name = 'market_naver_ad_research_snapshots'
    and (to_jsonb(new)->>'profile_id')::uuid <> new.project_id then
    raise exception 'market NAVER ad research profile does not match project';
  end if;
  return new;
end;
$$;

revoke all on function public.check_market_naver_ad_research_links() from public, anon, authenticated;
grant execute on function public.check_market_naver_ad_research_links() to service_role;

notify pgrst, 'reload schema';
commit;
