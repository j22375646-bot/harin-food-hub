alter table public.moaon_profiles add column avatar text not null default '' check(avatar='' or (length(avatar)<=50000 and avatar ~ '^data:image/jpeg;base64,/9j/[A-Za-z0-9+/]*={0,2}$'));
create or replace function public.moaon_team_command(p_actor uuid,p_tenant uuid,p_session uuid,p_hash text,p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a text:=p_input->>'action'; t public.moaon_tasks; target uuid; result jsonb; profile public.moaon_profiles;
begin
 perform 1 from public.dashboard_sessions where id=p_session and user_id=p_actor and token_hash=p_hash and revoked_at is null and expires_at>now() and role='OWNER' for share;
 if not found then raise exception 'TEAM_AUTH_REQUIRED';end if;
 perform 1 from moaon_control.memberships m join moaon_control.tenants b on b.id=m.tenant_id join public.dashboard_users u on u.user_id=m.user_id where m.user_id=p_actor and m.tenant_id=p_tenant and m.status='ACTIVE' and m.role='OWNER' and b.status='ACTIVE' and u.active and u.role='OWNER' for share of m,b,u;
 if not found then raise exception 'TEAM_ACCESS_DENIED'; end if;
 if a='READ' then
 return jsonb_build_object('me',p_actor,'members',(select coalesce(jsonb_agg(jsonb_build_object('id',u.user_id,'name',coalesce(p.display_name,u.display_name),'title',coalesce(p.title,''),'color',coalesce(p.color,'violet'),'avatar',coalesce(p.avatar,''),'notifications',coalesce(p.notifications,true),'revision',coalesce(p.revision,1)) order by u.created_at),'[]') from moaon_control.memberships m join public.dashboard_users u on u.user_id=m.user_id left join public.moaon_profiles p on p.user_id=u.user_id where m.tenant_id=p_tenant and m.status='ACTIVE' and m.role='OWNER' and u.active),
 'tasks',(select coalesce(jsonb_agg(to_jsonb(x) order by x.due_date,x.created_at),'[]') from (select * from public.moaon_tasks where tenant_id=p_tenant and (status='OPEN' or updated_at>now()-interval '90 days') order by due_date,id limit 1000) x),
 'truncated',(select count(*)>1000 from public.moaon_tasks where tenant_id=p_tenant and (status='OPEN' or updated_at>now()-interval '90 days')),
 'events',(select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]') from (select e.id,e.task_id,e.kind,e.created_at from public.moaon_task_events e where e.tenant_id=p_tenant and e.recipient_id=p_actor and e.actor_id<>p_actor and e.kind='ASSIGNED' and e.created_at>now()-interval '7 days' order by e.id desc limit 100) x));
 elsif a='PROFILE' then
 insert into public.moaon_profiles(user_id,display_name) select user_id,display_name from public.dashboard_users where user_id=p_actor on conflict do nothing;
 update public.moaon_profiles set avatar=case when p_input ? 'avatar' then p_input->>'avatar' else avatar end,display_name=p_input->>'name',title=p_input->>'title',color=p_input->>'color',notifications=(p_input->>'notifications')::boolean,revision=revision+1 where user_id=p_actor and revision=(p_input->>'revision')::integer returning * into profile;
 if not found then raise exception 'TEAM_CONFLICT';end if;
 return jsonb_build_object('saved',true);
 elsif a='CREATE' then
 target:=(p_input->>'assignedTo')::uuid;
 perform 1 from moaon_control.memberships m join public.dashboard_users u on u.user_id=m.user_id where m.tenant_id=p_tenant and m.user_id=target and m.role='OWNER' and m.status='ACTIVE' and u.active for share of m,u;
 if not found then raise exception 'TEAM_ASSIGNEE_INVALID';end if;
 insert into public.moaon_tasks(id,tenant_id,title,notes,due_date,assigned_to,created_by,checklist) values((p_input->>'id')::uuid,p_tenant,p_input->>'title',p_input->>'notes',(p_input->>'dueDate')::date,target,p_actor,p_input->'checklist') on conflict do nothing returning * into t;
 if not found then
 select * into t from public.moaon_tasks where id=(p_input->>'id')::uuid and tenant_id=p_tenant and created_by=p_actor;
 if not found or t.title is distinct from p_input->>'title' or t.notes is distinct from p_input->>'notes' or t.assigned_to<>target or t.due_date<>(p_input->>'dueDate')::date or t.checklist is distinct from p_input->'checklist' then raise exception 'TEAM_CONFLICT';end if;
 return jsonb_build_object('saved',true,'id',t.id);
 end if;
 insert into public.moaon_task_events(task_id,tenant_id,actor_id,recipient_id,kind) values(t.id,p_tenant,p_actor,target,'ASSIGNED');
 elsif a in ('CHECK','COMPLETE','REOPEN') then
 select * into t from public.moaon_tasks where id=(p_input->>'id')::uuid and tenant_id=p_tenant for update;
 if not found then raise exception 'TEAM_NOT_FOUND';end if;
 if t.revision<>(p_input->>'revision')::integer then raise exception 'TEAM_CONFLICT';end if;
 if a='CHECK' then
 if t.status='DONE' then raise exception 'TEAM_CONFLICT';end if;
 if (p_input->>'index')::int<0 or (p_input->>'index')::int>=jsonb_array_length(t.checklist) then raise exception 'TEAM_INVALID';end if;
 t.checklist:=jsonb_set(t.checklist,array[p_input->>'index','done'],p_input->'done');
 elsif a='COMPLETE' then t.status:='DONE';t.completed_by:=p_actor;t.completed_at:=now();
 else t.status:='OPEN';t.completed_by:=null;t.completed_at:=null;
 end if;
 update public.moaon_tasks set checklist=t.checklist,status=t.status,completed_by=t.completed_by,completed_at=t.completed_at,revision=revision+1,updated_at=now() where id=t.id;
 insert into public.moaon_task_events(task_id,tenant_id,actor_id,recipient_id,kind) values(t.id,p_tenant,p_actor,t.assigned_to,a);
 else raise exception 'TEAM_INVALID';end if;
 return jsonb_build_object('saved',true,'id',t.id);
end;$$;
revoke all on function public.moaon_team_command(uuid,uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.moaon_team_command(uuid,uuid,uuid,text,jsonb) to service_role;
