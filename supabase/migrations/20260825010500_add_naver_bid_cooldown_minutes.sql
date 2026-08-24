begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

alter table public.naver_bid_automation_schedules
  add column if not exists cooldown_minutes integer not null default 360;

alter table public.naver_bid_automation_schedules
  drop constraint if exists naver_bid_automation_schedules_cooldown_minutes_check;

alter table public.naver_bid_automation_schedules
  add constraint naver_bid_automation_schedules_cooldown_minutes_check
  check (cooldown_minutes in (60, 180, 360, 720, 1440));

comment on column public.naver_bid_automation_schedules.cooldown_minutes is
  'Minimum wait after a verified Naver keyword bid change before that same keyword can be changed again.';

commit;
