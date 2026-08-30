alter table public.reports
  drop constraint if exists reports_report_type_check,
  add constraint reports_report_type_check check (
    report_type = any (array['WEEKLY','MONTHLY','ADHOC','INFOGRAPHIC']::text[])
    or report_type ~ '^PRODUCT_ANALYSIS_[A-Za-z0-9_-]{1,60}$'
  );
