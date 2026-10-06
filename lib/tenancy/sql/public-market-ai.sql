-- P4-160B additive candidate; explicit operator application only. No CLOVA changes.
-- Schedule SELECT public.moaon_public_market_ai_cleanup() daily through trusted cron.
begin;
create table if not exists public.public_market_ai_claims (
 tenant_id uuid not null references moaon_control.tenants(id),
 request_id uuid not null,
 fingerprint text not null check(fingerprint ~ '^[0-9a-f]{64}$'),
 primary key(tenant_id,request_id), unique(tenant_id,fingerprint)
);
create table if not exists public.public_market_ai_requests (
 tenant_id uuid not null references moaon_control.tenants(id),
 request_id uuid not null,
 account_id text not null check(length(account_id) between 1 and 200),
 requester text not null check(length(requester) between 1 and 200),
 fingerprint text not null check(fingerprint ~ '^[0-9a-f]{64}$'),
 status text not null check(status in ('RESERVED','SUCCEEDED','FAILED','UNKNOWN')),
 cost_state text not null default 'FREE_CONFIRMED' check(cost_state='FREE_CONFIRMED'),
 usage jsonb check(usage is null or (jsonb_typeof(usage)='object' and octet_length(usage::text)<=2048)),
 day_kst date not null default (clock_timestamp() at time zone 'Asia/Seoul')::date,
 created_at timestamptz not null default clock_timestamp(), settled_at timestamptz,
 primary key(tenant_id,request_id), unique(tenant_id,fingerprint)
);
create index if not exists public_market_ai_account_day on public.public_market_ai_requests(account_id,day_kst);
create index if not exists public_market_ai_tenant_day on public.public_market_ai_requests(tenant_id,day_kst);
create table if not exists public.public_market_ai_runs (
 tenant_id uuid not null references moaon_control.tenants(id), run_id uuid not null,
 request_id uuid not null, fingerprint text not null check(fingerprint ~ '^[0-9a-f]{64}$'),
 run jsonb not null check(jsonb_typeof(run)='object' and octet_length(run::text)<=131072),
 created_at timestamptz not null default clock_timestamp(),
 primary key(tenant_id,run_id), unique(tenant_id,request_id), unique(tenant_id,fingerprint)
);
create or replace function public.moaon_public_market_ai_reserve(
 p_tenant_id uuid,p_request_id uuid,p_account_id text,p_fingerprint text,p_requester text
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.public_market_ai_requests%rowtype; c public.public_market_ai_claims%rowtype;
 today date := (clock_timestamp() at time zone 'Asia/Seoul')::date;
begin
 if p_tenant_id is null or p_request_id is null or coalesce(p_fingerprint,'') !~ '^[0-9a-f]{64}$'
 or coalesce(length(p_account_id),0) not between 1 and 200 or coalesce(length(p_requester),0) not between 1 and 200 then
 raise exception 'INVALID_REQUEST'; end if;
 -- Tenant lock spans all accounts; project lock spans all tenants. Never use a secret key as account ID.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_tenant_id::text,16001));
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_account_id,16002));
 today := (clock_timestamp() at time zone 'Asia/Seoul')::date;
 update public.public_market_ai_requests set status='UNKNOWN',settled_at=clock_timestamp()
 where tenant_id=p_tenant_id and status='RESERVED' and created_at<=clock_timestamp()-interval '2 minutes';
 select * into c from public.public_market_ai_claims where tenant_id=p_tenant_id and (request_id=p_request_id or fingerprint=p_fingerprint)
 order by (request_id=p_request_id) desc limit 1;
 if found then
 select * into r from public.public_market_ai_requests where tenant_id=c.tenant_id and request_id=c.request_id;
 return jsonb_build_object('allowed',false,'replayed',true,'reservationId',c.request_id,'reason',case when r.status='RESERVED' then 'PENDING' else 'ALREADY_PROCESSED' end);
 end if;
 if exists(select 1 from public.public_market_ai_requests where tenant_id=p_tenant_id and status='RESERVED') then
 return jsonb_build_object('allowed',false,'reason','PENDING'); end if;
 if (select count(*) from public.public_market_ai_requests where tenant_id=p_tenant_id and day_kst=today)>=20
 or (select count(*) from public.public_market_ai_requests where account_id=p_account_id and day_kst=today)>=20 then
 return jsonb_build_object('allowed',false,'reason','QUOTA_BLOCKED'); end if;
 insert into public.public_market_ai_claims values(p_tenant_id,p_request_id,p_fingerprint);
 insert into public.public_market_ai_requests(tenant_id,request_id,account_id,requester,fingerprint,status,day_kst)
 values(p_tenant_id,p_request_id,p_account_id,p_requester,p_fingerprint,'RESERVED',today);
 return jsonb_build_object('allowed',true,'replayed',false,'reservationId',p_request_id);
end $$;
create or replace function public.moaon_public_market_ai_settle(p_tenant_id uuid,p_request_id uuid,p_status text,p_usage jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.public_market_ai_requests%rowtype;
begin
 if p_status is null or p_status not in ('SUCCEEDED','FAILED','UNKNOWN') then raise exception 'INVALID_STATUS'; end if;
 select * into r from public.public_market_ai_requests where tenant_id=p_tenant_id and request_id=p_request_id for update;
 if not found then return jsonb_build_object('settled',false); end if;
 if r.status<>'RESERVED' then return jsonb_build_object('settled',true,'replayed',true); end if;
 update public.public_market_ai_requests set status=p_status,usage=p_usage,settled_at=clock_timestamp()
 where tenant_id=p_tenant_id and request_id=p_request_id;
 -- A failure or unknown response still consumed the reserved free call; never refund.
 return jsonb_build_object('settled',true,'replayed',false);
end $$;
create or replace function public.moaon_public_market_ai_cleanup() returns void
language plpgsql security invoker set search_path='' as $$ begin
 update public.public_market_ai_requests set status='UNKNOWN',settled_at=clock_timestamp()
 where status='RESERVED' and created_at<=clock_timestamp()-interval '2 minutes';
 delete from public.public_market_ai_runs where created_at<=clock_timestamp()-interval '7 days';
 delete from public.public_market_ai_requests where created_at<=clock_timestamp()-interval '90 days';
 -- Compact request/fingerprint claims survive retention: old IDs must never call the provider again.
end $$;
alter table public.public_market_ai_claims enable row level security;
alter table public.public_market_ai_requests enable row level security;
alter table public.public_market_ai_runs enable row level security;
revoke all on public.public_market_ai_claims,public.public_market_ai_requests,public.public_market_ai_runs from public,anon,authenticated;
grant select,insert,update,delete on public.public_market_ai_claims,public.public_market_ai_requests,public.public_market_ai_runs to service_role;
revoke all on function public.moaon_public_market_ai_reserve(uuid,uuid,text,text,text),public.moaon_public_market_ai_settle(uuid,uuid,text,jsonb),public.moaon_public_market_ai_cleanup() from public,anon,authenticated;
grant execute on function public.moaon_public_market_ai_reserve(uuid,uuid,text,text,text),public.moaon_public_market_ai_settle(uuid,uuid,text,jsonb),public.moaon_public_market_ai_cleanup() to service_role;
commit;
