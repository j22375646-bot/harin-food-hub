'use strict';
const validDate=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
function calendarDay(now=new Date()){
 const parts=new Intl.DateTimeFormat('en',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
 return ['year','month','day'].map(type=>parts.find(part=>part.type===type).value).join('-');
}
function monthRange(month){
 if(typeof month!=='string'||!/^20\d{2}-(?:0[1-9]|1[0-2])$/.test(month))return null;
 return {from:month+'-01',to:new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5)),0)).toISOString().slice(0,10)};
}
function projectMonth(payload,month){
 const range=monthRange(month);if(!range)return {status:'UNAVAILABLE',month,entries:[]};
 const result=projectCalendar(payload,range.from,range.to);return {status:result.status,month,...range,entries:result.entries};
}
function projectCalendar(payload,date,to=date){
 const empty={status:'UNAVAILABLE',date,entries:[]};
 if(!validDate(date)||!validDate(to)||date>to||payload?.ok!==true||payload.range?.from!==date||payload.range?.to!==to||!Array.isArray(payload.entries)||payload.entries.length>=500)return empty;
 const seen=new Set(),entries=[];
 for(const row of payload.entries){
  if(!row||typeof row.id!=='string'||!row.id||row.id.length>128||seen.has(row.id)||typeof row.title!=='string'||!row.title.trim()||row.title.length>300||!['SCHEDULE','MEMO','EVENT'].includes(row.type)||!['OPEN','DONE'].includes(row.status)||!validDate(row.date)||!validDate(row.endDate||row.date)||(row.endDate||row.date)<row.date||typeof row.time!=='string'||row.time&&!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(row.time))return empty;
  seen.add(row.id);if(row.date>to||(row.endDate||row.date)<date)continue;
  entries.push({id:row.id,title:row.title,type:row.type,status:row.status,time:row.time,date:row.date,endDate:row.endDate||row.date});
 }
 return {status:'READY',date,entries};
}
module.exports={calendarDay,projectCalendar,monthRange,projectMonth};
