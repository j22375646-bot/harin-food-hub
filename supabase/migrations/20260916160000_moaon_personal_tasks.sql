create table public.moaon_personal_bindings(
 tenant_id uuid primary key references moaon_control.tenants(id),telegram_id text,user_id uuid references public.dashboard_users(user_id),membership_version integer,revision integer not null check(revision>0),updated_at timestamptz not null default now(),check((telegram_id is null)=(user_id is null)));
create table public.moaon_personal_confirmations(
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references moaon_control.tenants(id),telegram_id text not null,user_id uuid not null,task_id uuid not null references public.moaon_tasks(id),task_revision integer not null,binding_revision integer not null,bot_revision integer not null,verb text not null check(verb in ('COMPLETE','TOMORROW')),title text not null,due_date date not null,created_at timestamptz not null default now(),expires_at timestamptz not null default(now()+interval '5 minutes'),result jsonb);
create index moaon_personal_confirmations_rate on public.moaon_personal_confirmations(tenant_id,created_at);
alter table public.moaon_personal_bindings enable row level security;
alter table public.moaon_personal_confirmations enable row level security;
revoke all on public.moaon_personal_bindings,public.moaon_personal_confirmations from public,anon,authenticated,service_role;
create function public.moaon_assistant_personal(p_actor uuid,p_session uuid,p_hash text,p_input jsonb,p_worker_hash text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare tenant uuid:='a3452bca-e259-40ed-a93d-b8bcc5c1b9e0';a text:=p_input->>'action';ident jsonb;b public.moaon_assistant_bots;m public.moaon_personal_bindings;c public.moaon_personal_confirmations;t public.moaon_tasks;v integer;n text;target_date date:=(now() at time zone 'Asia/Seoul')::date+1;r jsonb;
begin
 if p_worker_hash is null then
  perform public.moaon_assistant_access_command(p_actor,p_session,p_hash,'{"action":"STATUS"}');
  if a is null or a not in ('PERSONAL_READ','PERSONAL_BIND','PERSONAL_UNBIND') then raise exception 'ASSISTANT_INVALID';end if;
 else
  ident:=public.moaon_assistant_access_verify(p_worker_hash,true);
  if a is null or a not in ('PERSONAL_LIST','PERSONAL_PREPARE','PERSONAL_CONFIRM') then raise exception 'ASSISTANT_INVALID';end if;
  if not coalesce(ident->'scopes' ? 'tasks',false) then raise exception 'ASSISTANT_DISABLED';end if;
 end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('personal-tasks:'||tenant::text,0));
 select * into m from public.moaon_personal_bindings where tenant_id=tenant for update;
 select * into b from public.moaon_assistant_bots where tenant_id=tenant and slot='SOLO' for share;
 if p_worker_hash is null then
  select coalesce(p.display_name,u.display_name),mm.version into n,v from public.dashboard_users u join moaon_control.memberships mm on mm.user_id=u.user_id left join public.moaon_profiles p on p.user_id=u.user_id where u.user_id=p_actor and mm.tenant_id=tenant and mm.status='ACTIVE' and u.active for share of u,mm;
  if not found then raise exception 'ASSISTANT_AUTH_REQUIRED';end if;
  if a<>'PERSONAL_READ' then
   if (p_input->>'revision')::integer is distinct from coalesce(m.revision,0) then raise exception 'ASSISTANT_CONFLICT';end if;
   if m.user_id is not null and m.user_id<>p_actor then raise exception 'ASSISTANT_AUTH_REQUIRED';end if;
   if a='PERSONAL_BIND' then
    if not coalesce((b.settings->>'enabled')::boolean,false) or coalesce(b.settings->>'chatId','')!~'^[1-9][0-9]{0,18}$' or not coalesce(b.settings->'allowedUsers' ? (b.settings->>'chatId'),false) then raise exception 'ASSISTANT_DISABLED';end if;
    insert into public.moaon_personal_bindings(tenant_id,telegram_id,user_id,membership_version,revision) values(tenant,b.settings->>'chatId',p_actor,v,coalesce(m.revision,0)+1) on conflict(tenant_id) do update set telegram_id=excluded.telegram_id,user_id=excluded.user_id,membership_version=excluded.membership_version,revision=excluded.revision,updated_at=now() returning * into m;
   elsif m.tenant_id is not null then
    update public.moaon_personal_bindings set telegram_id=null,user_id=null,membership_version=null,revision=revision+1,updated_at=now() where tenant_id=tenant returning * into m;
   end if;
  end if;
  return jsonb_build_object('revision',coalesce(m.revision,0),'binding',case when m.user_id is null then null else jsonb_build_object('telegramId',m.telegram_id,'userId',m.user_id,'displayName',(select coalesce(p.display_name,u.display_name) from public.dashboard_users u left join public.moaon_profiles p on p.user_id=u.user_id where u.user_id=m.user_id),'revision',m.revision) end,'me',jsonb_build_object('userId',p_actor,'displayName',n));
 end if;
 if coalesce(p_input->>'userId','')!~'^[1-9][0-9]{0,18}$' or p_input->>'chatId' is distinct from p_input->>'userId' or m.telegram_id is distinct from p_input->>'userId' or m.user_id is null or not coalesce((b.settings->>'enabled')::boolean,false) or b.settings->>'chatId' is distinct from m.telegram_id or not coalesce(b.settings->'allowedUsers' ? m.telegram_id,false) then raise exception 'ASSISTANT_AUTH_REQUIRED';end if;
 select coalesce(p.display_name,u.display_name) into n from moaon_control.memberships mm join moaon_control.tenants tt on tt.id=mm.tenant_id join public.dashboard_users u on u.user_id=mm.user_id left join public.moaon_profiles p on p.user_id=u.user_id where mm.tenant_id=tenant and mm.user_id=m.user_id and mm.version=m.membership_version and mm.status='ACTIVE' and mm.role='OWNER' and tt.status='ACTIVE' and u.active and u.role='OWNER' for share of mm,tt,u;
 if not found then raise exception 'ASSISTANT_AUTH_REQUIRED';end if;
 if a='PERSONAL_LIST' then
  return jsonb_build_object('tasks',(select coalesce(jsonb_agg(to_jsonb(q)),'[]') from (select id,title,notes,due_date as "dueDate",status,revision from public.moaon_tasks where tenant_id=tenant and assigned_to=m.user_id and deleted_at is null and status='OPEN' order by due_date,updated_at desc,id limit 30) q),'displayName',n,'asOf',now());
 elsif a='PERSONAL_PREPARE' then
  if p_input->>'verb' is null or p_input->>'verb' not in ('COMPLETE','TOMORROW') then raise exception 'ASSISTANT_INVALID';end if;
  select * into t from public.moaon_tasks where tenant_id=tenant and id=(p_input->>'id')::uuid and assigned_to=m.user_id and deleted_at is null for update;
  if t.id is null or t.status<>'OPEN' or t.revision is distinct from (p_input->>'revision')::integer then raise exception 'ASSISTANT_CONFLICT';end if;
  if p_input->>'verb'='TOMORROW' and t.due_date>=target_date then raise exception 'ASSISTANT_CONFLICT';end if;
  if (select count(*) from public.moaon_personal_confirmations where tenant_id=tenant and created_at>now()-interval '1 hour')>=30 then raise exception 'ASSISTANT_RATE_LIMITED';end if;
  insert into public.moaon_personal_confirmations(tenant_id,telegram_id,user_id,task_id,task_revision,binding_revision,bot_revision,verb,title,due_date) values(tenant,m.telegram_id,m.user_id,t.id,t.revision,m.revision,b.revision,p_input->>'verb',t.title,case when p_input->>'verb'='TOMORROW' then target_date else t.due_date end) returning * into c;
  return jsonb_build_object('confirmationId',c.id,'title',c.title,'verb',c.verb,'dueDate',c.due_date);
 end if;
 select * into c from public.moaon_personal_confirmations where tenant_id=tenant and id=(p_input->>'confirmationId')::uuid for update;
 if c.id is null or c.telegram_id<>m.telegram_id or c.user_id<>m.user_id or c.binding_revision<>m.revision or c.bot_revision<>b.revision then raise exception 'ASSISTANT_AUTH_REQUIRED';end if;
 select * into t from public.moaon_tasks where tenant_id=tenant and id=c.task_id and assigned_to=m.user_id and deleted_at is null for update;
 if t.id is null then raise exception 'ASSISTANT_CONFLICT';end if;
 if c.result is not null then return c.result;end if;
 if c.expires_at<=now() or t.status<>'OPEN' or t.revision<>c.task_revision then raise exception 'ASSISTANT_CONFLICT';end if;
 if c.verb='TOMORROW' and (c.due_date<>target_date or t.due_date>=c.due_date) then raise exception 'ASSISTANT_CONFLICT';end if;
 update public.moaon_tasks set status=case when c.verb='COMPLETE' then 'DONE' else status end,completed_by=case when c.verb='COMPLETE' then m.user_id else completed_by end,completed_at=case when c.verb='COMPLETE' then now() else completed_at end,due_date=c.due_date,revision=revision+1,updated_at=now() where id=t.id returning * into t;
 insert into public.moaon_task_events(task_id,tenant_id,actor_id,recipient_id,kind) values(t.id,tenant,m.user_id,m.user_id,case when c.verb='COMPLETE' then 'COMPLETE' else 'EDIT' end);
 r:=jsonb_build_object('saved',true,'id',t.id,'status',t.status,'dueDate',t.due_date,'revision',t.revision);
 update public.moaon_personal_confirmations set result=r where id=c.id;
 return r;
end $$;
revoke all on function public.moaon_assistant_personal(uuid,uuid,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.moaon_assistant_personal(uuid,uuid,text,jsonb,text) to service_role;
