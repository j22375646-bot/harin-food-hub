-- Private knowledge bot; scheduling remains WORK/SOLO only.
alter table public.moaon_assistant_bots drop constraint moaon_assistant_bots_slot_check;
alter table public.moaon_assistant_bots add constraint moaon_assistant_bots_slot_check check(slot in ('WORK','SOLO','STUDY'));
create or replace function public.moaon_assistant_bot_command(p_actor uuid,p_session uuid,p_hash text,p_input jsonb,p_worker_hash text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare tenant uuid:='a3452bca-e259-40ed-a93d-b8bcc5c1b9e0';a text:=p_input->>'action';b public.moaon_assistant_bots;identity jsonb;
begin
 if p_worker_hash is null then
  perform public.moaon_assistant_access_command(p_actor,p_session,p_hash,'{"action":"STATUS"}');
  if a not in ('BOT_LIST','GET','PUT','TEST_CLAIM','TEST_RESULT') then raise exception 'ASSISTANT_INVALID';end if;
 else
  identity:=public.moaon_assistant_access_verify(p_worker_hash,true);
  if a not in ('BOT_CONFIG','BOT_REPORT') then raise exception 'ASSISTANT_INVALID';end if;
 end if;
 if a is null then raise exception 'ASSISTANT_INVALID';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('assistant-bots:'||tenant::text,0));
 if a='BOT_CONFIG' then return (select coalesce(jsonb_agg(to_jsonb(x)),'[]') from public.moaon_assistant_bots x where tenant_id=tenant);end if;
 if a<>'BOT_LIST' then
  if (p_input->>'slot') is null or (p_input->>'slot') not in ('WORK','SOLO','STUDY') then raise exception 'ASSISTANT_INVALID';end if;
  select * into b from public.moaon_assistant_bots where tenant_id=tenant and slot=p_input->>'slot' for update;
  if a='GET' then if b.slot is null then return null;end if;return to_jsonb(b);end if;
  if a='PUT' then
   if coalesce(b.revision,0) is distinct from (p_input->>'revision')::integer then raise exception 'ASSISTANT_CONFLICT';end if;
   if jsonb_typeof(p_input->'envelope') is distinct from 'object' or octet_length((p_input->'settings')::text)>24000 or p_input->>'username' !~ '^[A-Za-z0-9_]{5,32}$' then raise exception 'ASSISTANT_INVALID';end if;
   insert into public.moaon_assistant_bots(tenant_id,slot,revision,username,envelope,settings) values(tenant,p_input->>'slot',coalesce(b.revision,0)+1,p_input->>'username',p_input->'envelope',p_input->'settings')
   on conflict(tenant_id,slot) do update set revision=excluded.revision,username=excluded.username,envelope=excluded.envelope,settings=excluded.settings,runtime_status='PENDING',updated_at=now(),test_status=null,test_id=null;
  else
   if b.revision is distinct from (p_input->>'revision')::integer then raise exception 'ASSISTANT_CONFLICT';end if;
   if a='BOT_REPORT' then
    if p_input->>'status' not in ('RUNNING','STOPPED','CHECK_REQUIRED') then raise exception 'ASSISTANT_INVALID';end if;
    update public.moaon_assistant_bots set applied_revision=b.revision,runtime_status=p_input->>'status',checked_at=now() where tenant_id=tenant and slot=b.slot;
    return '{"saved":true}';
   elsif a='TEST_CLAIM' then
    if b.test_id=(p_input->>'id')::uuid then return jsonb_build_object('claimed',false);end if;
    if b.test_at>now()-interval '30 seconds' then raise exception 'ASSISTANT_RATE_LIMITED';end if;
    update public.moaon_assistant_bots set test_id=(p_input->>'id')::uuid,test_status='PENDING',test_at=now() where tenant_id=tenant and slot=b.slot;
    return jsonb_build_object('claimed',true,'row',to_jsonb(b));
   elsif a='TEST_RESULT' then
    if p_input->>'status' not in ('SENT','FAILED','UNKNOWN') then raise exception 'ASSISTANT_INVALID';end if;
    update public.moaon_assistant_bots set test_status=p_input->>'status' where tenant_id=tenant and slot=b.slot and test_id=(p_input->>'id')::uuid and test_status='PENDING';
   end if;
  end if;
 end if;
 return (select coalesce(jsonb_agg(to_jsonb(x)),'[]') from (select slot,revision,username,settings,applied_revision,runtime_status,checked_at,test_status,test_at,updated_at from public.moaon_assistant_bots where tenant_id=tenant order by slot) x);
end $$;
revoke all on function public.moaon_assistant_bot_command(uuid,uuid,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.moaon_assistant_bot_command(uuid,uuid,text,jsonb,text) to service_role;
