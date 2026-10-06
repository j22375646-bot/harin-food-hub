'use strict';
const {createHash,randomUUID}=require('node:crypto');
const {validateInsightRequest,validateInsightOutput,materializeInsight}=require('./insight-contract.js');
const defaultPolicy=require('./insight-policy.js');
const {PROMPT_VERSION}=require('./insight-prompt.js');
function fail(code){const error=new Error(code);error.code=code;return error;}
function createInsightService({store,budget,generate,loadSnapshot,policy=defaultPolicy,configuration,estimateMaxCost,priceUsage,assertCurrentContext,now=Date.now}){
 async function check(context,signal,deadlineAt){if(!context?.verified||!context.tenantId||!context.actorId||typeof assertCurrentContext!=='function')throw fail('FORBIDDEN');if(signal?.aborted||deadlineAt&&now()>=deadlineAt)throw fail('TIMEOUT');if(await assertCurrentContext(context)===false)throw fail('FORBIDDEN');if(signal?.aborted||deadlineAt&&now()>=deadlineAt)throw fail('TIMEOUT');}
 async function scopedRun(context,runId){const run=await store.getRun({tenantId:context.tenantId,runId});if(!run||run.tenantId!==context.tenantId)throw fail('NOT_FOUND');return run;}
 async function readRun({context,runId}){await check(context);const run=await scopedRun(context,runId);await check(context);return run;}
 async function listRuns({context,limit=30}){await check(context);const runs=await store.listRuns({tenantId:context.tenantId,limit:Math.min(50,Math.max(1,Number(limit)||30))});if(runs.some(r=>r.tenantId!==context.tenantId))throw fail('FORBIDDEN');await check(context);return runs;}
 async function deleteRun({context,runId}){await check(context);await scopedRun(context,runId);await check(context);const result=await store.deleteRun({tenantId:context.tenantId,runId});await check(context);return result;}
 async function generateRun({context,input,signal,deadlineAt=now()+25000}){
  deadlineAt=Math.min(deadlineAt,now()+25000);await check(context,signal,deadlineAt);
  input=validateInsightRequest(input);
  if(policy.classifyQuestion(input.question||'','NAVER_AD_REPORT').code==='QUESTION_PRIVACY_BLOCKED')throw fail('QUESTION_PRIVACY_BLOCKED');
  const snapshot=await loadSnapshot({context,tenantId:context.tenantId,reportIds:input.reportIds,signal,deadlineAt});
  if(snapshot?.tenantId!==context.tenantId||snapshot?.scope!=='NAVER_AD_REPORT'||snapshot?.dataClass!=='INTERNAL_AGGREGATE')throw fail('DATA_POLICY_BLOCKED');
  if(snapshot.sourceIds.length!==input.reportIds.length||snapshot.sourceIds.some(id=>!input.reportIds.includes(id)))throw fail('DATA_POLICY_BLOCKED');
  if(snapshot.dataState==='BLOCKED')throw fail('BLOCKED');
  await check(context,signal,deadlineAt);
  const question=input.question||'',classified=policy.classifyQuestion(question,snapshot.scope);
  if(!classified.allowed)return {status:'SCOPE_BLOCKED',scope:snapshot.scope,snapshotHash:snapshot.hash,answer:classified.answer,cards:[],nextChecks:[]};
  const cfg=typeof configuration==='function'?configuration():configuration||{enabled:false,ready:false,model:'HCX-007'};
  const history=[];let parent=null;
  if(input.parentRunId){parent=await scopedRun(context,input.parentRunId);let cursor=parent;const seen=new Set();while(cursor){if(seen.has(cursor.runId)||history.length>=6||cursor.snapshotHash!==snapshot.hash||cursor.status!=='SUCCEEDED')throw fail('INVALID_REQUEST');seen.add(cursor.runId);history.unshift({question:cursor.question,output:cursor.validatedOutput});cursor=cursor.parentRunId?await scopedRun(context,cursor.parentRunId):null;}if(history.length>=6)throw fail('TURN_LIMIT');}
  const turn=history.length+1;
  const fingerprint=createHash('sha256').update(JSON.stringify({tenantId:context.tenantId,snapshotHash:snapshot.hash,question,parentRunId:input.parentRunId||null,model:cfg.model,promptVersion:PROMPT_VERSION})).digest('hex');
  const cached=await store.findReusable({tenantId:context.tenantId,fingerprint});if(cached){if(cached.tenantId!==context.tenantId||cached.snapshotHash!==snapshot.hash)throw fail('FORBIDDEN');await check(context,signal,deadlineAt);return {...cached,snapshot,dataState:snapshot.dataState,sourceAsOf:snapshot.sourceAsOf,reused:true};}
  policy.assertProviderAllowed({provider:'CLOVA',dataClass:snapshot.dataClass,enabled:cfg.enabled,ready:cfg.ready});
  const args={snapshot,question,history,signal,deadlineAt,requestId:input.requestId,maxOutputTokens:1500};
  const maxCostKrw=typeof estimateMaxCost==='function'?estimateMaxCost(args):null;if(!Number.isSafeInteger(maxCostKrw)||maxCostKrw<=0)throw fail('SETUP_REQUIRED');
  await check(context,signal,deadlineAt);
  const reservation=await budget.reserve({tenantId:context.tenantId,requestId:input.requestId,provider:'CLOVA',fingerprint,maxCostKrw,pricingVersion:cfg.pricingVersion,requester:context.actorId,now:new Date(now()).toISOString()});
  if(!reservation.allowed)throw fail(reservation.reason||'BUDGET_BLOCKED');
  let called=false,response=null,settled=false;
  async function settle(status,usage){const actual=typeof priceUsage==='function'?priceUsage(usage):null;await budget.settle({tenantId:context.tenantId,requestId:input.requestId,status:actual===null?'UNKNOWN':status,actualCostKrw:actual,usage:usage||null});settled=true;}
  try{
   await check(context,signal,deadlineAt);called=true;response=await generate(args);await check(context,signal,deadlineAt);
   const validatedOutput=validateInsightOutput(response.output,snapshot),output=materializeInsight(validatedOutput,snapshot);
   await settle('SUCCEEDED',response.usage);
   await check(context,signal,deadlineAt);
   const run={runId:randomUUID(),requestId:input.requestId,tenantId:context.tenantId,requester:context.actorId,scope:snapshot.scope,provider:'CLOVA',model:response.model||cfg.model,promptVersion:PROMPT_VERSION,snapshotHash:snapshot.hash,sourceIds:snapshot.sourceIds,sourceAsOf:snapshot.sourceAsOf,dataState:snapshot.dataState,snapshot,fingerprint,status:'SUCCEEDED',question,parentRunId:input.parentRunId||null,turn,output,validatedOutput,usage:response.usage||null,createdAt:new Date(now()).toISOString()};
   try{await store.saveRun(run);}catch{throw fail('SAVE_FAILED');}
   await check(context,signal,deadlineAt);return {...run,reused:false};
  }catch(error){if(!settled){try{if(!called){await budget.settle({tenantId:context.tenantId,requestId:input.requestId,status:'FAILED',actualCostKrw:0,usage:null});}else await settle('FAILED',response?.usage||error.usage);}catch{/* Reservation remains conservative on settlement failure. */}}throw error;}
 }
 return {generateRun,readRun,listRuns,deleteRun};
}
module.exports={PROMPT_VERSION,createInsightService};
