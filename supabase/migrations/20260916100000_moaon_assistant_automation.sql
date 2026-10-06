create table public.moaon_assistant_settings(tenant_id uuid primary key references moaon_control.tenants(id),revision integer not null default 0,settings jsonb not null default '{"schedule":false,"changes":false,"knowledge":false,"drafts":false,"recipientType":"PERSONAL","chatId":"","time":"09:00","days":[0,1,2,3,4],"quietStart":8,"quietEnd":20}',test_id uuid,test_created_at timestamptz,worker_seen_at timestamptz,updated_at timestamptz not null default now());
create table public.moaon_assistant_knowledge(id uuid primary key,tenant_id uuid not null references moaon_control.tenants(id),revision integer not null default 1,title text not null check(length(title) between 1 and 160),body text not null check(length(body) between 1 and 8000),deleted_at timestamptz,updated_at timestamptz not null default now());
create table public.moaon_assistant_drafts(id uuid primary key,tenant_id uuid not null references moaon_control.tenants(id),owner_id uuid not null references public.dashboard_users(user_id),title text not null check(length(title) between 1 and 160),notes text not null check(length(notes)<=4000),due_date date not null,status text not null default 'PENDING' check(status in ('PENDING','APPROVED','REJECTED')),created_at timestamptz not null default now());
create table public.moaon_assistant_deliveries(tenant_id uuid not null references moaon_control.tenants(id),id text not null check(length(id) between 1 and 100),kind text not null check(kind in ('SCHEDULE','CHANGE','TEST')),status text not null default 'PENDING' check(status in ('PENDING','SENT','FAILED','UNKNOWN')),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),primary key(tenant_id,id));
alter table public.moaon_assistant_settings enable row level security;
alter table public.moaon_assistant_knowledge enable row level security;
alter table public.moaon_assistant_drafts enable row level security;
alter table public.moaon_assistant_deliveries enable row level security;
revoke all on public.moaon_assistant_settings,public.moaon_assistant_knowledge,public.moaon_assistant_drafts,public.moaon_assistant_deliveries from public,anon,authenticated,service_role;
create function public.moaon_assistant_automation(p_actor uuid,p_session uuid,p_hash text,p_input jsonb,p_worker_hash text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare tenant uuid:='a3452bca-e259-40ed-a93d-b8bcc5c1b9e0'; a text:=p_input->>'action'; identity jsonb; s public.moaon_assistant_settings; k public.moaon_assistant_knowledge; d public.moaon_assistant_drafts; r jsonb; n integer;
begin
 if p_worker_hash is null then
  perform public.moaon_assistant_access_command(p_actor,p_session,p_hash,'{"action":"STATUS"}');
  if a not in ('READ','SAVE','KNOWLEDGE','REMOVE','APPROVE','REJECT','TEST') then raise exception 'ASSISTANT_INVALID';end if;
 else
  identity:=public.moaon_assistant_access_verify(p_worker_hash,true);p_actor:=(identity->>'userId')::uuid;
  if a not in ('CONFIG','PULSE','PROPOSE','CLAIM','RESULT') then raise exception 'ASSISTANT_INVALID';end if;
 end if;
 if a is null then raise exception 'ASSISTANT_INVALID';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('assistant-automation:'||tenant::text,0));
 insert into public.moaon_assistant_settings(tenant_id) values(tenant) on conflict do nothing;
 select * into s from public.moaon_assistant_settings where tenant_id=tenant for update;
 if a='SAVE' then
  if (p_input->>'revision')::integer is distinct from s.revision then raise exception 'ASSISTANT_CONFLICT';end if;
  if jsonb_typeof(p_input->'settings') is distinct from 'object' or octet_length((p_input->'settings')::text)>2000 then raise exception 'ASSISTANT_INVALID';end if;
  update public.moaon_assistant_settings set revision=revision+1,settings=p_input->'settings',test_id=null,updated_at=now() where tenant_id=tenant returning * into s;
 elsif a='TEST' then
  if coalesce(s.settings->>'chatId','')='' then raise exception 'ASSISTANT_INVALID';end if;
  update public.moaon_assistant_settings set test_id=(p_input->>'id')::uuid,test_created_at=now() where tenant_id=tenant returning * into s;
 elsif a='KNOWLEDGE' then
  select * into k from public.moaon_assistant_knowledge where id=(p_input->>'id')::uuid for update;
  if k.id is not null and (k.tenant_id<>tenant or k.revision is distinct from (p_input->>'revision')::integer or k.deleted_at is not null) or k.id is null and (p_input->>'revision')::integer is distinct from 0 then raise exception 'ASSISTANT_CONFLICT';end if;
  if k.id is null and (select count(*) from public.moaon_assistant_knowledge where tenant_id=tenant and deleted_at is null)>=100 then raise exception 'ASSISTANT_LIMIT';end if;
  insert into public.moaon_assistant_knowledge(id,tenant_id,title,body) values((p_input->>'id')::uuid,tenant,p_input->>'title',p_input->>'body') on conflict(id) do update set title=excluded.title,body=excluded.body,revision=moaon_assistant_knowledge.revision+1,updated_at=now();
 elsif a='REMOVE' then
  update public.moaon_assistant_knowledge set deleted_at=now(),revision=revision+1 where id=(p_input->>'id')::uuid and tenant_id=tenant and revision=(p_input->>'revision')::integer and deleted_at is null;if not found then raise exception 'ASSISTANT_CONFLICT';end if;
 elsif a='PROPOSE' then
  if not coalesce((s.settings->>'drafts')::boolean,false) or not (identity->'scopes' ? 'tasks') then raise exception 'ASSISTANT_DISABLED';end if;
  select * into d from public.moaon_assistant_drafts where id=(p_input->>'id')::uuid;
  if d.id is not null then
   if d.tenant_id<>tenant or d.owner_id<>p_actor or d.title is distinct from p_input->>'title' or d.notes is distinct from p_input->>'notes' or d.due_date is distinct from (p_input->>'dueDate')::date then raise exception 'ASSISTANT_CONFLICT';end if;
   return jsonb_build_object('status',d.status,'id',d.id);
  end if;
  if (select count(*) from public.moaon_assistant_drafts where tenant_id=tenant and status='PENDING')>=100 then raise exception 'ASSISTANT_LIMIT';end if;
  insert into public.moaon_assistant_drafts(id,tenant_id,owner_id,title,notes,due_date) values((p_input->>'id')::uuid,tenant,p_actor,p_input->>'title',p_input->>'notes',(p_input->>'dueDate')::date) returning * into d;
  return jsonb_build_object('status',d.status,'id',d.id);
 elsif a in ('APPROVE','REJECT') then
  select * into d from public.moaon_assistant_drafts where id=(p_input->>'id')::uuid and tenant_id=tenant for update;if not found then raise exception 'ASSISTANT_INVALID';end if;
  if a='APPROVE' then
   if d.status='REJECTED' then raise exception 'ASSISTANT_CONFLICT';end if;
   if d.status='PENDING' then
    r:=public.moaon_team_command(p_actor,tenant,p_session,p_hash,jsonb_build_object('action','CREATE','id',d.id,'title',d.title,'notes',d.notes,'dueDate',d.due_date,'assignedTo',p_actor,'checklist','[]'::jsonb));
    update public.moaon_assistant_drafts set status='APPROVED' where id=d.id;
   end if;
  else
   if d.status='APPROVED' then raise exception 'ASSISTANT_CONFLICT';end if;
   update public.moaon_assistant_drafts set status='REJECTED' where id=d.id;
  end if;
 elsif a='CLAIM' then
  if (p_input->>'revision')::integer is distinct from s.revision then raise exception 'ASSISTANT_CONFLICT';end if;
  if p_input->>'kind'='TEST' then
   if p_input->>'id' is distinct from 'test:'||s.test_id::text or s.test_created_at<now()-interval '10 minutes' then raise exception 'ASSISTANT_DISABLED';end if;
  elsif p_input->>'kind'='SCHEDULE' then
   if not coalesce((s.settings->>'schedule')::boolean,false) then raise exception 'ASSISTANT_DISABLED';end if;
  elsif p_input->>'kind'='CHANGE' then
   if not coalesce((s.settings->>'changes')::boolean,false) then raise exception 'ASSISTANT_DISABLED';end if;
  else raise exception 'ASSISTANT_INVALID';end if;
  if coalesce(s.settings->>'chatId','')='' then raise exception 'ASSISTANT_DISABLED';end if;
  if (select count(*) from public.moaon_assistant_deliveries where tenant_id=tenant and created_at>now()-interval '1 hour')>=20 then raise exception 'ASSISTANT_RATE_LIMITED';end if;
  insert into public.moaon_assistant_deliveries(tenant_id,id,kind) values(tenant,p_input->>'id',p_input->>'kind') on conflict do nothing;get diagnostics n=row_count;
  return jsonb_build_object('claimed',n=1,'chatId',s.settings->>'chatId');
 elsif a='RESULT' then
  update public.moaon_assistant_deliveries set status=p_input->>'status',updated_at=now() where tenant_id=tenant and id=p_input->>'id' and status='PENDING';return jsonb_build_object('saved',true);
 end if;
 if a in ('CONFIG','PULSE') then
  if a='PULSE' then update public.moaon_assistant_settings set worker_seen_at=now() where tenant_id=tenant;end if;
  return jsonb_build_object('revision',s.revision,'settings',s.settings,'testId',case when s.test_created_at>now()-interval '10 minutes' then s.test_id else null end,'knowledge',case when coalesce((s.settings->>'knowledge')::boolean,false) then (select coalesce(jsonb_agg(jsonb_build_object('id',id,'title',title,'body',body,'updatedAt',updated_at)),'[]') from public.moaon_assistant_knowledge where tenant_id=tenant and deleted_at is null) else '[]'::jsonb end);
 end if;
 return jsonb_build_object('revision',s.revision,'settings',s.settings,'workerSeenAt',s.worker_seen_at,'knowledge',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from (select id,revision,title,body,updated_at from public.moaon_assistant_knowledge where tenant_id=tenant and deleted_at is null order by updated_at desc limit 100) x),'drafts',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from (select id,title,notes,due_date,status,created_at from public.moaon_assistant_drafts where tenant_id=tenant order by created_at desc limit 100) x),'deliveries',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from (select id,kind,status,created_at,updated_at from public.moaon_assistant_deliveries where tenant_id=tenant order by created_at desc limit 50) x));
end $$;
revoke all on function public.moaon_assistant_automation(uuid,uuid,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.moaon_assistant_automation(uuid,uuid,text,jsonb,text) to service_role;
