'use strict';
const {createBusinessListRuntime}=require('./business-list-runtime.js');
const {createDashboardIdentityVerifier}=require('./dashboard-identity.js');
const {createFinanceContextResolver}=require('./workspace-finance-runtime.js');
const {createWorkspaceAssistantRequest,guardWorkspaceAssistantRequest}=require('./workspace-assistant-request.js');
function createWorkspaceAssistantRuntime({readAssistant}={}){
 if(typeof readAssistant!=='function')throw TypeError('Trusted assistant reader required');
 return createBusinessListRuntime({guardRequest:guardWorkspaceAssistantRequest,createService:({database,identityDb,authAdmin})=>{
  const verifySession=createDashboardIdentityVerifier({db:identityDb,authAdmin,timeoutMs:10000});
  return createWorkspaceAssistantRequest({resolveContext:createFinanceContextResolver({database,verifySession}),readAssistant});
 }});
}
module.exports={createWorkspaceAssistantRuntime};
