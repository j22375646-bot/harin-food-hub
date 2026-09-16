-- Return the immutable parent snapshot only through the authorized job claim.
do $patch$ declare src text;updated text;begin
 src:=pg_get_functiondef('public.moaon_assistant_ads(uuid,uuid,text,jsonb,text)'::regprocedure);
 updated:=replace(src,'return to_jsonb(j)||jsonb_build_object(''changeSettings'',s.settings);','return to_jsonb(j)||jsonb_build_object(''changeSettings'',s.settings,''parentSummary'',(select summary from public.moaon_ads_jobs where tenant_id=tenant and id=j.parent_id and status=''SUCCEEDED''));');
 if updated=src then raise exception 'Revision claim source drift';end if;execute updated;
end $patch$;
