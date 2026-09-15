-- A health acknowledgement verifies access but does not read operational data.
do $$
declare source text;updated text;
begin
 source:=pg_get_functiondef('public.moaon_assistant_bot_command(uuid,uuid,text,jsonb,text)'::regprocedure);
 updated:=replace(source,'public.moaon_assistant_access_verify(p_worker_hash,true)','public.moaon_assistant_access_verify(p_worker_hash,a=''BOT_CONFIG'')');
 if updated=source then raise exception 'Bot RPC source changed; inspect before applying';end if;
 execute updated;
end $$;
