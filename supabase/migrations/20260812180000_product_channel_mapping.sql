begin;

alter table public.channel_products
  add column if not exists match_method text,
  add column if not exists match_confidence numeric,
  add column if not exists matched_at timestamptz,
  add column if not exists matched_by text;

update public.channel_products
set match_method = case when platform = 'CAFE24' then 'SOURCE' else 'AUTO' end,
    match_confidence = case when platform = 'CAFE24' then 1 else 0.95 end,
    matched_at = coalesce(matched_at, updated_at, now()),
    matched_by = coalesce(matched_by, 'SYSTEM')
where master_product_id is not null and match_method is null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'channel_products_match_method_check') then
    alter table public.channel_products add constraint channel_products_match_method_check
      check (match_method is null or match_method in ('SOURCE','AUTO','MANUAL'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'channel_products_match_confidence_check') then
    alter table public.channel_products add constraint channel_products_match_confidence_check
      check (match_confidence is null or (match_confidence >= 0 and match_confidence <= 1));
  end if;
end $$;

create table if not exists public.product_mapping_history (
  id uuid primary key default gen_random_uuid(),
  channel_product_id uuid references public.channel_products(id) on delete set null,
  platform text not null check (platform in ('NAVER','CAFE24','COUPANG')),
  external_product_id text not null,
  external_product_name text not null,
  previous_master_product_id uuid references public.master_products(id) on delete set null,
  new_master_product_id uuid references public.master_products(id) on delete set null,
  action text not null check (action in ('LINKED','AUTO_LINKED','RELINKED','UNLINKED','REJECTED')),
  match_method text check (match_method is null or match_method in ('SOURCE','AUTO','MANUAL')),
  match_confidence numeric check (match_confidence is null or (match_confidence >= 0 and match_confidence <= 1)),
  actor text not null default 'DASHBOARD',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists product_mapping_history_source_idx
  on public.product_mapping_history(platform, external_product_id, created_at desc);
create index if not exists product_mapping_history_master_idx
  on public.product_mapping_history(new_master_product_id, created_at desc);

alter table public.product_mapping_history enable row level security;
revoke all on table public.product_mapping_history from public, anon, authenticated;
grant select, insert on table public.product_mapping_history to service_role;

create or replace function public.apply_product_mapping(
  p_platform text,
  p_external_product_id text,
  p_external_product_name text,
  p_master_product_id uuid,
  p_action text,
  p_match_method text,
  p_match_confidence numeric,
  p_actor text,
  p_selling_price numeric,
  p_raw_data jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_existing public.channel_products%rowtype;
  v_row public.channel_products%rowtype;
  v_history_action text;
begin
  if p_platform not in ('NAVER','CAFE24','COUPANG') then raise exception 'Unsupported platform'; end if;
  if coalesce(trim(p_external_product_id),'') = '' or coalesce(trim(p_external_product_name),'') = '' then raise exception 'Source product is required'; end if;
  if p_action not in ('LINK','UNLINK','REJECT') then raise exception 'Unsupported mapping action'; end if;
  if p_match_method is not null and p_match_method not in ('SOURCE','AUTO','MANUAL') then raise exception 'Unsupported match method'; end if;
  if p_match_confidence is not null and (p_match_confidence < 0 or p_match_confidence > 1) then raise exception 'Invalid match confidence'; end if;
  if p_action in ('LINK','REJECT') and p_master_product_id is null then raise exception 'Master product is required'; end if;

  select * into v_existing
  from public.channel_products
  where platform = p_platform and external_product_id = p_external_product_id
  for update;

  if p_action = 'REJECT' then
    insert into public.product_mapping_history(channel_product_id,platform,external_product_id,external_product_name,previous_master_product_id,new_master_product_id,action,match_method,match_confidence,actor,metadata)
    values(v_existing.id,p_platform,p_external_product_id,p_external_product_name,v_existing.master_product_id,p_master_product_id,'REJECTED',p_match_method,p_match_confidence,coalesce(nullif(trim(p_actor),''),'DASHBOARD'),coalesce(p_raw_data,'{}'::jsonb));
    return jsonb_build_object('action','REJECTED','external_product_id',p_external_product_id);
  end if;

  if p_action = 'UNLINK' then
    if v_existing.id is null or v_existing.master_product_id is null then raise exception 'Linked channel product was not found'; end if;
    update public.channel_products
    set master_product_id = null, match_method = null, match_confidence = null,
        matched_at = null, matched_by = null, updated_at = now()
    where id = v_existing.id returning * into v_row;
    v_history_action := 'UNLINKED';
  else
    insert into public.channel_products(master_product_id,platform,external_product_id,external_product_name,selling_price,is_active,raw_data,match_method,match_confidence,matched_at,matched_by,updated_at)
    values(p_master_product_id,p_platform,p_external_product_id,p_external_product_name,p_selling_price,true,coalesce(p_raw_data,'{}'::jsonb),p_match_method,p_match_confidence,now(),coalesce(nullif(trim(p_actor),''),'DASHBOARD'),now())
    on conflict(platform,external_product_id) do update set
      master_product_id = excluded.master_product_id,
      external_product_name = excluded.external_product_name,
      selling_price = excluded.selling_price,
      is_active = excluded.is_active,
      raw_data = coalesce(public.channel_products.raw_data,'{}'::jsonb) || excluded.raw_data,
      match_method = excluded.match_method,
      match_confidence = excluded.match_confidence,
      matched_at = excluded.matched_at,
      matched_by = excluded.matched_by,
      updated_at = now()
    returning * into v_row;
    v_history_action := case
      when v_existing.master_product_id is not null and v_existing.master_product_id <> p_master_product_id then 'RELINKED'
      when p_match_method = 'AUTO' then 'AUTO_LINKED'
      else 'LINKED'
    end;
  end if;

  insert into public.product_mapping_history(channel_product_id,platform,external_product_id,external_product_name,previous_master_product_id,new_master_product_id,action,match_method,match_confidence,actor,metadata)
  values(v_row.id,p_platform,p_external_product_id,p_external_product_name,v_existing.master_product_id,v_row.master_product_id,v_history_action,p_match_method,p_match_confidence,coalesce(nullif(trim(p_actor),''),'DASHBOARD'),coalesce(p_raw_data,'{}'::jsonb));

  return jsonb_build_object('action',v_history_action,'channel_product_id',v_row.id,'master_product_id',v_row.master_product_id,'external_product_id',v_row.external_product_id);
end;
$$;

revoke all on function public.apply_product_mapping(text,text,text,uuid,text,text,numeric,text,numeric,jsonb) from public, anon, authenticated;
grant execute on function public.apply_product_mapping(text,text,text,uuid,text,text,numeric,text,numeric,jsonb) to service_role;

notify pgrst, 'reload schema';
commit;
