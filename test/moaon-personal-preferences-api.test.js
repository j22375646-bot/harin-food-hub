'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const c=require('../desktop/assistant-preferences-contract.cjs');
const {handler}=require('../lib/assistant/automation.js');
const settings=()=>Object.fromEntries([...c.slots.map(s=>[s,{enabled:false,time:'09:00',days:[0,1,2,3,4]}]),['newOrders',false]]);
const state=()=>({userId:'11111111-1111-4111-8111-111111111111',displayName:'사용자',role:'OPERATOR',revision:0,verified:false,chatId:'',settings:settings(),bots:[]});
const request=(input,extra={})=>new Request('https://harin-cafe24-sync.vercel.app/api/moaon/assistant/automation',{method:'POST',headers:{origin:'https://harin-cafe24-sync.vercel.app','content-type':'application/json',cookie:'harin_dashboard_session=testsession',...extra},body:JSON.stringify(input)});
test('personal settings reject actor injection, malformed schedules and worker privilege crossing',()=>{
 assert.equal(c.valid({action:'PREF_SAVE',revision:0,settings:settings()}),true);
 assert.equal(c.valid({action:'PREF_READ',userId:'another-user'}),false);
 const bad=settings();bad.WORK.days=[0,0];assert.equal(c.valid({action:'PREF_SAVE',revision:0,settings:bad}),false);
 assert.equal(c.valid({action:'PREF_LINK',revision:0,chatId:'-123'}),false);
 assert.equal(c.valid({action:'PREF_TICK'}),false);assert.equal(c.valid({action:'PREF_READ'},true),false);
 assert.equal(c.valid({action:'PREF_TICK'},true),true);
});
test('active member can reach own preferences, cannot access shared admin actions',async()=>{
 const calls=[];const run=handler({database:()=>({rpc:async(name,args)=>{calls.push({name,args});return {data:state()};}}),validate:async()=>({userId:state().userId,id:'session-id',role:'OPERATOR'})});
 const r=await run(request({action:'PREF_READ'}));assert.equal(r.status,200);assert.equal(calls[0].args.p_actor,state().userId);assert.equal(calls[0].args.p_session,'session-id');assert.equal(calls[0].name,'moaon_assistant_preferences');
 assert.equal((await run(request({action:'BOT_LIST'}))).status,403);assert.equal(calls.length,1);
 assert.equal((await run(request({action:'PREF_READ',userId:'victim'}))).status,400);
 assert.equal((await run(request({action:'PREF_READ'},{origin:'https://evil.example'}))).status,403);
});
test('verification sends only digest to DB, propagates failed-attempt result',async()=>{
 const calls=[];const {command,codeHash}=require('../lib/assistant/preferences.js');
 await assert.rejects(()=>command({input:{action:'PREF_VERIFY',revision:2,code:'123456'},worker:false,session:{userId:'u',id:'s',hash:'h'},db:{rpc:async(n,p)=>{calls.push(p);return {data:{error:'ASSISTANT_INVALID'}};}}}),{code:'ASSISTANT_INVALID'});
 assert.equal(calls[0].p_input.codeHash,codeHash('123456'));assert.equal(JSON.stringify(calls).includes('123456'),false);
});
test('renderer receives sanitized state without bot secrets or other account fields',()=>{
 const raw=state();raw.secret='no';raw.bots=[{slot:'WORK',username:'moaon_hub_bot',enabled:true,token:'never',envelope:'never'}];
 const out=c.response(raw);assert.equal(out.secret,undefined);assert.equal(out.bots[0].token,undefined);assert.equal(out.bots[0].envelope,undefined);
 assert.throws(()=>c.response({...raw,chatId:'-10'}));
});
test('compact SQL mutation results are re-read before desktop transport validates state',async()=>{
 const current=state();const run=handler({database:()=>({rpc:async(name,args)=>{
  if(args.p_input.action==='PREF_SAVE'){current.settings=args.p_input.settings;current.revision++;return {data:{revision:current.revision,settings:current.settings}};}
  return {data:current};
 }}),validate:async()=>({userId:current.userId,id:'session-id',role:'OPERATOR'})});
 const changed=settings();changed.WORK.time='10:30';
 const out=await require('../desktop/assistant-automation-transport.cjs').command(async(url,init)=>run(request(JSON.parse(init.body))),{action:'PREF_SAVE',revision:0,settings:changed});
 assert.equal(out.ok,true);assert.equal(out.value.userId,current.userId);assert.equal(out.value.settings.WORK.time,'10:30');assert.equal(out.value.revision,1);
});
