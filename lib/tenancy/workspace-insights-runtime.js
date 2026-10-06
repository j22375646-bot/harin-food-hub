'use strict';
const {createBusinessListRuntime}=require('./business-list-runtime.js');
const {createDashboardIdentityVerifier}=require('./dashboard-identity.js');
const {createFinanceContextResolver}=require('./workspace-finance-runtime.js');
const {createWorkspaceInsightsRequest,guardWorkspaceInsightsRequest}=require('./workspace-insights-request.js');
function createWorkspaceInsightsRuntime({readInsights}={}){
 if(typeof readInsights!=='function')throw TypeError('Trusted insights reader required');
 return createBusinessListRuntime({guardRequest:guardWorkspaceInsightsRequest,createService:({database,identityDb,authAdmin})=>{
  const verifySession=createDashboardIdentityVerifier({db:identityDb,authAdmin,timeoutMs:10000});
  return createWorkspaceInsightsRequest({resolveContext:createFinanceContextResolver({database,verifySession}),readInsights});
 }});
}
module.exports={createWorkspaceInsightsRuntime};
