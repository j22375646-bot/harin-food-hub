'use strict';
const SETTLEMENT_URL='https://harin-cafe24-sync.vercel.app/api/moaon/businesses/a3452bca-e259-40ed-a93d-b8bcc5c1b9e0/settlement';
const MONEY=['gross','refunds','fees','logistics','advertising','expected','actual','pending','variance'];
const PLATFORMS=['CAFE24','NAVER','COUPANG','COUPANG_RG'];
const STATES=new Set(['ACTUAL','ESTIMATED','COST_REQUIRED','APPROVAL_REQUIRED','RECONNECT_REQUIRED','SCOPE_REQUIRED','VERIFY_REQUIRED','UNAVAILABLE','NO_DATA','FAMILY_REQUIRED','PARTIAL','MATCHED','OVERPAID','UNDERPAID','SETTLEMENT_INCOMPLETE','SEPARATE_SOURCE_REQUIRED']);
const empty=status=>({status,summary:null,channels:[],schedules:[],period:null,generatedAt:null});
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const number=value=>value===null||typeof value==='number'&&Number.isFinite(value);
const text=value=>value===null||typeof value==='string'&&value.length<=500;
function date(value){return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;}
function timestamp(value){return value===null||typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)&&date(value.slice(0,10))&&Number.isFinite(Date.parse(value));}
function metric(value,statuses){return object(value)&&statuses.includes(value.status)&&number(value.value)&&(value.status==='BLOCKED'?value.value===null:value.value!==null);}
function settlementUrl(days=30){if(![7,30,90].includes(days))throw TypeError('Invalid period');return SETTLEMENT_URL+(days===30?'':'?days='+days);}
function project(payload,days){
 if(!object(payload)||payload.ok!==true||payload.writePolicy!=='READ_ONLY'||!timestamp(payload.generatedAt)||!object(payload.period)||payload.period.days!==days||!timestamp(payload.period.start)||!timestamp(payload.period.end)||payload.period.start&&payload.period.end&&Date.parse(payload.period.start)>Date.parse(payload.period.end))throw Error('Payload');
 const summary=payload.summary;
 if(!object(summary)||!metric(summary.actual,['READY','PARTIAL','BLOCKED'])||!metric(summary.expected,['ESTIMATED','BLOCKED'])||!number(summary.variance)||!(summary.comparableChannels===null||Number.isInteger(summary.comparableChannels)&&summary.comparableChannels>=0&&summary.comparableChannels<=4))throw Error('Summary');
 if(!Array.isArray(payload.channels)||payload.channels.length!==4||new Set(payload.channels.map(row=>row?.platform)).size!==4)throw Error('Channels');
 for(const row of payload.channels)if(!object(row)||!PLATFORMS.includes(row.platform)||!STATES.has(row.stateCode)||typeof row.label!=='string'||!row.label||!text(row.label)||typeof row.stateLabel!=='string'||!row.stateLabel||!text(row.stateLabel)||!MONEY.every(key=>number(row[key]))||!text(row.basis)||!text(row.payoutBasis)||!timestamp(row.asOf))throw Error('Channel');
 if(!Array.isArray(payload.schedules)||payload.schedules.length>100)throw Error('Schedules');
 for(const row of payload.schedules)if(!object(row)||!PLATFORMS.includes(row.platform)||!(row.date===null||date(row.date))||!number(row.amount)||!text(row.status)||!text(row.type))throw Error('Schedule');
 return {status:'READY',writePolicy:payload.writePolicy,generatedAt:payload.generatedAt,period:{days:payload.period.days,start:payload.period.start,end:payload.period.end},summary:{actual:{value:payload.summary.actual.value,status:payload.summary.actual.status},expected:{value:payload.summary.expected.value,status:payload.summary.expected.status},variance:payload.summary.variance,comparableChannels:payload.summary.comparableChannels},channels:payload.channels.map(row=>({...Object.fromEntries(['platform','label','stateCode','stateLabel',...MONEY,'basis','payoutBasis','asOf'].map(key=>[key,row[key]]))})),schedules:payload.schedules.map(row=>Object.fromEntries(['platform','date','amount','status','type'].map(key=>[key,row[key]])))};
}
function createSettlementTransport({fetch,timeoutMs=30000}={}){
 if(typeof fetch!=='function'||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>30000)throw TypeError('Invalid settlement transport');
 return async({signal,days=30}={})=>{
 if(![7,30,90].includes(days))return empty('UNAVAILABLE');const url=settlementUrl(days);
 if(signal?.aborted)return empty('CANCELLED');
 const controller=new AbortController();let stop,timer,reader;
 const cancelled=new Promise(resolve=>{stop=()=>{controller.abort();resolve(empty('CANCELLED'));};});signal?.addEventListener('abort',stop,{once:true});
 const run=async()=>{try{
  const response=await fetch(url,{method:'GET',credentials:'include',cache:'no-store',redirect:'error',signal:controller.signal});
  if(response.status!==200)return empty(({401:'LOGIN_REQUIRED',403:'FORBIDDEN',504:'TIMEOUT'})[response.status]||'UNAVAILABLE');
  if(response.redirected||response.url&&response.url!==url||Number(response.headers.get('content-length'))>262144)throw Error('Response');
  reader=response.body?.getReader();if(!reader)throw Error('Body');
  let size=0;const chunks=[];
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>262144)throw Error('Size');chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  return project(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)),days);
 }catch{return empty('UNAVAILABLE');}};
 try{return await Promise.race([run(),cancelled,new Promise(resolve=>{timer=setTimeout(()=>{controller.abort();resolve(empty('TIMEOUT'));},timeoutMs);})]);}finally{clearTimeout(timer);signal?.removeEventListener('abort',stop);controller.abort();try{reader?.cancel().catch(()=>{});}catch{}}
};}
module.exports={createSettlementTransport,settlementUrl};
