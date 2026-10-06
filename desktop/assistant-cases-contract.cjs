'use strict';
const exact=(v,k)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===k.length&&k.every(x=>Object.hasOwn(v,x));
const rev=v=>Number.isSafeInteger(v)&&v>=0&&v<2147483647;
const uuid=v=>typeof v==='string'&&/^[0-9a-f-]{36}$/i.test(v);
const identity=v=>typeof v.userId==='string'&&/^[1-9]\d{0,18}$/.test(v.userId)&&typeof v.chatId==='string'&&/^-?[1-9]\d{0,18}$/.test(v.chatId);
function valid(v,w=false){if(!v)return false;const base=w?['action','userId','chatId']:['action'];if(v.action==='CASE_TICK')return w&&exact(v,['action']);if(['CASE_READ','CASE_TEST'].includes(v.action))return exact(v,base)&&(!w||identity(v));if(v.action==='CASE_SAVE')return !w&&exact(v,['action','revision','enabled'])&&rev(v.revision)&&typeof v.enabled==='boolean';if(v.action==='CASE_ACT')return exact(v,[...base,'id','revision','verb'])&&(!w||identity(v))&&uuid(v.id)&&rev(v.revision)&&['TAKE','SNOOZE','RESUME'].includes(v.verb);return false;}
function response(v){if(!v||!rev(v.revision)||typeof v.enabled!=='boolean'||!Array.isArray(v.cases)||v.cases.length>100||!Array.isArray(v.events)||v.events.length>100)throw Error('CASE_RESPONSE');return v;}
module.exports={valid,response};
