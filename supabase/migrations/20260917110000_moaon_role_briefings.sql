-- Add role briefings without enabling or changing any existing schedule.
alter table public.moaon_bot_automations drop constraint moaon_bot_automations_slot_check;
alter table public.moaon_bot_automations add constraint moaon_bot_automations_slot_check check(slot in ('WORK','SOLO','SUP','STUDY'));
create or replace function public.moaon_assistant_bot_automation(p_actor uuid,p_session uuid,p_hash text,p_input jsonb,p_worker_hash text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare t uuid:='a3452bca-e259-40ed-a93d-b8bcc5c1b9e0';a text:=p_input->>'action';sl text:=p_input->>'slot';s public.moaon_bot_automations;b public.moaon_assistant_bots;v jsonb;n integer;ts timestamp:=now() at time zone 'Asia/Seoul';ident jsonb;event text:=p_input->>'id';
begin
 if p_worker_hash is null then
  perform public.moaon_assistant_access_command(p_actor,p_session,p_hash,'{"action":"STATUS"}');
  if a is null or a not in ('AUTO_READ','AUTO_SAVE','AUTO_TEST') then raise exception 'ASSISTANT_INVALID';end if;
 else
  -- Poll consumes one read allowance; result/claim bookkeeping has separate delivery caps.
  ident:=public.moaon_assistant_access_verify(p_worker_hash,a in ('AUTO_PULSE','AUTO_BRIEF'));
  if a is null or a not in ('AUTO_PULSE','AUTO_CLAIM','AUTO_RESULT','AUTO_HEALTH','AUTO_BRIEF') then raise exception 'ASSISTANT_INVALID';end if;
 end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('bot-automation:'||t::text,0));
 insert into public.moaon_bot_automations(tenant_id,slot,settings) select t,x,(case when x='SUP' then '{"sections":["health","deliveries"]}'::jsonb when x='STUDY' then '{"sections":["knowledge"]}'::jsonb else '{"sections":["tasks"]}'::jsonb end)||'{"schedule":false,"changes":false,"time":"09:00","days":[0,1,2,3,4,5,6],"quietStart":8,"quietEnd":20}'::jsonb from unnest(array['WORK','SOLO','SUP','STUDY']) x on conflict do nothing;
 if a not in ('AUTO_READ','AUTO_PULSE') then
  if sl is null or sl not in ('WORK','SOLO','SUP','STUDY') then raise exception 'ASSISTANT_INVALID';end if;
  select * into s from public.moaon_bot_automations where tenant_id=t and slot=sl for update;
  select * into b from public.moaon_assistant_bots where tenant_id=t and slot=sl for update;
 end if;
 if a in ('AUTO_SAVE','AUTO_TEST','AUTO_CLAIM') and (p_input->>'revision')::integer is distinct from s.revision then raise exception 'ASSISTANT_CONFLICT';end if;

 if a='AUTO_BRIEF' then
  if sl not in ('SUP','STUDY') or b.slot is null or not coalesce((b.settings->>'enabled')::boolean,false) then raise exception 'ASSISTANT_DISABLED';end if;
  if sl='SUP' then
   return jsonb_build_object('retrievedAt',now(),'bots',(select coalesce(jsonb_agg(jsonb_build_object('slot',slot,'enabled',settings->'enabled','status',runtime_status,'checkedAt',checked_at)),'[]') from public.moaon_assistant_bots where tenant_id=t),'deliveries',(select jsonb_build_object('failed',count(*) filter(where status='FAILED'),'unknown',count(*) filter(where status='UNKNOWN' or status='PENDING' and created_at<now()-interval '5 minutes')) from public.moaon_bot_deliveries where tenant_id=t and created_at>now()-interval '24 hours'));
  end if;
  if not exists(select 1 from public.moaon_assistant_settings where tenant_id=t and settings->>'knowledge'='true') then return jsonb_build_object('retrievedAt',now(),'knowledgeEnabled',false);end if;
  return jsonb_build_object('retrievedAt',now(),'knowledgeEnabled',true,'pending',(select count(*) from public.moaon_learning_proposals where tenant_id=t and status='PENDING'),'published',(select count(*) from public.moaon_assistant_knowledge where tenant_id=t and deleted_at is null),'recent',(select coalesce(jsonb_agg(to_jsonb(q)),'[]') from (select title,updated_at from public.moaon_assistant_knowledge where tenant_id=t and deleted_at is null and updated_at>now()-interval '7 days' order by updated_at desc limit 3) q));
 end if;
 if a='AUTO_SAVE' then
  v:=p_input->'settings';
  if sl in ('SUP','STUDY') and v->>'changes' is distinct from 'false' then raise exception 'ASSISTANT_INVALID';end if;
  if jsonb_typeof(v) is distinct from 'object' or (select count(*) from jsonb_object_keys(v))<>7 or not (v ?& array['schedule','changes','time','days','quietStart','quietEnd','sections']) then raise exception 'ASSISTANT_INVALID';end if;
  -- Strict validation also applies to direct service RPC callers.
  if jsonb_typeof(v->'schedule') is distinct from 'boolean' or jsonb_typeof(v->'changes') is distinct from 'boolean' or coalesce(v->>'time','')!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'ASSISTANT_INVALID';end if;
  if jsonb_typeof(v->'days') is distinct from 'array' or jsonb_typeof(v->'sections') is distinct from 'array' then raise exception 'ASSISTANT_INVALID';end if;
  if jsonb_array_length(v->'days') not between 1 and 7 or exists(select 1 from jsonb_array_elements(v->'days') x where x::text!~'^[0-6]$') or (select count(distinct x) from jsonb_array_elements(v->'days') x)<>jsonb_array_length(v->'days') then raise exception 'ASSISTANT_INVALID';end if;
  if jsonb_array_length(v->'sections') not between 1 and 3 or exists(select 1 from jsonb_array_elements_text(v->'sections') x where not (x=any(case when sl='SUP' then array['health','deliveries'] when sl='STUDY' then array['knowledge'] else array['orders','cs','tasks'] end))) or (select count(distinct x) from jsonb_array_elements_text(v->'sections') x)<>jsonb_array_length(v->'sections') then raise exception 'ASSISTANT_INVALID';end if;
  if coalesce(v->>'quietStart','')!~'^[0-9]{1,2}$' or coalesce(v->>'quietEnd','')!~'^[0-9]{1,2}$' or (v->>'quietStart')::int<0 or (v->>'quietEnd')::int>24 or (v->>'quietStart')::int>=(v->>'quietEnd')::int then raise exception 'ASSISTANT_INVALID';end if;
  if ((v->>'schedule')::boolean or (v->>'changes')::boolean) and (b.slot is null or not coalesce((b.settings->>'enabled')::boolean,false)) then raise exception 'ASSISTANT_DISABLED';end if;
  update public.moaon_bot_automations set settings=v,revision=revision+1,test_id=null,updated_at=now() where tenant_id=t and slot=sl;
 elsif a='AUTO_TEST' then
  if b.slot is null or not coalesce((b.settings->>'enabled')::boolean,false) then raise exception 'ASSISTANT_DISABLED';end if;
  if s.test_id is distinct from (event)::uuid and s.test_created_at>now()-interval '30 seconds' then raise exception 'ASSISTANT_RATE_LIMITED';end if;
  update public.moaon_bot_automations set test_id=(event)::uuid,test_created_at=now() where tenant_id=t and slot=sl;
 elsif a='AUTO_CLAIM' then
  if b.slot is null or not coalesce((b.settings->>'enabled')::boolean,false) or (p_input->>'botRevision')::int is distinct from b.revision then raise exception 'ASSISTANT_CONFLICT';end if;
  if event is null or event!~'^[a-zA-Z0-9:_-]{1,100}$' then raise exception 'ASSISTANT_INVALID';end if;
  if p_input->>'kind'='TEST' then
   if event is distinct from 'test:'||s.test_id::text or s.test_created_at<now()-interval '10 minutes' then raise exception 'ASSISTANT_DISABLED';end if;
  elsif p_input->>'kind'='SCHEDULE' then
   if not (s.settings->>'schedule')::boolean or not (s.settings->'days' @> to_jsonb(array[extract(isodow from ts)::int-1])) or ts<ts::date+(s.settings->>'time')::time or ts>=ts::date+(s.settings->>'time')::time+interval '10 minutes' or event is distinct from 'schedule:'||to_char(ts,'YYYY-MM-DD')||':'||replace(s.settings->>'time',':','') then raise exception 'ASSISTANT_DISABLED';end if;
  elsif p_input->>'kind'='CHANGE' then
   if not (s.settings->>'changes')::boolean or extract(hour from ts)<(s.settings->>'quietStart')::int or extract(hour from ts)>=(s.settings->>'quietEnd')::int then raise exception 'ASSISTANT_DISABLED';end if;
  else raise exception 'ASSISTANT_INVALID';end if;
  if exists(select 1 from public.moaon_bot_deliveries where tenant_id=t and slot=sl and id=event) then return '{"claimed":false}';end if;
  if (select count(*) from public.moaon_bot_deliveries where tenant_id=t and slot=sl and created_at>now()-interval '1 hour')>=20 then raise exception 'ASSISTANT_RATE_LIMITED';end if;
  insert into public.moaon_bot_deliveries(tenant_id,slot,id,kind,chat_id) values(t,sl,event,p_input->>'kind',b.settings->>'chatId');
  return jsonb_build_object('claimed',true,'chatId',b.settings->>'chatId');
 elsif a='AUTO_HEALTH' then
  if p_input->>'status' is null or p_input->>'status' not in ('OK','ERROR') then raise exception 'ASSISTANT_INVALID';end if;
  update public.moaon_bot_automations set worker_result=p_input->>'status' where tenant_id=t and slot=sl;return '{"saved":true}';
 elsif a='AUTO_RESULT' then
  if p_input->>'status' is null or p_input->>'status' not in ('SENT','FAILED','UNKNOWN') then raise exception 'ASSISTANT_INVALID';end if;
  update public.moaon_bot_deliveries set status=p_input->>'status',updated_at=now() where tenant_id=t and slot=sl and id=event and status='PENDING';return '{"saved":true}';
 elsif a='AUTO_PULSE' then
  update public.moaon_bot_automations set worker_seen_at=now() where tenant_id=t;
 end if;
 return jsonb_build_object('automations',(select jsonb_agg(jsonb_build_object('slot',x.slot,'revision',x.revision,'settings',x.settings,'workerSeenAt',x.worker_seen_at,'workerResult',x.worker_result,'testId',case when a='AUTO_PULSE' and x.test_created_at>now()-interval '10 minutes' then x.test_id else null end)) from public.moaon_bot_automations x where x.tenant_id=t),'deliveries',case when a='AUTO_PULSE' then '[]'::jsonb else (select coalesce(jsonb_agg(to_jsonb(q)),'[]') from (select slot,id,kind,status,chat_id,created_at,updated_at from public.moaon_bot_deliveries where tenant_id=t order by created_at desc limit 60) q) end);
end $$;
revoke all on function public.moaon_assistant_bot_automation(uuid,uuid,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.moaon_assistant_bot_automation(uuid,uuid,text,jsonb,text) to service_role;
