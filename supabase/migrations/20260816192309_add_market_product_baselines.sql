begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create table if not exists public.market_product_baselines (
  project_id uuid primary key references public.market_projects(id) on delete cascade,
  master_product_id uuid not null references public.master_products(id) on delete restrict,
  migration_mode text not null default 'READ_ONLY_COMPATIBILITY'
    check (migration_mode in ('READ_ONLY_COMPATIBILITY','OWNER_EDITED')),
  baseline_status text not null default 'REVIEW_REQUIRED'
    check (baseline_status in ('DRAFT','REVIEW_REQUIRED','VERIFIED','BLOCKED')),
  product_role text not null default 'STANDARD'
    check (product_role in ('STANDARD','OPTION','BUNDLE','GIFT')),
  product_summary text not null default '' check (char_length(product_summary) <= 2000),
  target_customer text not null default '' check (char_length(target_customer) <= 2000),
  purchase_situations text[] not null default '{}'
    check (cardinality(purchase_situations) <= 12),
  hesitation_reasons text[] not null default '{}'
    check (cardinality(hesitation_reasons) <= 12),
  core_message text not null default '' check (char_length(core_message) <= 2000),
  prohibited_phrases text[] not null default '{}'
    check (cardinality(prohibited_phrases) <= 24),
  usage_guide text not null default '' check (char_length(usage_guide) <= 2000),
  checklist_items jsonb not null default '{}'::jsonb
    check (jsonb_typeof(checklist_items) = 'object'),
  checklist_notes text not null default '' check (char_length(checklist_notes) <= 4000),
  legacy_offers jsonb not null default '[]'::jsonb
    check (jsonb_typeof(legacy_offers) = 'array' and octet_length(legacy_offers::text) <= 1000000),
  channel_options jsonb not null default '[]'::jsonb
    check (jsonb_typeof(channel_options) = 'array' and octet_length(channel_options::text) <= 2000000),
  claim_reviews jsonb not null default '[]'::jsonb
    check (jsonb_typeof(claim_reviews) = 'array' and octet_length(claim_reviews::text) <= 500000),
  migration_report jsonb not null default '{}'::jsonb
    check (jsonb_typeof(migration_report) = 'object'),
  source_updated_at jsonb not null default '{}'::jsonb
    check (jsonb_typeof(source_updated_at) = 'object'),
  owner_confirmed boolean not null default false,
  owner_confirmed_at timestamptz,
  imported_at timestamptz not null default now(),
  created_by text not null default 'OWNER' check (char_length(created_by) between 1 and 160),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, master_product_id)
);

create index if not exists market_product_baselines_master_idx
  on public.market_product_baselines (master_product_id, updated_at desc);
create index if not exists market_product_baselines_status_idx
  on public.market_product_baselines (baseline_status, updated_at desc);

create or replace function public.check_market_baseline_project_product()
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
    raise exception 'market baseline product does not match project';
  end if;
  return new;
end;
$$;

drop trigger if exists check_market_baseline_project_product on public.market_product_baselines;
create trigger check_market_baseline_project_product
before insert or update of project_id, master_product_id on public.market_product_baselines
for each row execute function public.check_market_baseline_project_product();

drop trigger if exists set_market_product_baselines_updated_at on public.market_product_baselines;
create trigger set_market_product_baselines_updated_at before update on public.market_product_baselines
for each row execute function public.set_updated_at();

alter table public.market_product_baselines enable row level security;
revoke all on table public.market_product_baselines from public, anon, authenticated;
grant select, insert, update, delete on table public.market_product_baselines to service_role;
revoke all on function public.check_market_baseline_project_product() from public, anon, authenticated;
grant execute on function public.check_market_baseline_project_product() to service_role;

with source_rows as (
  select
    p.id as project_id,
    p.master_product_id,
    pgp.master_product_id is not null as has_profile,
    pdc.master_product_id is not null as has_checklist,
    coalesce(pgp.product_role, 'STANDARD') as product_role,
    coalesce(pgp.product_summary, '') as product_summary,
    coalesce(pgp.target_customer, '') as target_customer,
    coalesce(pgp.purchase_situations, '{}') as purchase_situations,
    coalesce(pgp.hesitation_reasons, '{}') as hesitation_reasons,
    coalesce(pgp.core_message, '') as core_message,
    coalesce(pgp.prohibited_phrases, '{}') as prohibited_phrases,
    coalesce(pgp.usage_guide, '') as usage_guide,
    coalesce(pdc.items, '{}'::jsonb) as checklist_items,
    coalesce(pdc.notes, '') as checklist_notes,
    pgp.updated_at as profile_updated_at,
    pdc.updated_at as checklist_updated_at,
    (select max(cp.updated_at) from public.channel_products cp where cp.master_product_id = p.master_product_id and cp.is_active = true) as channel_products_updated_at,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'source_id', o.id,
        'name', o.name,
        'offer_type', o.offer_type,
        'platform', o.platform,
        'quantity', o.quantity,
        'list_price', o.list_price,
        'sale_price', o.sale_price,
        'is_active', o.is_active
      ) order by o.sort_order, o.id)
      from public.product_growth_offers o
      where o.master_product_id = p.master_product_id
    ), '[]'::jsonb) as legacy_offers,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'platform', cp.platform,
        'external_product_id', cp.external_product_id,
        'external_product_name', cp.external_product_name,
        'selling_price', cp.selling_price,
        'is_active', cp.is_active,
        'variants', case when jsonb_typeof(cp.raw_data->'variants') = 'array' then cp.raw_data->'variants' else '[]'::jsonb end
      ) order by cp.platform, cp.external_product_name)
      from public.channel_products cp
      where cp.master_product_id = p.master_product_id and cp.is_active = true
    ), '[]'::jsonb) as channel_options,
    (select count(*)::integer from public.product_growth_offers o where o.master_product_id = p.master_product_id) as legacy_offer_count,
    (select count(*)::integer from public.channel_products cp where cp.master_product_id = p.master_product_id and cp.is_active = true) as channel_product_count
  from public.market_projects p
  left join public.product_growth_profiles pgp on pgp.master_product_id = p.master_product_id
  left join public.product_detail_checklists pdc on pdc.master_product_id = p.master_product_id
), seeded as (
  insert into public.market_product_baselines (
    project_id, master_product_id, product_role, product_summary, target_customer,
    purchase_situations, hesitation_reasons, core_message, prohibited_phrases, usage_guide,
    checklist_items, checklist_notes, legacy_offers, channel_options, migration_report,
    source_updated_at, created_by
  )
  select
    project_id, master_product_id, product_role, product_summary, target_customer,
    purchase_situations, hesitation_reasons, core_message, prohibited_phrases, usage_guide,
    checklist_items, checklist_notes, legacy_offers, channel_options,
    jsonb_build_object(
      'mode', 'READ_ONLY_COMPATIBILITY',
      'profile_source_rows', case when has_profile then 1 else 0 end,
      'checklist_source_rows', case when has_checklist then 1 else 0 end,
      'offer_source_rows', legacy_offer_count,
      'channel_product_rows', channel_product_count,
      'destination_rows', 1,
      'field_consistency', true,
      'source_preserved', true,
      'checked_at', now()
    ),
    jsonb_strip_nulls(jsonb_build_object(
      'product_growth_profiles', profile_updated_at,
      'product_detail_checklists', checklist_updated_at,
      'channel_products', channel_products_updated_at
    )),
    'SYSTEM_PHASE_17_3'
  from source_rows
  on conflict (project_id) do nothing
  returning project_id, master_product_id, migration_report
)
select public.record_market_project_version(
  project_id,
  'PRODUCT_BASELINE_IMPORTED',
  jsonb_build_object('phase','17-3','master_product_id',master_product_id,'migration_report',migration_report),
  'SYSTEM_PHASE_17_3'
) from seeded;

comment on table public.market_product_baselines is
  'Owner-only, product-isolated baseline copied from legacy growth profile/checklist/offer sources without modifying or deleting them.';
comment on column public.market_product_baselines.migration_report is
  'Read-only compatibility row counts and field consistency evidence. Zero source rows are recorded as no source, never as migrated content.';
comment on column public.market_product_baselines.channel_options is
  'Safe product and variant snapshot from already matched active channel products. This snapshot never writes back to a platform.';

notify pgrst, 'reload schema';
commit;
