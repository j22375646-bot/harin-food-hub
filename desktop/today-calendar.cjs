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
 const result=projectCalendar(payload,range.from,range.to,true),empty={status:'UNAVAILABLE',month,...range,entries:[],holidays:[],holidayReady:false};
 if(result.status!=='READY')return empty;
 const bodies=new Map();
 for(const row of payload.entries){
  if(row.body!=null&&(typeof row.body!=='string'||row.body.length>4000))return empty;
  bodies.set(row.id,row.body??'');
 }
 const validHolidays=Array.isArray(payload.holidays)&&payload.holidays.length<=100&&payload.holidays.every(row=>row&&validDate(row.date)&&typeof row.name==='string'&&row.name.trim()&&row.name.length<=80);
 const holidays=validHolidays?payload.holidays.filter(row=>row.date>=range.from&&row.date<=range.to).map(row=>({date:row.date,name:row.name})):[];
 const eventById=new Map(payload.entries.filter(row=>row.type==='EVENT').map(row=>[row.id,row]));
 return {status:'READY',month,...range,complete:typeof payload.complete==='boolean'?payload.complete:null,entries:result.entries.map(row=>({...row,body:bodies.get(row.id),...(row.type==='EVENT'?{eventColor:eventById.get(row.id)?.eventColor||'BLUE',giftTiers:validGiftTiers(eventById.get(row.id)?.giftTiers)?eventById.get(row.id).giftTiers.map(t=>({...t})):[],eventState:eventById.get(row.id)?.eventState||'UNKNOWN',eventConfigInvalid:eventById.get(row.id)?.eventConfigInvalid===true||!validGiftTiers(eventById.get(row.id)?.giftTiers)}:{})})),holidays,holidayReady:validHolidays&&payload.holidayReady===true};
}
function projectCalendar(payload,date,to=date,allowPartial=false){
 const empty={status:'UNAVAILABLE',date,entries:[]};
 if(payload?.complete===false&&!allowPartial)return empty;
 if(!validDate(date)||!validDate(to)||date>to||payload?.ok!==true||payload.range?.from!==date||payload.range?.to!==to||!Array.isArray(payload.entries)||payload.entries.length>=500)return empty;
 const seen=new Set(),entries=[];
 for(const row of payload.entries){
  if(!row||typeof row.id!=='string'||!row.id||row.id.length>128||seen.has(row.id)||typeof row.title!=='string'||!row.title.trim()||row.title.length>300||!['SCHEDULE','MEMO','EVENT'].includes(row.type)||!['OPEN','DONE'].includes(row.status)||!validDate(row.date)||!validDate(row.endDate||row.date)||(row.endDate||row.date)<row.date||typeof row.time!=='string'||row.time&&!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(row.time))return empty;
  seen.add(row.id);if(row.date>to||(row.endDate||row.date)<date)continue;
  entries.push({id:row.id,title:row.title,type:row.type,status:row.status,time:row.time,date:row.date,endDate:row.endDate||row.date});
 }
 return {status:'READY',date,entries};
}
function validGiftTiers(rows){return Array.isArray(rows)&&rows.length<=10&&new Set(rows.map(r=>r?.minimumAmount)).size===rows.length&&rows.every(r=>r&&Object.keys(r).every(k=>['minimumAmount','maximumAmount','giftName','quantity'].includes(k))&&Number.isInteger(r.minimumAmount)&&r.minimumAmount>=1&&r.minimumAmount<=100000000&&(r.maximumAmount==null||Number.isInteger(r.maximumAmount)&&r.maximumAmount>=r.minimumAmount&&r.maximumAmount<=100000000)&&typeof r.giftName==='string'&&r.giftName.trim().length>0&&r.giftName.length<=120&&Number.isInteger(r.quantity)&&r.quantity>=1&&r.quantity<=99);}
function validCalendarDraft(v){
 if(!v||Object.getPrototypeOf(v)!==Object.prototype||!['title','body','date','time','type'].every(k=>Object.hasOwn(v,k))||Object.keys(v).some(k=>!['title','body','date','time','type','endDate','eventColor','giftTiers','id','sourceMonth'].includes(k)))return false;
 if(typeof v.title!=='string'||!v.title.trim()||v.title.length>160||typeof v.body!=='string'||v.body.length>(v.type==='EVENT'?2000:4000)||!validDate(v.date)||!/^20/.test(v.date)||typeof v.time!=='string'||v.time&&!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(v.time)||!['SCHEDULE','MEMO','EVENT'].includes(v.type))return false;
 if(v.id!==undefined&&(typeof v.id!=='string'||!/^[a-zA-Z0-9-]{1,128}$/.test(v.id)||!monthRange(v.sourceMonth))||v.id===undefined&&v.sourceMonth!==undefined)return false;
 const end=v.endDate||v.date;if(!validDate(end)||end<v.date||!/^20/.test(end)||(Date.parse(end)-Date.parse(v.date))/86400000>366||v.type==='MEMO'&&end!==v.date)return false;
 return v.type==='EVENT'?['BLUE','CORAL','MINT','VIOLET','AMBER'].includes(v.eventColor)&&validGiftTiers(v.giftTiers):v.eventColor===undefined&&v.giftTiers===undefined;
}
module.exports={calendarDay,projectCalendar,monthRange,projectMonth,validCalendarDraft,validGiftTiers};
