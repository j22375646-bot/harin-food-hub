'use strict';
const object=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
const keys=(v,allowed)=>object(v)&&Object.keys(v).every(k=>allowed.includes(k));
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const reportId=v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,128}$/.test(v);
const text=(v,max=1200)=>typeof v==='string'&&v.length<=max;
function validCommand(v){
 if(!object(v))return false;
 if(v.operation==='LIST')return keys(v,['operation']);
 if(v.operation==='DELETE')return keys(v,['operation','runId'])&&uuid(v.runId);
 if(v.operation!=='GENERATE'||!keys(v,['operation','input']))return false;
 const b=v.input;
 return keys(b,['requestId','reportIds','question','kind','parentRunId'])&&uuid(b.requestId)&&Array.isArray(b.reportIds)&&b.reportIds.length>=1&&b.reportIds.length<=2&&b.reportIds.every(reportId)&&new Set(b.reportIds).size===b.reportIds.length&&typeof b.question==='string'&&Array.from(b.question).length<=500&&['SUMMARY','QUESTION'].includes(b.kind)&&(b.kind==='SUMMARY'?!b.question.trim():!!b.question.trim())&&(b.parentRunId===undefined||uuid(b.parentRunId)&&b.kind==='QUESTION');
}
const STATUSES=new Set(['READY','COMPLETE','PARTIAL','STALE','BLOCKED','DISABLED','SETUP_REQUIRED','BUDGET_BLOCKED','QUOTA_BLOCKED','TIMEOUT','INVALID_OUTPUT','PENDING','ALREADY_PROCESSED','SAVE_FAILED','CANCELLED','UNAVAILABLE','LOGIN_REQUIRED','FORBIDDEN','DISCONNECTED','INVALID_REQUEST','DATA_POLICY_BLOCKED','PROVIDER_DISABLED','SCOPE_BLOCKED','OUT_OF_SCOPE','TURN_LIMIT','NOT_FOUND','INPUT_TOO_LARGE','QUESTION_PRIVACY_BLOCKED']);
function empty(status){status=({AUTH_REQUIRED:'LOGIN_REQUIRED',PERMISSION_DENIED:'FORBIDDEN',TENANT_ACCESS_DENIED:'FORBIDDEN',WORKSPACE_CHANGED:'CANCELLED'})[status]||status;return {ok:false,status:STATUSES.has(status)?status:'UNAVAILABLE'};}
function list(value,max,project){if(!Array.isArray(value)||value.length>max)throw Error('Invalid array');return value.map(project);}
function string(value,max=1200){if(!text(value,max))throw Error('Invalid text');return value;}
function date(value){if(typeof value!=='string'||value.length>35||!Number.isFinite(Date.parse(value)))throw Error('Invalid date');return value;}
function projectConfiguration(v){if(!object(v)||v.provider!=='CLOVA'||v.model!=='HCX-007'||typeof v.enabled!=='boolean'||typeof v.ready!=='boolean'||!['DISABLED','SETUP_REQUIRED','READY'].includes(v.status))throw Error('Invalid config');return {provider:'CLOVA',model:'HCX-007',enabled:v.enabled,ready:v.ready,status:v.status,pricingVersion:v.pricingVersion==null?null:string(v.pricingVersion,128),creditExpiresAt:v.creditExpiresAt==null?null:date(v.creditExpiresAt)};}
function projectRun(v){
 if(!object(v)||!uuid(v.id)||v.scope!=='NAVER_AD_REPORT'||v.provider!=='CLOVA'||v.model!=='HCX-007'||!['SUCCEEDED','READY'].includes(v.status)||!['COMPLETE','READY','PARTIAL','STALE','BLOCKED'].includes(v.dataState)||!Number.isInteger(v.turn)||v.turn<1||v.turn>6||!/^([0-9a-f]{64})$/.test(v.snapshotHash)||!object(v.period)||!object(v.metrics)||Object.keys(v.metrics).length>40)throw Error('Invalid run');
 const reportIds=list(v.reportIds,2,id=>{if(!reportId(id))throw Error('Invalid report');return id;});if(!reportIds.length||new Set(reportIds).size!==reportIds.length)throw Error('Invalid reports');
 const metrics=Object.fromEntries(Object.entries(v.metrics).map(([id,m])=>{if(!/^[a-zA-Z][a-zA-Z0-9]{0,80}$/.test(id)||!object(m)||!(m.value===null||typeof m.value==='number'&&Number.isFinite(m.value))||!['KRW','COUNT','PERCENT','PERCENT_POINT'].includes(m.unit))throw Error('Invalid metric');return [id,{value:m.value,unit:m.unit,definition:string(m.definition,500),sourceId:reportIds.includes(m.sourceId)?m.sourceId:null,...(m.sourceIds?{sourceIds:list(m.sourceIds,2,s=>{if(!reportIds.includes(s))throw Error('Invalid metric source');return s;})}:{}),reason:m.reason==null?null:string(m.reason,500)}];}));
 const cards=list(v.cards,5,c=>{if(!object(c))throw Error('Invalid card');return {findingId:string(c.findingId,128),observation:string(c.observation,2400),hypothesis:string(c.hypothesis,2400),nextCheck:string(c.nextCheck,2400),metricRefs:list(c.metricRefs,20,id=>{if(!Object.hasOwn(metrics,id))throw Error('Invalid ref');return id;}),evidenceRefs:list(c.evidenceRefs,2,id=>{if(!reportIds.includes(id))throw Error('Invalid evidence');return id;})};});
 const usage=v.usage==null?null:Object.fromEntries(['promptTokens','completionTokens','totalTokens'].filter(k=>Number.isSafeInteger(v.usage[k])&&v.usage[k]>=0).map(k=>[k,v.usage[k]]));
 return {id:v.id,status:v.status,dataState:v.dataState,scope:v.scope,reportIds,question:string(v.question,1000),parentRunId:v.parentRunId==null?null:uuid(v.parentRunId)?v.parentRunId:(()=>{throw Error('Invalid parent');})(),turn:v.turn,createdAt:date(v.createdAt),sourceAsOf:v.sourceAsOf==null?null:date(v.sourceAsOf),provider:v.provider,model:v.model,snapshotHash:v.snapshotHash,period:{start:date(v.period.start),end:date(v.period.end)},metrics,cards,answer:string(v.answer,4800),nextChecks:list(v.nextChecks,5,s=>string(s,2400)),exclusions:list(v.exclusions,20,s=>string(s,1200)),usage,reused:v.reused===true};
}
function projectResponse(value,operation){
 if(value?.ok!==true)return empty(value?.status||value?.code);
 if(operation==='LIST')return {ok:true,configuration:projectConfiguration(value.configuration),runs:list(value.runs,50,projectRun)};
 if(operation==='DELETE'){if(typeof value.deleted!=='boolean')throw Error('Invalid deletion');return {ok:true,deleted:value.deleted};}
 if(operation==='GENERATE')return {ok:true,run:projectRun(value.run)};
 throw Error('Invalid operation');
}
module.exports={validCommand,projectResponse,projectRun,projectConfiguration,empty};
