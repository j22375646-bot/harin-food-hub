create table public.moaon_stock_lots (
 tenant_id uuid not null, id uuid not null, revision integer not null check (revision>0),
 data jsonb not null check (jsonb_typeof(data)='object'), updated_at timestamptz not null default now(),updated_by uuid not null,
 primary key(tenant_id,id)
);
create index moaon_stock_lots_updated on public.moaon_stock_lots(tenant_id,updated_at desc);
alter table public.moaon_stock_lots enable row level security;
revoke all on public.moaon_stock_lots from public,anon,authenticated;
grant select,insert,update on public.moaon_stock_lots to service_role;
create table public.moaon_stock_lot_history (
 tenant_id uuid not null,id uuid not null,revision integer not null,data jsonb not null,changed_at timestamptz not null default now(),changed_by uuid not null,
 primary key(tenant_id,id,revision)
);
alter table public.moaon_stock_lot_history enable row level security;
revoke all on public.moaon_stock_lot_history from public,anon,authenticated;
grant select,insert on public.moaon_stock_lot_history to service_role;
create function public.moaon_save_stock_lot(p_tenant uuid,p_id uuid,p_revision integer,p_data jsonb,p_actor uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare saved public.moaon_stock_lots;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_tenant::text,0));
 if p_revision=0 then
   select * into saved from public.moaon_stock_lots where tenant_id=p_tenant and id=p_id;
   if found then
     if saved.revision=1 and saved.data=p_data then return jsonb_build_object('id',saved.id,'revision',saved.revision); end if;
     raise exception 'STOCK_CONFLICT';
   end if;
   if (select count(*) from public.moaon_stock_lots where tenant_id=p_tenant)>=5000 then raise exception 'STOCK_LIMIT'; end if;
   insert into public.moaon_stock_lots(tenant_id,id,revision,data,updated_by) values(p_tenant,p_id,1,p_data,p_actor) returning * into saved;
 else
   update public.moaon_stock_lots set data=p_data,revision=revision+1,updated_at=now(),updated_by=p_actor
   where tenant_id=p_tenant and id=p_id and revision=p_revision returning * into saved;
   if not found then raise exception 'STOCK_CONFLICT'; end if;
 end if;
 insert into public.moaon_stock_lot_history(tenant_id,id,revision,data,changed_by) values(saved.tenant_id,saved.id,saved.revision,saved.data,p_actor);
 return jsonb_build_object('id',saved.id,'revision',saved.revision);
end;
$$;
revoke all on function public.moaon_save_stock_lot(uuid,uuid,integer,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.moaon_save_stock_lot(uuid,uuid,integer,jsonb,uuid) to service_role;
