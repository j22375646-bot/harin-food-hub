'use strict';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const str=(v,max,min=0)=>typeof v==='string'&&v.length>=min&&v.length<=max;
function validInput(v){
 if(!v||typeof v!=='object'||Array.isArray(v))return false;
 const fields={READ:['action'],PROFILE:['action','name','title','color','notifications','revision'],CREATE:['action','id','title','notes','dueDate','assignedTo','checklist'],CHECK:['action','id','revision','index','done'],COMPLETE:['action','id','revision'],REOPEN:['action','id','revision']}[v.action];
 if(!fields||Object.keys(v).length!==fields.length||!fields.every(k=>Object.hasOwn(v,k)))return false;
 if(v.action==='READ')return true;
 if(v.action==='PROFILE')return str(v.name,40,1)&&!!v.name.trim()&&str(v.title,30)&&['violet','sage','peach','blue'].includes(v.color)&&typeof v.notifications==='boolean'&&Number.isSafeInteger(v.revision)&&v.revision>0;
 if(typeof v.id!=='string'||!UUID.test(v.id))return false;
 if(v.action==='CREATE')return str(v.title,160,1)&&!!v.title.trim()&&str(v.notes,4000)&&typeof v.assignedTo==='string'&&UUID.test(v.assignedTo)&&typeof v.dueDate==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v.dueDate)&&Number.isFinite(Date.parse(v.dueDate))&&new Date(v.dueDate).toISOString().slice(0,10)===v.dueDate&&Array.isArray(v.checklist)&&v.checklist.length<=30&&v.checklist.every(c=>c&&Object.keys(c).length===2&&str(c.text,200,1)&&!!c.text.trim()&&c.done===false);
 return Number.isSafeInteger(v.revision)&&v.revision>0&&(v.action!=='CHECK'||Number.isInteger(v.index)&&v.index>=0&&v.index<30&&typeof v.done==='boolean');
}
function validSnapshot(v){return v&&typeof v.me==='string'&&UUID.test(v.me)&&Array.isArray(v.members)&&v.members.length<=200&&v.members.every(m=>UUID.test(m.id)&&str(m.name,200,1))&&Array.isArray(v.tasks)&&v.tasks.length<=1000&&v.tasks.every(t=>UUID.test(t.id)&&str(t.title,160,1)&&UUID.test(t.assigned_to)&&UUID.test(t.created_by)&&Array.isArray(t.checklist)&&t.checklist.length<=30&&t.checklist.every(c=>str(c.text,200,1)&&typeof c.done==='boolean')&&['OPEN','DONE'].includes(t.status)&&Number.isInteger(t.revision)&&t.revision>0)&&Array.isArray(v.events)&&v.events.length<=100&&v.events.every(e=>Number.isSafeInteger(e.id)&&UUID.test(e.task_id));}
module.exports={validInput,validSnapshot};
