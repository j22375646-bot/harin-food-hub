'use strict';
const {guardBusinessListRequest}=require('./business-list-request.js');
const {assertLegacyHarinWorkspaceOwner}=require('./legacy-harin-workspace-access.js');
const {validateInsightRequest}=require('../ai/insight-contract.js');
const {publicInsightRun}=require('../ai/insight-public.js');
const PATH=/^\/api\/moaon\/businesses\/([0-9a-f-]{36})\/insights\/ai$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HEADERS={'cache-control':'private, no-store',vary:'Cookie','x-content-type-options':'nosniff'};
const failure=(status,code)=>Response.json({ok:false,code,status:code},{status,headers:HEADERS});
const fail=code=>{throw Object.assign(Error(code),{code});};
function guardWorkspaceAiInsightsRequest(request){
 const url=new URL(request.url),match=PATH.exec(url.pathname);
 if(!match||!UUID.test(match[1])||url.search)return {response:failure(400,'INVALID_REQUEST')};
 if(!['GET','POST','DELETE'].includes(request.method))return {response:failure(405,'INVALID_REQUEST')};
 if(request.method!=='GET'&&(request.headers.get('origin')!==url.origin||request.headers.get('content-type')?.split(';')[0].trim()!=='application/json'))return {response:failure(403,'INVALID_REQUEST')};
 const guarded=guardBusinessListRequest(new Request(request.url,{headers:request.headers}));
 return guarded.response?guarded:{...guarded,tenantId:match[1]};
}
async function readBody(request,signal){
 if(Number(request.headers.get('content-length'))>8192)fail('INPUT_TOO_LARGE');
 const reader=request.body?.getReader();if(!reader)fail('INVALID_REQUEST');
 let size=0;const chunks=[];
 const abort=()=>{reader.cancel().catch(()=>{});};signal.addEventListener('abort',abort,{once:true});
 try{while(true){if(signal.aborted)fail('TIMEOUT');const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>8192){await reader.cancel();fail('INPUT_TOO_LARGE');}chunks.push(Buffer.from(value));}
 if(signal.aborted)fail('TIMEOUT');try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{fail('INVALID_REQUEST');}
 }finally{signal.removeEventListener('abort',abort);reader.releaseLock();}
}
function createWorkspaceAiInsightsRequest({resolveContext,createService,configuration=()=>({status:'DISABLED'}),timeoutMs=25000}={}){
 if(typeof resolveContext!=='function'||typeof createService!=='function'||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>25000)throw TypeError('Trusted dependencies required');
 return async request=>{
  const guarded=guardWorkspaceAiInsightsRequest(request);if(guarded.response)return guarded.response;
  const controller=new AbortController(),deadlineAt=Date.now()+timeoutMs;let timer;
  const abort=()=>controller.abort();request.signal.addEventListener('abort',abort,{once:true});
  const current=()=>{if(controller.signal.aborted||request.signal.aborted||Date.now()>=deadlineAt)fail('TIMEOUT');};
  try{return await Promise.race([
   (async()=>{
    current();const before=await resolveContext(guarded);current();assertLegacyHarinWorkspaceOwner(before,guarded.tenantId);
    const assertCurrentContext=async()=>{current();const after=await resolveContext(guarded);current();assertLegacyHarinWorkspaceOwner(after,guarded.tenantId);if(['tenantId','userId','sessionId','role','membershipVersion'].some(k=>before[k]!==after[k]))fail('WORKSPACE_CHANGED');return true;};
    const context={...before,actorId:before.userId,verified:true};
    const service=createService({assertCurrentContext,signal:controller.signal,deadlineAt});let result;
    if(request.method==='GET'){
     const runs=[];let bytes=0;
     for(const row of await service.listRuns({context,limit:30})){
      const run=publicInsightRun(row),size=Buffer.byteLength(JSON.stringify(run),'utf8');
      if(bytes+size>100*1024)break;runs.push(run);bytes+=size;
     }
     result={configuration:configuration(),runs};
    }
    else {const body=await readBody(request,controller.signal);
     if(request.method==='POST'){const input=validateInsightRequest(body),run=await service.generateRun({context,input,signal:controller.signal,deadlineAt});if(run.status==='SCOPE_BLOCKED'){await assertCurrentContext();return failure(422,'SCOPE_BLOCKED');}result={run:publicInsightRun(run)};}
     else {if(!body||Object.keys(body).length!==1||!UUID.test(body.runId||''))fail('INVALID_REQUEST');await service.deleteRun({context,runId:body.runId});result={deleted:true};}
    }
    await assertCurrentContext();current();return Response.json({ok:true,...result},{headers:HEADERS});
   })(),
   new Promise((_,reject)=>{timer=setTimeout(()=>{abort();reject(Object.assign(Error('TIMEOUT'),{code:'TIMEOUT'}));},timeoutMs);})
  ]);}catch(error){const codes={AUTH_REQUIRED:401,TENANT_ACCESS_DENIED:403,PERMISSION_DENIED:403,FORBIDDEN:403,WORKSPACE_CHANGED:409,INVALID_REQUEST:400,INPUT_TOO_LARGE:413,TIMEOUT:504,NOT_FOUND:404,TURN_LIMIT:409,DISABLED:503,SETUP_REQUIRED:503,DATA_POLICY_BLOCKED:403,BLOCKED:409,QUESTION_PRIVACY_BLOCKED:400,PENDING:409,ALREADY_PROCESSED:409,BUDGET_BLOCKED:429,DAILY_LIMIT:429,CONCURRENCY_LIMIT:409,QUOTA_BLOCKED:429,INVALID_OUTPUT:502,SAVE_FAILED:503};return failure(codes[error?.code]||503,Object.hasOwn(codes,error?.code)?error.code:'UNAVAILABLE');}
  finally{abort();clearTimeout(timer);request.signal.removeEventListener('abort',abort);}
 };
}
module.exports={createWorkspaceAiInsightsRequest,guardWorkspaceAiInsightsRequest};
