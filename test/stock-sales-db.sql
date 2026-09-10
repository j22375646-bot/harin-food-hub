-- Isolated DB integration assertions. Every inserted row is rolled back.
begin;
do $$
declare tenant uuid='a3452bca-e259-40ed-a93d-b8bcc5c1b9e0';actor uuid=gen_random_uuid();
 a uuid=gen_random_uuid();b uuid=gen_random_uuid();product text='TEST-'||gen_random_uuid();i jsonb;o jsonb;v numeric;s text;
begin
 insert into public.moaon_stock_lots(tenant_id,id,revision,data,updated_by) values
 (tenant,a,1,jsonb_build_object('productNo',product,'unit','개','quantity',4,'expires','2098-01-01'),actor),
 (tenant,b,1,jsonb_build_object('productNo',product,'unit','개','quantity',6,'expires','2099-01-01'),actor);
 insert into public.moaon_stock_sales_rules(tenant_id,platform,product_key,option_key,name,product_no,unit,factor,updated_by)
 values(tenant,'NAVER',product,'*','시험',product,'개',3,actor);
 i=jsonb_build_object('product_order_id',product,'order_id',product,'product_id',product,'product_name','작수차 3개','quantity',2,'status','PAYED');
 o=jsonb_build_object('order_id',product,'payment_date',now()+interval '1 minute');
 perform public.moaon_capture_stock_order('NAVER',i,o);
 select sum((data->>'quantity')::numeric) into v from public.moaon_stock_lots where id in(a,b);assert v=4,'3 pack x 2 must consume 6';
 select (data->>'quantity')::numeric into v from public.moaon_stock_lots where id=a;assert v=0,'FEFO first lot';
 perform public.moaon_capture_stock_order('NAVER',i,o);
 select sum((data->>'quantity')::numeric) into v from public.moaon_stock_lots where id in(a,b);assert v=4,'repeat ingestion must not deduct';
 perform public.moaon_capture_stock_order('NAVER',i||'{"status":"CANCELED"}',o);
 select state into s from public.moaon_stock_order_ledger where platform='NAVER' and line_id=product;assert s='REVIEW','cancellation review';
 select sum((data->>'quantity')::numeric) into v from public.moaon_stock_lots where id in(a,b);assert v=4,'no blind cancellation restock';
 i=i||jsonb_build_object('product_order_id',product||'-short');perform public.moaon_capture_stock_order('NAVER',i,o);
 select state into s from public.moaon_stock_order_ledger where platform='NAVER' and line_id=product||'-short';assert s='INSUFFICIENT','short stock must be held';
 select sum((data->>'quantity')::numeric) into v from public.moaon_stock_lots where id in(a,b);assert v=4,'insufficient must not partially deduct';
 i=i||jsonb_build_object('product_order_id',product||'-old');perform public.moaon_capture_stock_order('NAVER',i,o||jsonb_build_object('payment_date',now()-interval '1 day'));
 assert not exists(select from public.moaon_stock_order_ledger where line_id=product||'-old'),'no historical backfill';
 insert into public.moaon_stock_sales_rules(tenant_id,platform,product_key,option_key,name,product_no,unit,factor,enabled,updated_by) values(tenant,'NAVER',product,'disabled','시험',product,'개',1,false,actor);
 perform public.moaon_capture_stock_order('NAVER',i||jsonb_build_object('product_order_id',product||'-disabled','option_name','disabled'),o);
 assert not exists(select from public.moaon_stock_order_ledger where line_id=product||'-disabled'),'disabled exact option must override enabled wildcard';
 insert into public.moaon_stock_sales_rules(tenant_id,platform,product_key,option_key,name,product_no,unit,factor,updated_by) values(tenant,'CAFE24',product,'*','시험',product,'개',1,actor),(tenant,'COUPANG',product,'','시험',product,'개',1,actor);
 i=jsonb_build_object('external_item_id',product||'-cafe','order_id',product,'external_product_no',product,'quantity',1,'raw_data',jsonb_build_object('order_status','COMPLETE'));
 o=jsonb_build_object('order_date',now()+interval '1 minute','raw_data',jsonb_build_object('order_place_id','SELF'));
 perform public.moaon_capture_stock_order('CAFE24',i,o);
 select state into s from public.moaon_stock_order_ledger where line_id=product||'-cafe';assert s='APPLIED','COMPLETE is paid, not canceled';
 perform public.moaon_capture_stock_order('CAFE24',i||jsonb_build_object('external_item_id',product||'-mirror'),o||jsonb_build_object('raw_data',jsonb_build_object('order_place_id','COUPANG')));
 assert not exists(select from public.moaon_stock_order_events where line_id=product||'-mirror'),'Cafe24 mirror must not double count';
 i=jsonb_build_object('external_item_key',product||'-cp','order_id',product,'vendor_item_id',product,'quantity',1,'status','ACCEPT','raw_data',jsonb_build_object('orderItemId',product));o=jsonb_build_object('ordered_at',now()+interval '1 minute');
 perform public.moaon_capture_stock_order('COUPANG',i,o);perform public.moaon_capture_stock_order('COUPANG',i||jsonb_build_object('external_item_key',product||'-cp-new-box'),o);
 select sum((data->>'quantity')::numeric) into v from public.moaon_stock_lots where id in(a,b);assert v=2,'Cafe24 and Coupang defaults consume one; changed shipment box is idempotent';
 perform public.moaon_capture_stock_order('COUPANG',i||jsonb_build_object('external_item_key',product||'-rg','raw_data',jsonb_build_object('fulfillmentType','ROCKET_GROWTH')),o);
 assert not exists(select from public.moaon_stock_order_events where line_id=product||'-rg'),'RG excluded';
 insert into public.moaon_stock_sales_rules(tenant_id,platform,product_key,option_key,name,product_no,unit,factor,updated_by) values(tenant,'NAVER',product,'trigger','시험',product,'개',1,actor);
 insert into public.naver_commerce_orders(order_id,payment_date,status) values(product||'-trigger',now()+interval '1 minute','PAYED');
 insert into public.naver_commerce_order_items(product_order_id,order_id,product_id,product_name,option_name,quantity,status) values(product||'-trigger',product||'-trigger',product,'시험','trigger',1,'PAYED');
 select state into s from public.moaon_stock_order_ledger where line_id=product||'-trigger';assert s='APPLIED','real source table trigger must deduct';
 update public.naver_commerce_orders set status='PAYED' where order_id=product||'-trigger';
 select sum((data->>'quantity')::numeric) into v from public.moaon_stock_lots where id in(a,b);assert v=1,'parent re-sync must not deduct twice';
 update public.moaon_stock_lots set data=jsonb_set(data,'{expires}','"2000-01-01"') where id=b;
 perform public.moaon_capture_stock_order('NAVER',jsonb_build_object('product_order_id',product||'-expired','order_id',product,'product_id',product,'product_name','시험','quantity',1,'option_name','trigger','status','PAYED'),jsonb_build_object('payment_date',now()+interval '1 minute'));
 select state into s from public.moaon_stock_order_ledger where line_id=product||'-expired';assert s='INSUFFICIENT','expired lots cannot be consumed';
end $$;
select 'PASS: FEFO, factors, duplicate, historical, insufficient, cancel, exact disable, Cafe24 mirror, Coupang stable item and RG' as result;
rollback;
