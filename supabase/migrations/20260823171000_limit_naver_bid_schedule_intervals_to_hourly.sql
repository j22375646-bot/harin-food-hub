alter table public.naver_bid_automation_schedules
  drop constraint if exists naver_bid_automation_schedules_interval_minutes_check;

alter table public.naver_bid_automation_schedules
  add constraint naver_bid_automation_schedules_interval_minutes_check
  check (interval_minutes in (60, 120, 180));

comment on column public.naver_bid_automation_schedules.interval_minutes is
  '기존 AWS 시간별 운영 트리거에 맞춘 60, 120, 180분 실행 간격';
