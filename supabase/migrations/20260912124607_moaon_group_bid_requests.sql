create table public.moaon_group_bid_requests (
 id uuid primary key default gen_random_uuid(), actor text not null, request_key text not null,
 group_id text not null, campaign_id text not null, group_name text not null,
 before_bid integer not null check(before_bid between 70 and 100000 and before_bid%10=0),
 bid integer not null check(bid between 70 and 100000 and bid%10=0),
 status text not null default 'PREVIEWED' check(status in ('PREVIEWED','APPLYING','VERIFIED','UNKNOWN','CANCELLED')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(actor,request_key)
);
create unique index moaon_group_bid_one_pending on public.moaon_group_bid_requests(group_id) where status in ('APPLYING','UNKNOWN');
alter table public.moaon_group_bid_requests enable row level security;
revoke all on public.moaon_group_bid_requests from public,anon,authenticated;
grant select,insert,update on public.moaon_group_bid_requests to service_role;
