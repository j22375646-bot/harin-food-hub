'use strict';
const {HARIN_ORIGIN}=require('./connection-policy.cjs');
const {randomUUID}=require('node:crypto');
const diagnostics=require('./ui/collection-diagnostics.js');
const ENDPOINT=`${HARIN_ORIGIN}/api/orders/live-refresh`;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const stamp=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(value)&&Number.isFinite(Date.parse(value))?value:null;
const empty=(code='NOT_CHECKED')=>({status:'CHECK_REQUIRED',observedAt:null,code});
function projectedDiagnostic(value){if(!value||!diagnostics.valid(value.code)||!['SUCCESS','PARTIAL','FAILED','PENDING','RUNNING','CHECK_REQUIRED'].includes(value.status))return null;return {status:value.status,code:value.code,observedAt:stamp(value.observedAt),...(Number.isInteger(value.httpStatus)&&value.httpStatus>=400&&value.httpStatus<=599?{httpStatus:value.httpStatus}:{})};}
// Correlation keys and queue identities stay in Main. A lost POST response is
// recovered with GET, never replaced by a fresh collection merely after time.
function createOrderCollection({authorize,fetch,readJson,permit,blocked,timeoutMs=45000}){
 let epoch=0,active=null,ids={},attempted=false,phase='IDLE',reason=null,checkedAt=null,failureCode=null,receiptId=null,reuseReceipt=false;
 let channels={cafe24:empty(),naver:empty(),coupang:empty()};
 function snapshot(){
  const states=Object.values(channels).map(row=>row.status),pending=states.some(s=>['PENDING','RUNNING'].includes(s)),recovering=Boolean(receiptId&&attempted&&reason&&reason!=='AUTH_REQUIRED');
  return {status:active?'PENDING':reason?'CHECK_REQUIRED':phase==='IDLE'?'IDLE':pending?'PENDING':states.every(s=>s==='SUCCESS')?'SUCCESS':'CHECK_REQUIRED',phase,reason,code:recovering?'RECOVERING':failureCode,recovering,checkedAt,channels:structuredClone(channels),canCheck:Object.keys(ids).length>0||Boolean(receiptId&&attempted),canCollect:!attempted&&!active,verifiedTerminal:!reason&&states.every(s=>['SUCCESS','PARTIAL','FAILED'].includes(s))};
 }
 function reset(){epoch++;active?.abort();active=null;ids={};attempted=false;phase='IDLE';reason=checkedAt=failureCode=receiptId=null;reuseReceipt=false;channels={cafe24:empty(),naver:empty(),coupang:empty()};}
 async function run(check){
  if(active||blocked())return {...snapshot(),status:'BUSY'};
  if(check&&!Object.keys(ids).length&&!receiptId||!check&&attempted)return snapshot();
  const expected=epoch,controller=new AbortController();active=controller;phase='AUTHORIZING';reason=failureCode=null;let timer,permitted=null;
  const alive=()=>expected===epoch&&!controller.signal.aborted;
  const clearPermit=()=>{if(permitted){permit(permitted,null);permitted=null;}};
  try{
   const operation=(async()=>{
    const auth=await authorize();if(!alive())return;
    if(!['READY','PARTIAL'].includes(auth)){reason=['LOGIN_REQUIRED','FORBIDDEN'].includes(auth)?'AUTH_REQUIRED':'UNAVAILABLE';failureCode=reason==='AUTH_REQUIRED'?'SESSION_REQUIRED':'DATABASE_ERROR';channels={cafe24:empty(),naver:empty(),coupang:empty()};return;}
    const method=check?'GET':'POST',params=new URLSearchParams();
    if(!check){if(!reuseReceipt)receiptId=randomUUID();reuseReceipt=false;attempted=true;ids={};channels={cafe24:empty(),naver:empty(),coupang:empty()};}
    if(check&&receiptId)params.set('collectionId',receiptId);else for(const key of ['coupang','naver'])if(ids[key])params.set(`${key}RequestId`,ids[key]);
    const url=check?`${ENDPOINT}?${params}`:ENDPOINT;
    phase=check?'CHECKING':'REQUESTING';permitted=url;permit(url,method);
    const response=await fetch(url,{method,credentials:'include',cache:'no-store',redirect:'error',signal:controller.signal,...(!check?{headers:{'Content-Type':'application/json',Origin:HARIN_ORIGIN},body:JSON.stringify({collectionId:receiptId})}:{})});
    if(!alive())return;
    if([401,403].includes(response.status)){reason='AUTH_REQUIRED';failureCode='SESSION_REQUIRED';throw Error('Collection unavailable');}
    if(![200,202,207].includes(response.status))failureCode=diagnostics.classify({status:response.status});
    const body=await readJson(response,controller);if(!alive())return;
    if(body?.collection&&(!receiptId||body.collection.id!==receiptId||!['RUNNING','SETTLED','ATTENTION','NOT_FOUND'].includes(body.collection.status)))throw new SyntaxError('Collection receipt mismatch');
    const matchedReceipt=Boolean(receiptId&&body?.collection?.id===receiptId);
    if(response.status===404&&matchedReceipt&&body.collection.status==='NOT_FOUND'){attempted=false;reuseReceipt=true;reason='UNAVAILABLE';failureCode='REQUEST_NOT_RECEIVED';for(const key of Object.keys(channels))if(channels[key].status==='CHECK_REQUIRED')channels[key]=empty('REQUEST_NOT_RECEIVED');checkedAt=new Date().toISOString();return;}
    if(diagnostics.valid(body?.errorCode))failureCode=body.errorCode;
    const hasDiagnostics=Object.values(body?.channelDiagnostics||{}).some(row=>projectedDiagnostic(row));
    if(body?.ok!==true&&!hasDiagnostics)throw Error('Collection unavailable');
    if(!check&&!matchedReceipt)receiptId=null; // Compatible with older web-server responses.
    if(!check||matchedReceipt){const candidate=projectedDiagnostic(body.channelDiagnostics?.cafe24)||(body.cafe24Error?{status:'FAILED',code:'REQUEST_FAILED',observedAt:new Date().toISOString()}:['SUCCESS','PARTIAL'].includes(body.cafe24?.status)?{status:body.cafe24.status,code:body.cafe24.status==='PARTIAL'?'CS_PARTIAL':'SUCCESS',observedAt:stamp(body.cafe24.finishedAt)}:empty('RESULT_MISSING'));if(!check||!['SUCCESS','PARTIAL'].includes(channels.cafe24.status)||!['PENDING','RUNNING','CHECK_REQUIRED'].includes(candidate.status))channels.cafe24=candidate;}
    for(const key of ['naver','coupang']){
     const row=body.requests?.[key],detail=projectedDiagnostic(body.channelDiagnostics?.[key]);
     if(check&&!ids[key]&&!matchedReceipt)continue;
     if(!row||typeof row.id!=='string'||!UUID.test(row.id)||check&&ids[key]&&row.id!==ids[key]){const known=!row&&matchedReceipt&&detail&&detail.status!=='SUCCESS'&&detail.status!=='PARTIAL'?detail:!check&&detail?.status==='FAILED'?detail:null;channels[key]=known?known:!check&&body.worker?.ready===false?{status:'FAILED',code:'WORKER_OFFLINE',observedAt:new Date().toISOString()}:empty('RESULT_MISSING');continue;}
     if(!check||!ids[key]&&matchedReceipt)ids[key]=row.id;
     const status=row.status==='CANCELLED'?'FAILED':['PENDING','RUNNING','SUCCESS','FAILED'].includes(row.status)?row.status:'CHECK_REQUIRED';
     channels[key]={status,code:detail?.code||(status==='SUCCESS'?'SUCCESS':status==='FAILED'?'REQUEST_FAILED':status==='RUNNING'?'RUNNING':status==='PENDING'?'QUEUED':'RESULT_MISSING'),observedAt:stamp(status==='SUCCESS'||status==='FAILED'?row.finished_at||row.executed_at:row.started_at||row.requested_at||row.created_at),...(detail?.httpStatus?{httpStatus:detail.httpStatus}:{})};
    }
    const waitingWorkers=['naver','coupang'].some(key=>['PENDING','RUNNING','CHECK_REQUIRED'].includes(channels[key].status));reason=body.worker?.ready===false&&(!matchedReceipt||waitingWorkers)?'WORKER_OFFLINE':null;failureCode=null;checkedAt=new Date().toISOString();
    if(Object.values(channels).every(row=>['SUCCESS','PARTIAL','FAILED'].includes(row.status))){attempted=false;receiptId=null;reuseReceipt=false;}
   })();
   await Promise.race([operation,new Promise((_,reject)=>{controller.signal.addEventListener('abort',()=>reject(Error('Collection stopped')),{once:true});timer=setTimeout(()=>controller.abort(),check?Math.min(timeoutMs,15000):timeoutMs);})]);
  }catch(error){
   if(expected===epoch){reason=reason||(controller.signal.aborted?'TIMEOUT':'UNAVAILABLE');const classified=diagnostics.classify(error);failureCode=failureCode||(controller.signal.aborted?'TIMEOUT':error instanceof SyntaxError?'RESPONSE_INVALID':classified==='REQUEST_FAILED'?'RESULT_MISSING':classified);checkedAt=new Date().toISOString();if(receiptId&&attempted&&reason!=='AUTH_REQUIRED')for(const key of Object.keys(channels))if(channels[key].status==='CHECK_REQUIRED')channels[key]=empty('RECOVERING');}
  }finally{clearTimeout(timer);clearPermit();if(active===controller){active=null;phase=reason?'ATTENTION':Object.values(channels).some(row=>['PENDING','RUNNING'].includes(row.status))?'WAITING':'FINISHED';}}
  return expected===epoch?snapshot():{status:'DISCONNECTED',channels:{cafe24:empty(),naver:empty(),coupang:empty()},canCheck:false,canCollect:false,verifiedTerminal:false};
 }
 return {collect:()=>run(false),check:()=>run(true),read:snapshot,reset};
}
module.exports={createOrderCollection};
