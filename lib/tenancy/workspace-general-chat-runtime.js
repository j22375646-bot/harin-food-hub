'use strict';
const {createBusinessListRuntime}=require('./business-list-runtime');
const {createDashboardIdentityVerifier}=require('./dashboard-identity');
const {createFinanceContextResolver}=require('./workspace-finance-runtime');
const {guardGeneralChatRequest,createGeneralChatRequest}=require('./workspace-general-chat-request');
const {createGeneralGeminiClient}=require('../ai/general-gemini-client');
const {createGeneralChatService}=require('../ai/general-chat-service');
const {environment}=require('../integrations/managed-keys');
const {buildInsightSnapshot}=require('../ai/insight-snapshot');
function createGeneralChatRuntime({getDb,env=process.env}){return createBusinessListRuntime({env,guardRequest:guardGeneralChatRequest,createService:({database,identityDb,authAdmin})=>createGeneralChatRequest({resolveContext:createFinanceContextResolver({database,verifySession:createDashboardIdentityVerifier({db:identityDb,authAdmin,timeoutMs:10000})}),createService:async({assertCurrentContext,tenantId})=>{
 const db=getDb(),configured=await environment('GEMINI',env,db);return createGeneralChatService({db,client:createGeneralGeminiClient({env:configured}),accountId:configured.GEMINI_FREE_PROJECT_ID,assertCurrentContext,loadAttachment:async(reportIds,signal)=>{
 const {data,error}=await db.from('reports').select('id,platform,report_type,period_start,period_end,summary_json,status,created_at').eq('platform','NAVER').eq('report_type','WEEKLY').eq('is_latest',true).order('period_end',{ascending:false}).order('created_at',{ascending:false}).limit(20).abortSignal(signal);if(error)throw Object.assign(Error('UNAVAILABLE'),{code:'UNAVAILABLE'});
 const reports=(data||[]).filter(r=>reportIds.includes(r.id));if(reports.length!==reportIds.length)throw Object.assign(Error('BLOCKED'),{code:'BLOCKED'});const snapshot=buildInsightSnapshot({tenantId,reports,sourceState:{}});return {scope:snapshot.scope,period:snapshot.period,metrics:snapshot.metrics,exclusions:snapshot.exclusions};
 }});
}})});}
module.exports={createGeneralChatRuntime};
