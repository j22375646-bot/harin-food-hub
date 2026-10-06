-- Extend only managed bot slots; retain existing authorization and report accounting.
alter table public.moaon_assistant_bots drop constraint moaon_assistant_bots_slot_check;
alter table public.moaon_assistant_bots add constraint moaon_assistant_bots_slot_check check(slot in ('WORK','SOLO','STUDY','SUP','AD'));
alter table public.moaon_bot_menus drop constraint moaon_bot_menus_slot_check;
alter table public.moaon_bot_menus add constraint moaon_bot_menus_slot_check check(slot in ('WORK','SOLO','STUDY','SUP','AD'));
do $patch$
declare src text;updated text;
begin
 src:=pg_get_functiondef('public.moaon_assistant_bot_command(uuid,uuid,text,jsonb,text)'::regprocedure);
 updated:=replace(src,'''WORK'',''SOLO'',''STUDY''','''WORK'',''SOLO'',''STUDY'',''SUP'',''AD''');
 if updated=src then raise exception 'Bot source drift';end if;
 execute updated;
 src:=pg_get_functiondef('public.moaon_assistant_menu(uuid,uuid,text,jsonb,text)'::regprocedure);
 updated:=replace(src,'"STUDY":["register","knowledge","pending","correct","quiz","settings"]','"STUDY":["register","knowledge","pending","correct","quiz","settings"],"SUP":["health","sources","settings"],"AD":["reports","checklist","settings"]');
 if updated=src then raise exception 'Menu source drift';end if;
 src:=updated;
 updated:=replace(src,'if a=''MENU_DATA'' then',$health$if a='MENU_DATA' then
   if s='SUP' and p_input->>'section'='health' then
    return jsonb_build_object('workerSeenAt',(select worker_seen_at from public.moaon_assistant_settings where tenant_id=tenant),'bots',(select coalesce(jsonb_agg(jsonb_build_object('slot',slot,'status',case when revision=applied_revision then runtime_status else 'PENDING' end,'checkedAt',checked_at)),'[]') from public.moaon_assistant_bots where tenant_id=tenant));
   end if;$health$);
 if updated=src then raise exception 'Menu health source drift';end if;
 execute updated;
end $patch$;
