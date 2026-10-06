'use strict';
const {createBusinessListRuntime}=require('./business-list-runtime.js');
const {createDashboardIdentityVerifier}=require('./dashboard-identity.js');
const {createFinanceContextResolver}=require('./workspace-finance-runtime.js');
const {createWorkspaceSettlementRequest,guardWorkspaceSettlementRequest}=require('./workspace-settlement-request.js');
function createWorkspaceSettlementRuntime({readSettlement}={}){
 if(typeof readSettlement!=='function')throw TypeError('Trusted settlement reader required');
 return createBusinessListRuntime({guardRequest:guardWorkspaceSettlementRequest,createService:({database,identityDb,authAdmin})=>{
  const verifySession=createDashboardIdentityVerifier({db:identityDb,authAdmin,timeoutMs:10000});
  return createWorkspaceSettlementRequest({resolveContext:createFinanceContextResolver({database,verifySession}),readSettlement});
 }});
}
module.exports={createWorkspaceSettlementRuntime};
