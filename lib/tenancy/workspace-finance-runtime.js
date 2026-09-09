'use strict';
const {createBusinessListRuntime}=require('./business-list-runtime.js');
const {createDashboardIdentityVerifier}=require('./dashboard-identity.js');
const {createTenantControlStore}=require('./control-store.js');
const {createWorkspaceFinanceRequest,guardWorkspaceFinanceRequest}=require('./workspace-finance-request.js');
function createWorkspaceFinanceRuntime({readFinance}={}){
 if(typeof readFinance!=='function')throw TypeError('Trusted finance reader required');
 return createBusinessListRuntime({
  guardRequest:guardWorkspaceFinanceRequest,
  createService:({database,identityDb,authAdmin})=>{
   const verifySession=createDashboardIdentityVerifier({db:identityDb,authAdmin,timeoutMs:10000});
   const store=createTenantControlStore({database,verifySession});
   return createWorkspaceFinanceRequest({resolveContext:input=>store.resolveContext(input),readFinance});
  }
 });
}
module.exports={createWorkspaceFinanceRuntime};
