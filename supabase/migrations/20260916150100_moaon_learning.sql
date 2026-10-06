create table public.moaon_learning_proposals (
 id uuid primary key,tenant_id uuid not null references moaon_control.tenants(id),submitted_by uuid not null references public.dashboard_users(user_id),
 revision integer not null default 1,title text not null check(length(title) between 1 and 160),body text not null check(length(body) between 1 and 7200),source text not null check(length(source) between 1 and 300),
 target_id uuid references public.moaon_assistant_knowledge(id),base_revision integer not null,original jsonb not null,
 status text not null default 'PENDING' check(status in ('PENDING','APPROVED','REJECTED')),published_id uuid references public.moaon_assistant_knowledge(id),
 reviewed_by uuid references public.dashboard_users(user_id),created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table public.moaon_learning_events(id bigint generated always as identity primary key,proposal_id uuid not null references public.moaon_learning_proposals(id),actor_id uuid not null,kind text not null,snapshot jsonb not null,created_at timestamptz not null default now());
alter table public.moaon_learning_proposals enable row level security;
alter table public.moaon_learning_events enable row level security;
revoke all on public.moaon_learning_proposals,public.moaon_learning_events from public,anon,authenticated,service_role;
create function public.moaon_assistant_learning(p_actor uuid,p_session uuid,p_hash text,p_input jsonb,p_worker_hash text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare tenant uuid:='a3452bca-e259-40ed-a93d-b8bcc5c1b9e0';a text:=p_input->>'action';ident jsonb;p public.moaon_learning_proposals;k public.moaon_assistant_knowledge;newid uuid;
begin
 if p_worker_hash is null then
  perform public.moaon_assistant_access_command(p_actor,p_session,p_hash,'{"action":"STATUS"}');
  if a is null or a not in ('LEARN_READ','LEARN_EDIT','LEARN_APPROVE','LEARN_REJECT') then raise exception 'ASSISTANT_INVALID';end if;
 else
  ident:=public.moaon_assistant_access_verify(p_worker_hash,true);p_actor:=(ident->>'userId')::uuid;
  if a is distinct from 'LEARN_SUBMIT' then raise exception 'ASSISTANT_INVALID';end if;
  if not exists(select 1 from public.moaon_assistant_settings where tenant_id=tenant and settings->>'knowledge'='true') then raise exception 'ASSISTANT_DISABLED';end if;
 end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('assistant-learning:'||tenant::text,0));
 if a<>'LEARN_READ' then
  select * into p from public.moaon_learning_proposals where id=(p_input->>'id')::uuid for update;
  if p.id is not null and p.tenant_id<>tenant then raise exception 'ASSISTANT_CONFLICT';end if;
 end if;
 if a='LEARN_SUBMIT' then
  if p.id is not null then
   if p.submitted_by<>p_actor or p.original is distinct from (p_input-'action') then raise exception 'ASSISTANT_CONFLICT';end if;
   return jsonb_build_object('id',p.id,'status',p.status);
  end if;
  if (select count(*) from public.moaon_learning_proposals where tenant_id=tenant and status='PENDING')>=100 then raise exception 'ASSISTANT_LIMIT';end if;
  if p_input->>'targetId' is not null then
   select * into k from public.moaon_assistant_knowledge where id=(p_input->>'targetId')::uuid and tenant_id=tenant and deleted_at is null for share;
   if k.id is null or k.revision is distinct from (p_input->>'baseRevision')::int then raise exception 'ASSISTANT_CONFLICT';end if;
  elsif (p_input->>'baseRevision')::int is distinct from 0 then raise exception 'ASSISTANT_INVALID';end if;
  insert into public.moaon_learning_proposals(id,tenant_id,submitted_by,title,body,source,target_id,base_revision,original) values((p_input->>'id')::uuid,tenant,p_actor,p_input->>'title',p_input->>'body',p_input->>'source',(p_input->>'targetId')::uuid,(p_input->>'baseRevision')::int,p_input-'action') returning * into p;
  insert into public.moaon_learning_events(proposal_id,actor_id,kind,snapshot) values(p.id,p_actor,'SUBMIT',to_jsonb(p));
  return jsonb_build_object('id',p.id,'status',p.status);
 elsif a in ('LEARN_EDIT','LEARN_APPROVE','LEARN_REJECT') then
  if p.id is null then raise exception 'ASSISTANT_INVALID';end if;
  if p.status=(case when a='LEARN_APPROVE' then 'APPROVED' when a='LEARN_REJECT' then 'REJECTED' else '' end) then return jsonb_build_object('saved',true,'id',p.id,'status',p.status);end if;
  if p.status<>'PENDING' or p.revision is distinct from (p_input->>'revision')::int then raise exception 'ASSISTANT_CONFLICT';end if;
  if a='LEARN_EDIT' then
   update public.moaon_learning_proposals set title=p_input->>'title',body=p_input->>'body',source=p_input->>'source',revision=revision+1,updated_at=now() where id=p.id returning * into p;
  elsif a='LEARN_APPROVE' then
   perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('assistant-automation:'||tenant::text,0));
   if p.target_id is not null then
    select * into k from public.moaon_assistant_knowledge where id=p.target_id and tenant_id=tenant and deleted_at is null for update;
    if k.id is null or k.revision<>p.base_revision then raise exception 'ASSISTANT_CONFLICT';end if;
    update public.moaon_assistant_knowledge set title=p.title,body=p.body||E'\n\n출처: '||p.source,revision=revision+1,updated_at=now() where id=k.id returning id into newid;
   else
    if (select count(*) from public.moaon_assistant_knowledge where tenant_id=tenant and deleted_at is null)>=100 then raise exception 'ASSISTANT_LIMIT';end if;
    insert into public.moaon_assistant_knowledge(id,tenant_id,title,body) values(p.id,tenant,p.title,p.body||E'\n\n출처: '||p.source) returning id into newid;
   end if;
   update public.moaon_learning_proposals set status='APPROVED',published_id=newid,reviewed_by=p_actor,revision=revision+1,updated_at=now() where id=p.id returning * into p;
  else
   update public.moaon_learning_proposals set status='REJECTED',reviewed_by=p_actor,revision=revision+1,updated_at=now() where id=p.id returning * into p;
  end if;
  insert into public.moaon_learning_events(proposal_id,actor_id,kind,snapshot) values(p.id,p_actor,a,to_jsonb(p));
  return jsonb_build_object('saved',true,'id',p.id,'status',p.status);
 end if;
 return jsonb_build_object('proposals',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from (select id,revision,title,body,source,target_id,base_revision,status,published_id,created_at,updated_at from public.moaon_learning_proposals where tenant_id=tenant order by created_at desc limit 100) x),'knowledge',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from (select id,revision,title,body,updated_at from public.moaon_assistant_knowledge where tenant_id=tenant and deleted_at is null order by updated_at desc limit 100) x));
end $$;
revoke all on function public.moaon_assistant_learning(uuid,uuid,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.moaon_assistant_learning(uuid,uuid,text,jsonb,text) to service_role;
