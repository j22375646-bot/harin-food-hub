-- Per-member opt-in, independent from notification schedules and shared bot ownership.
alter table public.moaon_personal_preferences add column chat_slots jsonb not null default '[]', add column chat_revision integer not null default 0;

create function public.moaon_chat_member(p_slot text,p_user text,p_chat text) returns uuid language sql stable security definer set search_path='' as $$
 select p.user_id from public.moaon_personal_preferences p
 join moaon_control.memberships m on m.tenant_id=p.tenant_id and m.user_id=p.user_id
 join moaon_control.tenants t on t.id=p.tenant_id join public.dashboard_users u on u.user_id=p.user_id
 join public.moaon_assistant_bots b on b.tenant_id=p.tenant_id and b.slot=p_slot
 where p.tenant_id='a3452bca-e259-40ed-a93d-b8bcc5c1b9e0' and p.chat_id=p_user and p_user=p_chat and p.verified and p.chat_slots ? p_slot
 and m.version=p.membership_version and m.status='ACTIVE' and m.role='OWNER' and t.status='ACTIVE' and u.active and u.role='OWNER' and b.settings->>'enabled'='true'
$$;
revoke all on function public.moaon_chat_member(text,text,text) from public,anon,authenticated;
grant execute on function public.moaon_chat_member(text,text,text) to service_role;

-- Existing explicit bot grants are retained; new members start with conversation off.
update public.moaon_personal_preferences p set chat_slots=(select coalesce(jsonb_agg(b.slot order by b.slot),'[]') from public.moaon_assistant_bots b where b.tenant_id=p.tenant_id and b.settings->'allowedUsers' ? p.chat_id),chat_revision=1 where p.verified;

alter function public.moaon_assistant_preferences(uuid,uuid,text,jsonb,text) rename to moaon_assistant_preferences_before_chat;
revoke all on function public.moaon_assistant_preferences_before_chat(uuid,uuid,text,jsonb,text) from public,anon,authenticated,service_role;
create function public.moaon_assistant_preferences(p_actor uuid,p_session uuid,p_hash text,p_input jsonb,p_worker_hash text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare r jsonb;p public.moaon_personal_preferences;a text:=p_input->>'action';v jsonb:=p_input->'slots';t uuid:='a3452bca-e259-40ed-a93d-b8bcc5c1b9e0';
begin
 if a='PREF_CHAT_SAVE' then
  if p_worker_hash is not null or jsonb_typeof(p_input) is distinct from 'object' or (select count(*) from jsonb_object_keys(p_input))<>3 or not p_input ?& array['action','revision','slots'] then raise exception 'ASSISTANT_INVALID';end if;
  r:=public.moaon_assistant_preferences_before_chat(p_actor,p_session,p_hash,'{"action":"PREF_READ"}',null);
  select * into p from public.moaon_personal_preferences where tenant_id=t and user_id=p_actor for update;
  if (p_input->>'revision')::int is distinct from p.revision then raise exception 'ASSISTANT_CONFLICT';end if;
  if jsonb_typeof(v) is distinct from 'array' then raise exception 'ASSISTANT_INVALID';end if;
  if jsonb_array_length(v)>5 or exists(select 1 from jsonb_array_elements(v) x where jsonb_typeof(x)<>'string' or x#>>'{}' not in ('WORK','SOLO','STUDY','SUP','AD')) or (select count(distinct x) from jsonb_array_elements(v) x)<>jsonb_array_length(v) then raise exception 'ASSISTANT_INVALID';end if;
  if jsonb_array_length(v)>0 and (r->>'verified'<>'true' or r->>'role'<>'OWNER') then raise exception 'ASSISTANT_RECIPIENT_REQUIRED';end if;
  update public.moaon_personal_preferences set chat_slots=v,chat_revision=chat_revision+1,revision=revision+1,updated_at=now() where tenant_id=t and user_id=p_actor;
  a:='PREF_READ';
 elsif a in ('LINK_BEGIN','PREF_UNLINK') then
  r:=public.moaon_assistant_preferences_before_chat(p_actor,p_session,p_hash,p_input,p_worker_hash);
  update public.moaon_personal_preferences set chat_slots='[]',chat_revision=chat_revision+1 where tenant_id=t and user_id=p_actor;
  return r;
 end if;
 r:=public.moaon_assistant_preferences_before_chat(p_actor,p_session,p_hash,case when p_input->>'action'='PREF_CHAT_SAVE' then '{"action":"PREF_READ"}'::jsonb else p_input end,p_worker_hash);
 if a='PREF_READ' then
  select * into p from public.moaon_personal_preferences where tenant_id=t and user_id=p_actor;
  r:=r||jsonb_build_object('chatSlots',p.chat_slots,'chatRevision',p.chat_revision);
 end if;
 return r;
end $$;

create function public.moaon_assistant_chat_context(p_worker_hash text,p_slot text,p_user text,p_chat text) returns jsonb language plpgsql security definer set search_path='' as $$
declare i jsonb;u uuid;begin
 i:=public.moaon_assistant_access_verify(p_worker_hash,false);
 if not public.moaon_chat_allowed(p_slot,p_user,p_chat) then raise exception 'ASSISTANT_AUTH_REQUIRED';end if;
 u:=public.moaon_chat_member(p_slot,p_user,p_chat);
 -- Legacy group chats may read shared operational sources, never an issuer's personal tasks.
 return i||jsonb_build_object('userId',coalesce(u,(i->>'userId')::uuid),'scopes',case when u is null then (i->'scopes')-'tasks' else i->'scopes' end);
end $$;
revoke all on function public.moaon_assistant_chat_context(text,text,text,text) from public,anon,authenticated;
grant execute on function public.moaon_assistant_chat_context(text,text,text,text) to service_role;

do $$ declare s text;n text;o text;begin
 s:=pg_get_functiondef('public.moaon_assistant_personal(uuid,uuid,text,jsonb,text)'::regprocedure);
 n:=$n$ if coalesce(p_input->>'userId','')!~'^[1-9][0-9]{0,18}$'$n$;
 o:=replace(s,n,$n$ if public.moaon_chat_member('SOLO',p_input->>'userId',p_input->>'chatId') is not null then
  select p.tenant_id,p.chat_id,p.user_id,p.membership_version,-(p.chat_revision+1),p.updated_at into m from public.moaon_personal_preferences p where p.tenant_id=tenant and p.user_id=public.moaon_chat_member('SOLO',p_input->>'userId',p_input->>'chatId');
  b.settings:=b.settings||jsonb_build_object('chatId',m.telegram_id,'allowedUsers',jsonb_build_array(m.telegram_id));
 elsif not public.moaon_chat_allowed('SOLO',p_input->>'userId',p_input->>'chatId') then raise exception 'ASSISTANT_AUTH_REQUIRED';end if;
$n$||n);
 if o=s then raise exception 'CHAT_PERSONAL_MIGRATION_DRIFT';end if;execute o;
end $$;
revoke all on function public.moaon_assistant_preferences(uuid,uuid,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.moaon_assistant_preferences(uuid,uuid,text,jsonb,text) to service_role;

create function public.moaon_assistant_chat_config(p_worker_hash text) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform public.moaon_assistant_access_verify(p_worker_hash,false);
 return (select coalesce(jsonb_agg(jsonb_build_object('slot',s.slot,'userId',p.user_id,'chatId',coalesce(p.chat_id,p.legacy_chat_id),'revision',p.chat_revision,'enabled',public.moaon_chat_member(s.slot,p.chat_id,p.chat_id) is not null)),'[]') from public.moaon_personal_preferences p cross join (values ('WORK'),('SOLO'),('STUDY'),('SUP'),('AD')) s(slot) where coalesce(p.chat_id,p.legacy_chat_id) is not null);
end $$;
revoke all on function public.moaon_assistant_chat_config(text) from public,anon,authenticated;
grant execute on function public.moaon_assistant_chat_config(text) to service_role;

-- Keep legacy group grants; an opted-out linked private recipient cannot fall back to them.
create function public.moaon_chat_allowed(p_slot text,p_user text,p_chat text) returns boolean language sql stable security definer set search_path='' as $$
 select public.moaon_chat_member(p_slot,p_user,p_chat) is not null or (
 not exists(select 1 from public.moaon_personal_preferences p where p.tenant_id='a3452bca-e259-40ed-a93d-b8bcc5c1b9e0' and (p.chat_id=p_user or p.legacy_chat_id=p_user))
 and exists(select 1 from public.moaon_assistant_bots b where b.tenant_id='a3452bca-e259-40ed-a93d-b8bcc5c1b9e0' and b.slot=p_slot and b.settings->>'enabled'='true' and b.settings->>'chatId'=p_chat and b.settings->'allowedUsers' ? p_user and (p_slot='WORK' or p_user=p_chat)))
$$;
revoke all on function public.moaon_chat_allowed(text,text,text) from public,anon,authenticated;
grant execute on function public.moaon_chat_allowed(text,text,text) to service_role;

-- Patch only the known menu admission guard; retain all action-specific checks.
do $$ declare s text;n text;o text;begin
 s:=pg_get_functiondef('public.moaon_assistant_menu(uuid,uuid,text,jsonb,text)'::regprocedure);
 n:=$n$not coalesce((b.settings->>'enabled')::boolean,false) or b.settings->>'chatId' is distinct from p_input->>'chatId' or not coalesce(b.settings->'allowedUsers' ? (p_input->>'userId'),false) or (s<>'WORK' and p_input->>'chatId' is distinct from p_input->>'userId')$n$;
 o:=replace(s,n,$n$not public.moaon_chat_allowed(s,p_input->>'userId',p_input->>'chatId')$n$);
 if o=s then raise exception 'CHAT_MENU_MIGRATION_DRIFT';end if;execute o;
end $$;

do $$ declare s text;n text;o text;begin
 s:=pg_get_functiondef('public.moaon_assistant_cases(uuid,uuid,text,jsonb,text)'::regprocedure);
 n:=$n$not coalesce((b.settings->>'enabled')::boolean,false) or b.settings->>'chatId' is distinct from p_input->>'chatId' or not coalesce(b.settings->'allowedUsers' ? (p_input->>'userId'),false)$n$;
 o:=replace(s,n,$n$not public.moaon_chat_allowed('WORK',p_input->>'userId',p_input->>'chatId')$n$);
 if o=s then raise exception 'CHAT_CASE_MIGRATION_DRIFT';end if;execute o;
 s:=pg_get_functiondef('public.moaon_assistant_ads(uuid,uuid,text,jsonb,text)'::regprocedure);
 n:=$n$not coalesce((b.settings->>'enabled')::boolean,false) or b.settings->>'chatId' is distinct from p_input->>'chatId' or p_input->>'userId' is distinct from p_input->>'chatId' or not coalesce(b.settings->'allowedUsers' ? (p_input->>'userId'),false)$n$;
 o:=replace(s,n,$n$not public.moaon_chat_allowed('AD',p_input->>'userId',p_input->>'chatId')$n$);
 if o=s then raise exception 'CHAT_ADS_MIGRATION_DRIFT';end if;s:=o;
 s:=replace(s,$n$k:='manual:'||day$n$,$n$k:='manual:'||coalesce(p_input->>'chatId','admin')||':'||day$n$);
 s:=replace(s,$n$values(tenant,k,since,until,(p_input->>'fresh')::boolean,b.revision,b.settings->>'chatId')$n$,$n$values(tenant,k,since,until,(p_input->>'fresh')::boolean,b.revision,case when p_worker_hash is not null then p_input->>'chatId' else b.settings->>'chatId' end)$n$);
 s:=replace(s,$n$values(tenant,'revision:'||j.id,j.start_date,j.end_date,true,b.revision,b.settings->>'chatId',j.id,j.campaign_ids)$n$,$n$values(tenant,'revision:'||j.id||':'||coalesce(p_input->>'chatId','admin'),j.start_date,j.end_date,true,b.revision,case when p_worker_hash is not null then p_input->>'chatId' else b.settings->>'chatId' end,j.id,j.campaign_ids)$n$);
 s:=replace(s,$n$b.settings->>'chatId' is distinct from j.chat_id$n$,$n$(b.settings->>'chatId' is distinct from j.chat_id and not public.moaon_chat_allowed('AD',j.chat_id,j.chat_id))$n$);
 execute s;
end $$;
