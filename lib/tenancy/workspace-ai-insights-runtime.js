'use strict';
const {createBusinessListRuntime}=require('./business-list-runtime.js');
const {createDashboardIdentityVerifier}=require('./dashboard-identity.js');
const {createFinanceContextResolver}=require('./workspace-finance-runtime.js');
const {createWorkspaceAiInsightsRequest,guardWorkspaceAiInsightsRequest}=require('./workspace-ai-insights-request.js');
const {createInsightStore}=require('../ai/insight-store.js');
const {createInsightBudget}=require('../ai/insight-budget.js');
const {createInsightService}=require('../ai/insight-service.js');
const {createClovaClient}=require('../ai/clova-client.js');
const {buildInsightSnapshot}=require('../ai/insight-snapshot.js');
function createWorkspaceAiInsightsRuntime({getDb,env=process.env}={}){
 if(typeof getDb!=='function')throw TypeError('Trusted service database required');
 return createBusinessListRuntime({guardRequest:guardWorkspaceAiInsightsRequest,createService:({database,identityDb,authAdmin})=>{
  const verifySession=createDashboardIdentityVerifier({db:identityDb,authAdmin,timeoutMs:10000});
  const client=createClovaClient({env});
  return createWorkspaceAiInsightsRequest({resolveContext:createFinanceContextResolver({database,verifySession}),configuration:client.configuration,createService:({assertCurrentContext})=>{
   const db=getDb(),store=createInsightStore({db}),budget=createInsightBudget({store,providerAccountId:env.CLOVA_STUDIO_ACCOUNT_ID,pricingVersion:env.CLOVA_STUDIO_PRICING_VERSION});
   return createInsightService({store,budget,...client,assertCurrentContext,loadSnapshot:async({tenantId,reportIds,signal})=>{
    // Legacy reports belong solely to the owner-gated Harin workspace above.
    const {data,error}=await db.from('reports').select('id,platform,report_type,period_start,period_end,summary_json,status,created_at').eq('platform','NAVER').eq('report_type','WEEKLY').eq('is_latest',true).order('period_end',{ascending:false}).order('created_at',{ascending:false}).limit(20).abortSignal(signal);
    if(error)throw Object.assign(Error('Source unavailable'),{code:'UNAVAILABLE'});
    const reports=(data||[]).filter(r=>reportIds.includes(r.id));
    if(reports.length!==reportIds.length)throw Object.assign(Error('Missing report'),{code:'NOT_FOUND'});
    return buildInsightSnapshot({tenantId,reports,sourceState:{}});
   }});
  }});
 }});
}
module.exports={createWorkspaceAiInsightsRuntime};
