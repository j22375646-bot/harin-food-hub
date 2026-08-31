create table if not exists public.report_deletion_audits (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null,
  report_type text not null,
  report_created_at timestamptz not null,
  deleted_by text not null check (char_length(deleted_by) between 1 and 100),
  deleted_at timestamptz not null default now(),
  report_snapshot jsonb not null
);

create index if not exists idx_report_deletion_audits_report
  on public.report_deletion_audits(report_id, deleted_at desc);

alter table public.report_deletion_audits enable row level security;

revoke all on table public.report_deletion_audits from public;
revoke all on table public.report_deletion_audits from anon;
revoke all on table public.report_deletion_audits from authenticated;
grant select, insert on table public.report_deletion_audits to service_role;

create or replace function public.delete_product_analysis_report(
  p_report_id uuid,
  p_expected_created_at timestamptz,
  p_deleted_by text
)
returns table(report_id uuid, deleted boolean, promoted_report_id uuid)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_report public.reports;
  next_report_id uuid;
  previous_report_id uuid;
begin
  select * into target_report
  from public.reports
  where id = p_report_id;

  if not found then
    return query select p_report_id, false, null::uuid;
    return;
  end if;

  if target_report.report_type !~ '^PRODUCT_ANALYSIS_' then
    raise exception using errcode = '42501', message = 'REPORT_NOT_FOUND';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      concat_ws(
        '|',
        target_report.platform,
        target_report.report_type,
        target_report.period_start::text,
        target_report.period_end::text
      ),
      0
    )
  );

  select * into target_report
  from public.reports
  where id = p_report_id
  for update;

  if not found then
    return query select p_report_id, false, null::uuid;
    return;
  end if;

  if target_report.report_type !~ '^PRODUCT_ANALYSIS_' then
    raise exception using errcode = '42501', message = 'REPORT_NOT_FOUND';
  end if;

  if p_expected_created_at is null or target_report.created_at <> p_expected_created_at then
    raise exception using errcode = '40001', message = 'REPORT_CHANGED';
  end if;

  insert into public.report_deletion_audits (
    report_id,
    report_type,
    report_created_at,
    deleted_by,
    report_snapshot
  ) values (
    target_report.id,
    target_report.report_type,
    target_report.created_at,
    left(coalesce(nullif(trim(p_deleted_by), ''), 'owner'), 100),
    to_jsonb(target_report)
  );

  select id into next_report_id
  from public.reports
  where supersedes_report_id = target_report.id
  order by version asc, created_at asc
  limit 1
  for update;

  if next_report_id is not null then
    update public.reports
    set supersedes_report_id = target_report.supersedes_report_id,
        updated_at = now()
    where id = next_report_id;
  end if;

  if target_report.is_latest then
    previous_report_id := target_report.supersedes_report_id;
  end if;

  delete from public.reports where id = target_report.id;

  if previous_report_id is not null then
    update public.reports
    set is_latest = true,
        updated_at = now()
    where id = previous_report_id;
  end if;

  return query select target_report.id, true, previous_report_id;
end;
$$;

revoke all on function public.delete_product_analysis_report(uuid,timestamptz,text) from public;
revoke all on function public.delete_product_analysis_report(uuid,timestamptz,text) from anon;
revoke all on function public.delete_product_analysis_report(uuid,timestamptz,text) from authenticated;
grant execute on function public.delete_product_analysis_report(uuid,timestamptz,text) to service_role;

comment on function public.delete_product_analysis_report(uuid,timestamptz,text)
  is 'Owner-only server RPC: delete one saved product analysis, retain an audit snapshot, and preserve report version links.';
