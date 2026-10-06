'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {fixture,link,T,ids}=require('./moaon-personal-preferences-sql.test.js');
test('verified family members opt in separately, menus and personal tasks enforce membership and revocation',async()=>{
 const {db,call}=await fixture(true);try{
  await db.exec("update dashboard_users set role='OWNER';update moaon_control.memberships set role='OWNER';update moaon_assistant_bots set settings=settings||'{\"allowedUsers\":[\"100\"]}';drop function public.moaon_assistant_menu(uuid,uuid,text,jsonb,text);");
  for(const name of ['20260912012319_moaon_team_tasks.sql','20260916160000_moaon_personal_tasks.sql','20260916161000_moaon_bot_menus.sql'])await db.exec(fs.readFileSync('supabase/migrations/'+name,'utf8'));
  await db.exec('alter table moaon_tasks add column deleted_at timestamptz');
  await db.exec(fs.readFileSync('supabase/migrations/20260919010000_moaon_personal_chat.sql','utf8'));
  await link(call,1,'101');let p=await call(1,{action:'PREF_READ'});assert.deepEqual(p.chatSlots,[]);
  const menu=async(uid,slot='WORK')=>(await db.query("select moaon_assistant_menu(null,null,null,$1,'worker') v",[JSON.stringify({action:'MENU_OPEN',slot,userId:uid,chatId:uid})])).rows[0].v;
  await assert.rejects(menu('101'),/AUTH_REQUIRED/);
  await call(1,{action:'PREF_CHAT_SAVE',revision:p.revision,slots:['WORK','SOLO']});p=await call(1,{action:'PREF_READ'});
  assert.deepEqual(p.chatSlots,['WORK','SOLO']);assert.ok((await menu('101')).items.includes('orders'));await assert.rejects(menu('101','STUDY'),/AUTH_REQUIRED/);
  assert.deepEqual((await call(0,{action:'PREF_READ'})).chatSlots,['AD','SOLO','STUDY','SUP','WORK']);
  const task='33333333-3333-4333-8333-333333333333';
  await db.query('insert into moaon_tasks(id,tenant_id,title,due_date,assigned_to,created_by) values($1,$2,$3,current_date,$4,$4)',[task,T,'Mothers task',ids[1]]);
  const personal=async(input)=>(await db.query("select moaon_assistant_personal(null,null,null,$1,'worker') v",[JSON.stringify({userId:'101',chatId:'101',...input})])).rows[0].v;
  const list=await personal({action:'PERSONAL_LIST'});assert.equal(list.tasks.length,1);assert.equal(list.tasks[0].id,task);
  const proposal=await personal({action:'PERSONAL_PREPARE',id:task,revision:1,verb:'COMPLETE'});
  await call(1,{action:'PREF_CHAT_SAVE',revision:p.revision,slots:[]});await assert.rejects(personal({action:'PERSONAL_CONFIRM',confirmationId:proposal.confirmationId}),/AUTH_REQUIRED/);
  assert.equal((await db.query('select status from moaon_tasks where id=$1',[task])).rows[0].status,'OPEN');
  p=await call(1,{action:'PREF_READ'});await call(1,{action:'PREF_CHAT_SAVE',revision:p.revision,slots:['WORK','SOLO']});
  await assert.rejects(personal({action:'PERSONAL_CONFIRM',confirmationId:proposal.confirmationId}),/AUTH_REQUIRED/);
  await db.query('update moaon_control.memberships set version=version+1 where user_id=$1',[ids[1]]);await assert.rejects(menu('101'),/AUTH_REQUIRED/);
  const cfg=(await db.query("select moaon_assistant_chat_config('worker') v")).rows[0].v;assert.ok(cfg.filter(x=>x.userId===ids[1]).every(x=>!x.enabled));
  await db.exec('set role anon');await assert.rejects(db.query("select moaon_chat_member('WORK','101','101')"),/permission denied/);
 }finally{await db.close();}
});
