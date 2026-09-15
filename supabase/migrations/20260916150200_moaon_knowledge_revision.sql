-- Add the optimistic concurrency version without replacing unrelated automation logic.
do $$
declare source text;updated text;
begin
 source:=pg_get_functiondef('public.moaon_assistant_automation(uuid,uuid,text,jsonb,text)'::regprocedure);
 updated:=replace(source,'''id'',id,''title'',title,''updatedAt'',updated_at','''id'',id,''title'',title,''revision'',revision,''updatedAt'',updated_at');
 updated:=replace(updated,'''id'',k.id,''title'',k.title,''body'',k.body,''updatedAt'',k.updated_at','''id'',k.id,''title'',k.title,''body'',k.body,''revision'',k.revision,''updatedAt'',k.updated_at');
 if updated=source then raise exception 'Knowledge lookup source changed; inspect before applying';end if;
 execute updated;
end $$;
