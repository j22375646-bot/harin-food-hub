-- Confirmation processing is bounded by expiry/idempotency and the preparation
-- limit. It must not consume the same quota needed to refresh the task list.
do $$
declare signature regprocedure:='public.moaon_assistant_personal(uuid,uuid,text,jsonb,text)'::regprocedure;body text;
begin
 body:=pg_get_functiondef(signature);
 if position('moaon_assistant_access_verify(p_worker_hash,true)' in body)=0 then raise exception 'PERSONAL_ACCOUNTING_SHAPE_CHANGED';end if;
 execute replace(body,'moaon_assistant_access_verify(p_worker_hash,true)','moaon_assistant_access_verify(p_worker_hash,a=''PERSONAL_LIST'')');
end $$;
