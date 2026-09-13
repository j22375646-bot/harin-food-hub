-- Private application data: callable only through the authenticated server bridge.
create table public.moaon_cs_settings(tenant_id uuid primary key references moaon_control.tenants(id), revision integer not null default 1, config jsonb not null, updated_at timestamptz not null default now());
create table public.moaon_task_series(id uuid primary key,tenant_id uuid not null references moaon_control.tenants(id),revision integer not null default 1,frequency text not null check(frequency in ('DAILY','WEEKLY','MONTHLY')),request jsonb not null,created_by uuid not null references public.dashboard_users(user_id));
alter table public.moaon_tasks add column series_id uuid references public.moaon_task_series(id),add column series_index integer;
create unique index moaon_tasks_series_occurrence on public.moaon_tasks(series_id,series_index) where series_id is not null;
create table public.moaon_stock_reservations(id uuid primary key,tenant_id uuid not null references moaon_control.tenants(id),lot_id uuid not null,event_id uuid not null references public.hub_work_items(id),quantity numeric not null check(quantity>0 and quantity<=1000000000),revision integer not null default 1,released_at timestamptz,updated_at timestamptz not null default now());
alter table public.moaon_stock_reservations add constraint moaon_reservation_lot_scope foreign key(tenant_id,lot_id) references public.moaon_stock_lots(tenant_id,id);
create index moaon_stock_reservations_lot on public.moaon_stock_reservations(tenant_id,lot_id) where released_at is null;
create table public.moaon_operations_history(id bigint generated always as identity primary key,tenant_id uuid not null,actor_id uuid not null,action text not null,record_id text not null,data jsonb not null,created_at timestamptz not null default now());
alter table public.moaon_cs_settings enable row level security;
alter table public.moaon_task_series enable row level security;
alter table public.moaon_stock_reservations enable row level security;
alter table public.moaon_operations_history enable row level security;
revoke all on public.moaon_cs_settings,public.moaon_task_series,public.moaon_stock_reservations,public.moaon_operations_history from anon,authenticated;
grant all on public.moaon_cs_settings,public.moaon_task_series,public.moaon_stock_reservations,public.moaon_operations_history to service_role;
grant usage,select on sequence public.moaon_operations_history_id_seq to service_role;

create function public.moaon_repeat_date(anchor date,frequency text,offset_index integer) returns date language sql immutable set search_path='' as $$
 select case frequency when 'DAILY' then anchor+offset_index when 'WEEKLY' then anchor+7*offset_index when 'MONTHLY' then (anchor+make_interval(months=>offset_index))::date end;
$$;
revoke all on function public.moaon_repeat_date(date,text,integer) from public,anon,authenticated;
grant execute on function public.moaon_repeat_date(date,text,integer) to service_role;

create function public.moaon_reservation_events() returns table(id uuid,title text,start date,"end" date) language sql stable set search_path='' as $$
 select w.id,w.title,(w.due_at at time zone 'Asia/Seoul')::date,greatest((w.due_at at time zone 'Asia/Seoul')::date,coalesce(substring(w.context_label from '종료 (20[0-9]{2}-[0-9]{2}-[0-9]{2})')::date,(w.due_at at time zone 'Asia/Seoul')::date))
 from public.hub_work_items w where w.context_href='/calendar' and w.context_label like '캘린더 이벤트%' and w.status not in ('ARCHIVED','DONE');
$$;
revoke all on function public.moaon_reservation_events() from public,anon,authenticated;
grant execute on function public.moaon_reservation_events() to service_role;

alter function public.moaon_team_command(uuid,uuid,uuid,text,jsonb) rename to moaon_team_command_v152;
-- Extend the existing, authenticated privileged membership boundary. The new
-- operations function stays invoker and never receives broad control-table grants.
do $migration$
declare definition text;
begin
 definition:=pg_get_functiondef('public.moaon_team_command_v152(uuid,uuid,uuid,text,jsonb)'::regprocedure);
 if position('elsif a=''PROFILE'' then' in definition)=0 then raise exception 'Unexpected team function version';end if;
 definition:=replace(definition,'elsif a=''PROFILE'' then',$branch$elsif a='VALIDATE_ASSIGNEE' then
  perform 1 from moaon_control.memberships m join public.dashboard_users u on u.user_id=m.user_id where m.tenant_id=p_tenant and m.user_id=(p_input->>'assignedTo')::uuid and m.role='OWNER' and m.status='ACTIVE' and u.active for share of m,u;
  if not found then raise exception 'TEAM_ASSIGNEE_INVALID';end if;
  return jsonb_build_object('valid',true);
 elsif a='PROFILE' then$branch$);
 execute definition;
end;$migration$;
create function public.moaon_team_command(p_actor uuid,p_tenant uuid,p_session uuid,p_hash text,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare a text:=p_input->>'action'; base jsonb; t public.moaon_tasks; s public.moaon_task_series; r public.moaon_stock_reservations; lot public.moaon_stock_lots; settings public.moaon_cs_settings; item jsonb; i integer; n integer; day date; rowid uuid; target uuid; d date; total numeric; eventrow record; outrows jsonb; result jsonb;
begin
 -- Keep the existing session, active user and owner membership fence and locks.
 base:=public.moaon_team_command_v152(p_actor,p_tenant,p_session,p_hash,jsonb_build_object('action','READ'));
 if a='READ' then
  select coalesce(jsonb_agg(j.value||jsonb_build_object('series_revision',coalesce(ss.revision,0),'frequency',ss.frequency) order by (j.value->>'due_date'),j.value->>'id'),'[]') into outrows from jsonb_array_elements(base->'tasks') j left join public.moaon_task_series ss on ss.id=(j.value->>'series_id')::uuid and ss.tenant_id=p_tenant;
  return jsonb_set(base,'{tasks}',outrows);
 elsif a='CS_READ' then
  select * into settings from public.moaon_cs_settings where tenant_id=p_tenant;
  return jsonb_build_object('revision',coalesce(settings.revision,0),'config',settings.config);
 elsif a='CS_SAVE' then
  perform pg_advisory_xact_lock(hashtextextended(p_tenant::text||':cs',0));
  select * into settings from public.moaon_cs_settings where tenant_id=p_tenant for update;
  if coalesce(settings.revision,0)<>(p_input->>'revision')::int then raise exception 'TEAM_CONFLICT';end if;
  if jsonb_typeof(p_input->'config') is distinct from 'object' or octet_length((p_input->'config')::text)>180000 then raise exception 'TEAM_INVALID';end if;
  insert into public.moaon_cs_settings values(p_tenant,1,p_input->'config',now()) on conflict(tenant_id) do update set revision=moaon_cs_settings.revision+1,config=excluded.config,updated_at=now() returning * into settings;
  insert into public.moaon_operations_history(tenant_id,actor_id,action,record_id,data) values(p_tenant,p_actor,a,p_tenant::text,to_jsonb(settings));
  return jsonb_build_object('saved',true,'revision',settings.revision,'config',settings.config);
 elsif a in ('STOCK_PLAN_READ','RESERVE','RELEASE') then
  -- The current calendar is explicitly the Harin calendar, never another tenant's source.
  if p_tenant<>'a3452bca-e259-40ed-a93d-b8bcc5c1b9e0'::uuid then raise exception 'TEAM_ACCESS_DENIED';end if;
  if a='STOCK_PLAN_READ' then
   if (select count(*) from public.moaon_stock_reservations where tenant_id=p_tenant and released_at is null)>5000 or (select count(*) from public.moaon_reservation_events() where "end">=(now() at time zone 'Asia/Seoul')::date)>1000 then raise exception 'TEAM_UNAVAILABLE';end if;
   return jsonb_build_object('reservations',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from public.moaon_stock_reservations x where tenant_id=p_tenant and released_at is null),'events',(select coalesce(jsonb_agg(to_jsonb(e) order by e.start,e.id),'[]') from public.moaon_reservation_events() e where e."end">=(now() at time zone 'Asia/Seoul')::date));
  end if;
  -- Serialize edits to reservations, then lock the lot also used by physical stock writes.
  perform pg_advisory_xact_lock(hashtextextended(p_tenant::text||':reservations',0));
  select * into r from public.moaon_stock_reservations where id=(p_input->>'id')::uuid and tenant_id=p_tenant for update;
  if a='RELEASE' then
   if r.id is null then raise exception 'TEAM_NOT_FOUND';end if;
   if r.released_at is not null then return jsonb_build_object('saved',true);end if;
   if r.revision<>(p_input->>'revision')::int then raise exception 'TEAM_CONFLICT';end if;
   update public.moaon_stock_reservations set released_at=now(),revision=revision+1,updated_at=now() where id=r.id returning * into r;
  else
   if coalesce(r.revision,0)<>(p_input->>'revision')::int or r.released_at is not null then raise exception 'TEAM_CONFLICT';end if;
   select * into lot from public.moaon_stock_lots where id=(p_input->>'lotId')::uuid and tenant_id=p_tenant for update;
   select * into eventrow from public.moaon_reservation_events() where id=(p_input->>'eventId')::uuid;
   if lot.id is null or eventrow.id is null or eventrow."end"<(now() at time zone 'Asia/Seoul')::date then raise exception 'TEAM_INVALID';end if;
   if coalesce(lot.data->>'expires','')='' or (lot.data->>'expires')::date<greatest(eventrow."end",(now() at time zone 'Asia/Seoul')::date) then raise exception 'RESERVATION_EXPIRY';end if;
   total:=(p_input->>'quantity')::numeric;
   if total<=0 or total>1e9 or total<>round(total,3) or ((lot.data->>'unit')<>'KG' and total<>trunc(total)) then raise exception 'TEAM_INVALID';end if;
   select total+coalesce(sum(x.quantity),0) into total from public.moaon_stock_reservations x join public.moaon_reservation_events() e on e.id=x.event_id where x.tenant_id=p_tenant and x.lot_id=lot.id and x.id<>(p_input->>'id')::uuid and x.released_at is null and e."end">=(now() at time zone 'Asia/Seoul')::date;
   if (lot.data->>'quantity') is null or total>(lot.data->>'quantity')::numeric then raise exception 'RESERVATION_EXCEEDS_STOCK';end if;
   insert into public.moaon_stock_reservations(id,tenant_id,lot_id,event_id,quantity) values((p_input->>'id')::uuid,p_tenant,lot.id,eventrow.id,(p_input->>'quantity')::numeric) on conflict(id) do update set lot_id=excluded.lot_id,event_id=excluded.event_id,quantity=excluded.quantity,revision=moaon_stock_reservations.revision+1,updated_at=now() where moaon_stock_reservations.tenant_id=p_tenant returning * into r;
   if r.id is null then raise exception 'TEAM_CONFLICT';end if;
  end if;
  insert into public.moaon_operations_history(tenant_id,actor_id,action,record_id,data) values(p_tenant,p_actor,a,r.id::text,to_jsonb(r));
  return jsonb_build_object('saved',true,'record',to_jsonb(r));
 elsif a='CREATE' and p_input ? 'recurrence' then
  perform pg_advisory_xact_lock(hashtextextended(p_tenant::text||':'||(p_input->>'id'),0));
  select * into s from public.moaon_task_series where id=(p_input->>'id')::uuid;
  if found then
   if s.tenant_id<>p_tenant or s.created_by<>p_actor or s.request<>p_input then raise exception 'TEAM_CONFLICT';end if;
   return jsonb_build_object('saved',true,'id',s.id,'count',(s.request#>>'{recurrence,count}')::int);
  end if;
  if exists(select 1 from public.moaon_tasks where id=(p_input->>'id')::uuid) then raise exception 'TEAM_CONFLICT';end if;
  n:=(p_input#>>'{recurrence,count}')::int;
  if n<2 or n>52 or (p_input#>>'{recurrence,frequency}') not in ('DAILY','WEEKLY','MONTHLY') then raise exception 'TEAM_INVALID';end if;
  insert into public.moaon_task_series(id,tenant_id,frequency,request,created_by) values((p_input->>'id')::uuid,p_tenant,p_input#>>'{recurrence,frequency}',p_input,p_actor) returning * into s;
  for i in 0..n-1 loop
   day:=public.moaon_repeat_date((p_input->>'dueDate')::date,s.frequency,i);
   if day<'2000-01-01' or day>'2099-12-31' then raise exception 'TEAM_INVALID';end if;
   rowid:=case when i=0 then s.id else gen_random_uuid() end;
   item:=(p_input-'recurrence')||jsonb_build_object('id',rowid,'dueDate',day);
   perform public.moaon_team_command_v152(p_actor,p_tenant,p_session,p_hash,item);
   update public.moaon_tasks set series_id=s.id,series_index=i where id=rowid and tenant_id=p_tenant;
  end loop;
  return jsonb_build_object('saved',true,'id',s.id,'count',n);
 elsif a in ('EDIT','CHECK','COMPLETE','REOPEN','DELETE') then
  select * into t from public.moaon_tasks where id=(p_input->>'id')::uuid and tenant_id=p_tenant;
  if t.id is null then raise exception 'TEAM_NOT_FOUND';end if;
  if t.series_id is not null then select * into s from public.moaon_task_series where id=t.series_id and tenant_id=p_tenant for update;end if;
  select * into t from public.moaon_tasks where id=t.id and tenant_id=p_tenant for update;
  if a='EDIT' or (a='DELETE' and p_input->>'scope'='FUTURE') then
   if t.deleted_at is not null or t.status='DONE' then raise exception 'TEAM_NOT_FOUND';end if;
   if t.revision<>(p_input->>'revision')::int or coalesce(s.revision,0)<>(p_input->>'seriesRevision')::int then raise exception 'TEAM_CONFLICT';end if;
   if p_input->>'scope'='FUTURE' and s.id is null then raise exception 'TEAM_INVALID';end if;
   if a='EDIT' then
    target:=(p_input->>'assignedTo')::uuid;
    perform public.moaon_team_command_v152(p_actor,p_tenant,p_session,p_hash,jsonb_build_object('action','VALIDATE_ASSIGNEE','assignedTo',target));
   end if;
   for item in select to_jsonb(x) from public.moaon_tasks x where x.tenant_id=p_tenant and x.deleted_at is null and x.status='OPEN' and (x.id=t.id or (p_input->>'scope'='FUTURE' and x.series_id=t.series_id and x.series_index>=t.series_index)) order by x.series_index,x.id for update loop
    if a='DELETE' then
     perform public.moaon_team_command_v152(p_actor,p_tenant,p_session,p_hash,jsonb_build_object('action','DELETE','id',item->>'id','revision',item->'revision'));
    else
     d:=case when p_input->>'scope'='FUTURE' then public.moaon_repeat_date((p_input->>'dueDate')::date,s.frequency,(item->>'series_index')::int-t.series_index) else (p_input->>'dueDate')::date end;
     if d<'2000-01-01' or d>'2099-12-31' then raise exception 'TEAM_INVALID';end if;
     -- Retain checked state for unchanged checklist text; newly added text starts unchecked.
     select coalesce(jsonb_agg(c.value||jsonb_build_object('done',coalesce((item->'checklist'->(c.ordinality::int-1)->>'text')=c.value->>'text' and (item->'checklist'->(c.ordinality::int-1)->>'done')::boolean,false)) order by c.ordinality),'[]') into outrows from jsonb_array_elements(p_input->'checklist') with ordinality c;
     update public.moaon_tasks set title=p_input->>'title',notes=p_input->>'notes',assigned_to=target,due_date=d,checklist=outrows,revision=revision+1,updated_at=now() where id=(item->>'id')::uuid;
     insert into public.moaon_task_events(task_id,tenant_id,actor_id,recipient_id,kind) values((item->>'id')::uuid,p_tenant,p_actor,target,case when target<>(item->>'assigned_to')::uuid then 'ASSIGNED' else 'EDIT' end);
     insert into public.moaon_operations_history(tenant_id,actor_id,action,record_id,data) values(p_tenant,p_actor,a,item->>'id',jsonb_build_object('before',item,'input',p_input));
    end if;
   end loop;
   result:=jsonb_build_object('saved',true,'id',t.id);
  else result:=public.moaon_team_command_v152(p_actor,p_tenant,p_session,p_hash,p_input);
  end if;
  if s.id is not null then update public.moaon_task_series set revision=revision+1 where id=s.id;end if;
  return result;
 end if;
 return public.moaon_team_command_v152(p_actor,p_tenant,p_session,p_hash,p_input);
end;$$;
revoke all on function public.moaon_team_command(uuid,uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.moaon_team_command(uuid,uuid,uuid,text,jsonb) to service_role;
