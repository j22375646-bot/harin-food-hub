'use strict';

const DAY_MS=86400000;
function text(value){return value==null?'':String(value).trim();}
function dateKey(value){
  if(/^\d{4}-\d{2}-\d{2}$/.test(text(value)))return text(value);
  const date=new Date(value);if(Number.isNaN(date.getTime()))return '';
  return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
}
function seoulParts(value){
  const date=new Date(value);if(Number.isNaN(date.getTime()))return null;
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date).filter(part=>part.type!=='literal').map(part=>[part.type,part.value]));
  return {date:`${parts.year}-${parts.month}-${parts.day}`,hour:Number(parts.hour),minute:Number(parts.minute)};
}
function addDays(key,days){const date=new Date(`${key}T00:00:00Z`);date.setUTCDate(date.getUTCDate()+days);return date.toISOString().slice(0,10);}
function compareDate(left,right){return Date.parse(`${left}T00:00:00Z`)-Date.parse(`${right}T00:00:00Z`);}
function isWeekend(key){const day=new Date(`${key}T00:00:00Z`).getUTCDay();return day===0||day===6;}
function holidaySet(values=[]){return new Set(values.map(value=>text(value?.date||value).replace(/[^0-9]/g,'')).filter(value=>value.length===8).map(value=>`${value.slice(0,4)}-${value.slice(4,6)}-${value.slice(6)}`));}
function isBusinessDay(key,holidays=new Set()){return Boolean(key)&&!isWeekend(key)&&!holidays.has(key);}
function nextBusinessDay(key,holidays=new Set(),includeCurrent=false){let cursor=includeCurrent?key:addDays(key,1);for(let index=0;index<370;index+=1){if(isBusinessDay(cursor,holidays))return cursor;cursor=addDays(cursor,1);}return ''}
function businessDaysBetween(start,end,holidays=new Set()){let count=0;for(let cursor=addDays(start,1);cursor&&compareDate(cursor,end)<=0;cursor=addDays(cursor,1)){if(isBusinessDay(cursor,holidays))count+=1;}return count;}

function calculateCutoffSchedule({asOf=new Date(),holidayDates=[],holidayReady=false,cutoffHour=15}={}){
  const now=new Date(asOf);const today=dateKey(now);const holidays=holidaySet(holidayDates);
  if(Number.isNaN(now.getTime())||!today)return {label:'오후 3시',dayLabel:'마감 시각 확인',deadlineAt:null,deadlineDate:null,remainingMinutes:null,status:'CHECK_REQUIRED',confidence:'BLOCKED',note:'기준시각 확인 필요'};
  const hour=Math.max(0,Math.min(23,Number(cutoffHour)||15));
  const todayDeadline=new Date(`${today}T${String(hour).padStart(2,'0')}:00:00+09:00`);
  const deadlineDate=isBusinessDay(today,holidays)&&now.getTime()<todayDeadline.getTime()
    ?today
    :nextBusinessDay(today,holidays,false);
  if(!deadlineDate)return {label:'오후 3시',dayLabel:'마감 시각 확인',deadlineAt:null,deadlineDate:null,remainingMinutes:null,status:'CHECK_REQUIRED',confidence:'BLOCKED',note:'다음 영업일 확인 필요'};
  const deadline=new Date(`${deadlineDate}T${String(hour).padStart(2,'0')}:00:00+09:00`);
  const weekday=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',weekday:'long'}).format(deadline);
  return {
    label:'오후 3시',
    dayLabel:deadlineDate===today?'오늘 오후 3시':`${weekday} 오후 3시`,
    deadlineAt:deadline.toISOString(),deadlineDate,
    remainingMinutes:Math.max(0,Math.ceil((deadline.getTime()-now.getTime())/60000)),
    status:'READY',confidence:holidayReady?'READY':'PARTIAL',
    note:holidayReady?'주말·공휴일 반영':'주말 반영 · 공휴일 확인 필요'
  };
}

function calculateShippingEstimate({orderedAt,asOf=new Date(),holidayDates=[],holidayReady=false,cutoffHour=15}={}){
  const ordered=seoulParts(orderedAt);const today=dateKey(asOf);const holidays=holidaySet(holidayDates);
  if(!ordered||!today)return {status:'NO_DATE',plannedShipDate:null,confidence:'BLOCKED',businessDaysLate:0};
  const beforeCutoff=ordered.hour<cutoffHour||(ordered.hour===cutoffHour&&ordered.minute===0);
  const sameBusinessDay=isBusinessDay(ordered.date,holidays)&&beforeCutoff;
  const plannedShipDate=sameBusinessDay?ordered.date:nextBusinessDay(ordered.date,holidays,false);
  const businessDaysLate=plannedShipDate&&compareDate(today,plannedShipDate)>0?businessDaysBetween(plannedShipDate,today,holidays):0;
  return {
    status:plannedShipDate===today?'DUE_TODAY':compareDate(plannedShipDate,today)<0?'OVERDUE':'SCHEDULED',
    plannedShipDate,confidence:holidayReady?'READY':'PARTIAL',businessDaysLate,beforeCutoff,
    note:holidayReady?'주말·공휴일 반영':'주말만 반영 · 공휴일 키 연결 후 확정'
  };
}

module.exports={addDays,businessDaysBetween,calculateCutoffSchedule,calculateShippingEstimate,dateKey,holidaySet,isBusinessDay,isWeekend,nextBusinessDay,seoulParts};
