-- Extend only the established owner-fenced legacy credential store; AI save confirmation activates configured CLOVA/Gemini in the server runtime.
alter table public.moaon_managed_keys drop constraint moaon_managed_keys_provider_check;
alter table public.moaon_managed_keys add constraint moaon_managed_keys_provider_check check(provider in ('COUPANG','NAVER','CAFE24','EPOST','CLOVA','GEMINI','OPENAI'));
alter table public.moaon_managed_keys add constraint moaon_managed_ai_keys_no_expiry check(provider not in ('CLOVA','GEMINI','OPENAI') or expires_at is null);
alter table public.moaon_key_checks drop constraint moaon_key_checks_provider_check;
alter table public.moaon_key_checks add constraint moaon_key_checks_provider_check check(provider in ('COUPANG','NAVER','CAFE24','EPOST','CLOVA','GEMINI','OPENAI'));
create or replace function public.moaon_key_command(p_actor uuid,p_session uuid,p_hash text,p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare tenant uuid:='a3452bca-e259-40ed-a93d-b8bcc5c1b9e0'; a text:=p_input->>'action'; rowdata public.moaon_managed_keys; provider_name text:=p_input->>'provider';
begin
 perform 1 from public.dashboard_sessions where id=p_session and user_id=p_actor and token_hash=p_hash and revoked_at is null and expires_at>now() and role='OWNER' for share;
 if not found then raise exception 'KEYS_AUTH_REQUIRED'; end if;
 perform 1 from moaon_control.memberships m join moaon_control.tenants t on t.id=m.tenant_id join public.dashboard_users u on u.user_id=m.user_id where m.user_id=p_actor and m.tenant_id=tenant and m.status='ACTIVE' and m.role='OWNER' and t.status='ACTIVE' and u.active and u.role='OWNER' for share of m,t,u;
 if not found then raise exception 'KEYS_AUTH_REQUIRED'; end if;
 if a not in ('LIST','REVEAL','CHECK','SAVE') or (a<>'LIST' and (provider_name is null or provider_name not in ('COUPANG','NAVER','CAFE24','EPOST','CLOVA','GEMINI','OPENAI'))) then raise exception 'KEYS_INVALID';end if;
 if provider_name in ('CLOVA','GEMINI','OPENAI') then
  if a='REVEAL' then raise exception 'KEYS_INVALID';end if;
  if a='SAVE' and (not (p_input ?& array['action','provider','revision','envelope','expiresAt']) or p_input-array['action','provider','revision','envelope','expiresAt']<>'{}'::jsonb or p_input->'expiresAt'<>'null'::jsonb or jsonb_typeof(p_input->'revision')<>'number' or (p_input->>'revision') !~ '^[0-9]+$') then raise exception 'KEYS_INVALID';end if;
  if a='SAVE' and (jsonb_typeof(p_input->'envelope') is distinct from 'object' or not ((p_input->'envelope') ?& array['version','keyId','iv','ciphertext','tag']) or (p_input->'envelope')-array['version','keyId','iv','ciphertext','tag']<>'{}'::jsonb or p_input->'envelope'->'version' is distinct from '1'::jsonb) then raise exception 'KEYS_INVALID';end if;
  if a='CHECK' and (not (p_input ?& array['action','provider']) or p_input-array['action','provider']<>'{}'::jsonb) then raise exception 'KEYS_INVALID';end if;
 end if;
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
  return jsonb_build_object('revision',coalesce(rowdata.revision,0)+1,'status','SAVED_UNVERIFIED','updatedAt',now());
 end if;
 if provider_name in ('CLOVA','GEMINI','OPENAI') then return case when rowdata.provider is null then 'null'::jsonb else jsonb_build_object('revision',rowdata.revision,'status','SAVED_UNVERIFIED','updatedAt',rowdata.updated_at,'checkedAt',null) end;end if;
 return case when rowdata.provider is null then 'null'::jsonb else jsonb_build_object('revision',rowdata.revision,'envelope',rowdata.envelope,'expiresAt',rowdata.expires_at) end;
end $$;
revoke all on function public.moaon_key_command(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.moaon_key_command(uuid,uuid,text,jsonb) to service_role;
