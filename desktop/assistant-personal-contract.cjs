'use strict';
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v),num=v=>typeof v==='string'&&/^[1-9][0-9]{0,18}$/.test(v),rev=v=>Number.isSafeInteger(v)&&v>=0;
function valid(v,w=false){switch(v?.action){case 'PERSONAL_READ':return !w&&exact(v,['action']);case 'PERSONAL_BIND':case 'PERSONAL_UNBIND':return !w&&exact(v,['action','revision'])&&rev(v.revision);case 'PERSONAL_LIST':return w&&exact(v,['action','userId','chatId'])&&num(v.userId)&&v.chatId===v.userId;case 'PERSONAL_PREPARE':return w&&exact(v,['action','userId','chatId','id','revision','verb'])&&num(v.userId)&&v.chatId===v.userId&&uuid(v.id)&&rev(v.revision)&&v.revision>0&&['COMPLETE','TOMORROW'].includes(v.verb);case 'PERSONAL_CONFIRM':return w&&exact(v,['action','userId','chatId','confirmationId'])&&num(v.userId)&&v.chatId===v.userId&&uuid(v.confirmationId);default:return false;}}
function response(v){
 const name=x=>typeof x==='string'&&x.length>0&&x.length<=80;
 if(!exact(v,['revision','binding','me'])||!rev(v.revision)||!exact(v.me,['userId','displayName'])||!uuid(v.me.userId)||!name(v.me.displayName))throw Error('INVALID');
 const b=v.binding;
 if(b!==null&&(!exact(b,['telegramId','userId','displayName','revision'])||!num(b.telegramId)||!uuid(b.userId)||!name(b.displayName)||!rev(b.revision)||b.revision!==v.revision))throw Error('INVALID');
 return {revision:v.revision,binding:b===null?null:{telegramId:b.telegramId,userId:b.userId,displayName:b.displayName,revision:b.revision},me:{userId:v.me.userId,displayName:v.me.displayName}};
}
module.exports={valid,response};
