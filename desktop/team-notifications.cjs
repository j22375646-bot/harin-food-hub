'use strict';
const fs=require('node:fs'),path=require('node:path');
function createTeamNotifications({Notification,directory,getWindow}){
 let user=null,seen=new Set(),shown=[];
 function reset(){user=null;seen.clear();for(const n of shown)n.close();shown=[];}
 return {reset,receive(value){if(!value){reset();return;}if(user!==value.me){reset();user=value.me;try{const v=JSON.parse(fs.readFileSync(path.join(directory,user+'.json'),'utf8'));if(Array.isArray(v)&&v.length<=1000)seen=new Set(v.filter(n=>Number.isSafeInteger(n)));}catch{}}
 const fresh=value.events.filter(e=>!seen.has(e.id));if(!fresh.length)return;for(const e of fresh)seen.add(e.id);seen=new Set([...seen].slice(-1000));try{fs.mkdirSync(directory,{recursive:true});fs.writeFileSync(path.join(directory,user+'.json'),JSON.stringify([...seen]));}catch{}
 const me=value.members.find(m=>m.id===user);if(me?.notifications===false||!Notification.isSupported())return;
 const event=fresh.at(-1),task=value.tasks.find(t=>t.id===event.task_id);if(!task||task.assigned_to!==user||task.status==='DONE')return;
 const expected=user,n=new Notification({title:fresh.length>1?`새 업무 ${fresh.length}건`:'새 업무가 배정되었습니다',body:task.title,icon:path.join(__dirname,'ui','brand','moaon.png'),silent:false});
 n.on('click',()=>{if(user!==expected)return;const w=getWindow();if(!w||w.isDestroyed())return;if(w.isMinimized())w.restore();w.show();w.focus();w.webContents.send('moaon-hub:team-open',task.id);});n.on('failed',()=>{});shown.push(n);if(shown.length>10)shown.shift().close();n.show();
 }};
}
module.exports={createTeamNotifications};
