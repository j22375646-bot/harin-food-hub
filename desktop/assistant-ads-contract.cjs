'use strict';
const exact=(v,k)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===k.length&&k.every(x=>Object.hasOwn(v,x));
const day=s=>typeof s==='string'&&/^20\d\d-\d\d-\d\d$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
const settings=v=>exact(v,['daily','weekly','time','notify','failures'])&&['daily','weekly','notify','failures'].every(k=>typeof v[k]==='boolean')&&/^([01]\d|2[0-3]):[0-5]\d$/.test(v.time);
const identity=v=>typeof v.userId==='string'&&/^[1-9]\d{0,18}$/.test(v.userId)&&v.chatId===v.userId;
function valid(v,w=false){if(!v)return false;if(v.action==='ADS_TICK')return w&&exact(v,['action']);if(v.action==='ADS_READ')return exact(v,w?['action','userId','chatId']:['action'])&&(!w||identity(v));if(v.action==='ADS_SAVE')return !w&&exact(v,['action','revision','settings'])&&Number.isSafeInteger(v.revision)&&v.revision>=0&&v.revision<2147483647&&settings(v.settings);if(v.action==='ADS_REQUEST')return exact(v,w?['action','start','end','fresh','userId','chatId']:['action','start','end','fresh'])&&day(v.start)&&day(v.end)&&v.start<=v.end&&Date.parse(v.end)-Date.parse(v.start)<=30*86400000&&typeof v.fresh==='boolean'&&(!w||identity(v));return false;}
function response(v){if(!v||!Number.isSafeInteger(v.revision)||!settings(v.settings)||!Array.isArray(v.jobs)||v.jobs.length>30)throw Error('ADS_RESPONSE');return v;}
module.exports={valid,settings,response};
