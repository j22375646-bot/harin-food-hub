create or replace function public.cleanup_duplicate_diagnosis_reports()
returns table(deleted_count integer, kept_count integer, audited_count integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  removed_rows integer := 0;
  retained_rows integer := 0;
  audit_rows integer := 0;
begin
  perform pg_advisory_xact_lock(hashtextextended('cleanup_duplicate_diagnosis_reports', 0));

  drop table if exists pg_temp.duplicate_diagnosis_targets;
  create temporary table duplicate_diagnosis_targets on commit drop as
  with report_evidence as (
    select
      report.id,
      report.platform,
      report.report_type,
      report.period_start,
      report.period_end,
      report.approved_at,
      report.is_latest,
      report.created_at,
      report.version,
      report.supersedes_report_id,
      md5((coalesce(report.summary_json, '{}'::jsonb) - 'generated_at' - 'generation_mode' - 'learning')::text) as evidence_hash
    from public.reports as report
    where report.report_type in ('ADHOC', 'WEEKLY', 'MONTHLY')
  ), ranked as (
    select
      report_evidence.*,
      first_value(id) over evidence_group as keeper_id,
      row_number() over evidence_group as evidence_rank,
      count(*) over evidence_group as evidence_count
    from report_evidence
    window evidence_group as (
      partition by platform, report_type, period_start, period_end, evidence_hash
      order by
        (approved_at is not null) desc,
        is_latest desc,
        created_at desc,
        version desc,
        id desc
    )
  )
  select id as target_id, keeper_id, supersedes_report_id as target_supersedes_id
  from ranked
  where evidence_count > 1
    and evidence_rank > 1
    and approved_at is null;

  select count(*), count(distinct keeper_id)
  into removed_rows, retained_rows
  from pg_temp.duplicate_diagnosis_targets;

  update public.alerts as alert
  set source_id = target.keeper_id
  from pg_temp.duplicate_diagnosis_targets as target
  where alert.source_id = target.target_id;

  update public.notification_deliveries as delivery
  set source_id = target.keeper_id
  from pg_temp.duplicate_diagnosis_targets as target
  where delivery.source_id = target.target_id;

  update public.reports as child
  set supersedes_report_id = target.target_supersedes_id,
      updated_at = now()
  from pg_temp.duplicate_diagnosis_targets as target
  where child.supersedes_report_id = target.target_id;

  insert into public.report_deletion_audits (
    report_id,
    report_type,
    report_created_at,
    deleted_by,
    report_snapshot
  )
  select
    report.id,
    report.report_type,
    report.created_at,
    'SYSTEM_DEDUPLICATION',
    to_jsonb(report) - 'report_html'
  from public.reports as report
  join pg_temp.duplicate_diagnosis_targets as target
    on target.target_id = report.id;

  get diagnostics audit_rows = row_count;

  delete from public.reports as report
  using pg_temp.duplicate_diagnosis_targets as target
  where report.id = target.target_id;

  return query select removed_rows, retained_rows, audit_rows;
end;
$$;

revoke execute on function public.cleanup_duplicate_diagnosis_reports() from public;
revoke execute on function public.cleanup_duplicate_diagnosis_reports() from anon;
revoke execute on function public.cleanup_duplicate_diagnosis_reports() from authenticated;
grant execute on function public.cleanup_duplicate_diagnosis_reports() to service_role;
