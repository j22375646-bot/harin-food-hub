-- Stage 1B draft. Apply BEFORE deploying the new collectors/importers.
-- Existing rows/keys and financial values are preserved. No family backfill is inferred.
begin;

do $$
declare table_name text;
begin
  foreach table_name in array array['coupang_settlements', 'coupang_settlement_summaries', 'coupang_cost_transactions'] loop
    execute format('alter table public.%I
      add column if not exists delivery_family text not null default ''UNKNOWN'' check (delivery_family in (''COUPANG'', ''ROCKET_GROWTH'', ''UNKNOWN'')),
      add column if not exists ingestion_source text not null default ''LEGACY'',
      add column if not exists source_record_id text,
      add column if not exists period_start date,
      add column if not exists period_end date,
      add column if not exists reconciliation_status text not null default ''UNVERIFIED'' check (reconciliation_status in (''UNVERIFIED'', ''MISSING_AMOUNT'', ''AMBIGUOUS_IDENTITY'')),
      add column if not exists provenance jsonb not null default ''{}''::jsonb', table_name);
    execute format('create index if not exists %I on public.%I (delivery_family, period_start, period_end)', table_name || '_family_period_idx', table_name);
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on public.%I from anon, authenticated', table_name);
    execute format('grant select, insert, update, delete on public.%I to service_role', table_name);
  end loop;
end $$;

-- These API fields were used by the mapper but absent from the original table definition.
alter table public.coupang_settlement_summaries
  add column if not exists settlement_amount numeric,
  add column if not exists last_amount numeric,
  add column if not exists pending_released_amount numeric;

-- Unknown amounts are nullable; changing defaults does not rewrite existing values.
do $$
declare spec record; column_name text;
begin
  for spec in select * from (values
    ('coupang_settlements', array['sale_amount','service_fee','service_fee_vat','settlement_amount','quantity']),
    ('coupang_settlement_summaries', array['total_sale','service_fee','settlement_target_amount','final_amount','seller_discount_coupon','downloadable_coupon','settlement_amount','last_amount','pending_released_amount']),
    ('coupang_cost_transactions', array['quantity','gross_sales','seller_discount','settlement_target','cost_amount','cost_vat','credit_amount']),
    ('coupang_cost_imports', array['gross_sales','cost_amount','cost_vat','credit_amount'])
  ) as specs(table_name, columns) loop
    foreach column_name in array spec.columns loop
      execute format('alter table public.%I alter column %I drop not null, alter column %I drop default', spec.table_name, column_name, column_name);
    end loop;
  end loop;
end $$;

comment on column public.coupang_settlements.delivery_family is 'Explicit source family only. Legacy and API rows without a documented signal remain UNKNOWN; never infer from order membership.';
comment on column public.coupang_settlement_summaries.provenance is 'Source evidence and coverage provenance. A reported final_amount is actual payment only when status confirms paid. UNVERIFIED coverage must not imply full reconciliation.';
comment on column public.coupang_cost_transactions.source_type is 'Existing cost category preserved; ingestion_source identifies transport/source of the ledger.';

commit;
