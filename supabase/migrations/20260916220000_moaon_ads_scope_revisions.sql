alter table public.moaon_ads_jobs add column parent_id uuid references public.moaon_ads_jobs(id),add column campaign_ids jsonb;
update public.moaon_ads_jobs set campaign_ids='[]';
update public.moaon_ads_jobs set dedupe=dedupe||':'||md5('[]') where dedupe like 'manual:%';
update public.moaon_ads_settings set settings=jsonb_build_object('campaignIds','[]'::jsonb)||settings;
create function public.moaon_ads_scope_snapshot() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.campaign_ids is null then select coalesce(settings->'campaignIds','[]'::jsonb) into new.campaign_ids from public.moaon_ads_settings where tenant_id=new.tenant_id;end if;
 new.campaign_ids:=coalesce(new.campaign_ids,'[]'::jsonb);
 if new.dedupe like 'manual:%' then new.dedupe:=new.dedupe||':'||md5((select coalesce(jsonb_agg(x order by x),'[]')::text from jsonb_array_elements_text(new.campaign_ids) x));end if;
 return new;
end $$;
revoke all on function public.moaon_ads_scope_snapshot() from public,anon,authenticated,service_role;
create trigger moaon_ads_scope_snapshot before insert on public.moaon_ads_jobs for each row execute function public.moaon_ads_scope_snapshot();
create or replace function public.moaon_assistant_ads(p_actor uuid,p_session uuid,p_hash text,p_input jsonb,p_worker_hash text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare tenant uuid:='a3452bca-e259-40ed-a93d-b8bcc5c1b9e0';a text:=p_input->>'action';s public.moaon_ads_settings;b public.moaon_assistant_bots;j public.moaon_ads_jobs;ident jsonb;day date:=(now() at time zone 'Asia/Seoul')::date;since date;until date;k text;
begin
 if p_worker_hash is null then
  perform public.moaon_assistant_access_command(p_actor,p_session,p_hash,'{"action":"STATUS"}');
  if a is null or a not in ('ADS_READ','ADS_SAVE','ADS_REQUEST','ADS_CHANGE_TEST','ADS_REVISE') then raise exception 'ASSISTANT_INVALID';end if;
 else
  ident:=public.moaon_assistant_access_verify(p_worker_hash,false);
  if not coalesce(ident->'scopes' ? 'reports',false) then raise exception 'ASSISTANT_AUTH_REQUIRED';end if;
  if a is null or a not in ('ADS_READ','ADS_REQUEST','ADS_REVISE','CLAIM','FINISH','DELIVERY','DELIVERED') then raise exception 'ASSISTANT_INVALID';end if;
  if a in ('ADS_READ','ADS_REQUEST','ADS_REVISE') then
   select * into b from public.moaon_assistant_bots where tenant_id=tenant and slot='AD';
   if not coalesce((b.settings->>'enabled')::boolean,false) or b.settings->>'chatId' is distinct from p_input->>'chatId' or p_input->>'userId' is distinct from p_input->>'chatId' or not coalesce(b.settings->'allowedUsers' ? (p_input->>'userId'),false) then raise exception 'ASSISTANT_AUTH_REQUIRED';end if;
  end if;
 end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('moaon-ads:'||tenant::text,0));
 insert into public.moaon_ads_settings(tenant_id) values(tenant) on conflict do nothing;
 select * into s from public.moaon_ads_settings where tenant_id=tenant for update;
 if a='ADS_SAVE' then
  if s.revision is distinct from (p_input->>'revision')::integer then raise exception 'ASSISTANT_CONFLICT';end if;
  if jsonb_typeof(p_input->'settings') is distinct from 'object' or p_input->'settings'->>'time' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'ASSISTANT_INVALID';end if;
  if exists(select 1 from jsonb_each(p_input->'settings') x where x.key in ('daily','weekly','monthly','changes','notify','failures','watchdog') and jsonb_typeof(x.value)<>'boolean') then raise exception 'ASSISTANT_INVALID';end if;
  if coalesce((p_input->'settings'->>'minClicks')::numeric,30) not between 1 and 1000000 or coalesce((p_input->'settings'->>'minCost')::numeric,10000) not between 1 and 1000000000 or coalesce((p_input->'settings'->>'changePercent')::numeric,30) not between 1 and 500 then raise exception 'ASSISTANT_INVALID';end if;
  if p_input->'settings' ? 'campaignIds' then
   if jsonb_typeof(p_input->'settings'->'campaignIds') is distinct from 'array' then raise exception 'ASSISTANT_INVALID';end if;
   if jsonb_array_length(p_input->'settings'->'campaignIds')>100 or exists(select 1 from jsonb_array_elements(p_input->'settings'->'campaignIds') x where jsonb_typeof(x)<>'string' or (x#>>'{}') !~ '^[A-Za-z0-9_-]{1,100}$') then raise exception 'ASSISTANT_INVALID';end if;
  end if;
  update public.moaon_ads_settings set settings=s.settings||(p_input->'settings'),revision=revision+1 where tenant_id=tenant returning * into s;
 elsif a='ADS_REQUEST' then
  since:=(p_input->>'start')::date;until:=(p_input->>'end')::date;
  if since is null or until is null or until>=day or since<day-90 or until<since or until-since>30 then raise exception 'ASSISTANT_INVALID';end if;
  select * into b from public.moaon_assistant_bots where tenant_id=tenant and slot='AD';
  if not coalesce((b.settings->>'enabled')::boolean,false) then raise exception 'ASSISTANT_DISABLED';end if;
  k:='manual:'||day||':'||since||':'||until||':'||(p_input->>'fresh');
  insert into public.moaon_ads_jobs(tenant_id,dedupe,start_date,end_date,fresh,bot_revision,chat_id) values(tenant,k,since,until,(p_input->>'fresh')::boolean,b.revision,b.settings->>'chatId') on conflict do nothing;
 elsif a='ADS_REVISE' then
  select * into j from public.moaon_ads_jobs where tenant_id=tenant and id=(p_input->>'id')::uuid;
  if j.id is null or j.status<>'SUCCEEDED' or j.start_date<day-90 then raise exception 'ASSISTANT_INVALID';end if;
  select * into b from public.moaon_assistant_bots where tenant_id=tenant and slot='AD';
  if not coalesce((b.settings->>'enabled')::boolean,false) then raise exception 'ASSISTANT_DISABLED';end if;
  insert into public.moaon_ads_jobs(tenant_id,dedupe,start_date,end_date,fresh,bot_revision,chat_id,parent_id,campaign_ids) values(tenant,'revision:'||j.id,j.start_date,j.end_date,true,b.revision,b.settings->>'chatId',j.id,j.campaign_ids) on conflict do nothing;
 elsif a='ADS_CHANGE_TEST' then
  select * into b from public.moaon_assistant_bots where tenant_id=tenant and slot='AD';
  if not coalesce((b.settings->>'enabled')::boolean,false) then raise exception 'ASSISTANT_DISABLED';end if;
  insert into public.moaon_ads_jobs(tenant_id,dedupe,start_date,end_date,fresh,bot_revision,chat_id) values(tenant,'change:'||day,day-7,day-1,true,b.revision,b.settings->>'chatId') on conflict do nothing;
 elsif a='CLAIM' then
  update public.moaon_ads_jobs set status='UNKNOWN',error_code='ADS_INTERRUPTED',finished_at=now() where tenant_id=tenant and status='RUNNING' and started_at<now()-interval '10 minutes';
  select * into b from public.moaon_assistant_bots where tenant_id=tenant and slot='AD';
  if coalesce((b.settings->>'enabled')::boolean,false) and to_char(now() at time zone 'Asia/Seoul','HH24:MI')>=(s.settings->>'time') then
   if (s.settings->>'daily')::boolean then insert into public.moaon_ads_jobs(tenant_id,dedupe,start_date,end_date,fresh,bot_revision,chat_id) values(tenant,'daily:'||day,day-1,day-1,true,b.revision,b.settings->>'chatId') on conflict do nothing;end if;
   if (s.settings->>'monthly')::boolean and extract(day from day)=2 then insert into public.moaon_ads_jobs(tenant_id,dedupe,start_date,end_date,fresh,bot_revision,chat_id) values(tenant,'monthly:'||to_char(day,'YYYY-MM'),(date_trunc('month',day)-interval '1 month')::date,date_trunc('month',day)::date-1,true,b.revision,b.settings->>'chatId') on conflict do nothing;end if;
   if (s.settings->>'changes')::boolean then insert into public.moaon_ads_jobs(tenant_id,dedupe,start_date,end_date,fresh,bot_revision,chat_id) values(tenant,'change:'||day,day-7,day-1,true,b.revision,b.settings->>'chatId') on conflict do nothing;end if;
   if (s.settings->>'weekly')::boolean and extract(isodow from day)=1 then insert into public.moaon_ads_jobs(tenant_id,dedupe,start_date,end_date,fresh,bot_revision,chat_id) values(tenant,'weekly:'||day,day-7,day-1,true,b.revision,b.settings->>'chatId') on conflict do nothing;end if;
  end if;
  if exists(select 1 from public.moaon_ads_jobs where tenant_id=tenant and status='RUNNING') then return '{}';end if;
  select * into j from public.moaon_ads_jobs where tenant_id=tenant and status='PENDING' order by created_at limit 1 for update;
  if j.id is null then return '{}';end if;
  if b.revision is distinct from j.bot_revision or b.settings->>'chatId' is distinct from j.chat_id or not coalesce((b.settings->>'enabled')::boolean,false) then update public.moaon_ads_jobs set status='FAILED',error_code='ADS_RECIPIENT_CHANGED',finished_at=now(),delivery='SKIPPED' where id=j.id;return '{}';end if;
  update public.moaon_ads_jobs set status='RUNNING',started_at=now() where id=j.id;
  return to_jsonb(j)||jsonb_build_object('changeSettings',s.settings);
 elsif a='FINISH' then
  if p_input->>'status' not in ('SUCCEEDED','FAILED') then raise exception 'ASSISTANT_INVALID';end if;
  update public.moaon_ads_jobs set status=p_input->>'status',report_id=(p_input->>'reportId')::uuid,summary=p_input->'summary',error_code=p_input->>'error',finished_at=now() where id=(p_input->>'id')::uuid and tenant_id=tenant and status='RUNNING';return '{}';
 elsif a='DELIVERY' then
  select * into j from public.moaon_ads_jobs where tenant_id=tenant and status in ('SUCCEEDED','FAILED','UNKNOWN') and delivery='PENDING' order by created_at limit 1 for update;
  if j.id is null then return '{}';end if;
  if j.dedupe like 'change:%' and j.status='SUCCEEDED' and (not coalesce((s.settings->>'changes')::boolean,false) or j.summary->'change'->>'status' is distinct from 'ALERT') then update public.moaon_ads_jobs set delivery='SKIPPED' where id=j.id;return '{}';end if;
  select * into b from public.moaon_assistant_bots where tenant_id=tenant and slot=case when j.status='SUCCEEDED' then 'AD' else 'SUP' end;
  if not coalesce((b.settings->>'enabled')::boolean,false) or b.settings->>'chatId' is distinct from j.chat_id or (j.status='SUCCEEDED' and (b.revision<>j.bot_revision or not (s.settings->>'notify')::boolean)) or (j.status<>'SUCCEEDED' and not (s.settings->>'failures')::boolean) then update public.moaon_ads_jobs set delivery='SKIPPED' where id=j.id;return '{}';end if;
  update public.moaon_ads_jobs set delivery='UNKNOWN' where id=j.id;
  return jsonb_build_object('job',to_jsonb(j),'bot',to_jsonb(b));
 elsif a='DELIVERED' then
  if p_input->>'status' not in ('SENT','FAILED','UNKNOWN') then raise exception 'ASSISTANT_INVALID';end if;
  update public.moaon_ads_jobs set delivery=p_input->>'status' where id=(p_input->>'id')::uuid and tenant_id=tenant and delivery='UNKNOWN';return '{}';
 end if;
 return jsonb_build_object('revision',s.revision,'settings',s.settings,'watchdog',(select jsonb_build_object('status',status,'checkedAt',checked_at,'seenAt',seen_at,'delivery',delivery) from public.moaon_hermes_watchdog where tenant_id=tenant),'jobs',(select coalesce(jsonb_agg(to_jsonb(q)),'[]') from (select id,parent_id,campaign_ids,start_date,end_date,fresh,status,report_id,error_code,created_at,finished_at,delivery,summary from public.moaon_ads_jobs where tenant_id=tenant order by created_at desc limit 30) q));
end $$;
revoke all on function public.moaon_assistant_ads(uuid,uuid,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.moaon_assistant_ads(uuid,uuid,text,jsonb,text) to service_role;
