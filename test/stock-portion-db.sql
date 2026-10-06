-- Rollback-only integration check: no operational inventory is retained.
begin;
do $$
declare t uuid=gen_random_uuid();l uuid=gen_random_uuid();a uuid=gen_random_uuid();
 d jsonb=jsonb_build_object('name','소분 시험','unit','티백','quantity',150,'packLabel','봉지','portionSize',30);saved jsonb;
begin
 perform public.moaon_save_stock_lot(t,l,0,d,a);
 select data into saved from public.moaon_stock_lots where tenant_id=t and id=l;
 assert saved->>'quantity'='150' and saved->>'portionSize'='30' and saved->>'packLabel'='봉지','bulk packaging not persisted';
 perform public.moaon_save_stock_lot(t,l,1,d||jsonb_build_object('unit','KG','quantity',30,'portionSize',100,'packLabel','개'),a);
 select data into saved from public.moaon_stock_lots where tenant_id=t and id=l;
 assert saved->>'quantity'='30' and saved->>'portionSize'='100' and saved->>'packLabel'='개','KG packaging not persisted';
 perform public.moaon_save_stock_lot(t,l,2,saved||jsonb_build_object('portionSize',null),a);
 select data into saved from public.moaon_stock_lots where tenant_id=t and id=l;
 assert saved->>'portionSize' is null,'none must clear';
end $$;
select 'PASS: tea/KG/none shared persistence' result;
rollback;
