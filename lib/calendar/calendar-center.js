'use strict';

const DATE_PATTERN=/^20\d{2}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/;
const TIME_PATTERN=/^(?:[01]\d|2[0-3]):[0-5]\d$/;
const PRIORITIES=new Set(['LOW','NORMAL','HIGH']);
const KST_PARTS=new Intl.DateTimeFormat('en-CA',{
  timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'
});

class CalendarInputError extends Error{
  constructor(message){super(message);this.name='CalendarInputError';this.status=400;}
}

function text(value,max,label,{required=false}={}){
  const result=String(value==null?'':value).replace(/\r\n?/g,'\n').trim();
  if(required&&!result)throw new CalendarInputError(`${label}을 입력해주세요.`);
  if(result.length>max)throw new CalendarInputError(`${label}은 ${max}자 이하여야 합니다.`);
  return result;
}

function validDateKey(value){
  const input=String(value||'');
  if(!DATE_PATTERN.test(input))return null;
  const parsed=new Date(`${input}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime())&&parsed.toISOString().slice(0,10)===input?input:null;
}

function seoulParts(value){
  const date=new Date(value||Date.now());
  if(Number.isNaN(date.getTime()))return null;
  return Object.fromEntries(KST_PARTS.formatToParts(date).filter(item=>item.type!=='literal').map(item=>[item.type,item.value]));
}

function seoulDateKey(value){
  const parts=seoulParts(value);
  return parts?`${parts.year}-${parts.month}-${parts.day}`:null;
}

function addDays(dateKey,days){
  const date=new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate()+days);
  return date.toISOString().slice(0,10);
}

function calendarContextLabel(date,endDate){
  return endDate&&endDate!==date?`캘린더 · 종료 ${endDate}`:'캘린더';
}

function contextEndDate(label,startDate){
  const matched=String(label||'').match(/(?:^|\s)종료\s+(20\d{2}-\d{2}-\d{2})(?:$|\s)/);
  const endDate=matched&&validDateKey(matched[1]);
  return endDate&&endDate>=startDate?endDate:startDate;
}

function daysBetween(start,end){
  return Math.round((new Date(`${end}T00:00:00.000Z`)-new Date(`${start}T00:00:00.000Z`))/86400000);
}

function rangePosition(entry,date){
  const start=entry.date,end=entry.endDate||entry.date;
  const weekday=new Date(`${date}T00:00:00.000Z`).getUTCDay();
  const starts=date===start||weekday===0;
  const ends=date===end||weekday===6;
  if(starts&&ends)return 'SINGLE';
  if(starts)return 'START';
  if(ends)return 'END';
  return 'MIDDLE';
}

function expandEntriesByDate(entries=[]){
  return sortEntries(entries).reduce((map,entry)=>{
    const end=entry.endDate||entry.date;
    for(let date=entry.date,index=0;date<=end&&index<=366;date=addDays(date,1),index+=1){
      if(!map[date])map[date]=[];
      map[date].push(Object.freeze({...entry,rangePosition:rangePosition(entry,date)}));
    }
    return map;
  },{});
}

function holidayDateKey(value){
  const digits=String(value||'').replace(/[^0-9]/g,'');
  return digits.length===8?validDateKey(`${digits.slice(0,4)}-${digits.slice(4,6)}-${digits.slice(6,8)}`):null;
}

function buildHolidayCalendar({snapshots=[],from,to}={}){
  const start=validDateKey(from),end=validDateKey(to);
  if(!start||!end||start>end)throw new CalendarInputError('공휴일 조회 범위를 확인해주세요.');
  const years=[];
  for(let year=Number(start.slice(0,4));year<=Number(end.slice(0,4));year+=1)years.push(year);
  const latestByYear=new Map();
  snapshots.filter(row=>row?.provider==='HOLIDAY_CALENDAR'&&row?.status==='SUCCESS').forEach(row=>{
    const year=Number(row.reference_year);
    if(!years.includes(year))return;
    const previous=latestByYear.get(year);
    if(!previous||new Date(row.fetched_at||0)>new Date(previous.fetched_at||0))latestByYear.set(year,row);
  });
  const holidays=[...latestByYear.values()].flatMap(row=>Array.isArray(row.source_data?.holidays)?row.source_data.holidays:[])
    .map(item=>({date:holidayDateKey(item.date),name:text(item.name||item.dateName||'공휴일',80,'공휴일 이름')}))
    .filter(item=>item.date&&item.date>=start&&item.date<=end)
    .sort((left,right)=>left.date.localeCompare(right.date));
  const missingYears=years.filter(year=>!latestByYear.has(year));
  return Object.freeze({ready:missingYears.length===0,holidays:Object.freeze(holidays),missingYears:Object.freeze(missingYears)});
}

function visibleMonthRange(month){
  const current=/^20\d{2}-(?:0[1-9]|1[0-2])$/.test(String(month||''))?String(month):seoulDateKey().slice(0,7);
  const first=`${current}-01`;
  const firstDate=new Date(`${first}T00:00:00.000Z`);
  const start=addDays(first,-firstDate.getUTCDay());
  const nextMonth=new Date(Date.UTC(firstDate.getUTCFullYear(),firstDate.getUTCMonth()+1,1));
  const last=new Date(nextMonth.getTime()-86400000).toISOString().slice(0,10);
  const lastDay=new Date(`${last}T00:00:00.000Z`).getUTCDay();
  const end=addDays(last,6-lastDay);
  return Object.freeze({month:current,start,end,endExclusive:addDays(end,1)});
}

function dayRange(dateKey){
  const date=validDateKey(dateKey)||seoulDateKey();
  return Object.freeze({start:date,end:date,endExclusive:addDays(date,1)});
}

function normalizeEntryInput(input={}){
  const type=String(input.type||'SCHEDULE').toUpperCase();
  if(!['SCHEDULE','MEMO'].includes(type))throw new CalendarInputError('일정 또는 메모 중 하나를 선택해주세요.');
  const date=validDateKey(input.date);
  if(!date)throw new CalendarInputError('날짜를 확인해주세요.');
  const requestedEnd=type==='SCHEDULE'?(input.endDate||date):date;
  const endDate=validDateKey(requestedEnd);
  if(!endDate)throw new CalendarInputError('종료일을 확인해주세요.');
  if(endDate<date)throw new CalendarInputError('종료일은 시작일보다 빠를 수 없습니다.');
  if(daysBetween(date,endDate)>366)throw new CalendarInputError('일정 기간은 366일 이하여야 합니다.');
  const rawTime=String(input.time||'').trim();
  if(rawTime&&!TIME_PATTERN.test(rawTime))throw new CalendarInputError('시간을 확인해주세요.');
  const time=type==='MEMO'?'':rawTime;
  const priority=String(input.priority||'NORMAL').toUpperCase();
  if(!PRIORITIES.has(priority))throw new CalendarInputError('우선순위를 확인해주세요.');
  return Object.freeze({
    type,
    title:text(input.title,160,'제목',{required:true}),
    body:text(input.body,4000,'내용'),
    date,
    endDate,
    time,
    priority,
    dueAt:new Date(`${date}T${time||'00:00'}:00+09:00`).toISOString(),
    contextLabel:calendarContextLabel(date,endDate)
  });
}

function decorateEntry(row={}){
  const parts=seoulParts(row.due_at);
  const date=parts?`${parts.year}-${parts.month}-${parts.day}`:null;
  const storedTime=parts?`${parts.hour}:${parts.minute}`:'';
  const type=String(row.item_type||'TASK').toUpperCase()==='NOTE'?'MEMO':'SCHEDULE';
  const endDate=date?(type==='MEMO'?date:contextEndDate(row.context_label,date)):null;
  return Object.freeze({
    id:String(row.id||''),type,title:String(row.title||''),body:String(row.body||''),
    status:String(row.status||'OPEN'),priority:String(row.priority||'NORMAL'),date,endDate,
    time:type==='MEMO'||storedTime==='00:00'?'':storedTime,allDay:type==='MEMO'||storedTime==='00:00',
    createdAt:row.created_at||null,updatedAt:row.updated_at||null,completedAt:row.completed_at||null
  });
}

function sortEntries(entries=[]){
  return entries.map(item=>item?.due_at?decorateEntry(item):Object.freeze({...item}))
    .filter(item=>item.date)
    .sort((left,right)=>`${left.date} ${left.time||'00:00'} ${left.title}`.localeCompare(`${right.date} ${right.time||'00:00'} ${right.title}`,'ko'));
}

function summarize(entries=[]){
  return Object.freeze({
    total:entries.length,
    schedules:entries.filter(item=>item.type==='SCHEDULE').length,
    memos:entries.filter(item=>item.type==='MEMO').length,
    open:entries.filter(item=>item.type==='SCHEDULE'&&item.status!=='DONE').length,
    done:entries.filter(item=>item.type==='SCHEDULE'&&item.status==='DONE').length
  });
}

function buildPhase28CalendarModel({entries=[],generatedAt=null,month=null,error=null}={}){
  const asOf=generatedAt||new Date().toISOString();
  const range=visibleMonthRange(month||seoulDateKey(asOf).slice(0,7));
  const normalized=Object.freeze(sortEntries(entries).filter(item=>item.date<=range.end&&(item.endDate||item.date)>=range.start));
  return Object.freeze({
    dataStatus:error?'ERROR':'READY',generatedAt:asOf,error:error?String(error):null,range,
    today:seoulDateKey(asOf),entries:normalized,summary:summarize(normalized),
    policy:Object.freeze({storage:'SERVER',monthLoading:'ON_DEMAND',deleteMode:'ARCHIVE',timezone:'Asia/Seoul'})
  });
}

function buildTodayCalendar(entries=[],now=new Date()){
  const date=seoulDateKey(now);
  const items=Object.freeze(sortEntries(entries).filter(item=>item.date<=date&&(item.endDate||item.date)>=date));
  return Object.freeze({date,items,summary:summarize(items)});
}

module.exports={CalendarInputError,addDays,buildHolidayCalendar,buildPhase28CalendarModel,buildTodayCalendar,calendarContextLabel,dayRange,decorateEntry,expandEntriesByDate,normalizeEntryInput,seoulDateKey,sortEntries,validDateKey,visibleMonthRange};
