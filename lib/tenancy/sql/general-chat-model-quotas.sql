-- Model-specific Moaon quotas; Google remaining balance is not inferred.
begin;
alter table public.public_market_ai_requests add column if not exists model text not null default 'gemini-3.5-flash-lite';
create or replace function public.moaon_public_market_ai_model_reserve(
 p_tenant_id uuid,p_request_id uuid,p_account_id text,p_fingerprint text,p_requester text,p_model text
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.public_market_ai_requests%rowtype; c public.public_market_ai_claims%rowtype;
 daily_limit integer := case p_model when 'gemini-3.5-flash-lite' then 500 when 'gemini-3.8-flash' then 500 else 0 end;
 today date := (clock_timestamp() at time zone 'Asia/Seoul')::date;
begin
 if daily_limit=0 or p_tenant_id is null or p_request_id is null or coalesce(p_fingerprint,'') !~ '^[0-9a-f]{64}$'
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
 if (select count(*) from public.public_market_ai_requests where tenant_id=p_tenant_id and day_kst=today and model=p_model)>=daily_limit
 or (select count(*) from public.public_market_ai_requests where account_id=p_account_id and day_kst=today and model=p_model)>=daily_limit then
 return jsonb_build_object('allowed',false,'reason','QUOTA_BLOCKED'); end if;
 insert into public.public_market_ai_claims values(p_tenant_id,p_request_id,p_fingerprint);
 insert into public.public_market_ai_requests(tenant_id,request_id,account_id,requester,fingerprint,status,day_kst,model)
 values(p_tenant_id,p_request_id,p_account_id,p_requester,p_fingerprint,'RESERVED',today,p_model);
 return jsonb_build_object('allowed',true,'replayed',false,'reservationId',p_request_id);
end $$;

create or replace function public.moaon_public_market_ai_reserve(p_tenant_id uuid,p_request_id uuid,p_account_id text,p_fingerprint text,p_requester text) returns jsonb language sql security invoker set search_path='' as $$ select public.moaon_public_market_ai_model_reserve(p_tenant_id,p_request_id,p_account_id,p_fingerprint,p_requester,'gemini-3.5-flash-lite'); $$;
revoke all on function public.moaon_public_market_ai_model_reserve(uuid,uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.moaon_public_market_ai_model_reserve(uuid,uuid,text,text,text,text) to service_role;
commit;
