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
    time,
    priority,
    dueAt:new Date(`${date}T${time||'00:00'}:00+09:00`).toISOString()
  });
}

function decorateEntry(row={}){
  const parts=seoulParts(row.due_at);
  const date=parts?`${parts.year}-${parts.month}-${parts.day}`:null;
  const storedTime=parts?`${parts.hour}:${parts.minute}`:'';
  const type=String(row.item_type||'TASK').toUpperCase()==='NOTE'?'MEMO':'SCHEDULE';
  return Object.freeze({
    id:String(row.id||''),type,title:String(row.title||''),body:String(row.body||''),
    status:String(row.status||'OPEN'),priority:String(row.priority||'NORMAL'),date,
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
  const normalized=Object.freeze(sortEntries(entries));
  return Object.freeze({
    dataStatus:error?'ERROR':'READY',generatedAt:asOf,error:error?String(error):null,range,
    today:seoulDateKey(asOf),entries:normalized,summary:summarize(normalized),
    policy:Object.freeze({storage:'SERVER',monthLoading:'ON_DEMAND',deleteMode:'ARCHIVE',timezone:'Asia/Seoul'})
  });
}

function buildTodayCalendar(entries=[],now=new Date()){
  const date=seoulDateKey(now);
  const items=Object.freeze(sortEntries(entries).filter(item=>item.date===date));
  return Object.freeze({date,items,summary:summarize(items)});
}

module.exports={CalendarInputError,addDays,buildPhase28CalendarModel,buildTodayCalendar,dayRange,decorateEntry,normalizeEntryInput,seoulDateKey,sortEntries,validDateKey,visibleMonthRange};
