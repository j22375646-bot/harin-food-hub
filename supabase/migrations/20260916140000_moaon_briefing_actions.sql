create table public.moaon_briefing_cards(
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,slot text not null,event_id text not null,bot_revision integer not null,chat_id text not null,message_id text,body text not null check(length(body) between 1 and 3900),created_at timestamptz not null default now(),
 unique(tenant_id,slot,event_id),foreign key(tenant_id,slot,event_id) references public.moaon_bot_deliveries(tenant_id,slot,id));
create table public.moaon_briefing_actions(
 id uuid primary key default gen_random_uuid(),card_id uuid not null references public.moaon_briefing_cards(id),kind text not null check(kind in ('DRAFT','SNOOZE')),user_id text not null,due_at timestamptz,status text not null check(status in ('PENDING','CLAIMED','SENT','FAILED','UNKNOWN','CANCELLED','DRAFTED')),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(card_id,kind));
alter table public.moaon_briefing_cards enable row level security;
alter table public.moaon_briefing_actions enable row level security;
revoke all on public.moaon_briefing_cards,public.moaon_briefing_actions from public,anon,authenticated,service_role;
create function public.moaon_assistant_actions(p_actor uuid,p_session uuid,p_hash text,p_input jsonb,p_worker_hash text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare t uuid:='a3452bca-e259-40ed-a93d-b8bcc5c1b9e0';a text:=p_input->>'action';ident jsonb;c public.moaon_briefing_cards;b public.moaon_assistant_bots;j public.moaon_briefing_actions;d public.moaon_bot_deliveries;v text;valid_user boolean;
begin
 if p_worker_hash is null then
  perform public.moaon_assistant_access_command(p_actor,p_session,p_hash,'{"action":"STATUS"}');
  if a is null or a not in ('ACT_READ','ACT_CANCEL') then raise exception 'ASSISTANT_INVALID';end if;
 else
  ident:=public.moaon_assistant_access_verify(p_worker_hash,a='ACT_PULSE');p_actor:=(ident->>'userId')::uuid;
  if a is null or a not in ('ACT_PREPARE','ACT_BIND','ACT_CLICK','ACT_PULSE','ACT_CLAIM','ACT_RESULT') then raise exception 'ASSISTANT_INVALID';end if;
 end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('briefing-actions:'||t::text,0));
 if a='ACT_PREPARE' then
  select * into d from public.moaon_bot_deliveries where tenant_id=t and slot=p_input->>'slot' and id=p_input->>'eventId';
  select * into b from public.moaon_assistant_bots where tenant_id=t and slot=p_input->>'slot' for share;
  if d.id is null or d.status<>'PENDING' or d.created_at<now()-interval '5 minutes' or b.revision is distinct from (p_input->>'botRevision')::int or not coalesce((b.settings->>'enabled')::boolean,false) or b.settings->>'chatId' is distinct from d.chat_id then raise exception 'ASSISTANT_CONFLICT';end if;
  select * into c from public.moaon_briefing_cards where tenant_id=t and slot=d.slot and event_id=d.id;
  if c.id is not null then
   if c.body is distinct from p_input->>'body' then raise exception 'ASSISTANT_CONFLICT';end if;
  else
   insert into public.moaon_briefing_cards(tenant_id,slot,event_id,bot_revision,chat_id,body) values(t,d.slot,d.id,b.revision,d.chat_id,p_input->>'body') returning * into c;
  end if;
  return jsonb_build_object('id',c.id);
 elsif a='ACT_BIND' then
  if coalesce(p_input->>'messageId','')!~'^[1-9][0-9]{0,18}$' then raise exception 'ASSISTANT_INVALID';end if;
  update public.moaon_briefing_cards set message_id=p_input->>'messageId' where id=(p_input->>'id')::uuid and tenant_id=t and created_at>now()-interval '5 minutes' and (message_id is null or message_id=p_input->>'messageId');if not found then raise exception 'ASSISTANT_CONFLICT';end if;
  return '{"saved":true}';
 elsif a='ACT_CLICK' then
  select * into c from public.moaon_briefing_cards where id=(p_input->>'id')::uuid and tenant_id=t;
  if c.id is null or c.slot is distinct from p_input->>'slot' or c.chat_id is distinct from p_input->>'chatId' or c.message_id is null or c.message_id is distinct from p_input->>'messageId' or c.created_at<now()-interval '7 days' then raise exception 'ASSISTANT_DISABLED';end if;
  select * into b from public.moaon_assistant_bots where tenant_id=t and slot=c.slot for share;
  valid_user:=coalesce(b.settings->'allowedUsers' ? (p_input->>'userId'),false);
  if b.revision is distinct from c.bot_revision or not coalesce((b.settings->>'enabled')::boolean,false) or b.settings->>'chatId' is distinct from c.chat_id or not valid_user or (c.slot='SOLO' and p_input->>'userId' is distinct from c.chat_id) then raise exception 'ASSISTANT_AUTH_REQUIRED';end if;
  if not exists(select 1 from public.moaon_bot_deliveries where tenant_id=t and slot=c.slot and id=c.event_id and status='SENT') then raise exception 'ASSISTANT_DISABLED';end if;
  v:=p_input->>'verb';if v is null or v not in ('DRAFT','SNOOZE') then raise exception 'ASSISTANT_INVALID';end if;
  if v='DRAFT' and (not (ident->'scopes' ? 'tasks') or not exists(select 1 from public.moaon_assistant_settings where tenant_id=t and settings->>'drafts'='true')) then raise exception 'ASSISTANT_DISABLED';end if;
  select * into j from public.moaon_briefing_actions where card_id=c.id and kind=v;
  if j.id is null then
   if (select count(*) from public.moaon_briefing_actions x join public.moaon_briefing_cards y on y.id=x.card_id where y.tenant_id=t and x.created_at>now()-interval '1 hour')>=20 then raise exception 'ASSISTANT_RATE_LIMITED';end if;
   if v='DRAFT' and (select count(*) from public.moaon_assistant_drafts where tenant_id=t and status='PENDING')>=100 then raise exception 'ASSISTANT_LIMIT';end if;
   insert into public.moaon_briefing_actions(card_id,kind,user_id,due_at,status) values(c.id,v,p_input->>'userId',case when v='SNOOZE' then now()+interval '1 hour' else null end,case when v='SNOOZE' then 'PENDING' else 'DRAFTED' end) returning * into j;
   if v='DRAFT' then
    insert into public.moaon_assistant_drafts(id,tenant_id,owner_id,title,notes,due_date) values(j.id,t,p_actor,'브리핑 확인 · '||to_char(c.created_at at time zone 'Asia/Seoul','MM-DD HH24:MI'),left(c.body,3800)||E'\n\nTelegram '||c.slot||' 봇에서 요청한 업무 등록안. 자료/담당 범위: 조회 키 발급자. 요청자 ID: '||j.user_id,(now() at time zone 'Asia/Seoul')::date);
   end if;
  end if;
  return jsonb_build_object('id',j.id,'kind',j.kind,'status',case when j.kind='DRAFT' then (select status from public.moaon_assistant_drafts where id=j.id and tenant_id=t) else j.status end,'dueAt',j.due_at);
 elsif a in ('ACT_CLAIM','ACT_RESULT','ACT_CANCEL') then
  select x.* into j from public.moaon_briefing_actions x join public.moaon_briefing_cards y on y.id=x.card_id where x.id=(p_input->>'id')::uuid and y.tenant_id=t for update of x;
  if j.id is null or j.kind<>'SNOOZE' then raise exception 'ASSISTANT_INVALID';end if;
  if a='ACT_CANCEL' then
   if j.status='PENDING' then update public.moaon_briefing_actions set status='CANCELLED',updated_at=now() where id=j.id;
   elsif j.status<>'CANCELLED' then raise exception 'ASSISTANT_CONFLICT';end if;
  elsif a='ACT_RESULT' then
   if p_input->>'status' is null or p_input->>'status' not in ('SENT','FAILED','UNKNOWN') then raise exception 'ASSISTANT_INVALID';end if;
   update public.moaon_briefing_actions set status=p_input->>'status',updated_at=now() where id=j.id and status='CLAIMED';return '{"saved":true}';
  else
   if j.status<>'PENDING' then return '{"claimed":false}';end if;
   select * into c from public.moaon_briefing_cards where id=j.card_id;
   select * into b from public.moaon_assistant_bots where tenant_id=t and slot=c.slot for share;
   if j.due_at>now() then raise exception 'ASSISTANT_DISABLED';end if;
   if j.due_at<now()-interval '24 hours' or b.revision is distinct from c.bot_revision or b.revision is distinct from (p_input->>'botRevision')::int or not coalesce((b.settings->>'enabled')::boolean,false) or b.settings->>'chatId' is distinct from c.chat_id or not coalesce(b.settings->'allowedUsers' ? j.user_id,false) then
    update public.moaon_briefing_actions set status='CANCELLED',updated_at=now() where id=j.id;return '{"claimed":false}';
   end if;
   update public.moaon_briefing_actions set status='CLAIMED',updated_at=now() where id=j.id;
   return jsonb_build_object('claimed',true,'chatId',c.chat_id,'body',c.body,'slot',c.slot);
  end if;
 elsif a='ACT_PULSE' then
  return jsonb_build_object('due',(select coalesce(jsonb_agg(to_jsonb(q)),'[]') from (select x.id,y.slot from public.moaon_briefing_actions x join public.moaon_briefing_cards y on y.id=x.card_id where y.tenant_id=t and x.kind='SNOOZE' and x.status='PENDING' and x.due_at<=now() order by x.due_at limit 20) q));
 end if;
 return jsonb_build_object('reminders',(select coalesce(jsonb_agg(to_jsonb(q)),'[]') from (select x.id,y.slot,x.status,x.due_at,x.created_at,x.updated_at,left(y.body,140) preview from public.moaon_briefing_actions x join public.moaon_briefing_cards y on y.id=x.card_id where y.tenant_id=t and x.kind='SNOOZE' order by x.created_at desc limit 60) q));
end $$;
revoke all on function public.moaon_assistant_actions(uuid,uuid,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.moaon_assistant_actions(uuid,uuid,text,jsonb,text) to service_role;
