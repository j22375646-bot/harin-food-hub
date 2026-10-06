'use strict';
const {createBusinessListRuntime}=require('./business-list-runtime.js');
const {createDashboardIdentityVerifier}=require('./dashboard-identity.js');
const {createFinanceContextResolver}=require('./workspace-finance-runtime.js');
const {createWorkspaceCsRequest,guardWorkspaceCsRequest}=require('./workspace-cs-request.js');
function createWorkspaceCsRuntime({readCs}={}){
 if(typeof readCs!=='function')throw TypeError('Trusted cs reader required');
 return createBusinessListRuntime({guardRequest:guardWorkspaceCsRequest,createService:({database,identityDb,authAdmin})=>{
  const verifySession=createDashboardIdentityVerifier({db:identityDb,authAdmin,timeoutMs:10000});
  return createWorkspaceCsRequest({resolveContext:createFinanceContextResolver({database,verifySession}),readCs});
 }});
}
module.exports={createWorkspaceCsRuntime};
