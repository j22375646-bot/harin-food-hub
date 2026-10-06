-- P4-160 additive candidate. Apply explicitly; never through the control-role runtime.
-- Trusted server verifies live session and tenant membership before every operation.
begin;
create table if not exists public.ai_insight_budget_accounts (
 provider_account_id text primary key,
 charged_krw bigint not null default 0 check(charged_krw >= 0)
);
create table if not exists public.ai_insight_tenant_budgets (
 provider_account_id text not null references public.ai_insight_budget_accounts,
 tenant_id uuid not null references moaon_control.tenants(id),
 charged_krw bigint not null default 0 check(charged_krw >= 0),
 day_kst date not null,
 daily_count integer not null default 0,
 primary key(provider_account_id,tenant_id)
);
create table if not exists public.ai_usage_reservations (
 tenant_id uuid not null references moaon_control.tenants(id),
 request_id uuid not null,
 provider_account_id text not null references public.ai_insight_budget_accounts,
 provider text not null check(provider='CLOVA'),
 requester text not null check(length(requester) between 1 and 200),
 fingerprint text not null check(fingerprint ~ '^[0-9a-f]{64}$'),
 pricing_version text not null,
 max_cost_krw bigint not null check(max_cost_krw between 1 and 30000),
 actual_cost_krw bigint check(actual_cost_krw >= 0),
 status text not null check(status in ('RESERVED','SUCCEEDED','FAILED','UNKNOWN')),
 usage jsonb,
 created_at timestamptz not null default clock_timestamp(),
 settled_at timestamptz,
 primary key(tenant_id,request_id),
 unique(tenant_id,fingerprint)
);
create table if not exists public.ai_insight_runs (
 tenant_id uuid not null references moaon_control.tenants(id),
 run_id uuid not null,
 request_id uuid not null,
 fingerprint text not null,
 run jsonb not null check(jsonb_typeof(run)='object' and octet_length(run::text)<=131072),
 created_at timestamptz not null default clock_timestamp(),
 primary key(tenant_id,run_id),
 unique(tenant_id,request_id),
 unique(tenant_id,fingerprint)
);
create or replace function public.moaon_ai_reserve(
 p_tenant_id uuid,p_request_id uuid,p_provider text,p_provider_account_id text,
 p_requester text,p_fingerprint text,p_max_cost_krw bigint,p_pricing_version text
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare a public.ai_insight_budget_accounts%rowtype;
 t public.ai_insight_tenant_budgets%rowtype; r public.ai_usage_reservations%rowtype;
 today date := (clock_timestamp() at time zone 'Asia/Seoul')::date;
begin
 if p_provider <> 'CLOVA' or coalesce(length(p_provider_account_id),0)=0
 or coalesce(length(p_pricing_version),0)=0 then
 return jsonb_build_object('allowed',false,'reason','SETUP_REQUIRED'); end if;
 if p_max_cost_krw is null or p_max_cost_krw<1 or p_max_cost_krw>30000 then
 return jsonb_build_object('allowed',false,'reason','BUDGET_BLOCKED'); end if;
 if clock_timestamp() >= timestamptz '2026-11-30 00:00:00+09' then
 return jsonb_build_object('allowed',false,'reason','BUDGET_BLOCKED'); end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_tenant_id::text,160));
 insert into public.ai_insight_budget_accounts(provider_account_id) values(p_provider_account_id) on conflict do nothing;
 select * into a from public.ai_insight_budget_accounts where provider_account_id=p_provider_account_id for update;
 insert into public.ai_insight_tenant_budgets(provider_account_id,tenant_id,day_kst)
 values(p_provider_account_id,p_tenant_id,today) on conflict do nothing;
 select * into t from public.ai_insight_tenant_budgets where provider_account_id=p_provider_account_id and tenant_id=p_tenant_id for update;
 -- A crashed caller must not hold the tenant slot forever. Keep its charge and
 -- fingerprint claim: two minutes exceeds the maximum 25-second provider deadline.
 update public.ai_usage_reservations set status='UNKNOWN',settled_at=clock_timestamp()
 where tenant_id=p_tenant_id and status='RESERVED' and created_at<=clock_timestamp()-interval '2 minutes';
 select * into r from public.ai_usage_reservations where tenant_id=p_tenant_id and (request_id=p_request_id or fingerprint=p_fingerprint) limit 1;
 if found then return jsonb_build_object('allowed',false,'reservationId',r.request_id,'replayed',true,'reason',case when r.status='RESERVED' then 'PENDING' else 'ALREADY_PROCESSED' end); end if;
 if exists(select 1 from public.ai_usage_reservations where tenant_id=p_tenant_id and status='RESERVED') then
 return jsonb_build_object('allowed',false,'reason','PENDING'); end if;
 if a.charged_krw+p_max_cost_krw>30000 or t.charged_krw+p_max_cost_krw>30000 then
 return jsonb_build_object('allowed',false,'reason','BUDGET_BLOCKED'); end if;
 if t.day_kst=today and t.daily_count>=50 then return jsonb_build_object('allowed',false,'reason','QUOTA_BLOCKED'); end if;
 update public.ai_insight_budget_accounts set charged_krw=charged_krw+p_max_cost_krw where provider_account_id=p_provider_account_id;
 update public.ai_insight_tenant_budgets set charged_krw=charged_krw+p_max_cost_krw,
 daily_count=case when day_kst=today then daily_count+1 else 1 end,day_kst=today
 where provider_account_id=p_provider_account_id and tenant_id=p_tenant_id;
 insert into public.ai_usage_reservations(tenant_id,request_id,provider_account_id,provider,requester,fingerprint,pricing_version,max_cost_krw,status)
 values(p_tenant_id,p_request_id,p_provider_account_id,p_provider,p_requester,p_fingerprint,p_pricing_version,p_max_cost_krw,'RESERVED');
 return jsonb_build_object('allowed',true,'reservationId',p_request_id,'replayed',false);
end $$;
create or replace function public.moaon_ai_settle(p_tenant_id uuid,p_request_id uuid,p_status text,p_actual_cost_krw bigint,p_usage jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.ai_usage_reservations%rowtype; account_id text; delta bigint;
begin
 if p_status not in ('SUCCEEDED','FAILED','UNKNOWN') then raise exception 'INVALID_STATUS'; end if;
 select provider_account_id into account_id from public.ai_usage_reservations where tenant_id=p_tenant_id and request_id=p_request_id;
 if not found then return jsonb_build_object('settled',false); end if;
 perform 1 from public.ai_insight_budget_accounts where provider_account_id=account_id for update;
 select * into r from public.ai_usage_reservations where tenant_id=p_tenant_id and request_id=p_request_id for update;
 if r.status<>'RESERVED' then return jsonb_build_object('settled',true,'replayed',true); end if;
 if p_actual_cost_krw<0 then raise exception 'INVALID_COST'; end if;
 -- Null cost and UNKNOWN are not evidence of a refund, including transport failures.
 delta := case when p_status='UNKNOWN' or p_actual_cost_krw is null then 0 else p_actual_cost_krw-r.max_cost_krw end;
 update public.ai_insight_budget_accounts set charged_krw=charged_krw+delta where provider_account_id=account_id;
 update public.ai_insight_tenant_budgets set charged_krw=charged_krw+delta where provider_account_id=account_id and tenant_id=p_tenant_id;
 update public.ai_usage_reservations set status=p_status,actual_cost_krw=case when p_status='UNKNOWN' then null else p_actual_cost_krw end,
 usage=p_usage,settled_at=clock_timestamp() where tenant_id=p_tenant_id and request_id=p_request_id;
 return jsonb_build_object('settled',true,'replayed',false);
end $$;
create or replace function public.moaon_ai_cleanup() returns void
language plpgsql security invoker set search_path='' as $$ begin
 update public.ai_usage_reservations set status='UNKNOWN',settled_at=clock_timestamp()
 where status='RESERVED' and created_at<=clock_timestamp()-interval '2 minutes';
 delete from public.ai_insight_runs where created_at<clock_timestamp()-interval '90 days';
 delete from public.ai_usage_reservations where created_at<clock_timestamp()-interval '180 days';
 -- Cumulative counters deliberately outlive individual ledgers. Cleanup never refunds.
end $$;
alter table public.ai_insight_budget_accounts enable row level security;
alter table public.ai_insight_tenant_budgets enable row level security;
alter table public.ai_usage_reservations enable row level security;
alter table public.ai_insight_runs enable row level security;
revoke all on public.ai_insight_budget_accounts,public.ai_insight_tenant_budgets,public.ai_usage_reservations,public.ai_insight_runs from public,anon,authenticated;
grant select,insert,update,delete on public.ai_insight_budget_accounts,public.ai_insight_tenant_budgets,public.ai_usage_reservations,public.ai_insight_runs to service_role;
revoke all on function public.moaon_ai_reserve(uuid,uuid,text,text,text,text,bigint,text),public.moaon_ai_settle(uuid,uuid,text,bigint,jsonb),public.moaon_ai_cleanup() from public,anon,authenticated;
grant execute on function public.moaon_ai_reserve(uuid,uuid,text,text,text,text,bigint,text),public.moaon_ai_settle(uuid,uuid,text,bigint,jsonb),public.moaon_ai_cleanup() to service_role;
commit;
