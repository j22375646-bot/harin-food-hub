alter table public.reports
  add column if not exists version integer,
  add column if not exists supersedes_report_id uuid,
  add column if not exists is_latest boolean,
  add column if not exists revision_note text,
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by text;

with ranked as (
  select
    id,
    row_number() over (
      partition by platform, report_type, period_start, period_end
      order by created_at, id
    )::integer as version_number,
    lag(id) over (
      partition by platform, report_type, period_start, period_end
      order by created_at, id
    ) as previous_id,
    count(*) over (
      partition by platform, report_type, period_start, period_end
    )::integer as version_count
  from public.reports
)
update public.reports as report
set
  version = ranked.version_number,
  supersedes_report_id = ranked.previous_id,
  is_latest = ranked.version_number = ranked.version_count
from ranked
where report.id = ranked.id
  and (report.version is null or report.is_latest is null);

alter table public.reports
  alter column version set default 1,
  alter column version set not null,
  alter column is_latest set default true,
  alter column is_latest set not null;

alter table public.reports
  drop constraint if exists reports_version_positive,
  add constraint reports_version_positive check (version > 0),
  drop constraint if exists reports_supersedes_report_id_fkey,
  add constraint reports_supersedes_report_id_fkey
    foreign key (supersedes_report_id) references public.reports(id) on delete set null;

create unique index if not exists reports_series_version_key
  on public.reports(platform, report_type, period_start, period_end, version);

create unique index if not exists reports_one_latest_per_series
  on public.reports(platform, report_type, period_start, period_end)
  where is_latest;

create index if not exists idx_reports_latest_created
  on public.reports(is_latest, created_at desc);

create or replace function public.create_report_version(
  p_platform text,
  p_report_type text,
  p_period_start date,
  p_period_end date,
  p_title text,
  p_status text,
  p_summary_json jsonb,
  p_report_html text,
  p_revision_note text default null
)
returns public.reports
language plpgsql
security invoker
set search_path = ''
as $$
declare
  previous_report public.reports;
  created_report public.reports;
begin
  perform pg_advisory_xact_lock(
    hashtextextended(concat_ws('|', p_platform, p_report_type, p_period_start::text, p_period_end::text), 0)
  );

  select * into previous_report
  from public.reports
  where platform = p_platform
    and report_type = p_report_type
    and period_start = p_period_start
    and period_end = p_period_end
    and is_latest
  order by version desc
  limit 1
  for update;

  if found then
    update public.reports
    set is_latest = false, updated_at = now()
    where id = previous_report.id;
  end if;

  insert into public.reports (
    platform, report_type, period_start, period_end, title, status,
    summary_json, report_html, version, supersedes_report_id, is_latest, revision_note
  ) values (
    p_platform, p_report_type, p_period_start, p_period_end, p_title, p_status,
    p_summary_json, p_report_html, coalesce(previous_report.version, 0) + 1,
    previous_report.id, true, p_revision_note
  )
  returning * into created_report;

  return created_report;
end;
$$;

revoke all on function public.create_report_version(text,text,date,date,text,text,jsonb,text,text) from public;
revoke all on function public.create_report_version(text,text,date,date,text,text,jsonb,text,text) from anon;
revoke all on function public.create_report_version(text,text,date,date,text,text,jsonb,text,text) from authenticated;
grant execute on function public.create_report_version(text,text,date,date,text,text,jsonb,text,text) to service_role;
