alter table public.notification_deliveries
  drop constraint if exists notification_deliveries_channel_check,
  drop constraint if exists notification_deliveries_status_check;

alter table public.notification_deliveries
  add constraint notification_deliveries_channel_check
    check (channel in ('EMAIL','TELEGRAM')),
  add constraint notification_deliveries_status_check
    check (status in ('PENDING','SENT','SKIPPED','FAILED'));

drop index if exists public.notification_deliveries_sent_dedup_idx;

create unique index if not exists notification_deliveries_active_dedup_idx
  on public.notification_deliveries(channel,dedup_key)
  where dedup_key is not null and status in ('PENDING','SENT');

comment on index public.notification_deliveries_active_dedup_idx is
  '채널별 알림을 외부 호출 전에 선점하여 동시 실행 중복 발송을 방지한다.';
