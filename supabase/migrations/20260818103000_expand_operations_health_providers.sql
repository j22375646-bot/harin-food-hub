alter table public.operations_health_snapshots
  drop constraint if exists operations_health_snapshots_provider_check;

alter table public.operations_health_snapshots
  add constraint operations_health_snapshots_provider_check
  check (provider in (
    'AWS_CLOUDWATCH','VERCEL','GITHUB_RELEASES','UPTIMEROBOT','TELEGRAM_BOT','RESEND'
  ));

comment on table public.operations_health_snapshots is
  'Phase 19-4 and 20-4 aggregated infrastructure, release, uptime and alert-provider readiness metrics only; no raw logs, credentials or customer PII.';
