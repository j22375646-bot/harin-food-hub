begin;
create or replace function public.moaon_queue_rocket_refresh() returns jsonb
language plpgsql set search_path='' as $$
declare job public.coupang_sync_requests;
begin
 perform pg_advisory_xact_lock(hashtextextended('moaon_rocket_refresh',0));
 select * into job from public.coupang_sync_requests where request_type='RG_INVENTORY'
 and (status in ('PENDING','RUNNING') or requested_at>now()-interval '5 minutes') order by requested_at desc limit 1;
 if not found then insert into public.coupang_sync_requests(request_type,status) values('RG_INVENTORY','PENDING') returning * into job; end if;
 return jsonb_build_object('id',job.id,'status',job.status);
end $$;
revoke all on function public.moaon_queue_rocket_refresh() from public,anon,authenticated;
grant execute on function public.moaon_queue_rocket_refresh() to service_role;
commit;
