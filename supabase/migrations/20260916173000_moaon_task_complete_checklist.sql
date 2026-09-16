-- Completing a task completes all of its checklist items in the same transaction.
-- Enforce this for desktop and Telegram paths, retaining existing authorization.
create function public.moaon_task_complete_checklist() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if new.status='DONE' then
  select coalesce(jsonb_agg(jsonb_set(item,'{done}','true'::jsonb) order by ordinal),'[]'::jsonb)
  into new.checklist
  from jsonb_array_elements(new.checklist) with ordinality as items(item,ordinal);
 end if;
 return new;
end;$$;
revoke all on function public.moaon_task_complete_checklist() from public,anon,authenticated;
grant execute on function public.moaon_task_complete_checklist() to service_role;
create trigger moaon_task_complete_checklist
before insert or update of status,checklist on public.moaon_tasks
for each row execute function public.moaon_task_complete_checklist();

-- Repair previously completed tasks without changing completion attribution/time.
-- Revision advances so an already-open editor cannot overwrite repaired state.
update public.moaon_tasks set checklist=checklist,revision=revision+1,updated_at=now()
where status='DONE' and deleted_at is null
and exists(select 1 from jsonb_array_elements(checklist) item where item->>'done' is distinct from 'true');
