begin;
create or replace function public.moaon_capture_stock_order(p_platform text,i jsonb,o jsonb) returns void
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
  if s ~ '^[CREU][0-9]' or s ~ '(CANCEL|RETURN|EXCHANGE)'  or upper(coalesce(o#>>'{raw_data,canceled}',''))='T' then decision='CANCEL';end if;
 elsif p_platform='COUPANG' then
  line=case when nullif(i#>>'{raw_data,orderItemId}','') is not null then 'ITEM:'||(i->>'order_id')||':'||(i#>>'{raw_data,orderItemId}') else i->>'external_item_key' end;product=i->>'vendor_item_id';opt='';at_time=coalesce(nullif(o->>'paid_at',''),o->>'ordered_at')::timestamptz;s=upper(coalesce(i->>'status',o->>'status',''));
  if upper(coalesce(i#>>'{raw_data,fulfillmentType}',o#>>'{raw_data,fulfillmentType}','')) ~ '(ROCKET|RG|COUPANG)' then return;end if;
  if s in ('ACCEPT','INSTRUCT','DEPARTURE','DELIVERING','FINAL_DELIVERY','PAYMENT_COMPLETE','PAID','PREPARING','SHIPPING','DELIVERED') then decision='PAID';end if;
  if s like '%CANCEL%' or s like '%RETURN%' then decision='CANCEL';end if;
 else
  line=i->>'product_order_id';product=i->>'product_id';opt=coalesce(i->>'option_name','');at_time=coalesce(nullif(o->>'payment_date',''),o->>'order_date')::timestamptz;s=upper(coalesce(i->>'status',o->>'status',''));
  if s in ('PAYED','DELIVERING','DELIVERED','PURCHASE_DECIDED','EXCHANGED') then decision='PAID';end if;
  if s like '%CANCEL%' or s like '%RETURN%' or s='EXCHANGED' then decision='CANCEL';end if;
 end if;
 if upper(coalesce(o->>'status','')) ~ '(CANCEL|RETURN|EXCHANGE)' then decision='CANCEL';end if;
 if nullif(line,'') is null or nullif(product,'') is null then return;end if;
 insert into public.moaon_stock_order_events(platform,line_id,order_id,product_key,option_key,name,quantity,ordered_at,status)
 values(p_platform,line,i->>'order_id',product,opt,left(coalesce(i->>'product_name','상품'),200),coalesce((i->>'quantity')::numeric,0),at_time,decision)
 on conflict(platform,line_id) do update set product_key=excluded.product_key,option_key=excluded.option_key,quantity=excluded.quantity,status=excluded.status,updated_at=now();
 perform public.moaon_apply_stock_order(p_platform,line);
end $$;

commit;
