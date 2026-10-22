-- Active, authenticated use renews within seven days of expiry.
-- Expired/revoked credentials and changed memberships remain rejected.
create or replace function public.moaon_assistant_access_verify(p_hash text,p_consume boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.moaon_assistant_access;
begin
 if p_hash is null or p_hash !~ '^[0-9a-f]{64}$' or p_consume is null then raise exception 'ASSISTANT_AUTH_REQUIRED';end if;
 select a.* into r from public.moaon_assistant_access a join moaon_control.memberships m on m.tenant_id=a.tenant_id and m.user_id=a.owner_id join moaon_control.tenants t on t.id=a.tenant_id join public.dashboard_users u on u.user_id=a.owner_id
 where a.tenant_id='a3452bca-e259-40ed-a93d-b8bcc5c1b9e0' and a.token_hash=p_hash and a.revoked_at is null and a.expires_at>clock_timestamp() and m.version=a.membership_version and m.status='ACTIVE' and m.role='OWNER' and t.status='ACTIVE' and u.active and u.role='OWNER' for update of a for share of m,t,u;
 if not found then raise exception 'ASSISTANT_AUTH_REQUIRED';end if;
 if p_consume then
  if r.window_start>clock_timestamp()-interval '1 minute' and r.requests>=10 then raise exception 'ASSISTANT_RATE_LIMITED';end if;
  update public.moaon_assistant_access set requests=case when window_start<=clock_timestamp()-interval '1 minute' then 1 else requests+1 end,window_start=case when window_start<=clock_timestamp()-interval '1 minute' then clock_timestamp() else window_start end,last_used_at=clock_timestamp(),expires_at=case when expires_at<=clock_timestamp()+interval '7 days' then clock_timestamp()+interval '30 days' else expires_at end where tenant_id=r.tenant_id;
 end if;
 return jsonb_build_object('tenantId',r.tenant_id,'userId',r.owner_id,'revision',r.revision,'scopes',r.scopes);
end $$;
revoke all on function public.moaon_assistant_access_verify(text,boolean) from public,anon,authenticated;
grant execute on function public.moaon_assistant_access_verify(text,boolean) to service_role;

