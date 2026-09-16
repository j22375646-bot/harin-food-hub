create table public.moaon_case_settings(tenant_id uuid primary key references moaon_control.tenants(id),revision integer not null default 0,enabled boolean not null default false,checked_at timestamptz,lease_until timestamptz,sources jsonb not null default '[]');
create table public.moaon_cases(id uuid primary key default gen_random_uuid(),tenant_id uuid not null references moaon_control.tenants(id),platform text not null,kind text not null,source_id text not null,status text not null default 'OPEN',revision integer not null default 0,observed_state text not null default 'PENDING',last_seen_at timestamptz not null default now(),created_at timestamptz not null default now(),snooze_until timestamptz,unique(tenant_id,platform,kind,source_id));
create table public.moaon_case_events(id uuid primary key default gen_random_uuid(),tenant_id uuid not null,case_id uuid references public.moaon_cases(id),kind text not null,created_at timestamptz not null default now(),delivery text not null default 'PENDING',actor text,bot_revision integer,chat_id text);
alter table public.moaon_case_settings enable row level security;
alter table public.moaon_cases enable row level security;
alter table public.moaon_case_events enable row level security;
revoke all on public.moaon_case_settings,public.moaon_cases,public.moaon_case_events from public,anon,authenticated,service_role;
create table public.moaon_case_runs(id uuid primary key default gen_random_uuid(),tenant_id uuid not null,lease_until timestamptz not null,started_at timestamptz not null default now(),finished_at timestamptz,status text not null default 'RUNNING',observations integer,sources jsonb);
alter table public.moaon_case_runs enable row level security;
revoke all on public.moaon_case_runs from public,anon,authenticated,service_role;
create index moaon_case_event_delivery on public.moaon_case_events(tenant_id,delivery,created_at);
create function public.moaon_assistant_cases(p_actor uuid,p_session uuid,p_hash text,p_input jsonb,p_worker_hash text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare tenant uuid:='a3452bca-e259-40ed-a93d-b8bcc5c1b9e0';a text:=p_input->>'action';s public.moaon_case_settings;c public.moaon_cases;b public.moaon_assistant_bots;e public.moaon_case_events;o jsonb;ident jsonb;event_kind text;present boolean;lease text;
begin
 if p_worker_hash is null then perform public.moaon_assistant_access_command(p_actor,p_session,p_hash,'{"action":"STATUS"}');
 else
  ident:=public.moaon_assistant_access_verify(p_worker_hash,false);
  if not coalesce(ident->'scopes' ?& array['orders','cs'],false) then raise exception 'ASSISTANT_AUTH_REQUIRED';end if;
  if a='CASE_SAVE' then raise exception 'ASSISTANT_AUTH_REQUIRED';end if;
  if a in ('CASE_READ','CASE_ACT') then
   select * into b from public.moaon_assistant_bots where tenant_id=tenant and slot='WORK';
   if not coalesce((b.settings->>'enabled')::boolean,false) or b.settings->>'chatId' is distinct from p_input->>'chatId' or not coalesce(b.settings->'allowedUsers' ? (p_input->>'userId'),false) then raise exception 'ASSISTANT_AUTH_REQUIRED';end if;
  end if;
 end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('moaon-cases:'||tenant::text,0));
 insert into public.moaon_case_settings(tenant_id) values(tenant) on conflict do nothing;
 select * into s from public.moaon_case_settings where tenant_id=tenant for update;
 if a='CASE_SAVE' then
  if (p_input->>'revision')::integer is distinct from s.revision then raise exception 'ASSISTANT_CONFLICT';end if;
  if jsonb_typeof(p_input->'enabled') is distinct from 'boolean' then raise exception 'ASSISTANT_INVALID';end if;
  update public.moaon_case_settings set enabled=(p_input->>'enabled')::boolean,revision=revision+1 where tenant_id=tenant returning * into s;
 elsif a='BEGIN' then
  if (not s.enabled and not coalesce((p_input->>'test')::boolean,false)) or s.lease_until>now() or (not coalesce((p_input->>'test')::boolean,false) and s.checked_at>now()-interval '10 minutes') then return '{}';end if;
  update public.moaon_case_runs set status='UNKNOWN',finished_at=now() where tenant_id=tenant and status='RUNNING' and lease_until<=now();
  update public.moaon_case_settings set lease_until=now()+interval '5 minutes' where tenant_id=tenant returning * into s;
  insert into public.moaon_case_runs(tenant_id,lease_until) values(tenant,s.lease_until);
  return jsonb_build_object('lease',s.lease_until);
 elsif a='APPLY' then
  if s.lease_until is distinct from (p_input->>'lease')::timestamptz or s.lease_until<now() then raise exception 'ASSISTANT_CONFLICT';end if;
  if jsonb_typeof(p_input->'observations') is distinct from 'array' or jsonb_array_length(p_input->'observations')>3000 then raise exception 'ASSISTANT_INVALID';end if;
  for o in select value from jsonb_array_elements(p_input->'observations') loop
   if o->>'platform' not in ('NAVER','CAFE24','COUPANG') or o->>'kind' not in ('ORDER','CS') or o->>'state' not in ('PENDING','RESOLVED') or length(o->>'sourceId') not between 1 and 240 then raise exception 'ASSISTANT_INVALID';end if;
   select * into c from public.moaon_cases where tenant_id=tenant and platform=o->>'platform' and kind=o->>'kind' and source_id=o->>'sourceId';
   event_kind:=null;
   if c.id is null and o->>'state'='PENDING' then
    insert into public.moaon_cases(tenant_id,platform,kind,source_id) values(tenant,o->>'platform',o->>'kind',o->>'sourceId') returning * into c;event_kind:='DETECTED';
   elsif c.id is not null then
    if o->>'state'='RESOLVED' and c.status<>'RESOLVED' then event_kind:='RESOLVED';update public.moaon_cases set status='RESOLVED',snooze_until=null,revision=revision+1 where id=c.id;
    elsif o->>'state'='PENDING' and c.status='RESOLVED' then event_kind:='REOPENED';update public.moaon_cases set status='OPEN',revision=revision+1 where id=c.id;
    elsif o->>'state'='PENDING' and c.status='SNOOZED' and c.snooze_until<=now() then event_kind:='REMINDER';update public.moaon_cases set status='OPEN',snooze_until=null,revision=revision+1 where id=c.id;end if;
    update public.moaon_cases set observed_state=o->>'state',last_seen_at=now() where id=c.id;
   end if;
   if event_kind is not null then insert into public.moaon_case_events(tenant_id,case_id,kind,delivery,bot_revision,chat_id) values(tenant,c.id,event_kind,case when s.enabled then 'PENDING' else 'SKIPPED' end,(select revision from public.moaon_assistant_bots where tenant_id=tenant and slot='WORK'),(select settings->>'chatId' from public.moaon_assistant_bots where tenant_id=tenant and slot='WORK'));end if;
  end loop;
  -- Missing records or failed readers never close a case.
  update public.moaon_cases c1 set observed_state='UNKNOWN' where c1.tenant_id=tenant and c1.status<>'RESOLVED' and not exists(select 1 from jsonb_array_elements(p_input->'observations') x where x->>'platform'=c1.platform and x->>'kind'=c1.kind and x->>'sourceId'=c1.source_id);
  update public.moaon_case_runs set status=case when jsonb_array_length(coalesce(p_input->'sources','[]'))>0 then 'PARTIAL' else 'SUCCEEDED' end,finished_at=now(),observations=jsonb_array_length(p_input->'observations'),sources=p_input->'sources' where tenant_id=tenant and lease_until=s.lease_until and status='RUNNING';
  update public.moaon_case_settings set checked_at=now(),lease_until=null,sources=coalesce(p_input->'sources','[]') where tenant_id=tenant returning * into s;
 elsif a='CASE_ACT' then
  select * into c from public.moaon_cases where tenant_id=tenant and id=(p_input->>'id')::uuid for update;
  if c.id is null or c.revision is distinct from (p_input->>'revision')::integer or c.status='RESOLVED' then raise exception 'ASSISTANT_CONFLICT';end if;
  if p_input->>'verb' not in ('TAKE','SNOOZE','RESUME') then raise exception 'ASSISTANT_INVALID';end if;
  update public.moaon_cases set status=case p_input->>'verb' when 'TAKE' then 'IN_PROGRESS' when 'SNOOZE' then 'SNOOZED' else 'OPEN' end,snooze_until=case when p_input->>'verb'='SNOOZE' then now()+interval '30 minutes' else null end,revision=revision+1 where id=c.id;
  insert into public.moaon_case_events(tenant_id,case_id,kind,delivery,actor) values(tenant,c.id,p_input->>'verb','SKIPPED',coalesce(p_actor::text,'telegram:'||(p_input->>'userId')));
 elsif a='DELIVERY' then
  select * into e from public.moaon_case_events where tenant_id=tenant and delivery='PENDING' order by created_at limit 1 for update;
  if e.id is null then return '{}';end if;
  select * into b from public.moaon_assistant_bots where tenant_id=tenant and slot='WORK';
  if not s.enabled or b.revision is distinct from e.bot_revision or b.settings->>'chatId' is distinct from e.chat_id or not coalesce((b.settings->>'enabled')::boolean,false) then update public.moaon_case_events set delivery='SKIPPED' where id=e.id;return '{}';end if;
  if extract(hour from now() at time zone 'Asia/Seoul') not between 8 and 19 then return '{}';end if;
  select * into c from public.moaon_cases where id=e.case_id;
  if (c.observed_state='UNKNOWN' and e.kind<>'RESOLVED') or (e.kind in ('DETECTED','REOPENED','REMINDER') and c.status<>'OPEN') or (e.kind='RESOLVED' and c.status<>'RESOLVED') then update public.moaon_case_events set delivery='SKIPPED' where id=e.id;return '{}';end if;
  update public.moaon_case_events set delivery='UNKNOWN' where id=e.id;
  return jsonb_build_object('event',to_jsonb(e),'case',to_jsonb(c),'bot',to_jsonb(b));
 elsif a='RESULT' then
  if p_input->>'status' not in ('SENT','FAILED','UNKNOWN') then raise exception 'ASSISTANT_INVALID';end if;
  update public.moaon_case_events set delivery=p_input->>'status' where tenant_id=tenant and id=(p_input->>'id')::uuid and delivery='UNKNOWN';return '{}';
 elsif a<>'CASE_READ' then raise exception 'ASSISTANT_INVALID';end if;
 return jsonb_build_object('revision',s.revision,'enabled',s.enabled,'checkedAt',s.checked_at,'sources',s.sources,'runs',(select coalesce(jsonb_agg(to_jsonb(q)),'[]') from (select id,started_at,finished_at,status,observations,sources from public.moaon_case_runs where tenant_id=tenant order by started_at desc limit 20) q),'activeCount',(select count(*) from public.moaon_cases where tenant_id=tenant and status<>'RESOLVED'),'cases',(select coalesce(jsonb_agg(to_jsonb(q)),'[]') from (select * from public.moaon_cases where tenant_id=tenant order by (status='RESOLVED'),created_at desc limit 100) q),'events',(select coalesce(jsonb_agg(to_jsonb(q)),'[]') from (select id,case_id,kind,created_at,delivery from public.moaon_case_events where tenant_id=tenant order by created_at desc limit 100) q));
end $$;
revoke all on function public.moaon_assistant_cases(uuid,uuid,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.moaon_assistant_cases(uuid,uuid,text,jsonb,text) to service_role;
