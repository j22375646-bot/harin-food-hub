create table if not exists public.notification_settings (
  setting_key text primary key default 'default' check (setting_key = 'default'),
  recipient_email text,
  email_enabled boolean not null default false,
  instant_alert_enabled boolean not null default true,
  daily_report_enabled boolean not null default true,
  weekly_report_enabled boolean not null default true,
  monthly_report_enabled boolean not null default true,
  minimum_severity text not null default 'ERROR' check (minimum_severity in ('INFO','WARNING','ERROR')),
  timezone text not null default 'Asia/Seoul',
  updated_at timestamptz not null default now()
);

insert into public.notification_settings (setting_key)
values ('default')
on conflict (setting_key) do nothing;

create table if not exists public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in ('REPORT','ALERT','DIGEST','TEST')),
  source_id uuid,
  platform text not null default 'ALL' check (platform in ('ALL','NAVER','CAFE24','COUPANG')),
  channel text not null default 'EMAIL' check (channel in ('EMAIL')),
  recipient text,
  subject text not null,
  status text not null check (status in ('SENT','SKIPPED','FAILED')),
  trigger_type text not null default 'SYSTEM' check (trigger_type in ('CRON','MANUAL','SYSTEM')),
  provider_message_id text,
  error_message text,
  dedup_key text,
  details jsonb not null default '{}'::jsonb,
  attempted_at timestamptz not null default now(),
  sent_at timestamptz
);

create index if not exists notification_deliveries_attempted_idx on public.notification_deliveries(attempted_at desc);
create index if not exists notification_deliveries_status_idx on public.notification_deliveries(status, attempted_at desc);
create unique index if not exists notification_deliveries_sent_dedup_idx on public.notification_deliveries(dedup_key) where status = 'SENT' and dedup_key is not null;

alter table public.notification_settings enable row level security;
alter table public.notification_deliveries enable row level security;
revoke all on public.notification_settings, public.notification_deliveries from anon, authenticated;
grant select, insert, update, delete on public.notification_settings, public.notification_deliveries to service_role;
