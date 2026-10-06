'use strict';
// Explicit projection keeps raw model tokens, prompts, tenant IDs and account data server-side.
function publicInsightRun(run={}){
 const snapshot=run.snapshot||{},output=run.output||{};
 return {id:run.runId||null,status:run.status||'UNAVAILABLE',dataState:run.dataState||snapshot.dataState||'BLOCKED',scope:run.scope||'NAVER_AD_REPORT',reportIds:run.sourceIds||snapshot.sourceIds||[],question:run.question||'',parentRunId:run.parentRunId||null,turn:run.turn||0,createdAt:run.createdAt||null,provider:run.provider||'CLOVA',model:run.model||null,snapshotHash:run.snapshotHash||null,sourceAsOf:run.sourceAsOf||snapshot.sourceAsOf||null,period:snapshot.period||null,metrics:snapshot.metrics||{},cards:output.cards||run.cards||[],answer:output.answer||run.answer||'',nextChecks:output.nextChecks||run.nextChecks||[],exclusions:snapshot.exclusions||[],usage:run.usage?{promptTokens:run.usage.promptTokens,completionTokens:run.usage.completionTokens}:null,reused:run.reused===true};
}
module.exports={publicInsightRun};
