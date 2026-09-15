create table public.moaon_bot_menus(tenant_id uuid not null references moaon_control.tenants(id),slot text not null check(slot in ('WORK','SOLO','STUDY')),revision integer not null check(revision>0),items jsonb not null,updated_at timestamptz not null default now(),primary key(tenant_id,slot));
alter table public.moaon_bot_menus enable row level security;
revoke all on public.moaon_bot_menus from public,anon,authenticated,service_role;
create function public.moaon_assistant_menu(p_actor uuid,p_session uuid,p_hash text,p_input jsonb,p_worker_hash text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare tenant uuid:='a3452bca-e259-40ed-a93d-b8bcc5c1b9e0';a text:=p_input->>'action';s text:=p_input->>'slot';b public.moaon_assistant_bots;m public.moaon_bot_menus;defs jsonb:='{"WORK":["briefing","orders","cs","tasks","knowledge","settings"],"SOLO":["tasks","memo","reminders","focus","review","settings"],"STUDY":["register","knowledge","pending","correct","quiz","settings"]}';
begin
 if p_worker_hash is null then
  perform public.moaon_assistant_access_command(p_actor,p_session,p_hash,'{"action":"STATUS"}');
  if a is null or a not in ('MENU_READ','MENU_SAVE') then raise exception 'ASSISTANT_INVALID';end if;
 else
  perform public.moaon_assistant_access_verify(p_worker_hash,a='MENU_DATA');
  if a is null or a not in ('MENU_OPEN','MENU_DATA') then raise exception 'ASSISTANT_INVALID';end if;
 end if;
 if a<>'MENU_READ' and (s is null or not defs ? s) then raise exception 'ASSISTANT_INVALID';end if;
 if a='MENU_SAVE' then
  if jsonb_typeof(p_input->'items') is distinct from 'array' then raise exception 'ASSISTANT_INVALID';end if;
  if jsonb_array_length(p_input->'items') not between 1 and 6 or exists(select 1 from jsonb_array_elements(p_input->'items') x where jsonb_typeof(x)<>'string' or not (defs->s) ? (x#>>'{}')) or (select count(distinct x) from jsonb_array_elements(p_input->'items') x)<>jsonb_array_length(p_input->'items') then raise exception 'ASSISTANT_INVALID';end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('moaon-menu:'||tenant::text||s,0));
  select * into m from public.moaon_bot_menus where tenant_id=tenant and slot=s for update;
  if (p_input->>'revision')::integer is distinct from coalesce(m.revision,0) then raise exception 'ASSISTANT_CONFLICT';end if;
  insert into public.moaon_bot_menus values(tenant,s,coalesce(m.revision,0)+1,p_input->'items',now()) on conflict(tenant_id,slot) do update set revision=excluded.revision,items=excluded.items,updated_at=now();
 elsif a in ('MENU_OPEN','MENU_DATA') then
  select * into b from public.moaon_assistant_bots where tenant_id=tenant and slot=s for share;
  if not coalesce((b.settings->>'enabled')::boolean,false) or b.settings->>'chatId' is distinct from p_input->>'chatId' or not coalesce(b.settings->'allowedUsers' ? (p_input->>'userId'),false) or (s<>'WORK' and p_input->>'chatId' is distinct from p_input->>'userId') then raise exception 'ASSISTANT_AUTH_REQUIRED';end if;
  if a='MENU_DATA' then
   if s='SOLO' and p_input->>'section'='reminders' then
    return jsonb_build_object('reminders',(select coalesce(jsonb_agg(to_jsonb(q)),'[]') from (select j.id,j.due_at as "dueAt",j.status from public.moaon_briefing_actions j join public.moaon_briefing_cards c on c.id=j.card_id where c.tenant_id=tenant and c.slot=s and c.chat_id=p_input->>'chatId' and c.bot_revision=b.revision and j.user_id=p_input->>'userId' and j.kind='SNOOZE' and j.status in ('PENDING','CLAIMED','UNKNOWN') order by j.due_at limit 20) q));
   elsif s='STUDY' and p_input->>'section' in ('pending','settings') then
    if not exists(select 1 from public.moaon_assistant_settings where tenant_id=tenant and coalesce((settings->>'knowledge')::boolean,false)) then raise exception 'ASSISTANT_DISABLED';end if;
    return jsonb_build_object('pending',(select coalesce(jsonb_agg(to_jsonb(q)),'[]') from (select id,title,source,created_at as "createdAt" from public.moaon_learning_proposals where tenant_id=tenant and status='PENDING' order by created_at desc limit 20) q),'approvedCount',(select count(*) from public.moaon_assistant_knowledge where tenant_id=tenant and deleted_at is null));
   else raise exception 'ASSISTANT_INVALID';end if;
  end if;
  select * into m from public.moaon_bot_menus where tenant_id=tenant and slot=s;
  return jsonb_build_object('slot',s,'revision',coalesce(m.revision,0),'items',coalesce(m.items,defs->s));
 end if;
 return jsonb_build_object('menus',(select jsonb_agg(jsonb_build_object('slot',d.key,'revision',coalesce(x.revision,0),'items',coalesce(x.items,d.value)) order by d.key) from jsonb_each(defs) d left join public.moaon_bot_menus x on x.tenant_id=tenant and x.slot=d.key));
end $$;
revoke all on function public.moaon_assistant_menu(uuid,uuid,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.moaon_assistant_menu(uuid,uuid,text,jsonb,text) to service_role;
