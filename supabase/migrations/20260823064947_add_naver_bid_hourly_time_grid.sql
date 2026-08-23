begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

alter table public.naver_bid_automation_schedules
  add column if not exists time_slots jsonb;

alter table public.naver_bid_automation_schedules
  drop constraint if exists naver_bid_automation_schedules_time_slots_check;

alter table public.naver_bid_automation_schedules
  add constraint naver_bid_automation_schedules_time_slots_check
  check (time_slots is null or jsonb_typeof(time_slots) = 'array');

create table if not exists public.naver_bid_automation_controls (
  id text primary key default 'global' check (id = 'global'),
  emergency_paused boolean not null default false,
  paused_reason text,
  paused_at timestamptz,
  paused_by text,
  updated_at timestamptz not null default now()
);

insert into public.naver_bid_automation_controls (id, emergency_paused)
values ('global', false)
on conflict (id) do nothing;

drop trigger if exists naver_bid_automation_controls_set_updated_at on public.naver_bid_automation_controls;
create trigger naver_bid_automation_controls_set_updated_at
before update on public.naver_bid_automation_controls
for each row execute function public.set_updated_at();

alter table public.naver_bid_automation_controls enable row level security;
revoke all on table public.naver_bid_automation_controls from public, anon, authenticated, service_role;
grant select, insert, update on table public.naver_bid_automation_controls to service_role;

comment on column public.naver_bid_automation_schedules.time_slots is
  'Optional Naver-only weekday x hour grid. Null preserves the legacy weekday and time-window schedule.';
comment on table public.naver_bid_automation_controls is
  'Server-only global emergency pause for Naver bid automation. Individual schedule modes remain unchanged.';

notify pgrst, 'reload schema';
commit;
