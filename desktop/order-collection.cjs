'use strict';
const {HARIN_ORIGIN}=require('./connection-policy.cjs');
const diagnostics=require('./ui/collection-diagnostics.js');
const ENDPOINT=`${HARIN_ORIGIN}/api/orders/live-refresh`;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const stamp=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(value)&&Number.isFinite(Date.parse(value))?value:null;
const empty=(code='NOT_CHECKED')=>({status:'CHECK_REQUIRED',observedAt:null,code});
function projectedDiagnostic(value){if(!value||!diagnostics.valid(value.code)||!['SUCCESS','PARTIAL','FAILED','PENDING','RUNNING','CHECK_REQUIRED'].includes(value.status))return null;return {status:value.status,code:value.code,observedAt:stamp(value.observedAt),...(Number.isInteger(value.httpStatus)&&value.httpStatus>=400&&value.httpStatus<=599?{httpStatus:value.httpStatus}:{})};}
// Request identities and raw customer-bearing responses never leave Main.
function createOrderCollection({authorize,fetch,readJson,permit,blocked,timeoutMs=45000}){
 let epoch=0,active=null,ids={},attempted=false,phase='IDLE',reason=null,checkedAt=null,failureCode=null;
 let channels={cafe24:empty(),naver:empty(),coupang:empty()};
 function snapshot(){
  const states=Object.values(channels).map(row=>row.status),pending=states.some(s=>['PENDING','RUNNING'].includes(s));
  return {status:active?'PENDING':reason?'CHECK_REQUIRED':phase==='IDLE'?'IDLE':pending?'PENDING':states.every(s=>s==='SUCCESS')?'SUCCESS':'CHECK_REQUIRED',phase,reason,code:failureCode,checkedAt,channels:structuredClone(channels),canCheck:Object.keys(ids).length>0,canCollect:!attempted&&!active,verifiedTerminal:!reason&&states.every(s=>['SUCCESS','PARTIAL','FAILED'].includes(s))};
 }
 function reset(){epoch++;active?.abort();active=null;ids={};attempted=false;phase='IDLE';reason=checkedAt=failureCode=null;channels={cafe24:empty(),naver:empty(),coupang:empty()};}
 async function run(check){
  if(active||blocked())return {...snapshot(),status:'BUSY'};
  if(check&&!Object.keys(ids).length||!check&&attempted)return snapshot();
  const expected=epoch,controller=new AbortController();active=controller;phase='AUTHORIZING';reason=failureCode=null;let timer,permitted=null;
  const alive=()=>expected===epoch&&!controller.signal.aborted;
  const clearPermit=()=>{if(permitted){permit(permitted,null);permitted=null;}};
  try{
   const operation=(async()=>{
    const auth=await authorize();if(!alive())return;
    if(!['READY','PARTIAL'].includes(auth)){reason=['LOGIN_REQUIRED','FORBIDDEN'].includes(auth)?'AUTH_REQUIRED':'UNAVAILABLE';failureCode=reason==='AUTH_REQUIRED'?'SESSION_REQUIRED':'DATABASE_ERROR';channels={cafe24:empty(),naver:empty(),coupang:empty()};return;}
    const method=check?'GET':'POST';const params=new URLSearchParams();
    for(const key of ['coupang','naver'])if(ids[key])params.set(`${key}RequestId`,ids[key]);
    const url=check?`${ENDPOINT}?${params}`:ENDPOINT;
    if(!check){attempted=true;ids={};channels={cafe24:empty(),naver:empty(),coupang:empty()};}
    phase=check?'CHECKING':'REQUESTING';permitted=url;permit(url,method);
    const response=await fetch(url,{method,credentials:'include',cache:'no-store',redirect:'error',signal:controller.signal,...(!check?{headers:{'Content-Type':'application/json',Origin:HARIN_ORIGIN},body:'{}'}:{})});
    if(!alive())return;
    if([401,403].includes(response.status)){reason='AUTH_REQUIRED';failureCode='SESSION_REQUIRED';throw Error('Collection unavailable');}
    if(![200,202,207].includes(response.status))failureCode=diagnostics.classify({status:response.status});
    const body=await readJson(response,controller);if(!alive())return;
    if(diagnostics.valid(body?.errorCode))failureCode=body.errorCode;
    const hasDiagnostics=Object.values(body?.channelDiagnostics||{}).some(row=>projectedDiagnostic(row));
    if(body?.ok!==true&&!hasDiagnostics)throw Error('Collection unavailable');
    if(!check)channels.cafe24=projectedDiagnostic(body.channelDiagnostics?.cafe24)||(body.cafe24Error?{status:'FAILED',code:'REQUEST_FAILED',observedAt:new Date().toISOString()}:['SUCCESS','PARTIAL'].includes(body.cafe24?.status)?{status:body.cafe24.status,code:body.cafe24.status==='PARTIAL'?'CS_PARTIAL':'SUCCESS',observedAt:stamp(body.cafe24.finishedAt)}:empty('RESULT_MISSING'));
    for(const key of ['naver','coupang']){
     const row=body.requests?.[key];
     if(check&&!ids[key])continue;
     if(!row||typeof row.id!=='string'||!UUID.test(row.id)||check&&row.id!==ids[key]){const knownFailure=!check&&projectedDiagnostic(body.channelDiagnostics?.[key]);channels[key]=knownFailure?.status==='FAILED'?knownFailure:!check&&body.worker?.ready===false?{status:'FAILED',code:'WORKER_OFFLINE',observedAt:new Date().toISOString()}:empty('RESULT_MISSING');continue;}
     if(!check)ids[key]=row.id;
     const status=['PENDING','RUNNING','SUCCESS','FAILED'].includes(row.status)?row.status:'CHECK_REQUIRED';
     const detail=projectedDiagnostic(body.channelDiagnostics?.[key]);
     channels[key]={status,code:detail?.code||(status==='SUCCESS'?'SUCCESS':status==='FAILED'?'REQUEST_FAILED':status==='RUNNING'?'RUNNING':status==='PENDING'?'QUEUED':'RESULT_MISSING'),observedAt:stamp(status==='SUCCESS'||status==='FAILED'?row.finished_at||row.executed_at:row.started_at||row.requested_at||row.created_at),...(detail?.httpStatus?{httpStatus:detail.httpStatus}:{})};
    }
    reason=body.worker?.ready===false?'WORKER_OFFLINE':null;failureCode=null;
    checkedAt=new Date().toISOString();
    if(Object.values(channels).every(row=>['SUCCESS','PARTIAL','FAILED'].includes(row.status)))attempted=false;
   })();
   await Promise.race([operation,new Promise((_,reject)=>{controller.signal.addEventListener('abort',()=>reject(Error('Collection stopped')),{once:true});timer=setTimeout(()=>controller.abort(),timeoutMs);})]);
  }catch(error){
   if(expected===epoch){reason=reason||(controller.signal.aborted?'TIMEOUT':'UNAVAILABLE');const classified=diagnostics.classify(error);failureCode=failureCode||(controller.signal.aborted?'TIMEOUT':error instanceof SyntaxError?'RESPONSE_INVALID':classified==='REQUEST_FAILED'?'RESULT_MISSING':classified);}
  }finally{clearTimeout(timer);clearPermit();if(active===controller){active=null;phase=reason?'ATTENTION':Object.values(channels).some(row=>['PENDING','RUNNING'].includes(row.status))?'WAITING':'FINISHED';}}
  return expected===epoch?snapshot():{status:'DISCONNECTED',channels:{cafe24:empty(),naver:empty(),coupang:empty()},canCheck:false,canCollect:false,verifiedTerminal:false};
 }
 return {collect:()=>run(false),check:()=>run(true),read:snapshot,reset};
}
module.exports={createOrderCollection};
