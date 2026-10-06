'use strict';
const {createHash,randomUUID}=require('node:crypto');
const {validatePublicMarketRequest,validatePublicMarketOutput,materializePublicMarketInsight}=require('./public-market-contract');
const {projectPublicMarketSnapshot}=require('./public-market-snapshot');
const PROMPT_VERSION='p4-166-v2';
const fail=code=>{throw Object.assign(Error(code),{code});};
function createPublicMarketAiService({store,configuration,accountId,loadSnapshot,generate,assertCurrentContext,now=Date.now}){
 async function check(context,signal,deadlineAt){if(!context?.verified||!context.tenantId||!context.actorId||typeof assertCurrentContext!=='function')fail('FORBIDDEN');if(signal?.aborted||deadlineAt&&now()>=deadlineAt)fail('TIMEOUT');if(await assertCurrentContext(context)===false)fail('FORBIDDEN');if(signal?.aborted||deadlineAt&&now()>=deadlineAt)fail('TIMEOUT');}
 async function generateRun({context,input,signal,deadlineAt=now()+25000}){
  await check(context,signal,deadlineAt);
  const request=validatePublicMarketRequest({requestId:input.requestId,kind:input.kind});
  const cfg=configuration();if(!cfg.enabled)fail('DISABLED');if(!cfg.ready||!accountId)fail('SETUP_REQUIRED');
  const snapshot=projectPublicMarketSnapshot(await loadSnapshot({query:input.query,days:input.days,signal,deadlineAt}),{now:now()});
  if(snapshot.dataClass!=='PUBLIC_MARKET'||snapshot.scope!=='PUBLIC_SEARCH_TREND')fail('DATA_POLICY_BLOCKED');
  if(['BLOCKED','STALE'].includes(snapshot.dataState))fail(snapshot.dataState);
  await check(context,signal,deadlineAt);
  const fingerprint=createHash('sha256').update(JSON.stringify({tenantId:context.tenantId,snapshotHash:snapshot.hash,kind:request.kind,model:cfg.model,promptVersion:PROMPT_VERSION})).digest('hex');
  const cached=await store.findReusable({tenantId:context.tenantId,fingerprint});
  if(cached){if(cached.tenantId!==context.tenantId||cached.snapshotHash!==snapshot.hash||cached.kind!==request.kind)fail('FORBIDDEN');await check(context,signal,deadlineAt);return {...cached,snapshot,sourceAsOf:snapshot.sourceAsOf,dataState:snapshot.dataState,reused:true};}
  const reservation=await store.reserve({tenantId:context.tenantId,requestId:request.requestId,accountId,fingerprint,requester:context.actorId});
  if(!reservation.allowed)fail(reservation.reason||'QUOTA_BLOCKED');
  let called=false,response=null,settled=false;
  try{
   await check(context,signal,deadlineAt);called=true;
   // No query, user prose, previous conversation or internal records cross this boundary.
   response=await generate({snapshot,kind:request.kind,requestId:request.requestId,signal,deadlineAt});
   await check(context,signal,deadlineAt);
   const validatedOutput=validatePublicMarketOutput(response.output,snapshot),output=materializePublicMarketInsight(validatedOutput,snapshot);
   await store.settle({tenantId:context.tenantId,requestId:request.requestId,status:'SUCCEEDED',usage:response.usage});settled=true;
   await check(context,signal,deadlineAt);
   const run={runId:randomUUID(),requestId:request.requestId,tenantId:context.tenantId,requester:context.actorId,fingerprint,scope:snapshot.scope,provider:'GEMINI_FREE',model:cfg.model,promptVersion:PROMPT_VERSION,kind:request.kind,snapshotHash:snapshot.hash,snapshot,sourceAsOf:snapshot.sourceAsOf,status:'SUCCEEDED',dataState:snapshot.dataState,output,validatedOutput,usage:response.usage||null,createdAt:new Date(now()).toISOString()};
   try{await store.saveRun(run);}catch{fail('SAVE_FAILED');}
   await check(context,signal,deadlineAt);return {...run,reused:false};
  }catch(error){if(!settled){try{await store.settle({tenantId:context.tenantId,requestId:request.requestId,status:called&&!response?'UNKNOWN':'FAILED',usage:response?.usage||null});}catch{/* A reservation remains counted when settlement cannot be confirmed. */}}throw error;}
 }
 return {generateRun};
}
function publicMarketRun(run){const s=run.snapshot,o=run.output;return {id:run.runId,status:run.status,kind:run.kind,scope:run.scope,provider:run.provider,model:run.model,createdAt:run.createdAt,sourceAsOf:run.sourceAsOf||null,snapshotHash:run.snapshotHash,dataState:run.dataState,period:s.period,sources:s.sources,metrics:s.metrics,cards:o.cards,answer:o.answer,nextChecks:o.nextChecks,exclusions:s.exclusions||[],usage:run.usage?{promptTokens:run.usage.promptTokens,completionTokens:run.usage.completionTokens}:null,reused:run.reused===true};}
module.exports={createPublicMarketAiService,publicMarketRun,PROMPT_VERSION};
