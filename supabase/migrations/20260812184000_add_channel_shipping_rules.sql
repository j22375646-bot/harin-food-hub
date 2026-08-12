begin;

create table if not exists public.channel_shipping_rules (
  platform text primary key check (platform in ('NAVER', 'CAFE24', 'COUPANG')),
  return_shipping_cost numeric not null default 0 check (return_shipping_cost >= 0),
  return_rate numeric not null default 0 check (return_rate between 0 and 1),
  remote_area_surcharge numeric not null default 0 check (remote_area_surcharge >= 0),
  remote_area_rate numeric not null default 0 check (remote_area_rate between 0 and 1),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.channel_shipping_rules(platform)
values ('CAFE24'), ('NAVER'), ('COUPANG')
on conflict (platform) do nothing;

drop trigger if exists set_channel_shipping_rules_updated_at on public.channel_shipping_rules;
create trigger set_channel_shipping_rules_updated_at before update on public.channel_shipping_rules
for each row execute function public.set_updated_at();

alter table public.channel_shipping_rules enable row level security;
revoke all on public.channel_shipping_rules from anon, authenticated;
revoke all on public.channel_shipping_rules from service_role;
grant select, insert, update on public.channel_shipping_rules to service_role;

comment on table public.channel_shipping_rules is
  'Server-only expected return and remote-area shipping reserves used in profitability calculations.';

commit;
