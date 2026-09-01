create table if not exists public.naver_bizmoney_daily (
  date date primary key,
  charged_purchased numeric,
  charged_free numeric,
  used_purchased numeric,
  used_free numeric,
  refunded_purchased numeric,
  refunded_free numeric,
  returned_purchased numeric,
  closing_purchased_balance numeric,
  closing_free_balance numeric,
  closing_balance numeric,
  current_balance numeric,
  charge_events integer not null default 0 check (charge_events >= 0),
  deduction_events integer not null default 0 check (deduction_events >= 0),
  updated_at timestamptz not null default now(),
  constraint naver_bizmoney_daily_non_negative check (
    (charged_purchased is null or charged_purchased >= 0) and
    (charged_free is null or charged_free >= 0) and
    (used_purchased is null or used_purchased >= 0) and
    (used_free is null or used_free >= 0)
  )
);

comment on table public.naver_bizmoney_daily is
  'Server-only Naver Search Ads Bizmoney funding, deduction, and balance evidence. Charging is not booked as advertising expense.';

alter table public.naver_bizmoney_daily enable row level security;
revoke all on table public.naver_bizmoney_daily from anon, authenticated;
grant select, insert, update, delete on table public.naver_bizmoney_daily to service_role;

create index if not exists naver_bizmoney_daily_updated_at_idx
  on public.naver_bizmoney_daily (updated_at desc);
