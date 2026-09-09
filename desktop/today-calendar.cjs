'use strict';
const validDate=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
function calendarDay(now=new Date()){
 const parts=new Intl.DateTimeFormat('en',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
 return ['year','month','day'].map(type=>parts.find(part=>part.type===type).value).join('-');
}
function projectCalendar(payload,date){
 const empty={status:'UNAVAILABLE',date,entries:[]};
 if(!validDate(date)||payload?.ok!==true||payload.range?.from!==date||payload.range?.to!==date||!Array.isArray(payload.entries)||payload.entries.length>=500)return empty;
 const seen=new Set(),entries=[];
 for(const row of payload.entries){
  if(!row||typeof row.id!=='string'||!row.id||row.id.length>128||seen.has(row.id)||typeof row.title!=='string'||!row.title.trim()||row.title.length>300||!['SCHEDULE','MEMO','EVENT'].includes(row.type)||!['OPEN','DONE'].includes(row.status)||!validDate(row.date)||!validDate(row.endDate||row.date)||(row.endDate||row.date)<row.date||typeof row.time!=='string'||row.time&&!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(row.time))return empty;
  seen.add(row.id);if(row.date>date||(row.endDate||row.date)<date)continue;
  entries.push({id:row.id,title:row.title,type:row.type,status:row.status,time:row.time,date:row.date,endDate:row.endDate||row.date});
 }
 return {status:'READY',date,entries};
}
module.exports={calendarDay,projectCalendar};
