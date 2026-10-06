'use strict';
const fs=require('node:fs'),path=require('node:path');
function createTeamNotifications({Notification,directory,getWindow}){
 let user=null,seen=new Set(),pending=new Set(),failed=new Set(),shown=[],lastTest=0;
 function reset(){user=null;seen.clear();pending.clear();failed.clear();for(const n of shown)n.close();shown=[];}
 function persist(ids){for(const id of ids)seen.add(id);seen=new Set([...seen].slice(-1000));try{fs.mkdirSync(directory,{recursive:true});fs.writeFileSync(path.join(directory,user+'.json'),JSON.stringify([...seen]));}catch{}}
 function display({title,body,taskId,ids=[]}){const expected=user;for(const id of ids)pending.add(id);return new Promise(resolve=>{let settled=false;const finish=code=>{if(settled)return;settled=true;clearTimeout(timer);if(user===expected){for(const id of ids)pending.delete(id);if(code==='SHOWN')persist(ids);else for(const id of ids)failed.add(id);}resolve({status:code});};const timer=setTimeout(()=>finish('UNCONFIRMED'),8000);try{const n=new Notification({title,body,icon:path.join(__dirname,'ui','brand','moaon.png'),silent:false});n.on('show',()=>finish('SHOWN'));n.on('failed',()=>finish('FAILED'));n.on('click',()=>{if(user!==expected||!taskId)return;const w=getWindow();if(!w||w.isDestroyed())return;if(w.isMinimized())w.restore();w.show();w.focus();w.webContents.send('moaon-hub:team-open',taskId);});shown.push(n);if(shown.length>10)shown.shift().close();n.show();}catch{finish('FAILED');}});}
 return {reset,test(){if(!user)return Promise.resolve({status:'LOGIN_REQUIRED'});if(!Notification.isSupported())return Promise.resolve({status:'UNSUPPORTED'});if(Date.now()-lastTest<15000)return Promise.resolve({status:'RATE_LIMITED'});lastTest=Date.now();return display({title:'모아온 알림 테스트',body:'이 알림이 보이면 Windows 업무 알림을 받을 수 있습니다.'});},receive(value){
  if(!value){reset();return;}if(user!==value.me){reset();user=value.me;try{const v=JSON.parse(fs.readFileSync(path.join(directory,user+'.json'),'utf8'));if(Array.isArray(v)&&v.length<=1000)seen=new Set(v.filter(n=>Number.isSafeInteger(n)));}catch{}}
  const fresh=value.events.filter(e=>!seen.has(e.id)&&!pending.has(e.id)&&!failed.has(e.id));if(!fresh.length)return;
  const me=value.members.find(m=>m.id===user);if(me?.notifications===false){persist(fresh.map(e=>e.id));return;}if(!Notification.isSupported())return;
  const actionable=fresh.filter(e=>value.tasks.some(t=>t.id===e.task_id&&t.assigned_to===user&&t.status!=='DONE'));persist(fresh.filter(e=>!actionable.includes(e)).map(e=>e.id));if(!actionable.length)return;
  const event=actionable.at(-1),task=value.tasks.find(t=>t.id===event.task_id);void display({title:actionable.length>1?`새 업무 ${actionable.length}건`:'새 업무가 배정되었습니다',body:task.title,taskId:task.id,ids:actionable.map(e=>e.id)});
 }};
}
module.exports={createTeamNotifications};
