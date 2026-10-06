-- New members opt in; only an unambiguous existing owner configuration is migrated below.
create table public.moaon_personal_preferences(
 tenant_id uuid not null references moaon_control.tenants(id),user_id uuid not null references public.dashboard_users(user_id),
 revision integer not null default 0,legacy_chat_id text,order_cursor timestamptz,test_id uuid,test_slot text,test_at timestamptz,test_window timestamptz,test_count integer not null default 0,chat_id text,verified boolean not null default false,membership_version integer,
 settings jsonb not null default '{"WORK":{"enabled":false,"time":"09:00","days":[0,1,2,3,4,5,6]},"SOLO":{"enabled":false,"time":"09:00","days":[0,1,2,3,4,5,6]},"STUDY":{"enabled":false,"time":"09:00","days":[0,1,2,3,4,5,6]},"SUP":{"enabled":false,"time":"09:00","days":[0,1,2,3,4,5,6]},"AD":{"enabled":false,"time":"09:00","days":[0,1,2,3,4,5,6]},"newOrders":false}',
 code_hash text,challenge_until timestamptz,attempts integer not null default 0,link_started_at timestamptz,link_window timestamptz,link_count integer not null default 0,
 notify_since timestamptz not null default now(),updated_at timestamptz not null default now(),primary key(tenant_id,user_id),check(not verified or chat_id is not null));
create unique index moaon_personal_verified_chat on public.moaon_personal_preferences(tenant_id,chat_id) where verified;
create table public.moaon_personal_deliveries(
 tenant_id uuid not null,user_id uuid not null,slot text not null check(slot in ('WORK','SOLO','STUDY','SUP','AD')),id text not null,kind text not null,
 revision integer not null,chat_id text not null,status text not null default 'UNKNOWN' check(status in ('UNKNOWN','SENT','FAILED','CANCELLED')),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),primary key(tenant_id,user_id,slot,id),
 foreign key(tenant_id,user_id) references public.moaon_personal_preferences(tenant_id,user_id));
alter table public.moaon_personal_preferences enable row level security;
alter table public.moaon_personal_deliveries enable row level security;
revoke all on public.moaon_personal_preferences,public.moaon_personal_deliveries from public,anon,authenticated;
grant select,insert,update,delete on public.moaon_personal_preferences,public.moaon_personal_deliveries to service_role;
alter table public.moaon_case_events add column personal_eligible boolean not null default false,add column personal_ordered_at timestamptz;
create function public.moaon_assistant_preferences(p_actor uuid,p_session uuid,p_hash text,p_input jsonb,p_worker_hash text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare t uuid:='a3452bca-e259-40ed-a93d-b8bcc5c1b9e0';a text:=p_input->>'action';s public.moaon_personal_preferences;b public.moaon_assistant_bots;v jsonb;x jsonb;k text;uid uuid:=p_actor;mv integer;nm text;rl text;ts timestamp:=now() at time zone 'Asia/Seoul';sl text:=p_input->>'slot';eid text:=p_input->>'id';ident jsonb;cutoff timestamptz;groups jsonb;ev uuid;
begin
 if jsonb_typeof(p_input) is distinct from 'object' then raise exception 'ASSISTANT_INVALID';end if;
 if p_worker_hash is null then
  if a is null or a not in ('PREF_READ','PREF_SAVE','LINK_BEGIN','LINK_VERIFY','PREF_UNLINK','PREF_TEST') or p_input ?| array['userId','actor','tenantId'] then raise exception 'ASSISTANT_INVALID';end if;
  perform 1 from public.dashboard_sessions where id=p_session and user_id=p_actor and token_hash=p_hash and revoked_at is null and expires_at>clock_timestamp() for share;
  if not found then raise exception 'ASSISTANT_AUTH_REQUIRED';end if;
  select m.version,u.display_name,u.role into mv,nm,rl from moaon_control.memberships m join moaon_control.tenants tt on tt.id=m.tenant_id join public.dashboard_users u on u.user_id=m.user_id where m.tenant_id=t and m.user_id=p_actor and m.status='ACTIVE' and tt.status='ACTIVE' and u.active for share of m,tt,u;
  if not found then raise exception 'ASSISTANT_AUTH_REQUIRED';end if;
 else
  ident:=public.moaon_assistant_access_verify(p_worker_hash,a='PREF_DUE');
  if a is null or a not in ('PREF_DUE','PREF_CLAIM','PREF_RESULT') then raise exception 'ASSISTANT_INVALID';end if;
  uid:=(p_input->>'userId')::uuid;
 end if;
 -- Serialize verified-recipient uniqueness and mutation/claim snapshots.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('personal-preferences:'||t::text,0));
 if a='PREF_DUE' then
  return jsonb_build_object('jobs',(select coalesce(jsonb_agg(q.job),'[]') from (
   select jsonb_build_object('userId',p.user_id,'slot',bb.slot,'revision',p.revision,'botRevision',bb.revision,'id',j.id,'kind',j.kind,'chatId',p.chat_id) job
   from public.moaon_personal_preferences p join moaon_control.memberships m on m.tenant_id=p.tenant_id and m.user_id=p.user_id join moaon_control.tenants tt on tt.id=p.tenant_id join public.dashboard_users u on u.user_id=p.user_id join public.moaon_assistant_bots bb on bb.tenant_id=p.tenant_id
   cross join lateral (
    select 'schedule:'||to_char(ts,'YYYY-MM-DD')||':'||replace(p.settings->bb.slot->>'time',':','') id,'SCHEDULE' kind
    where p.settings->bb.slot->>'enabled'='true' and p.settings->bb.slot->'days' @> to_jsonb(array[extract(isodow from ts)::int-1]) and ts>=ts::date+(p.settings->bb.slot->>'time')::time and ts<ts::date+(p.settings->bb.slot->>'time')::time+interval '10 minutes'
    union all select 'test:'||p.test_id::text,'TEST' where p.test_slot=bb.slot and p.test_at>now()-interval '10 minutes'
    union all select 'orders:'||latest.id::text,'NEW_ORDER' from (select e.id from public.moaon_case_events e join public.moaon_cases c on c.id=e.case_id where e.tenant_id=t and e.personal_eligible and e.personal_ordered_at>=p.notify_since and e.created_at>greatest(p.notify_since,coalesce(p.order_cursor,p.notify_since)) and c.kind='ORDER' and c.status='OPEN' and c.observed_state='PENDING' order by e.created_at desc,e.id desc limit 1) latest where bb.slot='WORK' and p.settings->>'newOrders'='true' and extract(hour from ts) between 8 and 19
   ) j
   where p.tenant_id=t and p.verified and m.status='ACTIVE' and m.version=p.membership_version and tt.status='ACTIVE' and u.active and bb.slot in ('WORK','SOLO','STUDY','SUP','AD') and bb.settings->>'enabled'='true'
   and (bb.slot<>'AD' or coalesce(ident->'scopes' ? 'reports',false)) and (j.kind<>'NEW_ORDER' or coalesce(ident->'scopes' ? 'orders',false))
   and not exists(select 1 from public.moaon_personal_deliveries d where d.tenant_id=t and d.user_id=p.user_id and d.slot=bb.slot and d.id=j.id)
   order by p.user_id,bb.slot,j.id limit 250
  ) q));
 end if;
 if p_worker_hash is null then insert into public.moaon_personal_preferences(tenant_id,user_id) values(t,uid) on conflict do nothing;end if;
 select * into s from public.moaon_personal_preferences where tenant_id=t and user_id=uid for update;
 if s.user_id is null then raise exception 'ASSISTANT_DISABLED';end if;
 if a in ('PREF_SAVE','LINK_BEGIN','LINK_VERIFY','PREF_UNLINK','PREF_TEST','PREF_CLAIM') and (p_input->>'revision')::integer is distinct from s.revision then raise exception 'ASSISTANT_CONFLICT';end if;
 if a='PREF_SAVE' then
  v:=p_input->'settings';
  if jsonb_typeof(v) is distinct from 'object' then raise exception 'ASSISTANT_INVALID';end if;
  if (select count(*) from jsonb_object_keys(v))<>6 or not v ?& array['WORK','SOLO','STUDY','SUP','AD','newOrders'] or jsonb_typeof(v->'newOrders') is distinct from 'boolean' then raise exception 'ASSISTANT_INVALID';end if;
  foreach k in array array['WORK','SOLO','STUDY','SUP','AD'] loop
   x:=v->k;
   if jsonb_typeof(x) is distinct from 'object' then raise exception 'ASSISTANT_INVALID';end if;
   if (select count(*) from jsonb_object_keys(x))<>3 or not x ?& array['enabled','time','days'] or jsonb_typeof(x->'enabled') is distinct from 'boolean' or jsonb_typeof(x->'time') is distinct from 'string' or coalesce(x->>'time','')!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' or jsonb_typeof(x->'days') is distinct from 'array' then raise exception 'ASSISTANT_INVALID';end if;
   if jsonb_array_length(x->'days') not between 1 and 7 or exists(select 1 from jsonb_array_elements(x->'days') d where d::text!~'^[0-6]$') or (select count(distinct d) from jsonb_array_elements(x->'days') d)<>jsonb_array_length(x->'days') then raise exception 'ASSISTANT_INVALID';end if;
  end loop;
  if (v->>'newOrders'='true' or exists(select 1 from jsonb_each(v) z where z.key<>'newOrders' and z.value->>'enabled'='true')) and (not s.verified or s.membership_version is distinct from mv) then raise exception 'ASSISTANT_RECIPIENT_REQUIRED';end if;
  update public.moaon_personal_preferences set settings=v,notify_since=case when settings->>'newOrders'='false' and v->>'newOrders'='true' then now() else notify_since end,revision=revision+1,updated_at=now() where tenant_id=t and user_id=uid returning * into s;
  return jsonb_build_object('revision',s.revision,'settings',s.settings);
 elsif a='PREF_TEST' then
  if not s.verified or s.membership_version is distinct from mv then raise exception 'ASSISTANT_RECIPIENT_REQUIRED';end if;
  if sl is null or sl not in ('WORK','SOLO','STUDY','SUP','AD') or coalesce(p_input->>'id','')!~'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' then raise exception 'ASSISTANT_INVALID';end if;
  select * into b from public.moaon_assistant_bots where tenant_id=t and slot=sl;
  if b.slot is null or b.settings->>'enabled' is distinct from 'true' then raise exception 'ASSISTANT_DISABLED';end if;
  if s.test_id=(p_input->>'id')::uuid then return jsonb_build_object('revision',s.revision,'queued',true);end if;
  if s.test_at>now()-interval '30 seconds' or (s.test_window>now()-interval '1 hour' and s.test_count>=5) then raise exception 'ASSISTANT_RATE_LIMITED';end if;
  update public.moaon_personal_preferences set test_id=(p_input->>'id')::uuid,test_slot=sl,test_at=now(),test_count=case when test_window>now()-interval '1 hour' then test_count+1 else 1 end,test_window=case when test_window>now()-interval '1 hour' then test_window else now() end where tenant_id=t and user_id=uid;
  return jsonb_build_object('revision',s.revision,'queued',true);
 elsif a='LINK_BEGIN' then
  if jsonb_typeof(p_input->'chatId') is distinct from 'string' or coalesce(p_input->>'chatId','')!~'^[1-9][0-9]{0,15}$' or coalesce(p_input->>'codeHash','')!~'^[a-f0-9]{64}$' then raise exception 'ASSISTANT_INVALID';end if;
  if s.link_started_at>now()-interval '30 seconds' or (s.link_window>now()-interval '1 hour' and s.link_count>=3) then raise exception 'ASSISTANT_RATE_LIMITED';end if;
  select * into b from public.moaon_assistant_bots where tenant_id=t and slot='WORK';
  if b.slot is null or b.settings->>'enabled' is distinct from 'true' then raise exception 'ASSISTANT_DISABLED';end if;
  update public.moaon_personal_preferences set test_id=null,chat_id=p_input->>'chatId',verified=false,membership_version=null,code_hash=p_input->>'codeHash',challenge_until=now()+interval '10 minutes',attempts=0,link_started_at=now(),link_count=case when link_window>now()-interval '1 hour' then link_count+1 else 1 end,link_window=case when link_window>now()-interval '1 hour' then link_window else now() end,revision=revision+1,updated_at=now() where tenant_id=t and user_id=uid returning * into s;
  update public.moaon_personal_deliveries set status='CANCELLED',updated_at=now() where tenant_id=t and user_id=uid and status='UNKNOWN';
  return jsonb_build_object('revision',s.revision,'chatId',s.chat_id,'bot',to_jsonb(b));
 elsif a='LINK_VERIFY' then
  if coalesce(p_input->>'codeHash','')!~'^[a-f0-9]{64}$' then raise exception 'ASSISTANT_INVALID';end if;
  if s.code_hash is null or s.challenge_until<=now() or s.attempts>=5 then return jsonb_build_object('revision',s.revision,'verified',false,'error','ASSISTANT_CHALLENGE_EXPIRED');end if;
  update public.moaon_personal_preferences set attempts=attempts+1 where tenant_id=t and user_id=uid;
  if s.code_hash is distinct from p_input->>'codeHash' then return jsonb_build_object('revision',s.revision,'verified',false,'error','ASSISTANT_CODE_INVALID');end if;
  if exists(select 1 from public.moaon_personal_preferences where tenant_id=t and verified and chat_id=s.chat_id and user_id<>uid) then return jsonb_build_object('revision',s.revision,'verified',false,'error','ASSISTANT_RECIPIENT_IN_USE');end if;
  update public.moaon_personal_preferences set verified=true,membership_version=mv,code_hash=null,challenge_until=null,revision=revision+1,notify_since=now(),updated_at=now() where tenant_id=t and user_id=uid returning * into s;
  return jsonb_build_object('revision',s.revision,'verified',true,'chatId',s.chat_id);
 elsif a='PREF_UNLINK' then
  v:=jsonb_set(s.settings,array['newOrders'],'false');
  foreach k in array array['WORK','SOLO','STUDY','SUP','AD'] loop v:=jsonb_set(v,array[k,'enabled'],'false');end loop;
  update public.moaon_personal_preferences set settings=v,test_id=null,verified=false,chat_id=null,membership_version=null,code_hash=null,challenge_until=null,revision=revision+1,updated_at=now() where tenant_id=t and user_id=uid returning * into s;
  update public.moaon_personal_deliveries set status='CANCELLED',updated_at=now() where tenant_id=t and user_id=uid and status='UNKNOWN';
  return jsonb_build_object('revision',s.revision,'verified',false,'chatId',null);
 elsif a='PREF_CLAIM' then
  perform 1 from moaon_control.memberships m join moaon_control.tenants tt on tt.id=m.tenant_id join public.dashboard_users u on u.user_id=m.user_id where m.tenant_id=t and m.user_id=uid and m.status='ACTIVE' and m.version=s.membership_version and tt.status='ACTIVE' and u.active for share of m,tt,u;
  if not found or not s.verified then raise exception 'ASSISTANT_AUTH_REQUIRED';end if;
  if sl is null or sl not in ('WORK','SOLO','STUDY','SUP','AD') then raise exception 'ASSISTANT_INVALID';end if;
  if sl='AD' and not coalesce(ident->'scopes' ? 'reports',false) or p_input->>'kind'='NEW_ORDER' and not coalesce(ident->'scopes' ? 'orders',false) then raise exception 'ASSISTANT_AUTH_REQUIRED';end if;
  select * into b from public.moaon_assistant_bots where tenant_id=t and slot=sl for share;
  if b.slot is null or b.settings->>'enabled' is distinct from 'true' or (p_input->>'botRevision')::integer is distinct from b.revision then raise exception 'ASSISTANT_CONFLICT';end if;
  if p_input->>'kind'='TEST' then
   if sl is distinct from s.test_slot or eid is distinct from 'test:'||s.test_id::text or s.test_at is null or s.test_at<now()-interval '10 minutes' then raise exception 'ASSISTANT_DISABLED';end if;
  elsif p_input->>'kind'='NEW_ORDER' then
   if sl<>'WORK' or s.settings->>'newOrders' is distinct from 'true' or extract(hour from ts) not between 8 and 19 or coalesce(eid,'')!~'^orders:[a-f0-9-]{36}$' then raise exception 'ASSISTANT_DISABLED';end if;
   ev:=substring(eid from 8)::uuid;
   select created_at into cutoff from public.moaon_case_events where id=ev and tenant_id=t and personal_eligible;
   if cutoff is null or cutoff<=greatest(s.notify_since,coalesce(s.order_cursor,s.notify_since)) then return '{"claimed":false}';end if;
   select jsonb_agg(to_jsonb(q)) into groups from (select c.platform,count(*)::integer count from public.moaon_case_events e join public.moaon_cases c on c.id=e.case_id where e.tenant_id=t and e.personal_eligible and e.personal_ordered_at>=s.notify_since and e.created_at>greatest(s.notify_since,coalesce(s.order_cursor,s.notify_since)) and e.created_at<=cutoff and c.kind='ORDER' and c.status='OPEN' and c.observed_state='PENDING' group by c.platform) q;
   if groups is null then return '{"claimed":false}';end if;
  elsif p_input->>'kind'='SCHEDULE' then
  if s.settings->sl->>'enabled' is distinct from 'true' or not(s.settings->sl->'days' @> to_jsonb(array[extract(isodow from ts)::int-1])) or ts<ts::date+(s.settings->sl->>'time')::time or ts>=ts::date+(s.settings->sl->>'time')::time+interval '10 minutes' or eid is distinct from 'schedule:'||to_char(ts,'YYYY-MM-DD')||':'||replace(s.settings->sl->>'time',':','') then raise exception 'ASSISTANT_DISABLED';end if;
  else raise exception 'ASSISTANT_INVALID';end if;
  insert into public.moaon_personal_deliveries(tenant_id,user_id,slot,id,kind,revision,chat_id) values(t,uid,sl,eid,p_input->>'kind',s.revision,s.chat_id) on conflict do nothing;
  if not found then return '{"claimed":false}';end if;
  if p_input->>'kind'='NEW_ORDER' then update public.moaon_personal_preferences set order_cursor=cutoff where tenant_id=t and user_id=uid;end if;
  return jsonb_build_object('kind',p_input->>'kind','groups',groups,'claimed',true,'userId',uid,'slot',sl,'chatId',s.chat_id,'scopes',ident->'scopes','settings',s.settings,'bot',to_jsonb(b));
 elsif a='PREF_RESULT' then
  if coalesce(p_input->>'status','') not in ('SENT','FAILED','UNKNOWN') then raise exception 'ASSISTANT_INVALID';end if;
  update public.moaon_personal_deliveries set status=p_input->>'status',updated_at=now() where tenant_id=t and user_id=uid and slot=sl and id=eid and status='UNKNOWN';
  return '{"saved":true}';
 end if;
 return jsonb_build_object('userId',uid,'displayName',nm,'role',rl,'revision',s.revision,'chatId',coalesce(s.chat_id,''),'verified',s.verified and s.membership_version=mv,'settings',s.settings,'bots',(select coalesce(jsonb_agg(jsonb_build_object('slot',slot,'username',username,'enabled',settings->'enabled','status',runtime_status)),'[]') from public.moaon_assistant_bots where tenant_id=t));
end $$;
revoke all on function public.moaon_assistant_preferences(uuid,uuid,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.moaon_assistant_preferences(uuid,uuid,text,jsonb,text) to service_role;
-- Preserve only an unambiguous, already configured legacy owner recipient.
-- This marker survives unlinking so old shared schedules cannot silently resume.
do $$
declare t uuid:='a3452bca-e259-40ed-a93d-b8bcc5c1b9e0';owner_id uuid;mv integer;chat text;n integer;v jsonb;sl text;aut jsonb;ads jsonb;
begin
 if to_regclass('public.moaon_assistant_access') is null then return;end if;
 select a.owner_id,m.version into owner_id,mv from public.moaon_assistant_access a join moaon_control.memberships m on m.tenant_id=a.tenant_id and m.user_id=a.owner_id join moaon_control.tenants tt on tt.id=a.tenant_id join public.dashboard_users u on u.user_id=a.owner_id where a.tenant_id=t and a.revoked_at is null and a.expires_at>now() and m.version=a.membership_version and m.status='ACTIVE' and m.role='OWNER' and tt.status='ACTIVE' and u.active and u.role='OWNER';
 if owner_id is null then return;end if;
 select count(distinct settings->>'chatId'),min(settings->>'chatId') into n,chat from public.moaon_assistant_bots where tenant_id=t and settings->>'enabled'='true';
 if n<>1 or coalesce(chat,'')!~'^[1-9][0-9]{0,15}$' or exists(select 1 from public.moaon_assistant_bots where tenant_id=t and settings->>'enabled'='true' and coalesce(settings->>'chatId','')!~'^[1-9][0-9]{0,15}$') then return;end if;
 insert into public.moaon_personal_preferences(tenant_id,user_id,chat_id,legacy_chat_id,verified,membership_version,revision) values(t,owner_id,chat,chat,true,mv,1) on conflict do nothing;
 if not found then return;end if;
 select settings into v from public.moaon_personal_preferences where tenant_id=t and user_id=owner_id;
 foreach sl in array array['WORK','SOLO','STUDY','SUP'] loop
  select settings into aut from public.moaon_bot_automations where tenant_id=t and slot=sl;
  if aut is not null then v:=jsonb_set(v,array[sl],jsonb_build_object('enabled',coalesce((aut->>'schedule')::boolean,false),'time',aut->>'time','days',aut->'days'));end if;
 end loop;
 select settings into ads from public.moaon_ads_settings where tenant_id=t;
 if ads is not null then v:=jsonb_set(v,array['AD'],jsonb_build_object('enabled',coalesce((ads->>'daily')::boolean,false) and coalesce((ads->>'notify')::boolean,false),'time',ads->>'time','days','[0,1,2,3,4,5,6]'::jsonb));end if;
 v:=jsonb_set(v,array['newOrders'],to_jsonb(coalesce((select enabled from public.moaon_case_settings where tenant_id=t),false)));
 update public.moaon_personal_preferences set settings=v where tenant_id=t and user_id=owner_id;
end $$;
-- Guard source transformations: fail migration if the expected deployed contract drifts.
do $$
declare src text;outsrc text;needle text;
begin
 if to_regprocedure('public.moaon_assistant_bot_automation(uuid,uuid,text,jsonb,text)') is not null then
  src:=pg_get_functiondef('public.moaon_assistant_bot_automation(uuid,uuid,text,jsonb,text)'::regprocedure);
  needle:='  insert into public.moaon_bot_deliveries(tenant_id,slot,id,kind,chat_id)';
  outsrc:=replace(src,needle,$patch$  if p_input->>'kind'<>'TEST' and exists(select 1 from public.moaon_personal_preferences pp where pp.tenant_id=t and pp.legacy_chat_id=b.settings->>'chatId') then return '{"claimed":false}';end if;
$patch$||needle);
  if outsrc=src then raise exception 'PERSONAL_MIGRATION_AUTO_DRIFT';end if;execute outsrc;
 end if;
 if to_regprocedure('public.moaon_assistant_cases(uuid,uuid,text,jsonb,text)') is not null then
  src:=pg_get_functiondef('public.moaon_assistant_cases(uuid,uuid,text,jsonb,text)'::regprocedure);
  outsrc:=replace(src,'(tenant_id,case_id,kind,delivery,bot_revision,chat_id) values(tenant,c.id,event_kind,case when s.enabled', $patch$(tenant_id,case_id,kind,personal_ordered_at,personal_eligible,delivery,bot_revision,chat_id) values(tenant,c.id,event_kind,case when coalesce(o->>'orderedAt','')~'^20[0-9]{2}-[0-9]{2}-[0-9]{2}T' then (o->>'orderedAt')::timestamptz else null end,event_kind='DETECTED' and o->>'kind'='ORDER' and case when coalesce(o->>'orderedAt','')~'^20[0-9]{2}-[0-9]{2}-[0-9]{2}T' then (o->>'orderedAt')::timestamptz between coalesce((select min(pp.notify_since) from public.moaon_personal_preferences pp where pp.tenant_id=tenant and pp.verified and pp.settings->>'newOrders'='true'),now()) and now()+interval '5 minutes' else false end,case when s.enabled$patch$);
  if outsrc=src then raise exception 'PERSONAL_MIGRATION_CASE_EVENT_DRIFT';end if;src:=outsrc;
  outsrc:=replace(src,'(not s.enabled and not coalesce((p_input->>''test'')::boolean,false))', $patch$(not (s.enabled or exists(select 1 from public.moaon_personal_preferences pp where pp.tenant_id=tenant and pp.verified and pp.settings->>'newOrders'='true')) and not coalesce((p_input->>'test')::boolean,false))$patch$);
  if outsrc=src then raise exception 'PERSONAL_MIGRATION_CASE_POLL_DRIFT';end if;src:=outsrc;
  needle:='  batch:=gen_random_uuid();';
  outsrc:=replace(src,needle,$patch$  if exists(select 1 from public.moaon_personal_preferences pp where pp.tenant_id=tenant and pp.legacy_chat_id=b.settings->>'chatId') then update public.moaon_case_events set delivery='SKIPPED' where tenant_id=tenant and delivery='PENDING';return '{}';end if;
$patch$||needle);
  if outsrc=src then raise exception 'PERSONAL_MIGRATION_CASE_DELIVERY_DRIFT';end if;execute outsrc;
 end if;
 if to_regprocedure('public.moaon_assistant_ads(uuid,uuid,text,jsonb,text)') is not null then
  src:=pg_get_functiondef('public.moaon_assistant_ads(uuid,uuid,text,jsonb,text)'::regprocedure);
  needle:='  update public.moaon_ads_jobs set delivery=''UNKNOWN'' where id=j.id;';
  outsrc:=replace(src,needle,$patch$  if j.dedupe like 'daily:%' and exists(select 1 from public.moaon_personal_preferences pp where pp.tenant_id=tenant and pp.legacy_chat_id=b.settings->>'chatId') then update public.moaon_ads_jobs set delivery='SKIPPED' where id=j.id;return '{}';end if;
$patch$||needle);
  if outsrc=src then raise exception 'PERSONAL_MIGRATION_ADS_DRIFT';end if;execute outsrc;
 end if;
end $$;
