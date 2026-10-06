'use strict';
const {guardBusinessListRequest}=require('./business-list-request.js');
const {assertLegacyHarinWorkspaceOwner}=require('./legacy-harin-workspace-access.js');
const PATH=/^\/api\/moaon\/businesses\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/finance$/;
const HEADERS={'cache-control':'private, no-store',vary:'Cookie','x-content-type-options':'nosniff'};
function failure(status,code,headers=HEADERS){return Response.json({ok:false,code},{status,headers});}
function guardWorkspaceFinanceRequest(request){
 const url=new URL(request.url),match=PATH.exec(url.pathname);
 if(!match||url.search)return {response:failure(400,'INVALID_REQUEST')};
 const guarded=guardBusinessListRequest(request);
 return guarded.response?guarded:{...guarded,tenantId:match[1]};
}
function createWorkspaceFinanceRequest({resolveContext,readFinance,timeoutMs=25000}={}){
 if(typeof resolveContext!=='function'||typeof readFinance!=='function')throw TypeError('Trusted dependencies required');
 if(!Number.isFinite(timeoutMs)||timeoutMs<1||timeoutMs>30000)throw TypeError('Invalid deadline');
 return async request=>{
  const input=guardWorkspaceFinanceRequest(request);if(input.response)return input.response;
  let stopped=false,timer;
  const started=performance.now(),timings=[];
  let phase=null;
  const begin=name=>{const at=performance.now();if(phase)timings.push([phase.name,at-phase.at]);phase={name,at};};
  const headers=()=>{const at=performance.now();return {...HEADERS,'server-timing':[...timings,...(phase?[[phase.name,at-phase.at]]:[]),['total',at-started]].map(([name,duration])=>`${name};dur=${Math.max(0,duration).toFixed(1)}`).join(', ')};};
  const current=()=>{if(stopped||request.signal.aborted)throw Object.assign(Error('Stopped'),{code:'REQUEST_TIMEOUT'});};
  const allowed=context=>assertLegacyHarinWorkspaceOwner(context,input.tenantId);
  try{
   return await Promise.race([
    (async()=>{
     current();begin('auth-before');const before=await resolveContext(input);current();allowed(before);
     begin('finance-read');const summary=await readFinance();current();
     begin('auth-after');const after=await resolveContext(input);current();allowed(after);
     if(['tenantId','userId','sessionId','role','membershipVersion'].some(key=>before[key]!==after[key]))return failure(409,'WORKSPACE_CHANGED',headers());
     const payload={ok:true,month:summary.month,generatedAt:summary.generatedAt,metrics:{sales:summary.metrics.sales,profit:summary.metrics.profit,balance:summary.metrics.balance}};
     return Response.json(payload,{headers:headers()});
    })(),
    new Promise((_,reject)=>{timer=setTimeout(()=>{stopped=true;reject(Object.assign(Error('Deadline'),{code:'REQUEST_TIMEOUT'}));},timeoutMs);})
   ]);
  }catch(error){
   const codes={AUTH_REQUIRED:401,TENANT_ACCESS_DENIED:403,PERMISSION_DENIED:403,REQUEST_TIMEOUT:504};
   return Object.hasOwn(codes,error?.code)?failure(codes[error.code],error.code,headers()):failure(503,'WORKSPACE_UNAVAILABLE',headers());
  }finally{stopped=true;clearTimeout(timer);}
 };
}
module.exports={createWorkspaceFinanceRequest,guardWorkspaceFinanceRequest};
