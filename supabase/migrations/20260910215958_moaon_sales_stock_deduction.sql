begin;
create table public.moaon_stock_sales_rules(
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,platform text not null check(platform in ('CAFE24','NAVER','COUPANG')),
 product_key text not null,option_key text not null default '',name text not null,
 product_no text not null,unit text not null check(unit in ('개','KG','티백','박스')),factor numeric(15,3) not null check(factor>0 and factor<=1000000),
 enabled boolean not null default true,starts_at timestamptz not null default now(),updated_by uuid not null,
 unique(tenant_id,platform,product_key,option_key)
);
create table public.moaon_stock_order_events(
 platform text not null,line_id text not null,order_id text not null,product_key text not null,option_key text not null,
 name text not null,quantity numeric not null,ordered_at timestamptz,status text not null,updated_at timestamptz not null default now(),
 primary key(platform,line_id)
);
create table public.moaon_stock_order_ledger(
 tenant_id uuid not null,platform text not null,line_id text not null,order_id text not null,name text not null,
 source_product text,source_option text,rule_id uuid,quantity numeric,required numeric,unit text,product_no text,state text not null,reason text not null default '',
 allocations jsonb not null default '[]',updated_at timestamptz not null default now(),
 primary key(tenant_id,platform,line_id)
);
create table public.moaon_stock_sync_errors(source text not null,order_key text not null,code text not null,updated_at timestamptz not null default now(),primary key(source,order_key));
alter table public.moaon_stock_sync_errors enable row level security;
revoke all on public.moaon_stock_sync_errors from public,anon,authenticated;
grant select,insert,update on public.moaon_stock_sync_errors to service_role;
alter table public.moaon_stock_sales_rules enable row level security;
alter table public.moaon_stock_order_events enable row level security;
alter table public.moaon_stock_order_ledger enable row level security;
revoke all on public.moaon_stock_sales_rules,public.moaon_stock_order_events,public.moaon_stock_order_ledger from public,anon,authenticated;
grant select,insert,update on public.moaon_stock_sales_rules,public.moaon_stock_order_events,public.moaon_stock_order_ledger to service_role;

create function public.moaon_apply_stock_order(p_platform text,p_line text) returns void
language plpgsql set search_path='' as $$
declare e public.moaon_stock_order_events;r public.moaon_stock_sales_rules;l public.moaon_stock_order_ledger;
 lot public.moaon_stock_lots;needed numeric;available numeric;take_qty numeric;remaining numeric;alloc jsonb='[]';
 tenant constant uuid='a3452bca-e259-40ed-a93d-b8bcc5c1b9e0';
begin
 perform pg_advisory_xact_lock(hashtextextended(tenant::text,0));
 select * into e from public.moaon_stock_order_events where platform=p_platform and line_id=p_line;
 if not found then return; end if;
 select * into l from public.moaon_stock_order_ledger where tenant_id=tenant and platform=p_platform and line_id=p_line;
 if found and jsonb_array_length(l.allocations)>0 then
  if e.status in ('CANCEL','REVIEW') or e.quantity is distinct from l.quantity or e.product_key is distinct from l.source_product or e.option_key is distinct from l.source_option then
   update public.moaon_stock_order_ledger set state='REVIEW',reason='취소·반품 또는 주문 변경: 실물과 차감 이력을 확인하세요.',updated_at=now() where tenant_id=tenant and platform=p_platform and line_id=p_line;
  end if;
  return;
 end if;
 select * into r from public.moaon_stock_sales_rules where tenant_id=tenant and platform=e.platform and product_key=e.product_key and option_key in (e.option_key,'*') order by (option_key=e.option_key) desc limit 1;
 if not found or not r.enabled or e.ordered_at is null or e.ordered_at<r.starts_at then return; end if;
 if e.status<>'PAID' then
  update public.moaon_stock_order_ledger set state='SKIPPED',reason='미결제·취소·상태 확인 필요',updated_at=now() where tenant_id=tenant and platform=p_platform and line_id=p_line and jsonb_array_length(allocations)=0;
  return;
 end if;
 needed=e.quantity*r.factor;
 if e.quantity<=0 or e.quantity<>trunc(e.quantity) or needed>1000000000 or (r.unit<>'KG' and needed<>trunc(needed)) then return; end if;
 insert into public.moaon_stock_order_ledger(tenant_id,platform,line_id,order_id,name,source_product,source_option,rule_id,quantity,required,unit,product_no,state)
 values(tenant,p_platform,p_line,e.order_id,e.name,e.product_key,e.option_key,r.id,e.quantity,needed,r.unit,r.product_no,'PENDING')
 on conflict(tenant_id,platform,line_id) do update set rule_id=r.id,quantity=e.quantity,required=needed,unit=r.unit,product_no=r.product_no,state='PENDING',updated_at=now();
 -- Lock in deterministic FEFO order; expiry and unit mismatch never consume a lot.
 available=0;
 for lot in select * from public.moaon_stock_lots where tenant_id=tenant and data->>'productNo'=r.product_no and data->>'unit'=r.unit
 and (coalesce(data->>'expires','')='' or data->>'expires'>=to_char(now() at time zone 'Asia/Seoul','YYYY-MM-DD'))
 order by nullif(data->>'expires','') nulls last,updated_at,id for update loop
  available=available+(lot.data->>'quantity')::numeric;
 end loop;
 if available<needed then
  update public.moaon_stock_order_ledger set state='INSUFFICIENT',reason='출고 가능한 재고가 부족합니다. 입고 후 재확인하세요.',updated_at=now() where tenant_id=tenant and platform=p_platform and line_id=p_line;return;
 end if;
 remaining=needed;
 for lot in select * from public.moaon_stock_lots where tenant_id=tenant and data->>'productNo'=r.product_no and data->>'unit'=r.unit and (data->>'quantity')::numeric>0
 and (coalesce(data->>'expires','')='' or data->>'expires'>=to_char(now() at time zone 'Asia/Seoul','YYYY-MM-DD'))
 order by nullif(data->>'expires','') nulls last,updated_at,id for update loop
  take_qty=least(remaining,(lot.data->>'quantity')::numeric);
  update public.moaon_stock_lots set data=jsonb_set(data,'{quantity}',to_jsonb((data->>'quantity')::numeric-take_qty)),revision=revision+1,updated_at=now(),updated_by=r.updated_by where tenant_id=tenant and id=lot.id returning * into lot;
  insert into public.moaon_stock_lot_history(tenant_id,id,revision,data,changed_by) values(tenant,lot.id,lot.revision,lot.data,r.updated_by);
  alloc=alloc||jsonb_build_array(jsonb_build_object('lotId',lot.id,'quantity',take_qty));remaining=remaining-take_qty;exit when remaining=0;
 end loop;
 update public.moaon_stock_order_ledger set state='APPLIED',allocations=alloc,reason='',updated_at=now() where tenant_id=tenant and platform=p_platform and line_id=p_line;
end $$;

create function public.moaon_capture_stock_order(p_platform text,i jsonb,o jsonb) returns void
language plpgsql set search_path='' as $$
declare line text;product text;opt text;at_time timestamptz;s text;decision text='REVIEW';origin text;
begin
 if o is null then return; end if;
 if p_platform='CAFE24' then
  origin=upper(coalesce(nullif(o#>>'{raw_data,order_place_id}',''),nullif(o#>>'{raw_data,market_id}',''),o#>>'{raw_data,market_code}',''));
  if origin not in ('','SELF','MOBILE','MOBILE_D','CAFE24','NCHECKOUT') then return; end if;
  line=i->>'external_item_id';product=i->>'external_product_no';opt=coalesce(i->>'option_name','');at_time=(o->>'order_date')::timestamptz;
  s=upper(coalesce(i#>>'{raw_data,order_status}',o->>'payment_status',''));
  if s in ('N10','N20','N21','N22','N30','N40','N50','PAID','PAYMENT_COMPLETE','PREPARING','READY_TO_SHIP','SHIPPING','SHIPPED','DELIVERED','COMPLETE') or (s in ('N00','N01') and upper(coalesce(o#>>'{raw_data,paid}',''))='T') then decision='PAID'; end if;
  if s like 'C%' or s like 'R%' or s like 'E%' or upper(coalesce(o#>>'{raw_data,canceled}',''))='T' then decision='CANCEL';end if;
 elsif p_platform='COUPANG' then
  line=i->>'external_item_key';product=i->>'vendor_item_id';opt='';at_time=coalesce(nullif(o->>'paid_at',''),o->>'ordered_at')::timestamptz;s=upper(coalesce(i->>'status',o->>'status',''));
  if upper(coalesce(i#>>'{raw_data,fulfillmentType}',o#>>'{raw_data,fulfillmentType}','')) ~ '(ROCKET|RG|COUPANG)' then return;end if;
  if s in ('ACCEPT','INSTRUCT','DEPARTURE','DELIVERING','FINAL_DELIVERY','PAYMENT_COMPLETE','PAID','PREPARING','SHIPPING','DELIVERED') then decision='PAID';end if;
  if s like '%CANCEL%' or s like '%RETURN%' then decision='CANCEL';end if;
 else
  line=i->>'product_order_id';product=i->>'product_id';opt=coalesce(i->>'option_name','');at_time=coalesce(nullif(o->>'payment_date',''),o->>'order_date')::timestamptz;s=upper(coalesce(i->>'status',o->>'status',''));
  if s in ('PAYED','DELIVERING','DELIVERED','PURCHASE_DECIDED','EXCHANGED') then decision='PAID';end if;
  if s like '%CANCEL%' or s like '%RETURN%' or s='EXCHANGED' then decision='CANCEL';end if;
 end if;
 if nullif(line,'') is null or nullif(product,'') is null then return;end if;
 insert into public.moaon_stock_order_events(platform,line_id,order_id,product_key,option_key,name,quantity,ordered_at,status)
 values(p_platform,line,i->>'order_id',product,opt,left(coalesce(i->>'product_name','상품'),200),coalesce((i->>'quantity')::numeric,0),at_time,decision)
 on conflict(platform,line_id) do update set product_key=excluded.product_key,option_key=excluded.option_key,quantity=excluded.quantity,status=excluded.status,updated_at=now();
 perform public.moaon_apply_stock_order(p_platform,line);
end $$;

create function public.moaon_stock_source_trigger() returns trigger language plpgsql set search_path='' as $$
declare o jsonb;i jsonb;n jsonb=to_jsonb(new);p text;
begin
 p=case when tg_table_name like 'cafe24%' then 'CAFE24' when tg_table_name like 'coupang%' then 'COUPANG' else 'NAVER' end;
 if tg_table_name='cafe24_order_items' then select to_jsonb(x) into o from public.cafe24_orders x where order_id=n->>'order_id';
 elsif tg_table_name='coupang_order_items' then select to_jsonb(x) into o from public.coupang_orders x where shipment_box_id=n->>'shipment_box_id';
 elsif tg_table_name='naver_commerce_order_items' then select to_jsonb(x) into o from public.naver_commerce_orders x where order_id=n->>'order_id';
 elsif tg_table_name='cafe24_orders' then for i in select to_jsonb(x) from public.cafe24_order_items x where order_id=n->>'order_id' loop perform public.moaon_capture_stock_order(p,i,n);end loop;return new;
 elsif tg_table_name='coupang_orders' then for i in select to_jsonb(x) from public.coupang_order_items x where shipment_box_id=n->>'shipment_box_id' loop perform public.moaon_capture_stock_order(p,i,n);end loop;return new;
 else for i in select to_jsonb(x) from public.naver_commerce_order_items x where order_id=n->>'order_id' loop perform public.moaon_capture_stock_order(p,i,n);end loop;return new;
 end if;
 perform public.moaon_capture_stock_order(p,n,o);return new;
exception when others then
 insert into public.moaon_stock_sync_errors(source,order_key,code) values(tg_table_name,coalesce(n->>'order_id','UNKNOWN'),sqlstate) on conflict(source,order_key) do update set code=excluded.code,updated_at=now();
 return new;
end $$;
create trigger moaon_stock_order after insert or update on public.cafe24_order_items for each row execute function public.moaon_stock_source_trigger();
create trigger moaon_stock_order after insert or update on public.cafe24_orders for each row execute function public.moaon_stock_source_trigger();
create trigger moaon_stock_order after insert or update on public.coupang_order_items for each row execute function public.moaon_stock_source_trigger();
create trigger moaon_stock_order after insert or update on public.coupang_orders for each row execute function public.moaon_stock_source_trigger();
create trigger moaon_stock_order after insert or update on public.naver_commerce_order_items for each row execute function public.moaon_stock_source_trigger();
create trigger moaon_stock_order after insert or update on public.naver_commerce_orders for each row execute function public.moaon_stock_source_trigger();
revoke all on function public.moaon_apply_stock_order(text,text),public.moaon_capture_stock_order(text,jsonb,jsonb),public.moaon_stock_source_trigger() from public,anon,authenticated;
grant execute on function public.moaon_apply_stock_order(text,text),public.moaon_capture_stock_order(text,jsonb,jsonb),public.moaon_stock_source_trigger() to service_role;
commit;
