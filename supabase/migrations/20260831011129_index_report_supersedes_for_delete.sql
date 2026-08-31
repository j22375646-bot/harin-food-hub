create index if not exists idx_reports_supersedes_report_id
  on public.reports (supersedes_report_id)
  where supersedes_report_id is not null;
