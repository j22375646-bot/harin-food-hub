create table public.moaon_assistant_access (
 tenant_id uuid primary key references moaon_control.tenants(id),
 owner_id uuid not null references public.dashboard_users(user_id),
 membership_version integer not null,
 revision integer not null check(revision>0),
 token_hash text check(token_hash ~ '^[0-9a-f]{64}$'),
 expires_at timestamptz not null, revoked_at timestamptz,
 scopes text[] not null check(cardinality(scopes) between 1 and 4 and scopes <@ array['orders','tasks','cs','reports']::text[]),
 created_at timestamptz not null default now(), last_used_at timestamptz,
 window_start timestamptz not null default now(), requests integer not null default 0
);
alter table public.moaon_assistant_access enable row level security;
revoke all on public.moaon_assistant_access from public,anon,authenticated,service_role;
create function public.moaon_assistant_access_command(p_actor uuid,p_session uuid,p_hash text,p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare tenant uuid:='a3452bca-e259-40ed-a93d-b8bcc5c1b9e0'; a text:=p_input->>'action'; v integer; r public.moaon_assistant_access; s text[];
begin
 perform 1 from public.dashboard_sessions where id=p_session and user_id=p_actor and token_hash=p_hash and revoked_at is null and expires_at>clock_timestamp() and role='OWNER' for share;
 if not found then raise exception 'ASSISTANT_AUTH_REQUIRED';end if;
 select m.version into v from moaon_control.memberships m join moaon_control.tenants t on t.id=m.tenant_id join public.dashboard_users u on u.user_id=m.user_id where m.user_id=p_actor and m.tenant_id=tenant and m.status='ACTIVE' and m.role='OWNER' and t.status='ACTIVE' and u.active and u.role='OWNER' for share of m,t,u;
 if not found then raise exception 'ASSISTANT_AUTH_REQUIRED';end if;
 if a is null or a not in ('STATUS','ISSUE','REVOKE') then raise exception 'ASSISTANT_INVALID';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('assistant-access:'||tenant::text,0));
 select * into r from public.moaon_assistant_access where tenant_id=tenant for update;
 if a<>'STATUS' then
  if (p_input->>'revision') is null or (p_input->>'revision')::integer<>coalesce(r.revision,0) then raise exception 'ASSISTANT_CONFLICT';end if;
  if a='ISSUE' then
   if coalesce(p_input->>'tokenHash','') !~ '^[0-9a-f]{64}$' or jsonb_typeof(p_input->'scopes') is distinct from 'array' then raise exception 'ASSISTANT_INVALID';end if;
   select array_agg(x) into s from jsonb_array_elements_text(p_input->'scopes') x;
   if s is null or cardinality(s) not between 1 and 4 or not s <@ array['orders','tasks','cs','reports']::text[] or cardinality(s)<>(select count(distinct x) from unnest(s) x) then raise exception 'ASSISTANT_INVALID';end if;
   insert into public.moaon_assistant_access(tenant_id,owner_id,membership_version,revision,token_hash,expires_at,scopes)
   values(tenant,p_actor,v,coalesce(r.revision,0)+1,p_input->>'tokenHash',clock_timestamp()+interval '30 days',s)
   on conflict(tenant_id) do update set owner_id=excluded.owner_id,membership_version=excluded.membership_version,revision=excluded.revision,token_hash=excluded.token_hash,expires_at=excluded.expires_at,scopes=excluded.scopes,created_at=clock_timestamp(),revoked_at=null,last_used_at=null,window_start=clock_timestamp(),requests=0 returning * into r;
  elsif r.tenant_id is not null then
   update public.moaon_assistant_access set revoked_at=clock_timestamp(),token_hash=null,revision=revision+1 where tenant_id=tenant returning * into r;
  end if;
 end if;
 return jsonb_build_object('revision',coalesce(r.revision,0),'status',case when r.tenant_id is null then 'NOT_ISSUED' when r.revoked_at is not null then 'REVOKED' when r.expires_at<=clock_timestamp() then 'EXPIRED' when r.owner_id<>p_actor or r.membership_version<>v then 'REISSUE_REQUIRED' else 'ACTIVE' end,'expiresAt',r.expires_at,'lastUsedAt',r.last_used_at,'scopes',coalesce(to_jsonb(r.scopes),'[]'::jsonb));
end $$;
revoke all on function public.moaon_assistant_access_command(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.moaon_assistant_access_command(uuid,uuid,text,jsonb) to service_role;
create function public.moaon_assistant_access_verify(p_hash text,p_consume boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.moaon_assistant_access;
begin
 if p_hash is null or p_hash !~ '^[0-9a-f]{64}$' or p_consume is null then raise exception 'ASSISTANT_AUTH_REQUIRED';end if;
 select a.* into r from public.moaon_assistant_access a join moaon_control.memberships m on m.tenant_id=a.tenant_id and m.user_id=a.owner_id join moaon_control.tenants t on t.id=a.tenant_id join public.dashboard_users u on u.user_id=a.owner_id
 where a.tenant_id='a3452bca-e259-40ed-a93d-b8bcc5c1b9e0' and a.token_hash=p_hash and a.revoked_at is null and a.expires_at>clock_timestamp() and m.version=a.membership_version and m.status='ACTIVE' and m.role='OWNER' and t.status='ACTIVE' and u.active and u.role='OWNER' for update of a for share of m,t,u;
 if not found then raise exception 'ASSISTANT_AUTH_REQUIRED';end if;
 if p_consume then
  if r.window_start>clock_timestamp()-interval '1 minute' and r.requests>=10 then raise exception 'ASSISTANT_RATE_LIMITED';end if;
  update public.moaon_assistant_access set requests=case when window_start<=clock_timestamp()-interval '1 minute' then 1 else requests+1 end,window_start=case when window_start<=clock_timestamp()-interval '1 minute' then clock_timestamp() else window_start end,last_used_at=clock_timestamp() where tenant_id=r.tenant_id;
 end if;
 return jsonb_build_object('tenantId',r.tenant_id,'userId',r.owner_id,'revision',r.revision,'scopes',r.scopes);
end $$;
revoke all on function public.moaon_assistant_access_verify(text,boolean) from public,anon,authenticated;
grant execute on function public.moaon_assistant_access_verify(text,boolean) to service_role;
