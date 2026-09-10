begin;
-- Only API-backed, stocked selling options enter this persistent watch list.
create table public.moaon_rocket_watch (
 vendor_item_id text primary key,
 name text not null,
 first_seen_at timestamptz not null default now()
);
alter table public.moaon_rocket_watch enable row level security;
revoke all on public.moaon_rocket_watch from public, anon, authenticated;
grant select, insert, update on public.moaon_rocket_watch to service_role;
create function public.moaon_watch_rocket_stock() returns trigger
language plpgsql set search_path='' as $$
begin
 if new.total_orderable_quantity > 0 then
  insert into public.moaon_rocket_watch(vendor_item_id,name)
  select i.vendor_item_id,coalesce(nullif(i.item_name,''),p.product_name,i.vendor_item_id)
  from public.coupang_product_items i join public.coupang_products p using(seller_product_id)
  where i.vendor_item_id=new.vendor_item_id
   and upper(coalesce(i.status,p.status,'')) in ('APPROVED','ACTIVE','SELLING','ON_SALE','SALE','AVAILABLE','승인완료','판매중')
   and upper(coalesce(p.status,'')) in ('APPROVED','ACTIVE','SELLING','ON_SALE','SALE','AVAILABLE','승인완료','판매중')
  on conflict(vendor_item_id) do nothing;
 end if;
 return new;
end $$;
create trigger moaon_watch_rocket after insert or update on public.coupang_rg_inventory
for each row execute function public.moaon_watch_rocket_stock();
insert into public.moaon_rocket_watch(vendor_item_id,name)
select r.vendor_item_id,coalesce(nullif(i.item_name,''),p.product_name,r.vendor_item_id)
from public.coupang_rg_inventory r join public.coupang_product_items i using(vendor_item_id)
join public.coupang_products p using(seller_product_id)
where r.total_orderable_quantity>0
 and upper(coalesce(i.status,p.status,'')) in ('APPROVED','ACTIVE','SELLING','ON_SALE','SALE','AVAILABLE','승인완료','판매중')
 and upper(coalesce(p.status,'')) in ('APPROVED','ACTIVE','SELLING','ON_SALE','SALE','AVAILABLE','승인완료','판매중');
create table public.moaon_product_choices (
 id uuid not null unique default gen_random_uuid(),
 tenant_id uuid not null,
 master_id text not null,
 platform text not null check(platform in ('CAFE24','NAVER','COUPANG')),
 link_id text not null,
 updated_at timestamptz not null default now(),
 primary key(tenant_id,master_id,platform)
);
alter table public.moaon_product_choices enable row level security;
revoke all on public.moaon_product_choices from public,anon,authenticated;
grant select,insert,update on public.moaon_product_choices to service_role;
create function public.moaon_queue_rocket_refresh() returns jsonb
language plpgsql set search_path='' as $$
declare job public.coupang_sync_requests;
begin
 perform pg_advisory_xact_lock(hashtextextended('moaon_rocket_refresh',0));
 select * into job from public.coupang_sync_requests where request_type='RG_INVENTORY'
 and (status in ('PENDING','RUNNING') or created_at>now()-interval '5 minutes') order by created_at desc limit 1;
 if not found then insert into public.coupang_sync_requests(request_type,status) values('RG_INVENTORY','PENDING') returning * into job; end if;
 return jsonb_build_object('id',job.id,'status',job.status);
end $$;
revoke all on function public.moaon_queue_rocket_refresh() from public,anon,authenticated;
grant execute on function public.moaon_queue_rocket_refresh() to service_role;
commit;
