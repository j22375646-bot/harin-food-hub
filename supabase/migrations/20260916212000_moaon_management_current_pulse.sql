do $patch$ declare src text;updated text;begin
 src:=pg_get_functiondef('public.moaon_assistant_menu(uuid,uuid,text,jsonb,text)'::regprocedure);
 updated:=replace(src,'select worker_seen_at from public.moaon_assistant_settings where tenant_id=tenant','select max(worker_seen_at) from public.moaon_bot_automations where tenant_id=tenant');
 if updated=src then raise exception 'Menu pulse source drift';end if;execute updated;
end $patch$;
