'use strict';
const {createBusinessListRuntime}=require('./business-list-runtime.js');
const {createDashboardIdentityVerifier}=require('./dashboard-identity.js');
const {createFinanceContextResolver}=require('./workspace-finance-runtime.js');
const {createWorkspaceInventoryRequest,guardWorkspaceInventoryRequest}=require('./workspace-inventory-request.js');
function createWorkspaceInventoryRuntime({readInventory}={}){
 if(typeof readInventory!=='function')throw TypeError('Trusted inventory reader required');
 return createBusinessListRuntime({guardRequest:guardWorkspaceInventoryRequest,createService:({database,identityDb,authAdmin})=>{
  const verifySession=createDashboardIdentityVerifier({db:identityDb,authAdmin,timeoutMs:10000});
  return createWorkspaceInventoryRequest({resolveContext:createFinanceContextResolver({database,verifySession}),readInventory});
 }});
}
module.exports={createWorkspaceInventoryRuntime};
