'use strict';
const object=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
const keys=(v,allowed)=>object(v)&&Object.keys(v).every(k=>allowed.includes(k));
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const SOURCE_URL='https://datalab.naver.com/keyword/trendSearch.naver';
const KINDS=['TREND_EXPLANATION','SEASONAL_NOTES'];
const METRICS=['firstIndex','lastIndex','meanIndex','peakIndex','indexChange'];
function validCommand(v){
 if(!object(v))return false;
 if(v.operation==='CONFIG')return keys(v,['operation']);
 if(v.operation!=='GENERATE'||!keys(v,['operation','input']))return false;
 const b=v.input;
 return keys(b,['requestId','kind','query','days'])&&Object.keys(b).length===4&&uuid(b.requestId)&&KINDS.includes(b.kind)&&[30,90].includes(b.days)&&typeof b.query==='string'&&b.query.trim()===b.query&&b.query.length>0&&b.query.length<=60&&!/[\u0000-\u001f\u007f,<>@]|https?:|\d{2,4}[- .]?\d{3,4}[- .]?\d{4}/u.test(b.query);
}
const STATUSES=new Set(['DISABLED','SETUP_REQUIRED','PUBLIC_SOURCE_REQUIRED','DATA_POLICY_BLOCKED','BLOCKED','STALE','QUOTA_BLOCKED','PENDING','ALREADY_PROCESSED','INVALID_OUTPUT','SAVE_FAILED','CANCELLED','TIMEOUT','UNAVAILABLE','LOGIN_REQUIRED','FORBIDDEN','DISCONNECTED','INVALID_REQUEST','INPUT_TOO_LARGE']);
function empty(status){status=({AUTH_REQUIRED:'LOGIN_REQUIRED',PERMISSION_DENIED:'FORBIDDEN',TENANT_ACCESS_DENIED:'FORBIDDEN',WORKSPACE_CHANGED:'CANCELLED'})[status]||status;return {ok:false,status:STATUSES.has(status)?status:'UNAVAILABLE'};}
function list(value,max,project){if(!Array.isArray(value)||value.length>max)throw Error('Invalid array');return value.map(project);}
function string(value,max=1200){if(typeof value!=='string'||value.length>max)throw Error('Invalid text');return value;}
function date(value){if(typeof value!=='string'||value.length>35||!Number.isFinite(Date.parse(value)))throw Error('Invalid date');return value;}
function projectConfiguration(v){if(!object(v)||v.provider!=='GEMINI_FREE'||v.model!=='gemini-3.5-flash-lite'||typeof v.enabled!=='boolean'||typeof v.ready!=='boolean'||!['DISABLED','SETUP_REQUIRED','READY'].includes(v.status)||v.dailyLimit!==20)throw Error('Invalid config');return {provider:v.provider,model:v.model,enabled:v.enabled,ready:v.ready,status:v.status,freeConfirmedAt:v.freeConfirmedAt==null?null:date(v.freeConfirmedAt),dailyLimit:20};}
function projectRun(v){
 if(!object(v)||!uuid(v.id)||v.scope!=='PUBLIC_SEARCH_TREND'||v.provider!=='GEMINI_FREE'||v.model!=='gemini-3.5-flash-lite'||v.status!=='SUCCEEDED'||!KINDS.includes(v.kind)||!['COMPLETE','PARTIAL','STALE','BLOCKED'].includes(v.dataState)||!/^([0-9a-f]{64})$/.test(v.snapshotHash)||!object(v.period)||!object(v.metrics)||Object.keys(v.metrics).length!==METRICS.length)throw Error('Invalid run');
 const sources=list(v.sources,1,s=>{if(!object(s)||s.id!=='naver-search-trend'||s.kind!=='NAVER_SEARCH_TREND'||s.url!==SOURCE_URL)throw Error('Invalid source');return {id:s.id,kind:s.kind,url:SOURCE_URL,observedAt:date(s.observedAt)};});if(sources.length!==1)throw Error('Missing source');
 const metrics=Object.fromEntries(METRICS.map(id=>{const m=v.metrics[id];if(!object(m)||!(m.value===null||typeof m.value==='number'&&Number.isFinite(m.value)&&m.value>=(id==='indexChange'?-100:0)&&m.value<=100)||m.unit!==(id==='indexChange'?'INDEX_POINT':'INDEX')||m.sourceId!=='naver-search-trend')throw Error('Invalid metric');return [id,{value:m.value,unit:m.unit,definition:string(m.definition,500),sourceId:m.sourceId,reason:m.reason==null?null:string(m.reason,500)}];}));
 const cards=list(v.cards,5,c=>{if(!object(c)||!METRICS.includes(c.findingId))throw Error('Invalid card');return {findingId:c.findingId,observation:string(c.observation,2400),hypothesis:string(c.hypothesis,2400),nextCheck:string(c.nextCheck,2400),metricRefs:list(c.metricRefs,20,id=>{if(!Object.hasOwn(metrics,id))throw Error('Invalid ref');return id;}),evidenceRefs:list(c.evidenceRefs,1,id=>{if(id!=='naver-search-trend')throw Error('Invalid evidence');return id;})};});
 const usage=v.usage==null?null:Object.fromEntries(['promptTokens','completionTokens'].filter(k=>Number.isSafeInteger(v.usage[k])&&v.usage[k]>=0).map(k=>[k,v.usage[k]]));
 return {id:v.id,status:v.status,kind:v.kind,scope:v.scope,provider:v.provider,model:v.model,createdAt:date(v.createdAt),sourceAsOf:v.sourceAsOf==null?null:date(v.sourceAsOf),snapshotHash:v.snapshotHash,dataState:v.dataState,period:{start:date(v.period.start),end:date(v.period.end)},sources,metrics,cards,answer:string(v.answer,4800),nextChecks:list(v.nextChecks,5,s=>string(s,2400)),exclusions:list(v.exclusions,20,s=>string(s,1200)),usage,reused:v.reused===true};
}
function projectResponse(value,operation){if(value?.ok!==true)return empty(value?.status||value?.code);if(operation==='CONFIG')return {ok:true,configuration:projectConfiguration(value.configuration)};if(operation==='GENERATE')return {ok:true,run:projectRun(value.run)};throw Error('Invalid operation');}
module.exports={validCommand,projectResponse,projectRun,projectConfiguration,empty};
