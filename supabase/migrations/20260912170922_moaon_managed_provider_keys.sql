-- Dedicated encrypted settings for the established legacy business runtime.
create table public.moaon_managed_keys (
 tenant_id uuid not null references moaon_control.tenants(id),
 provider text not null check(provider in ('COUPANG','NAVER','CAFE24','EPOST')),
 revision integer not null check(revision>0), envelope jsonb not null,
 expires_at timestamptz, updated_at timestamptz not null default now(),
 updated_by uuid not null references public.dashboard_users(user_id),
 primary key(tenant_id,provider)
);
alter table public.moaon_managed_keys enable row level security;
revoke all on public.moaon_managed_keys from public,anon,authenticated,service_role;
grant select on public.moaon_managed_keys to service_role;
create table public.moaon_key_events (
 id bigint generated always as identity primary key, actor uuid not null,
 tenant_id uuid not null, provider text, action text not null, created_at timestamptz not null default now()
);
alter table public.moaon_key_events enable row level security;
revoke all on public.moaon_key_events from public,anon,authenticated,service_role;
create index moaon_key_events_actor_time on public.moaon_key_events(actor,created_at);
create table public.moaon_key_checks(tenant_id uuid not null references moaon_control.tenants(id),provider text not null check(provider in ('COUPANG','NAVER','CAFE24','EPOST')),revision integer not null check(revision>=0),result jsonb not null,checked_at timestamptz not null,primary key(tenant_id,provider));
alter table public.moaon_key_checks enable row level security;
revoke all on public.moaon_key_checks from public,anon,authenticated,service_role;
grant select,insert,update on public.moaon_key_checks to service_role;
create function public.moaon_key_command(p_actor uuid,p_session uuid,p_hash text,p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare tenant uuid:='a3452bca-e259-40ed-a93d-b8bcc5c1b9e0'; a text:=p_input->>'action'; rowdata public.moaon_managed_keys; provider_name text:=p_input->>'provider';
begin
 perform 1 from public.dashboard_sessions where id=p_session and user_id=p_actor and token_hash=p_hash and revoked_at is null and expires_at>now() and role='OWNER' for share;
 if not found then raise exception 'KEYS_AUTH_REQUIRED'; end if;
 perform 1 from moaon_control.memberships m join moaon_control.tenants t on t.id=m.tenant_id join public.dashboard_users u on u.user_id=m.user_id where m.user_id=p_actor and m.tenant_id=tenant and m.status='ACTIVE' and m.role='OWNER' and t.status='ACTIVE' and u.active and u.role='OWNER' for share of m,t,u;
 if not found then raise exception 'KEYS_AUTH_REQUIRED'; end if;
 if a not in ('LIST','REVEAL','CHECK','SAVE') or (a<>'LIST' and (provider_name is null or provider_name not in ('COUPANG','NAVER','CAFE24','EPOST'))) then raise exception 'KEYS_INVALID';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('managed-key-actor:'||p_actor::text,0));
 if (select count(*) from public.moaon_key_events where actor=p_actor and created_at>now()-interval '1 minute')>=30 then raise exception 'KEYS_RATE_LIMITED';end if;
 insert into public.moaon_key_events(actor,tenant_id,provider,action) values(p_actor,tenant,provider_name,a);
 if a='LIST' then return (select coalesce(jsonb_agg(jsonb_build_object('provider',provider,'revision',revision,'expiresAt',expires_at,'updatedAt',updated_at)),'[]') from public.moaon_managed_keys where tenant_id=tenant);end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('managed-key:'||tenant::text||provider_name,0));
 select * into rowdata from public.moaon_managed_keys where tenant_id=tenant and provider=provider_name for update;
 if a='SAVE' then
  if coalesce(rowdata.revision,0)<>(p_input->>'revision')::integer then raise exception 'KEYS_CONFLICT';end if;
  if jsonb_typeof(p_input->'envelope')<>'object' or pg_column_size(p_input->'envelope')>32768 then raise exception 'KEYS_INVALID';end if;
  insert into public.moaon_managed_keys(tenant_id,provider,revision,envelope,expires_at,updated_by) values(tenant,provider_name,coalesce(rowdata.revision,0)+1,p_input->'envelope',(p_input->>'expiresAt')::timestamptz,p_actor)
  on conflict(tenant_id,provider) do update set revision=excluded.revision,envelope=excluded.envelope,expires_at=excluded.expires_at,updated_at=now(),updated_by=p_actor;
  return jsonb_build_object('revision',coalesce(rowdata.revision,0)+1,'status','SAVED_UNVERIFIED');
 end if;
 return case when rowdata.provider is null then 'null'::jsonb else jsonb_build_object('revision',rowdata.revision,'envelope',rowdata.envelope,'expiresAt',rowdata.expires_at) end;
end $$;
revoke all on function public.moaon_key_command(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.moaon_key_command(uuid,uuid,text,jsonb) to service_role;
